import type { AgentsMdCandidate, Analysis } from "../domain.js";

export function analyzeAgentsMd(candidate: AgentsMdCandidate): Analysis {
  if (candidate.discoveryConflict) {
    return {
      candidate,
      status: "CONFLICT",
      summary: "AGENTS.md relies on a symlink",
      reason: candidate.discoveryConflict,
      selected: false,
    };
  }
  if (!candidate.nested) {
    return {
      candidate,
      status: "NATIVE",
      summary:
        "Root AGENTS.md is read natively by Cursor and Kiro and remains unchanged",
      selected: false,
    };
  }
  return {
    candidate,
    status: "CONFLICT",
    summary:
      "Nested AGENTS.md remains unchanged, but semantic equivalence is not proven",
    reason:
      "Kiro documents nested discovery but not Cursor's subtree-only composition and specificity precedence.",
    cursorBehavior:
      "Cursor scopes nested AGENTS.md to its directory subtree and merges parents with the most specific instructions winning.",
    kiroGap: "Kiro does not document the same subtree and precedence contract.",
    selected: false,
  };
}
