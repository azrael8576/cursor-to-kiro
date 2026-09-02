import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli/app.js";
import type { MigrationRuntime } from "../src/runtime.js";
import { prepareMigration } from "../src/planner/migration-plan.js";
import { scan } from "../src/scanner/index.js";
import {
  cleanupTemporary,
  fixtureWorkspace,
  tempDirectory,
  writeText,
} from "./helpers.js";

afterEach(cleanupTemporary);

function runtime(root: string): MigrationRuntime {
  return {
    cwd: root,
    terminal: { input: process.stdin, output: process.stdout },
    temporaryDirectory: tempDirectory,
  };
}

describe("migration runtime interface", () => {
  it("migrates a workspace through an injected runtime", async () => {
    const root = await fixtureWorkspace("golden/input");
    const output: string[] = [];
    const io = {
      log: (value: unknown) => output.push(String(value)),
      error: (value: unknown) => output.push(String(value)),
    };

    expect(await runCli(["--yes"], runtime(root), io)).toBe(0);
    expect(output.join("\n")).toContain("Created: 5; already migrated: 0.");
  });

  it("keeps report destination validation inside migration planning", async () => {
    const root = await fixtureWorkspace("golden/input");
    await writeText(root, ".cursor-to-kiro-report.md", "existing report");
    const scanned = await scan({
      root,
    });

    const result = await prepareMigration({
      candidates: scanned.candidates,
      root,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "destination-conflict" },
    });
  });

  it("discovers project artifacts even when the project has no Git metadata", async () => {
    const root = await tempDirectory("workspace-");
    await writeText(
      root,
      ".cursor/skills/workspace/SKILL.md",
      "---\nname: workspace\ndescription: Workspace.\n---\nRun.\n",
    );
    await writeText(
      root,
      ".cursor/agents/reviewer.md",
      "---\nname: reviewer\ndescription: Reviewer.\n---\nRun.\n",
    );
    await writeText(
      root,
      ".cursor/rules/project.mdc",
      "---\nalwaysApply: true\n---\nProject rule.\n",
    );
    await writeText(
      root,
      ".cursor/hooks.json",
      '{"version":1,"hooks":{"sessionStart":[{"command":"echo start"}]}}',
    );

    const scanned = await scan({
      root,
    });

    expect(scanned.candidates.map(candidate => candidate.identity)).toEqual([
      ".cursor/agents/reviewer.md",
      ".cursor/hooks.json#sessionStart[0]",
      ".cursor/rules/project.mdc",
      ".cursor/skills/workspace/SKILL.md",
    ]);
  });
});
