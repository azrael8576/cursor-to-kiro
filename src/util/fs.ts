import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Dirent } from "node:fs";
import { relativeIdentity, stableCompare } from "./paths.js";

export const GENERATED_DIRECTORY_NAMES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".cache",
  "cache",
  "target",
  "out",
]);

export interface WalkedFile {
  absolutePath: string;
  identity: string;
  symlink: boolean;
}

export async function pathExists(absolutePath: string): Promise<boolean> {
  try {
    await readFile(absolutePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EISDIR") return true;
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function sortedEntries(directory: string): Promise<Dirent[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries.sort((left, right) => stableCompare(left.name, right.name));
}

export async function walkFiles(
  root: string,
  options: {
    include?: (identity: string) => boolean;
    excludeDirectory?: (name: string, identity: string) => boolean;
  } = {},
): Promise<WalkedFile[]> {
  const found: WalkedFile[] = [];
  const visit = async (directory: string): Promise<void> => {
    let entries: Dirent[];
    try {
      entries = await sortedEntries(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const identity = relativeIdentity(root, absolutePath);
      if (entry.isSymbolicLink()) {
        if (!options.include || options.include(identity)) {
          found.push({ absolutePath, identity, symlink: true });
        }
        continue;
      }
      if (entry.isDirectory()) {
        const excluded = options.excludeDirectory
          ? options.excludeDirectory(entry.name, identity)
          : GENERATED_DIRECTORY_NAMES.has(entry.name);
        if (!excluded) await visit(absolutePath);
        continue;
      }
      if (entry.isFile() && (!options.include || options.include(identity))) {
        found.push({ absolutePath, identity, symlink: false });
      }
    }
  };
  await visit(root);
  return found;
}
