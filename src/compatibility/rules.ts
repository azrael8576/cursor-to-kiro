import type { Analysis, RuleCandidate } from "../domain.js";

export const CURSOR_RULE_FIELDS = [
  "alwaysApply",
  "description",
  "globs",
] as const;

export const RULE_CONTRACT = {
  verifiedAt: "2026-09-02",
  sourceUrls: [
    "https://prod.cursor.com/docs/rules",
    "https://kiro.dev/docs/steering/",
  ],
  automaticProfiles: [] as readonly string[],
  reason:
    "Cursor Rule and Kiro steering differ in applicable surfaces, reference syntax, glob evidence, and precedence; no V1 profile is proven end-to-end equivalent.",
} as const;

export function analyzeRule(candidate: RuleCandidate): Analysis {
  const fields = Object.keys(candidate.parsed.frontmatter);
  const unknown = fields.filter(
    field => !CURSOR_RULE_FIELDS.includes(field as never),
  );
  let reason: string = RULE_CONTRACT.reason;
  if (candidate.discoveryConflict) reason = candidate.discoveryConflict;
  else if (unknown.length > 0)
    reason = `Unsupported Cursor Rule field(s): ${unknown.join(", ")}.`;
  else if (/(^|\s)@[A-Za-z0-9_.\-/]+/m.test(candidate.parsed.body)) {
    reason =
      "Cursor-specific @file reference detected; equivalent behavior through Kiro steering cannot be guaranteed.";
  } else if (candidate.legacy) {
    reason =
      "Legacy .cursorrules is Always Apply in Cursor, but the same cross-surface behavior is not proven for Kiro steering.";
  }
  return {
    candidate,
    status: "CONFLICT",
    summary:
      "Strict Rule migration is not proven by current official contracts",
    reason,
    cursorBehavior:
      "Cursor Rules apply through Cursor Agent Chat activation and Cursor-specific references/glob semantics.",
    kiroGap:
      "Kiro steering has similar modes but its surfaces, references, matching and precedence are not documented as 1:1.",
    fields,
    selected: false,
  };
}
