import { readFile } from "node:fs/promises";
import type { SourceFile } from "../domain.js";

export async function readSourceFile(absolutePath: string, identity: string): Promise<SourceFile> {
  return { absolutePath, identity, bytes: await readFile(absolutePath) };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
