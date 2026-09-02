import { lstat } from "node:fs/promises";
import path from "node:path";

async function exists(absolutePath: string): Promise<boolean> {
  try {
    await lstat(absolutePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function resolveWorkspaceRoot(
  cwd: string,
  override?: string,
): Promise<{ root: string; warning?: string }> {
  if (override) {
    const root = path.resolve(cwd, override);
    const stat = await lstat(root);
    if (stat.isSymbolicLink() || !stat.isDirectory())
      throw new Error(`Workspace root must be a real directory: ${root}`);
    return { root };
  }
  const start = path.resolve(cwd);
  let current = start;
  while (true) {
    if (await exists(path.join(current, ".git"))) return { root: current };
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return {
    root: start,
    warning:
      "No containing .git file or directory was found; using the current working directory.",
  };
}
