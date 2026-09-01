import type { HookCandidate, ManifestEntry } from "../domain.js";

export function convertHook(_candidate: HookCandidate): ManifestEntry[] {
  throw new Error("Cursor and Kiro hook action protocols are not compatible in V1");
}
