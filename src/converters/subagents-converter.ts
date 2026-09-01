import type { ManifestEntry, SubagentCandidate } from "../domain.js";

export function convertSubagent(_candidate: SubagentCandidate): ManifestEntry[] {
  throw new Error("Cursor custom Subagent runtime defaults are not compatible with Kiro custom agents");
}
