import type { ManifestEntry, RuleCandidate } from "../domain.js";

export function convertRule(_candidate: RuleCandidate): ManifestEntry[] {
  throw new Error("No Cursor Rule profile is allowlisted for automatic migration in the 2026-09-02 strict contract");
}
