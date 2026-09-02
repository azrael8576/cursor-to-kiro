import type { Analysis, RuleCandidate } from "../domain.js";

export const CURSOR_RULE_FIELDS = [
  "alwaysApply",
  "description",
  "globs",
] as const;

export const RULE_CONTRACT = {
  verifiedAt: "2026-09-02",
  sourceUrls: [
    "https://cursor.com/docs/rules",
    "https://kiro.dev/docs/steering/",
  ],
  automaticProfiles: ["always", "fileMatch", "auto", "manual"] as const,
} as const;

export function analyzeRule(candidate: RuleCandidate): Analysis {
  const fields = Object.keys(candidate.parsed.frontmatter);
  const unknown = fields.filter(
    field => !CURSOR_RULE_FIELDS.includes(field as never),
  );
  if (candidate.discoveryConflict)
    return conflict(candidate, candidate.discoveryConflict);
  if (candidate.referenceIssue)
    return conflict(candidate, candidate.referenceIssue);
  if (unknown.length > 0)
    return conflict(
      candidate,
      `UNSUPPORTED_CURSOR_FIELD: ${unknown.map(field => `${field}=${formatValue(candidate.parsed.frontmatter[field])}`).join(", ")}.`,
    );
  if (candidate.legacy)
    return conflict(
      candidate,
      "LEGACY_CURSOR_RULE: .cursorrules has no structured activation mode.",
    );

  const alwaysApply = candidate.parsed.frontmatter.alwaysApply;
  if (typeof alwaysApply !== "boolean")
    return conflict(
      candidate,
      `INVALID_ALWAYS_APPLY: alwaysApply=${formatValue(alwaysApply)}; expected a boolean.`,
    );
  if (alwaysApply)
    return transform(candidate, "Always-included Rule maps to Kiro steering.");

  const globs = candidate.parsed.frontmatter.globs;
  if (globs !== undefined) {
    if (typeof globs === "string" && isUnverifiedGlob(globs))
      return conflict(
        candidate,
        `UNVERIFIED_GLOB_PATTERN: globs=${formatValue(globs)}.`,
      );
    const patterns = normalizeGlobs(globs);
    if (!patterns)
      return conflict(
        candidate,
        `INVALID_GLOB: globs=${formatValue(globs)}; expected a non-empty string or string array.`,
      );
    const unverified = patterns.find(isUnverifiedGlob);
    if (unverified)
      return conflict(
        candidate,
        `UNVERIFIED_GLOB_PATTERN: globs=${formatValue(unverified)}.`,
      );
    return transform(
      candidate,
      "File-matched Rule maps to Kiro fileMatch steering.",
    );
  }
  if (
    typeof candidate.parsed.frontmatter.description === "string" &&
    candidate.parsed.frontmatter.description.trim() !== ""
  )
    return transform(
      candidate,
      "Description-matched Rule maps to Kiro auto steering.",
    );
  return transform(candidate, "Manual Rule maps to Kiro manual steering.");
}

export function normalizeGlobs(value: unknown): string[] | undefined {
  const values =
    typeof value === "string"
      ? value
          .split(",")
          .map(item => item.trim())
          .filter(Boolean)
      : value;
  if (
    !Array.isArray(values) ||
    values.length === 0 ||
    values.some(item => typeof item !== "string" || item.trim() === "")
  )
    return undefined;
  return values;
}

function isUnverifiedGlob(pattern: string): boolean {
  return (
    pattern.startsWith("!") ||
    /[{}\[\]]/.test(pattern) ||
    pattern.includes("@(")
  );
}

function formatValue(value: unknown): string {
  const formatted = JSON.stringify(value);
  return formatted === undefined ? String(value) : formatted;
}

function transform(candidate: RuleCandidate, summary: string): Analysis {
  return {
    candidate,
    status: "TRANSFORM",
    summary,
    fields: Object.keys(candidate.parsed.frontmatter),
    selected: true,
  };
}

function conflict(candidate: RuleCandidate, reason: string): Analysis {
  return {
    candidate,
    status: "CONFLICT",
    summary: "Rule contains a source value that cannot be translated safely",
    reason,
    fields: Object.keys(candidate.parsed.frontmatter),
    selected: false,
  };
}
