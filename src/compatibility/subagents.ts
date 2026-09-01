import type { Analysis, SubagentCandidate } from "../domain.js";

export const CURSOR_SUBAGENT_FIELDS = ["name", "description", "model", "readonly", "is_background"] as const;

export function analyzeSubagent(candidate: SubagentCandidate): Analysis {
  const fields = Object.keys(candidate.parsed.frontmatter);
  const unknown = fields.filter((field) => !CURSOR_SUBAGENT_FIELDS.includes(field as never));
  const explicit = fields.filter((field) => ["model", "readonly", "is_background"].includes(field));
  const fieldText = [...unknown, ...explicit].filter((value, index, values) => values.indexOf(value) === index);
  return {
    candidate,
    status: "CONFLICT",
    summary: "Custom agent runtime defaults are not equivalent",
    reason:
      candidate.discoveryConflict ?? (fieldText.length > 0
        ? `Unsupported or non-equivalent Subagent field(s): ${fieldText.join(", ")}.`
        : "Even without explicit execution fields, Cursor and Kiro differ in model, tool, resource and permission inheritance defaults."),
    cursorBehavior: "Cursor subagents inherit the parent model and all local tools by default and have Cursor-specific delegation behavior.",
    kiroGap: "Kiro custom subagents use their assigned agent configuration/default model and different tool/resource/permission inheritance.",
    fields,
    selected: false,
  };
}
