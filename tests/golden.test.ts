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
          scope: "workspace",
          home: root,
          kiroHome: path.join(root, ".kiro"),
        })
      ).candidates,
    );
    const snapshot = snapshotSelectedSources(plan.analyses);

    const first = await commitTransaction(
      plan.manifest,
      snapshot,
      tempDirectory,
    );
    expect(first.created).toHaveLength(3);
    const actual = await treeSnapshot(path.join(root, ".kiro"));
    const expected = await treeSnapshot(
      path.join(FIXTURES, "golden", "expected", ".kiro"),
    );
    expect(actual).toEqual(expected);

    const secondPlan = await createMigrationPlan(
      (
        await scan({
          root,
          scope: "workspace",
          home: root,
          kiroHome: path.join(root, ".kiro"),
        })
      ).candidates,
    );
    const second = await commitTransaction(
      secondPlan.manifest,
      snapshotSelectedSources(secondPlan.analyses),
      tempDirectory,
    );
    expect(second.created).toHaveLength(0);
    expect(second.alreadyPresent).toHaveLength(3);

    const afterSources = (await treeSnapshot(root)).filter(
      file => !file.identity.startsWith(".kiro/"),
    );
    expect(afterSources).toEqual(beforeSources);
  });
});
