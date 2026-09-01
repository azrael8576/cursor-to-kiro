import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { walkFiles } from "../src/util/fs.js";

export const FIXTURES = fileURLToPath(new URL("./fixtures", import.meta.url));
const temporary: string[] = [];

export async function tempDirectory(prefix = "cursor-to-kiro-test-"): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  temporary.push(directory);
  return directory;
}

export async function fixtureWorkspace(name: string): Promise<string> {
  const target = await tempDirectory();
  await cp(path.join(FIXTURES, name), target, { recursive: true });
  return target;
}

export async function writeText(root: string, relative: string, content: string): Promise<void> {
  const target = path.join(root, ...relative.split("/"));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

export async function treeSnapshot(root: string): Promise<Array<{ identity: string; content: string }>> {
  const files = await walkFiles(root, { excludeDirectory: () => false });
  return Promise.all(files.map(async (file) => ({
    identity: file.identity,
    content: (await readFile(file.absolutePath, "utf8")).replace(/\r\n?/g, "\n"),
  })));
}

export async function cleanupTemporary(): Promise<void> {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
}
