import { chmod, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scan } from "../src/scanner/index.js";
import { createMigrationPlan } from "../src/planner/migration-plan.js";
import { renderMigrationReport } from "../src/report/migration-report.js";
import { commitTransaction } from "../src/transaction/transaction.js";
import { snapshotSelectedSources } from "../src/validator/source-integrity.js";
import { cleanupTemporary, tempDirectory, writeText } from "./helpers.js";

afterEach(cleanupTemporary);
const planAt = async (root: string) =>
  createMigrationPlan((await scan({ root })).candidates);
const textAt = (plan: Awaited<ReturnType<typeof planAt>>, name: string) => {
  const entry = plan.manifest.find(item => item.displayPath === name);
  expect(entry, name).toBeDefined();
  return new TextDecoder().decode(entry?.bytes);
};

async function agent(root: string, fields = "", body = "Review changes.") {
  await writeText(
    root,
    ".cursor/agents/reviewer.md",
    `---\ndescription: Review changes.\n${fields}---\n${body}\n`,
  );
}
async function skill(
  root: string,
  fields = "",
  location = ".cursor/skills/demo",
  body = "Follow the workflow.",
) {
  await writeText(
    root,
    `${location}/SKILL.md`,
    `---\nname: demo\ndescription: Demo workflow.\n${fields}---\n${body}\n`,
  );
}

describe("relaxed subagent migration", () => {
  it("converts the role, derives name, and reports model default differences", async () => {
    const root = await tempDirectory();
    await agent(root, "model: inherit\n");
    const plan = await planAt(root);
    expect(
      JSON.parse(textAt(plan, ".kiro/agents/reviewer.json")),
    ).toMatchObject({
      name: "reviewer",
      description: "Review changes.",
      prompt: "Review changes.\n",
    });
    expect(textAt(plan, ".kiro/agents/reviewer.json")).not.toContain('"model"');
    expect(renderMigrationReport(plan)).toContain("Kiro default");
  });
  it("turns readonly into an explicit read-only tool set", async () => {
    const root = await tempDirectory();
    await agent(root, "readonly: true\n");
    const config = JSON.parse(
      textAt(await planAt(root), ".kiro/agents/reviewer.json"),
    );
    expect(config.tools).toEqual(["read"]);
    expect(config.includeMcpJson).toBe(false);
    expect(config.allowedTools).toBeUndefined();
  });
  it.each([
    "model: composer-2\n",
    "is_background: true\n",
    "futureField: enabled\n",
  ])("preserves unresolved %s in a non-activated draft", async fields => {
    const root = await tempDirectory();
    await agent(root, fields);
    const plan = await planAt(root);
    expect(
      plan.manifest.some(entry =>
        entry.displayPath.startsWith(".kiro/agents/"),
      ),
    ).toBe(false);
    expect(
      plan.manifest.some(entry =>
        entry.displayPath.startsWith(".agents/docs/migration-drafts/"),
      ),
    ).toBe(true);
    expect(renderMigrationReport(plan)).toContain("DRAFT");
    expect(renderMigrationReport(plan)).toContain(fields.split(":")[0]);
  });
  it("rejects invalid booleans and unsafe identifiers with a named error", async () => {
    const root = await tempDirectory();
    await agent(root, 'readonly: "yes"\n');
    expect((await planAt(root)).analyses[0]?.reason).toContain("INVALID_FIELD");
    await agent(root, "name: ../escape\n");
    expect((await planAt(root)).manifest).toHaveLength(0);
  });
  it("uses file resources for references without rewriting email, MCP or fenced examples", async () => {
    const root = await tempDirectory();
    await writeText(root, "docs/guide.md", "Guide");
    await agent(
      root,
      "",
      "Read @docs/guide.md. Keep user@example.com and @server/tool.\n```text\n@missing.md\n```",
    );
    const config = JSON.parse(
      textAt(await planAt(root), ".kiro/agents/reviewer.json"),
    );
    expect(config.resources).toContain("file://docs/guide.md");
    expect(config.prompt).toContain("user@example.com and @server/tool");
    expect(config.prompt).toContain("@missing.md");
  });
  it("reports missing references precisely", async () => {
    const root = await tempDirectory();
    await agent(root, "", "Read @missing.md.");
    const plan = await planAt(root);
    expect(plan.manifest).toHaveLength(0);
    expect(plan.analyses[0]?.reason).toContain("MISSING_REFERENCE_TARGET");
  });
});

