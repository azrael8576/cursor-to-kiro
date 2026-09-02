import type { Analysis, ManifestEntry } from "../domain.js";
import { convertHook } from "./hooks-converter.js";
import { convertRule } from "./rules-converter.js";
import { convertSkill } from "./skills-converter.js";
import { convertSubagent } from "./subagents-converter.js";

export function convertAnalysis(analysis: Analysis): ManifestEntry[] {
  if (analysis.status !== "EXACT" && analysis.status !== "TRANSFORM") return [];
  switch (analysis.candidate.kind) {
    case "skill":
      return convertSkill(analysis.candidate);
    case "rule":
      return convertRule(analysis.candidate);
    case "subagent":
      return convertSubagent(analysis.candidate);
    case "hook":
      return convertHook(analysis.candidate);
    case "agents-md":
      return [];
  }
}
