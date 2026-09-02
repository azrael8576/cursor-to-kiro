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
  it("transforms a file-matched Rule and its live file references", async () => {
    const root = await tempDirectory();
    await writeText(root, "lib/repo/api.dart", "class Api {}\n");
    await writeText(root, "lib/repo/model.dart", "class Model {}\n");
    await writeText(root, "template.dart", "class Template {}\n");
    await writeText(
      root,
      ".cursor/rules/api.mdc",
      [
        "---",
        "alwaysApply: false",
        "description: Apply to API changes.",
        "globs:",
        '  - "lib/repo/**/*.dart"',
        "---",
        "Read [the API](mdc:lib/repo/api.dart), @lib/repo/model.dart, and @template.dart.",
        "",
      ].join("\n"),
    );
    const plan = await createMigrationPlan(
      (
        await scan({
          root,
        })
      ).candidates,
    );

    const rule = plan.analyses.find(item => item.candidate.kind === "rule");
    expect(rule?.status).toBe("TRANSFORM");
    expect(rule?.selected).toBe(true);
    expect(
      plan.manifest.map(item => [
        item.displayPath,
        new TextDecoder().decode(item.bytes),
      ]),
    ).toEqual([
      [
        ".agents/docs/rules/api.md",
        "Read #[[file:lib/repo/api.dart]], #[[file:lib/repo/model.dart]], and #[[file:template.dart]].\n",
      ],
      [
        ".kiro/steering/api.md",
        [
          "---",
          "inclusion: fileMatch",
          "fileMatchPattern:",
          "  - lib/repo/**/*.dart",
          "---",
          "#[[file:.agents/docs/rules/api.md]]",
          "",
        ].join("\n"),
      ],
    ]);
  });

  it("reports the exact unsupported Rule field or value", async () => {
    const root = await tempDirectory();
    await writeText(
      root,
      ".cursor/rules/unknown-field.mdc",
      "---\nalwaysApply: false\nglobs: lib/**/*.dart\nfutureSemanticField: enabled\n---\nBody\n",
    );
    await writeText(
      root,
      ".cursor/rules/invalid-glob.mdc",
      "---\nalwaysApply: false\nglobs: 42\n---\nBody\n",
    );
    await writeText(
      root,
      ".cursor/rules/exotic-glob.mdc",
      "---\nalwaysApply: false\nglobs: lib/{feature,base}/**/*.dart\n---\nBody\n",
    );
    await writeText(
      root,
      ".cursor/rules/missing-reference.mdc",
      "---\nalwaysApply: false\nglobs: lib/**/*.dart\n---\nRead [missing](mdc:lib/missing.dart).\n",
    );
    const plan = await createMigrationPlan(
      (
        await scan({
          root,
        })
      ).candidates,
    );

    const reasonFor = (identity: string) =>
      plan.analyses.find(item => item.candidate.identity === identity)?.reason;
    expect(reasonFor(".cursor/rules/unknown-field.mdc")).toBe(
      'UNSUPPORTED_CURSOR_FIELD: futureSemanticField="enabled".',
    );
    expect(reasonFor(".cursor/rules/invalid-glob.mdc")).toBe(
      "INVALID_GLOB: globs=42; expected a non-empty string or string array.",
    );
    expect(reasonFor(".cursor/rules/exotic-glob.mdc")).toBe(
      'UNVERIFIED_GLOB_PATTERN: globs="lib/{feature,base}/**/*.dart".',
    );
    expect(reasonFor(".cursor/rules/missing-reference.mdc")).toBe(
      "MISSING_REFERENCE_TARGET: mdc:lib/missing.dart.",
    );
  });

  it("transforms always, auto, manual, and scalar multi-glob Rule modes", async () => {
    const root = await tempDirectory();
    await writeText(
      root,
      ".cursor/rules/always.mdc",
      "---\nalwaysApply: true\ndescription: Ignored by Cursor.\nglobs: lib/**/*.dart\n---\nAlways\n",
    );
    await writeText(
      root,
      ".cursor/rules/auto.mdc",
      "---\nalwaysApply: false\ndescription: Use for API work.\n---\nAuto\n",
    );
    await writeText(
      root,
      ".cursor/rules/manual.mdc",
      "---\nalwaysApply: false\n---\nManual\n",
    );
    await writeText(
      root,
      ".cursor/rules/multi-glob.mdc",
      "---\nalwaysApply: false\nglobs: lib/**/*.dart, test/**/*.dart\n---\nMultiple\n",
    );
    const plan = await createMigrationPlan(
      (
        await scan({
          root,
        })
      ).candidates,
    );

    expect(plan.analyses.every(item => item.status === "TRANSFORM")).toBe(true);
    expect(
      plan.manifest.map(item => [
        item.displayPath,
        new TextDecoder().decode(item.bytes),
      ]),
    ).toEqual([
      [".agents/docs/rules/always.md", "Always\n"],
      [
        ".kiro/steering/always.md",
        "---\ninclusion: always\n---\n#[[file:.agents/docs/rules/always.md]]\n",
      ],
      [".agents/docs/rules/auto.md", "Auto\n"],
      [
        ".kiro/steering/auto.md",
        "---\ninclusion: auto\nname: auto\ndescription: Use for API work.\n---\n#[[file:.agents/docs/rules/auto.md]]\n",
      ],
      [".agents/docs/rules/manual.md", "Manual\n"],
      [
        ".kiro/steering/manual.md",
        "---\ninclusion: manual\n---\n#[[file:.agents/docs/rules/manual.md]]\n",
      ],
      [".agents/docs/rules/multi-glob.md", "Multiple\n"],
      [
        ".kiro/steering/multi-glob.md",
        "---\ninclusion: fileMatch\nfileMatchPattern:\n  - lib/**/*.dart\n  - test/**/*.dart\n---\n#[[file:.agents/docs/rules/multi-glob.md]]\n",
      ],
    ]);
  });

  it("migrates only the proven Skill subset in the golden fixture", async () => {
    const root = await fixtureWorkspace("golden/input");
    const scanned = await scan({
      root,
    });
    const plan = await createMigrationPlan(scanned.candidates);
    expect(
      plan.analyses
        .filter(item => item.selected)
        .map(item => item.candidate.kind),
    ).toEqual(["rule", "skill"]);
    expect(
      plan.analyses.some(item => item.candidate.identity.endsWith("AGENTS.md")),
    ).toBe(false);
    expect(
      plan.analyses.find(item => item.candidate.kind === "rule")?.status,
    ).toBe("TRANSFORM");
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
      (
        await scan({
          root,
        })
      ).candidates,
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
      (
        await scan({
          root,
        })
      ).candidates,
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
