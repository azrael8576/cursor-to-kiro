import type {
  Analysis,
  Candidate,
  ManifestEntry,
  MigrationPlan,
  Result,
} from "../domain.js";
import path from "node:path";
import { lstat } from "node:fs/promises";
import { analyzeRule } from "../compatibility/rules.js";
import { convertRule } from "../converters/rules-converter.js";
import {
  prepareArtifact,
  type PreparedArtifact,
  type MigrationIssue,
} from "../migration/artifacts.js";
import { rewriteArtifactReferences } from "../migration/references.js";
import {
  detectExistingDestinationIssues,
  detectManifestCollisions,
  type DestinationIssue,
} from "../validator/destination-validator.js";
import {
  snapshotSelectedSources,
  type IntegritySnapshot,
} from "../validator/source-integrity.js";
import { reportEntry } from "../report/migration-report.js";

export interface PreparedMigration {
  plan: MigrationPlan;
  entries: ManifestEntry[];
  sourceSnapshot: IntegritySnapshot;
}

export interface PrepareMigrationOptions {
  candidates: Candidate[];
  root: string;
  selectedIds?: ReadonlySet<string>;
}

export type PlanningError = {
  kind: "destination-conflict";
  reasons: string[];
};

function applyIssues(
  analyses: Analysis[],
  issues: DestinationIssue[],
): Analysis[] {
  const reasons = new Map<string, string[]>();
  for (const issue of issues) {
    for (const id of issue.artifactIds) {
      const current = reasons.get(id) ?? [];
      current.push(issue.reason);
      reasons.set(id, current);
    }
  }
  return analyses.map(analysis => {
    const artifactReasons = reasons.get(analysis.candidate.id);
    if (!artifactReasons) return analysis;
    return {
      ...analysis,
      status: "CONFLICT",
      selected: false,
      summary: "Destination collision or existing-content conflict",
      reason: artifactReasons.join(" "),
      cursorBehavior:
        "The selected Cursor artifact maps to a deterministic destination.",
      kiroGap:
        "Writing it would overwrite, collide, or make precedence depend on filesystem/scanner order.",
    };
  });
}

export async function createMigrationPlan(
  candidates: Candidate[],
  selectedIds?: ReadonlySet<string>,
): Promise<MigrationPlan> {
  const prepared = new Map<string, PreparedArtifact>();
  const roots = new Map<string, string>();
  let analyses = candidates.map(candidate => {
    const source = candidate.sourceFiles[0];
    const root = source
      ? path.resolve(
          source.absolutePath,
          ...source.identity.split("/").map(() => ".."),
        )
      : "";
    roots.set(candidate.id, root);
    let artifact: PreparedArtifact;
    if (candidate.kind === "rule") {
      const analysis = analyzeRule(candidate);
      artifact = {
        analysis,
        entries:
          analysis.status === "TRANSFORM" || analysis.status === "EXACT"
            ? convertRule(candidate)
            : [],
        documents: [],
      };
    } else {
      const result = prepareArtifact(candidate, root);
      if (!result.ok)
        return {
          candidate,
          status: "CONFLICT" as const,
          selected: false,
          summary: "Artifact could not be converted",
          reason: `${result.error.kind}: ${result.error.detail}`,
        };
      artifact = result.value;
    }
    const analysis = {
      ...artifact.analysis,
      selected:
        (artifact.analysis.status === "TRANSFORM" ||
          artifact.analysis.status === "EXACT") &&
        (selectedIds === undefined || selectedIds.has(candidate.id)),
    };
    if (analysis.selected)
      prepared.set(candidate.id, { ...artifact, analysis });
    return analysis;
  });
  const badIds = new Set<string>();
  let manifest: ManifestEntry[] = [];
  // Remove failed destinations before resolving dependent references. Rebuild
  // from original bytes so a reference never points at a rejected artifact.
  while (true) {
    const mappings = new Map<string, string>();
    for (const artifact of prepared.values()) {
      for (const entry of artifact.entries) {
        if (entry.sourceAbsolutePath)
          mappings.set(entry.sourceAbsolutePath, entry.absolutePath);
      }
      const candidate = artifact.analysis.candidate;
      if (
        candidate.kind === "subagent" &&
        candidate.sourceFiles[0] &&
        artifact.entries[0]
      )
        mappings.set(
          candidate.sourceFiles[0].absolutePath,
          artifact.entries[0].absolutePath,
        );
      if (
        candidate.kind === "rule" &&
        candidate.sourceFiles[0] &&
        artifact.entries[0]
      )
        mappings.set(
          candidate.sourceFiles[0].absolutePath,
          artifact.entries[0].absolutePath,
        );
    }
    const issues: DestinationIssue[] = [];
    const converted: PreparedArtifact[] = [];
    for (const artifact of prepared.values()) {
      const id = artifact.analysis.candidate.id;
      const root = roots.get(id);
      if (root === undefined)
        throw new Error(`Missing workspace root for ${id}`);
      const result = await rewriteArtifactReferences(artifact, root, mappings, {
        inspect: async absolutePath => {
          const relative = path.relative(root, absolutePath);
          let current = root;
          try {
            for (const component of relative.split(path.sep)) {
              current = path.join(current, component);
              const info = await lstat(current);
              if (info.isSymbolicLink())
                return {
                  ok: false,
                  error: {
                    kind: "UNSAFE_REFERENCE",
                    detail: `symlink ${current}`,
                  },
                };
            }
            return { ok: true, value: undefined };
          } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            const kind: MigrationIssue["kind"] =
              code === "ENOENT" || code === "ENOTDIR"
                ? "MISSING_REFERENCE_TARGET"
                : "REFERENCE_IO_ERROR";
            return { ok: false, error: { kind, detail: String(error) } };
          }
        },
      });
      if (result.ok) converted.push(result.value);
      else
        issues.push({
          artifactIds: [id],
          reason: `${result.error.kind}: ${result.error.detail}`,
        });
    }
    const collisions = detectManifestCollisions(
      converted.flatMap(artifact => artifact.entries),
    );
    issues.push(
      ...collisions.issues,
      ...(await detectExistingDestinationIssues(collisions.entries)),
    );
    if (!issues.length) {
      manifest = collisions.entries;
      const rewritten = new Map(
        converted.map(artifact => [
          artifact.analysis.candidate.id,
          artifact.analysis,
        ]),
      );
      analyses = analyses.map(
        analysis => rewritten.get(analysis.candidate.id) ?? analysis,
      );
      break;
    }
    analyses = applyIssues(analyses, issues);
    for (const issue of issues)
      for (const id of issue.artifactIds) {
        badIds.add(id);
        prepared.delete(id);
      }
  }
  return {
    analyses,
    manifest,
    selectedIds: analyses
      .filter(analysis => analysis.selected)
      .map(analysis => analysis.candidate.id)
      .sort(),
    destinationConflicts: analyses.filter(analysis =>
      badIds.has(analysis.candidate.id),
    ),
  };
}

export async function prepareMigration(
  options: PrepareMigrationOptions,
): Promise<Result<PreparedMigration, PlanningError>> {
  const plan = await createMigrationPlan(
    options.candidates,
    options.selectedIds,
  );
  const output = reportEntry(options.root, plan);
  const issues = await detectExistingDestinationIssues([output]);
  if (issues.length > 0) {
    return {
      ok: false,
      error: {
        kind: "destination-conflict",
        reasons: issues.map(issue => issue.reason),
      },
    };
  }
  return {
    ok: true,
    value: {
      plan,
      entries: [...plan.manifest, output],
      sourceSnapshot: snapshotSelectedSources(plan.analyses),
    },
  };
}