describe("relaxed skill migration", () => {
  it("flattens organizational folders and preserves bundle-relative links", async () => {
    const root = await tempDirectory();
    await skill(
      root,
      "",
      ".cursor/skills/category/demo",
      "Read [guide](references/guide.md).",
    );
    await writeText(
      root,
      ".cursor/skills/category/demo/references/guide.md",
      "Guide",
    );
    const plan = await planAt(root);
    expect(textAt(plan, ".kiro/skills/demo/SKILL.md")).toContain(
      "[guide](references/guide.md)",
    );
    expect(textAt(plan, ".kiro/skills/demo/references/guide.md")).toBe("Guide");
  });
  it("preserves UI metadata without rejecting the skill", async () => {
    const root = await tempDirectory();
    await skill(
      root,
      "icon: beaker\ncolor: green\ndisable-model-invocation: false\n",
    );
    const plan = await planAt(root);
    expect(textAt(plan, ".kiro/skills/demo/SKILL.md")).toContain(
      "cursor.icon: beaker",
    );
    expect(renderMigrationReport(plan)).toContain("color");
  });
  it("creates only manual steering and a passive bundle for manual-only skills", async () => {
    const root = await tempDirectory();
    await skill(
      root,
      "disable-model-invocation: true\n",
      ".cursor/skills/demo",
      "Read [guide](references/guide.md).",
    );
    await writeText(root, ".cursor/skills/demo/references/guide.md", "Guide");
    const plan = await planAt(root);
    expect(textAt(plan, ".kiro/steering/demo.md")).toContain(
      "inclusion: manual",
    );
    expect(
      plan.manifest.some(entry => entry.displayPath.includes("/SKILL.md")),
    ).toBe(false);
    expect(textAt(plan, ".agents/docs/skills/demo/instructions.md")).toContain(
      "references/guide.md",
    );
    expect(textAt(plan, ".kiro/steering/demo.md")).toContain(
      "#[[file:.agents/docs/skills/demo/instructions.md]]",
    );
  });
  it("maps scope with paths precedence and maintains a nested subtree intersection", async () => {
    const root = await tempDirectory();
    await skill(
      root,
      'paths: "**/*.tsx, **/*.ts"\nglobs: ignored/**\n',
      "apps/web/.cursor/skills/demo",
    );
    const plan = await planAt(root);
    const steering = textAt(plan, ".kiro/steering/apps--web--demo.md");
    expect(steering).toContain("apps/web/**/*.tsx");
    expect(steering).toContain("apps/web/**/*.ts");
    expect(steering).not.toContain("ignored");
    expect(renderMigrationReport(plan)).toContain("fileMatch");
  });
  it("does not auto-load manual plus paths", async () => {
    const root = await tempDirectory();
    await skill(root, "disable-model-invocation: true\npaths: src/**\n");
    const plan = await planAt(root);
    expect(
      plan.manifest.some(entry => entry.displayPath.startsWith(".kiro/")),
    ).toBe(false);
    expect(renderMigrationReport(plan)).toContain("DRAFT");
  });
  it.each([65, 0])("rejects name length %i", async length => {
    const root = await tempDirectory();
    const name = "a".repeat(length);
    await writeText(
      root,
      ".cursor/skills/demo/SKILL.md",
      `---\nname: "${name}"\ndescription: Valid\n---\nBody`,
    );
    expect((await planAt(root)).analyses[0]?.reason).toContain("INVALID_FIELD");
  });
  it.each([
    "description: ''",
    `description: ${"a".repeat(1025)}`,
    "metadata: { key: 42 }",
  ])("validates %s", async field => {
    const root = await tempDirectory();
    await writeText(
      root,
      ".cursor/skills/demo/SKILL.md",
      `---\nname: demo\n${field.startsWith("description") ? "" : "description: Valid\n"}${field}\n---\nBody`,
    );
    expect((await planAt(root)).analyses[0]?.reason).toContain("INVALID_FIELD");
  });
  it("preserves executable bits and is idempotent", async () => {
    const root = await tempDirectory();
    await skill(root);
    await writeText(
      root,
      ".cursor/skills/demo/scripts/run.sh",
      "#!/bin/sh\ntrue\n",
    );
    await chmod(path.join(root, ".cursor/skills/demo/scripts/run.sh"), 0o755);
    const plan = await planAt(root);
    await commitTransaction(
      plan.manifest,
      snapshotSelectedSources(plan.analyses),
      tempDirectory,
    );
    expect(
      (await stat(path.join(root, ".kiro/skills/demo/scripts/run.sh"))).mode &
        0o111,
    ).toBe(0o111);
    const second = await planAt(root);
    expect(
      (
        await commitTransaction(
          second.manifest,
          snapshotSelectedSources(second.analyses),
          tempDirectory,
        )
      ).created,
    ).toHaveLength(0);
    expect(
      await readFile(
        path.join(root, ".cursor/skills/demo/scripts/run.sh"),
        "utf8",
      ),
    ).toBe("#!/bin/sh\ntrue\n");
  });
});

