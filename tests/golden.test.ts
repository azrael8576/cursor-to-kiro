import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createMigrationPlan } from "../src/planner/migration-plan.js";
import { scan } from "../src/scanner/index.js";
import { commitTransaction } from "../src/transaction/transaction.js";
import { snapshotSelectedSources } from "../src/validator/source-integrity.js";
import {
  cleanupTemporary,
  FIXTURES,
  fixtureWorkspace,
  tempDirectory,
  treeSnapshot,
} from "./helpers.js";

afterEach(cleanupTemporary);

describe("golden and idempotency migration", () => {
  it("produces the exact expected Kiro tree and changes nothing on a second run", async () => {
    const root = await fixtureWorkspace("golden/input");
    const beforeSources = await treeSnapshot(root);
    const plan = await createMigrationPlan(
      (
        await scan({
          root,
        })
      ).candidates,
    );
    const snapshot = snapshotSelectedSources(plan.analyses);

    const first = await commitTransaction(
      plan.manifest,
      snapshot,
      tempDirectory,
    );
    expect(first.created).toHaveLength(8);
    const actual = await treeSnapshot(path.join(root, ".kiro"));
    const expected = await treeSnapshot(
      path.join(FIXTURES, "golden", "expected", ".kiro"),
    );
    expect(
      actual.filter(
        file =>
          !file.identity.startsWith("agents/") &&
          !file.identity.startsWith("hooks/"),
      ),
    ).toEqual(expected);
    const agent = actual.find(file => file.identity === "agents/reviewer.json");
    expect(JSON.parse(agent?.content ?? "null")).toEqual({
      name: "reviewer",
      description: "Review changes.",
      prompt: "\nReview the requested files.\n",
      tools: ["read", "write", "shell"],
      includeMcpJson: false,
      resources: ["skill://.kiro/skills/*/SKILL.md"],
    });
    const hook = actual.find(
      file => file.identity === "hooks/cursor-preToolUse-0.json",
    );
    expect(JSON.parse(hook?.content ?? "null")).toEqual({
      version: "v1",
      hooks: [
        {
          name: "cursor-preToolUse-0",
          trigger: "PreToolUse",
          enabled: false,
          timeout: 62,
          action: {
            type: "command",
            command: "node '.kiro/hooks/adapters/cursor-preToolUse-0.mjs'",
          },
        },
      ],
    });

    const secondPlan = await createMigrationPlan(
      (
        await scan({
          root,
        })
      ).candidates,
    );
    const second = await commitTransaction(
      secondPlan.manifest,
      snapshotSelectedSources(secondPlan.analyses),
      tempDirectory,
    );
    expect(second.created).toHaveLength(0);
    expect(second.alreadyPresent).toHaveLength(8);

    const afterSources = (await treeSnapshot(root)).filter(
      file =>
        !file.identity.startsWith(".kiro/") &&
        !file.identity.startsWith(".agents/docs/rules/") &&
        !file.identity.startsWith(".agents/docs/migration-drafts/"),
    );
    expect(afterSources).toEqual(beforeSources);
  });
});
