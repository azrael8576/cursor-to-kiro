import { mkdir } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveWorkspaceRoot } from "../src/scanner/workspace-root.js";
import { cleanupTemporary, tempDirectory } from "./helpers.js";

afterEach(cleanupTemporary);

describe("workspace root resolution", () => {
  it("uses the nearest containing .git without invoking git", async () => {
    const outer = await tempDirectory();
    const innerRepo = path.join(outer, "repo");
    const nested = path.join(innerRepo, "packages", "app");
    await mkdir(path.join(innerRepo, ".git"), { recursive: true });
    await mkdir(nested, { recursive: true });
    expect(await resolveWorkspaceRoot(nested)).toEqual({ root: innerRepo });
  });

  it("falls back to cwd with a warning", async () => {
    const cwd = await tempDirectory();
    const resolved = await resolveWorkspaceRoot(cwd);
    expect(resolved.root).toBe(cwd);
    expect(resolved.warning).toContain("using the current working directory");
  });
});