describe("hook conversion", () => {
  it("emits standalone v1 and a disabled adapter draft for an unverified script", async () => {
    const root = await tempDirectory();
    await writeText(
      root,
      ".cursor/hooks.json",
      JSON.stringify({
        version: 1,
        hooks: {
          beforeSubmitPrompt: [
            {
              command: "node hook.mjs",
              matcher: "UserPromptSubmit",
              timeout: 12,
            },
          ],
        },
      }),
    );
    const plan = await planAt(root);
    const entry = plan.manifest.find(
      item =>
        item.displayPath.startsWith(".kiro/hooks/") &&
        item.displayPath.endsWith(".json"),
    );
    expect(entry).toBeDefined();
    const config = JSON.parse(new TextDecoder().decode(entry?.bytes));
    expect(config.version).toBe("v1");
    expect(config.hooks[0]).toMatchObject({
      trigger: "UserPromptSubmit",
      enabled: false,
      timeout: 14,
    });
    expect(config.hooks[0].matcher).toBeUndefined();
    expect(config.hooks[0].action.command).toContain("node ");
    expect(renderMigrationReport(plan)).toContain("DRAFT");
  });
  it("reports an unsupported lifecycle by its actual name", async () => {
    const root = await tempDirectory();
    await writeText(
      root,
      ".cursor/hooks.json",
      JSON.stringify({
        version: 1,
        hooks: { sessionEnd: [{ command: "echo end" }] },
      }),
    );
    const plan = await planAt(root);
    expect(plan.analyses[0]?.reason).toContain("sessionEnd");
    expect(plan.manifest).toHaveLength(0);
  });
});

