import { readFile } from "node:fs/promises";
import type { Analysis } from "../domain.js";
import { bytesEqual } from "../util/text.js";

export interface IntegritySnapshot {
  files: Map<string, Uint8Array>;
}

export function snapshotSelectedSources(analyses: Analysis[]): IntegritySnapshot {
  const files = new Map<string, Uint8Array>();
  for (const analysis of analyses) {
    if (!analysis.selected) continue;
    for (const source of analysis.candidate.sourceFiles) files.set(source.absolutePath, source.bytes);
  }
  return { files };
}

export async function verifySourceIntegrity(snapshot: IntegritySnapshot): Promise<void> {
  for (const [absolutePath, expected] of snapshot.files) {
    let current: Uint8Array;
    try {
      current = await readFile(absolutePath);
    } catch (error) {
      throw new Error(`Source integrity check failed for ${absolutePath}: ${String(error)}`);
    }
    if (!bytesEqual(current, expected)) throw new Error(`Source changed during migration: ${absolutePath}`);
  }
}
