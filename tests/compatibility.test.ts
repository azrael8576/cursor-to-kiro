import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scan } from "../src/scanner/index.js";
import { createMigrationPlan } from "../src/planner/migration-plan.js";
import {
  cleanupTemporary,
  fixtureWorkspace,
  tempDirectory,
  writeText,
} from "./helpers.js";

afterEach(cleanupTemporary);

describe("strict compatibility analysis", () => {
  it("migrates only the proven Skill subset in the golden fixture", async () => {
    const root = await fixtureWorkspace("golden/input");
    const scanned = await scan({
      root,
      scope: "workspace",
      home: await tempDirectory("empty-home-"),
    });
    const plan = await createMigrationPlan(scanned.candidates);
    expect(
      plan.analyses
        .filter(item => item.selected)
        .map(item => item.candidate.kind),
    ).toEqual(["skill"]);
    expect(
      plan.analyses.find(item => item.candidate.identity === "AGENTS.md")
        ?.status,
    ).toBe("NATIVE");
    expect(
      plan.analyses.find(
        item => item.candidate.identity === "packages/app/AGENTS.md",
      )?.status,
    ).toBe("CONFLICT");
    expect(
      plan.analyses.find(item => item.candidate.kind === "rule")?.status,
    ).toBe("CONFLICT");
    expect(
      plan.analyses.find(item => item.candidate.kind === "subagent")?.status,
    ).toBe("CONFLICT");
    expect(
      plan.analyses.find(item => item.candidate.kind === "hook")?.status,
    ).toBe("CONFLICT");
  });

  it("rejects nested and Cursor-scoped Skills", async () => {
    const root = await tempDirectory();
    await writeText(
      root,
      "apps/web/.cursor/skills/deploy/SKILL.md",
      "---\nname: deploy\ndescription: Deploy web.\n---\nRun deploy.\n",
    );
    await writeText(
      root,
      ".cursor/skills/scoped/SKILL.md",
      "---\nname: scoped\ndescription: Scoped.\npaths: src/**\n---\nScoped.\n",
    );
    const plan = await createMigrationPlan(
      (await scan({ root, scope: "workspace" })).candidates,
    );
    const skills = plan.analyses.filter(
      item => item.candidate.kind === "skill",
    );
    expect(skills).toHaveLength(2);
    expect(skills.every(item => item.status === "CONFLICT")).toBe(true);
    expect(skills.map(item => item.reason).join(" ")).toContain(
      "nested project Skill",
    );
    expect(skills.map(item => item.reason).join(" ")).toContain("paths");
  });

  it("turns multiple different sources targeting one Skill into conflicts", async () => {
    const root = await tempDirectory();
    await writeText(
      root,
      ".cursor/skills/demo/SKILL.md",
      "---\nname: demo\ndescription: Cursor copy.\n---\nOne.\n",
    );
    await writeText(
      root,
      ".agents/skills/demo/SKILL.md",
      "---\nname: demo\ndescription: Agents copy.\n---\nTwo.\n",
    );
    const plan = await createMigrationPlan(
      (await scan({ root, scope: "workspace" })).candidates,
    );
    expect(plan.manifest).toHaveLength(0);
    expect(plan.destinationConflicts).toHaveLength(2);
    expect(
      plan.destinationConflicts.every(item =>
        item.reason?.includes("Multiple sources"),
      ),
    ).toBe(true);
    expect(path.join(root, ".kiro")).toBeTruthy();
  });
});