describe("reference relocation and destination failures", () => {
  it("relocates cross-bundle links, but retains source references when the target is not selected", async () => {
    const root = await tempDirectory();
    await skill(
      root,
      "",
      ".cursor/skills/category/demo",
      "Read [other](../../other/SKILL.md#usage).",
    );
    await writeText(
      root,
      ".cursor/skills/other/SKILL.md",
      "---\nname: other\ndescription: Other\n---\nOther",
    );
    const candidates = (await scan({ root })).candidates;
    const full = await createMigrationPlan(candidates);
    expect(textAt(full, ".kiro/skills/demo/SKILL.md")).toContain(
      "../other/SKILL.md#usage",
    );
    const partial = await createMigrationPlan(
      candidates,
      new Set(
        candidates
          .filter(c => c.identity.includes("category/demo"))
          .map(c => c.id),
      ),
    );
    expect(textAt(partial, ".kiro/skills/demo/SKILL.md")).toContain(
      "../../../.cursor/skills/other/SKILL.md#usage",
    );
  });
  it("does not reference a destination rejected because of existing content", async () => {
    const root = await tempDirectory();
    await skill(
      root,
      "",
      ".cursor/skills/demo",
      "Read [other](../other/SKILL.md).",
    );
    await writeText(
      root,
      ".cursor/skills/other/SKILL.md",
      "---\nname: other\ndescription: Other\n---\nOther",
    );
    await writeText(root, ".kiro/skills/other/SKILL.md", "User content");
    const plan = await planAt(root);
    expect(textAt(plan, ".kiro/skills/demo/SKILL.md")).toContain(
      "../../../.cursor/skills/other/SKILL.md",
    );
    expect(
      plan.analyses.find(a => a.candidate.identity.includes("other/SKILL.md"))
        ?.status,
    ).toBe("CONFLICT");
  });
  it("preserves Markdown titles and quoted paths containing spaces", async () => {
    const root = await tempDirectory();
    await skill(
      root,
      "",
      ".cursor/skills/demo",
      'Read [guide](<references/my guide.md> "Title").',
    );
    await writeText(
      root,
      ".cursor/skills/demo/references/my guide.md",
      "Guide",
    );
    expect(textAt(await planAt(root), ".kiro/skills/demo/SKILL.md")).toContain(
      'references/my%20guide.md "Title"',
    );
  });
  it("rejects references outside the workspace", async () => {
    const root = await tempDirectory();
    await skill(
      root,
      "",
      ".cursor/skills/demo",
      "[outside](../../../../outside.md)",
    );
    expect((await planAt(root)).analyses[0]?.reason).toContain(
      "UNSAFE_REFERENCE",
    );
  });
});

describe("migration contract boundaries", () => {
  it("loads migrated skills through skill URIs in agent resources", async () => {
    const root = await tempDirectory();
    await agent(root, "", "Use @.cursor/skills/demo/SKILL.md.");
    await skill(root);
    const config = JSON.parse(
      textAt(await planAt(root), ".kiro/agents/reviewer.json"),
    );
    expect(config.resources).toContain("skill://.kiro/skills/demo/SKILL.md");
    expect(config.resources).not.toContain("file://.kiro/skills/demo/SKILL.md");
  });
  it("accepts maximum valid skill field lengths", async () => {
    const root = await tempDirectory();
    const name = "a".repeat(64);
    await writeText(
      root,
      `.cursor/skills/${name}/SKILL.md`,
      `---\nname: ${name}\ndescription: ${"d".repeat(1024)}\n---\nBody`,
    );
    expect((await planAt(root)).analyses[0]?.status).toBe("TRANSFORM");
  });
  it.each(["allowed-tools: Read\n", "unknown: enabled\n"])(
    "retains unsupported %s in a passive draft",
    async fields => {
      const root = await tempDirectory();
      await skill(root, fields);
      const plan = await planAt(root);
      expect(
        plan.manifest.some(entry => entry.displayPath.startsWith(".kiro/")),
      ).toBe(false);
      expect(
        textAt(
          plan,
          ".agents/docs/migration-drafts/skills/demo/cursor-source.txt",
        ),
      ).toContain(fields);
    },
  );
  it.each([
    { timeout: -1 },
    { failClosed: "yes" },
    { matcher: "[" },
    { type: "prompt", prompt: "Check" },
  ])("rejects malformed or unsupported hook fields: %j", async fields => {
    const root = await tempDirectory();
    await writeText(
      root,
      ".cursor/hooks.json",
      JSON.stringify({
        version: 1,
        hooks: { preToolUse: [{ command: "true", ...fields }] },
      }),
    );
    const plan = await planAt(root);
    expect(plan.manifest).toHaveLength(0);
    expect(plan.analyses[0]?.reason).toContain("INVALID_FIELD");
  });
});
