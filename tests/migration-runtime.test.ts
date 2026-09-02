import path from "node:path";
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
    home: root,
    kiroHome: path.join(root, ".kiro"),
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

    expect(
      await runCli(["--scope", "workspace", "--yes"], runtime(root), io),
    ).toBe(0);
    expect(output.join("\n")).toContain("Created: 4; already migrated: 0.");
  });

  it("keeps report destination validation inside migration planning", async () => {
    const root = await fixtureWorkspace("golden/input");
    await writeText(root, ".cursor-to-kiro-report.md", "existing report");
    const scanned = await scan({
      root,
      scope: "workspace",
      home: root,
      kiroHome: path.join(root, ".kiro"),
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

  it("discovers workspace and user artifacts from explicit roots", async () => {
    const root = await tempDirectory("workspace-");
    const home = await tempDirectory("home-");
    await writeText(
      root,
      ".cursor/skills/workspace/SKILL.md",
      "---\nname: workspace\ndescription: Workspace.\n---\nRun.\n",
    );
    await writeText(
      home,
      ".cursor/skills/user/SKILL.md",
      "---\nname: user\ndescription: User.\n---\nRun.\n",
    );

    const scanned = await scan({
      root,
      scope: "both",
      home,
      kiroHome: path.join(home, ".kiro"),
    });

    expect(scanned.candidates.map(candidate => candidate.identity)).toEqual([
      ".cursor/skills/workspace/SKILL.md",
      "~/.cursor/skills/user/SKILL.md",
    ]);
  });
});
