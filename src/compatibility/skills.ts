import type { Analysis, SkillCandidate } from "../domain.js";

export const KIRO_COMMON_SKILL_FIELDS = [
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
] as const;
export const CURSOR_ONLY_SKILL_FIELDS = [
  "paths",
  "globs",
  "disable-model-invocation",
  "icon",
  "color",
  "allowed-tools",
] as const;

export function analyzeSkill(candidate: SkillCandidate): Analysis {
  const fields = Object.keys(candidate.parsed.frontmatter);
  const unsupported = fields.filter(
    field => !KIRO_COMMON_SKILL_FIELDS.includes(field as never),
  );
  let reason: string | undefined;
  if (candidate.discoveryConflict) {
    reason = candidate.discoveryConflict;
  } else if (candidate.scopeSemantics === "nested-subtree") {
    reason = `Cursor nested project Skill is scoped to ${candidate.sourceScopeRoot}. Kiro documents no equivalent nested directory scope.`;
  } else if (candidate.organizationalDepth > 0) {
    reason =
      "Cursor documents recursive organizational Skill folders, but Kiro recursive Skill discovery is not proven.";
  } else if (unsupported.length > 0) {
    reason = `Unsupported semantic Skill field(s): ${unsupported.join(", ")}.`;
  } else if (
    typeof candidate.parsed.frontmatter.name !== "string" ||
    typeof candidate.parsed.frontmatter.description !== "string"
  ) {
    reason = "Agent Skills require string name and description fields.";
  } else if (candidate.parsed.frontmatter.name !== candidate.skillName) {
    reason = `Skill name ${String(candidate.parsed.frontmatter.name)} does not match directory ${candidate.skillName}.`;
  } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidate.skillName)) {
    reason = `Skill name ${candidate.skillName} does not satisfy the Agent Skills lowercase hyphenated name contract.`;
  }
  if (reason) {
    return {
      candidate,
      status: "CONFLICT",
      summary: "Skill semantics cannot be preserved",
      reason,
      cursorBehavior:
        "Cursor uses directory location and frontmatter to control Skill identity, scope and invocation.",
      kiroGap:
        "Kiro only documents root/global Skills and the common Agent Skills field subset.",
      fields,
      selected: false,
    };
  }
  return {
    candidate,
    status: "TRANSFORM",
    summary:
      "Standard Agent Skill package can be copied to Kiro's documented Skill root",
    fields,
    selected: true,
  };
}
