import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { ManifestEntry } from "../domain.js";
import { bytesEqual } from "../util/text.js";

export interface DestinationIssue {
  artifactIds: string[];
  reason: string;
}

function folded(absolutePath: string): string {
  return path.resolve(absolutePath).normalize("NFC").toLocaleLowerCase("en-US");
}

export function detectManifestCollisions(entries: ManifestEntry[]): {
  entries: ManifestEntry[];
  issues: DestinationIssue[];
} {
  const issues: DestinationIssue[] = [];
  const byFolded = new Map<string, ManifestEntry[]>();
  for (const entry of entries) {
    const key = folded(entry.absolutePath);
    const group = byFolded.get(key) ?? [];
    group.push(entry);
    byFolded.set(key, group);
  }
  const deduplicated: ManifestEntry[] = [];
  for (const group of byFolded.values()) {
    const [first] = group;
    if (!first) throw new Error("Manifest collision group cannot be empty");
    if (group.length === 1) {
      deduplicated.push(first);
      continue;
    }
    const identical = group.every(
      entry =>
        entry.semanticKey === first.semanticKey &&
        bytesEqual(entry.bytes, first.bytes),
    );
    if (identical) {
      deduplicated.push(first);
    } else {
      issues.push({
        artifactIds: [...new Set(group.map(entry => entry.artifactId))],
        reason: `Multiple sources target the same case-insensitive destination: ${group.map(entry => entry.displayPath).join(", ")}.`,
      });
    }
  }
  const sorted = [...deduplicated].sort((left, right) =>
    folded(left.absolutePath).localeCompare(folded(right.absolutePath)),
  );
  for (const [leftIndex, left] of sorted.entries()) {
    for (const right of sorted.slice(leftIndex + 1)) {
      const leftPath = folded(left.absolutePath);
      const rightPath = folded(right.absolutePath);
      if (
        rightPath.startsWith(`${leftPath}${path.sep}`) ||
        leftPath.startsWith(`${rightPath}${path.sep}`)
      ) {
        issues.push({
          artifactIds: [...new Set([left.artifactId, right.artifactId])],
          reason: `File-vs-directory destination collision between ${left.displayPath} and ${right.displayPath}.`,
        });
      }
    }
  }
  const badIds = new Set(issues.flatMap(issue => issue.artifactIds));
  return {
    entries: deduplicated.filter(entry => !badIds.has(entry.artifactId)),
    issues,
  };
}

async function lstatOptional(absolutePath: string) {
  try {
    return await lstat(absolutePath);
  } catch (error) {
    if (
      ["ENOENT", "ENOTDIR"].includes(
        (error as NodeJS.ErrnoException).code ?? "",
      )
    )
      return undefined;
    throw error;
  }
}

async function existingCaseCollision(
  absolutePath: string,
): Promise<string | undefined> {
  const parent = path.dirname(absolutePath);
  let names: string[];
  try {
    names = await readdir(parent);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  const basename = path.basename(absolutePath);
  return names.find(
    name =>
      name !== basename &&
      name.toLocaleLowerCase("en-US") === basename.toLocaleLowerCase("en-US"),
  );
}

async function unsafeExistingParent(
  absolutePath: string,
): Promise<string | undefined> {
  let current = path.dirname(path.resolve(absolutePath));
  while (true) {
    const stat = await lstatOptional(current);
    if (stat) {
      if (stat.isSymbolicLink() || !stat.isDirectory()) return current;
      return undefined;
    }
    const parent = path.dirname(current);
    if (parent === current)
      return `No existing directory ancestor for ${absolutePath}`;
    current = parent;
  }
}

export async function detectExistingDestinationIssues(
  entries: ManifestEntry[],
): Promise<DestinationIssue[]> {
  const issues: DestinationIssue[] = [];
  for (const entry of entries) {
    const unsafeParent = await unsafeExistingParent(entry.absolutePath);
    if (unsafeParent) {
      issues.push({
        artifactIds: [entry.artifactId],
        reason: `Destination has an unsafe file or symlink parent: ${unsafeParent}.`,
      });
      continue;
    }
    const collision = await existingCaseCollision(entry.absolutePath);
    if (collision) {
      issues.push({
        artifactIds: [entry.artifactId],
        reason: `Case-insensitive collision with existing destination ${collision}.`,
      });
      continue;
    }
    const stat = await lstatOptional(entry.absolutePath);
    if (!stat) continue;
    if (stat.isSymbolicLink() || !stat.isFile()) {
      issues.push({
        artifactIds: [entry.artifactId],
        reason: `Destination exists and is not a regular file: ${entry.displayPath}.`,
      });
      continue;
    }
    const existing = await readFile(entry.absolutePath);
    if (!bytesEqual(existing, entry.bytes)) {
      issues.push({
        artifactIds: [entry.artifactId],
        reason: `Destination exists with different content: ${entry.displayPath}.`,
      });
    }
  }
  return issues;
}
