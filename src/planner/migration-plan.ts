import type { Analysis, Candidate, MigrationPlan } from "../domain.js";
import { analyzeCandidate } from "../compatibility/index.js";
import { convertAnalysis } from "../converters/index.js";
import { detectExistingDestinationIssues, detectManifestCollisions, type DestinationIssue } from "../validator/destination-validator.js";

function applyIssues(analyses: Analysis[], issues: DestinationIssue[]): Analysis[] {
  const reasons = new Map<string, string[]>();
  for (const issue of issues) {
    for (const id of issue.artifactIds) {
      const current = reasons.get(id) ?? [];
      current.push(issue.reason);
      reasons.set(id, current);
    }
  }
  return analyses.map((analysis) => {
    const artifactReasons = reasons.get(analysis.candidate.id);
    if (!artifactReasons) return analysis;
    return {
      ...analysis,
      status: "CONFLICT",
      selected: false,
      summary: "Destination collision or existing-content conflict",
      reason: artifactReasons.join(" "),
      cursorBehavior: "The selected Cursor artifact maps to a deterministic destination.",
      kiroGap: "Writing it would overwrite, collide, or make precedence depend on filesystem/scanner order.",
    };
  });
}

export async function createMigrationPlan(candidates: Candidate[], selectedIds?: ReadonlySet<string>): Promise<MigrationPlan> {
  let analyses = candidates.map(analyzeCandidate).map((analysis) => ({
    ...analysis,
    selected: (analysis.status === "EXACT" || analysis.status === "TRANSFORM") &&
      (selectedIds === undefined || selectedIds.has(analysis.candidate.id)),
  }));
  let manifest = analyses.filter((analysis) => analysis.selected).flatMap(convertAnalysis);
  const collisionResult = detectManifestCollisions(manifest);
  const existingIssues = await detectExistingDestinationIssues(collisionResult.entries);
  const issues = [...collisionResult.issues, ...existingIssues];
  analyses = applyIssues(analyses, issues);
  const badIds = new Set(issues.flatMap((issue) => issue.artifactIds));
  manifest = collisionResult.entries.filter((entry) => !badIds.has(entry.artifactId));
  return {
    analyses,
    manifest,
    selectedIds: analyses.filter((analysis) => analysis.selected).map((analysis) => analysis.candidate.id).sort(),
    destinationConflicts: analyses.filter((analysis) => badIds.has(analysis.candidate.id)),
  };
}
