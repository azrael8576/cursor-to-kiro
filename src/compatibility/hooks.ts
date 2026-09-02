import type { Analysis, HookCandidate } from "../domain.js";

export interface HookCompatibility {
  cursorTrigger: string;
  kiroTrigger?: string;
  status: "EXACT" | "TRANSFORM" | "CONFLICT";
  reason: string;
}

const SAME_NAME_CANDIDATES: Record<string, string> = {
  sessionStart: "SessionStart",
  preToolUse: "PreToolUse",
  postToolUse: "PostToolUse",
  beforeSubmitPrompt: "UserPromptSubmit",
  stop: "Stop",
};

export const HOOK_COMPATIBILITY: readonly HookCompatibility[] = Object.entries(
  SAME_NAME_CANDIDATES,
).map(([cursorTrigger, kiroTrigger]) => ({
  cursorTrigger,
  kiroTrigger,
  status: "CONFLICT",
  reason:
    "Cursor and Kiro command hooks use different stdin/stdout, exit-code, failure, context-injection and blocking protocols.",
}));

export function analyzeHook(candidate: HookCandidate): Analysis {
  const possibleTarget = SAME_NAME_CANDIDATES[candidate.trigger];
  const fields = Object.keys(candidate.definition);
  return {
    candidate,
    status: "CONFLICT",
    summary: possibleTarget
      ? `${candidate.trigger} resembles ${possibleTarget}, but the action protocol is not equivalent`
      : `No strict Kiro lifecycle equivalent for ${candidate.trigger}`,
    reason:
      candidate.discoveryConflict ??
      candidate.parseError ??
      (possibleTarget
        ? "Trigger naming is similar, but complete command/prompt protocol equivalence is not proven."
        : `Kiro standalone v1 exposes no 1:1 ${candidate.trigger} lifecycle contract.`),
    cursorBehavior:
      "Cursor hooks exchange JSON decisions over stdin/stdout and use Cursor-specific exit/fail-open semantics.",
    kiroGap:
      "Kiro hooks inject stdout/stderr into context and block on different exit and trigger rules.",
    fields,
    selected: false,
  };
}
