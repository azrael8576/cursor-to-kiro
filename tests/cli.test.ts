import { afterEach, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { runCli } from "../src/cli/app.js";
import type { MigrationRuntime } from "../src/runtime.js";
import {
  cleanupTemporary,
  fixtureWorkspace,
  tempDirectory,
} from "./helpers.js";

afterEach(cleanupTemporary);

function runtime(root: string): MigrationRuntime {
  return {
    cwd: root,
    terminal: { input: process.stdin, output: process.stdout },
    temporaryDirectory: tempDirectory,
  };
}

describe("CLI operational contract", () => {
  it("supports help and version", async () => {
    const output: string[] = [];
    const io = {
      log: (value: unknown) => output.push(String(value)),
      error: (value: unknown) => output.push(String(value)),
    };
    expect(await runCli(["--version"], runtime("."), io)).toBe(0);
    expect(output).toContain("0.1.0");
    output.length = 0;
    expect(await runCli(["--help"], runtime("."), io)).toBe(0);
    expect(output.join("\n")).toContain("Usage:");
    expect(output.join("\n")).toContain("Examples:");
    expect(output.join("\n")).not.toContain("--scope");
  });

  it("rejects the removed scope option", async () => {
    const output: string[] = [];
    const io = {
      log: (value: unknown) => output.push(String(value)),
      error: (value: unknown) => output.push(String(value)),
    };
    expect(await runCli(["--scope", "workspace"], runtime("."), io)).toBe(1);
    expect(output.join("\n")).toContain("Unknown option '--scope'");
  });

  it("performs a non-writing dry run with expected conflicts", async () => {
    const root = await fixtureWorkspace("golden/input");
    const output: string[] = [];
    const io = {
      log: (value: unknown) => output.push(String(value)),
      error: (value: unknown) => output.push(String(value)),
    };
    expect(await runCli(["--root", root, "--dry-run"], runtime(root), io)).toBe(
      0,
    );
    expect(output.join("\n")).toContain(
      "Dry run complete. No files were written.",
    );
    expect(output.join("\n")).toContain("Not migrated:");
  });

  it("commits through the CLI and is idempotent", async () => {
    const root = await fixtureWorkspace("golden/input");
    const output: string[] = [];
    const io = {
      log: (value: unknown) => output.push(String(value)),
      error: (value: unknown) => output.push(String(value)),
    };
    const args = ["--root", root, "--yes"];
    expect(await runCli(args, runtime(root), io)).toBe(0);
    expect(
      await readFile(
        path.join(root, ".kiro", "skills", "code-review", "SKILL.md"),
        "utf8",
      ),
    ).toContain("name: code-review");
    expect(
      await readFile(path.join(root, ".cursor-to-kiro-report.md"), "utf8"),
    ).toContain("Cursor → Kiro Migration Report");
    output.length = 0;
    expect(await runCli(args, runtime(root), io)).toBe(0);
    expect(output.join("\n")).toContain("Created: 0; already migrated: 9.");
  });
});
