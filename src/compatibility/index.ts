import type { Analysis, Candidate } from "../domain.js";
import { analyzeAgentsMd } from "./agents-md.js";
import { analyzeHook } from "./hooks.js";
import { analyzeRule } from "./rules.js";
import { analyzeSkill } from "./skills.js";
import { analyzeSubagent } from "./subagents.js";

export function analyzeCandidate(candidate: Candidate): Analysis {
  switch (candidate.kind) {
    case "rule":
      return analyzeRule(candidate);
    case "skill":
      return analyzeSkill(candidate);
    case "subagent":
      return analyzeSubagent(candidate);
    case "hook":
      return analyzeHook(candidate);
    case "agents-md":
      return analyzeAgentsMd(candidate);
  }
}
