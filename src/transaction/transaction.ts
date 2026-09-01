import { constants } from "node:fs";
import { copyFile, lstat, mkdir, mkdtemp, readFile, rm, rmdir, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { CommitResult, ManifestEntry } from "../domain.js";
import type { IntegritySnapshot } from "../validator/source-integrity.js";
import { verifySourceIntegrity } from "../validator/source-integrity.js";
import { bytesEqual, hashBytes } from "../util/text.js";

async function statOptional(absolutePath: string) {
  try { return await lstat(absolutePath); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function ensureSafeDirectory(directory: string, createdDirectories: string[]): Promise<void> {
  const missing: string[] = [];
  let current = path.resolve(directory);
  while (true) {
    const stat = await statOptional(current);
    if (stat) {
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Unsafe destination parent: ${current}`);
      break;
    }
    missing.push(current);
    const parent = path.dirname(current);
    if (parent === current) throw new Error(`Cannot find an existing destination ancestor for ${directory}`);
    current = parent;
  }
  for (const target of missing.reverse()) {
    await mkdir(target);
    createdDirectories.push(target);
  }
}

export async function commitTransaction(
  entries: ManifestEntry[],
  sourceSnapshot: IntegritySnapshot,
): Promise<CommitResult> {
  await verifySourceIntegrity(sourceSnapshot);
  const stageRoot = await mkdtemp(path.join(os.tmpdir(), "cursor-to-kiro-"));
  const staged = new Map<string, string>();
  const created: string[] = [];
  const createdDirectories: string[] = [];
  const alreadyPresent: string[] = [];
  let rollbackPerformed = false;
  try {
    for (const entry of entries) {
      const stagePath = path.join(stageRoot, hashBytes(Buffer.from(entry.absolutePath)));
      await writeFile(stagePath, entry.bytes, { flag: "wx" });
      staged.set(entry.absolutePath, stagePath);
    }
    for (const entry of entries) {
      await ensureSafeDirectory(path.dirname(entry.absolutePath), createdDirectories);
      const existing = await statOptional(entry.absolutePath);
      if (existing) {
        if (!existing.isFile() || existing.isSymbolicLink()) throw new Error(`Destination is not a regular file: ${entry.displayPath}`);
        if (!bytesEqual(await readFile(entry.absolutePath), entry.bytes)) throw new Error(`Destination changed before commit: ${entry.displayPath}`);
        alreadyPresent.push(entry.displayPath);
        continue;
      }
      await copyFile(staged.get(entry.absolutePath)!, entry.absolutePath, constants.COPYFILE_EXCL);
      created.push(entry.absolutePath);
    }
    for (const entry of entries) {
      const output = await readFile(entry.absolutePath);
      if (!bytesEqual(output, entry.bytes)) throw new Error(`Post-write validation failed: ${entry.displayPath}`);
    }
    await verifySourceIntegrity(sourceSnapshot);
    return { created: created.map((absolute) => entries.find((entry) => entry.absolutePath === absolute)!.displayPath), alreadyPresent, rollbackPerformed };
  } catch (error) {
    rollbackPerformed = true;
    for (const absolutePath of created.reverse()) {
      try { await unlink(absolutePath); } catch { /* Report the original failure. */ }
    }
    for (const directory of createdDirectories.reverse()) {
      try { await rmdir(directory); } catch { /* Never remove a non-empty/pre-existing directory. */ }
    }
    throw Object.assign(new Error(`${error instanceof Error ? error.message : String(error)} Rollback attempted.`), { rollbackPerformed });
  } finally {
    await rm(stageRoot, { recursive: true, force: true });
  }
}
