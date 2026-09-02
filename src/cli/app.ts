import { parseArgs } from "node:util";
import type { MigrationScope } from "../domain.js";
import { createMigrationPlan } from "../planner/migration-plan.js";
import { reportEntry } from "../report/migration-report.js";
import { scan } from "../scanner/index.js";
import { resolveWorkspaceRoot } from "../scanner/workspace-root.js";
import { commitTransaction } from "../transaction/transaction.js";
import { detectExistingDestinationIssues } from "../validator/destination-validator.js";
import { snapshotSelectedSources } from "../validator/source-integrity.js";
import { confirmMigration } from "./confirmation.js";
import { renderPlan, renderTerminalSummary, renderTree } from "./renderer.js";
import { promptScope } from "./scope-prompt.js";
import { selectArtifacts } from "./tree-selector.js";

export const VERSION = "0.1.0";

const HELP = `cursor-to-kiro ${VERSION}

Usage:
  cursor-to-kiro [options]

Options:
  --root <path>                  Override workspace root
  --scope <workspace|user|both> Select scope without prompting
  --dry-run                      Scan, analyze and preview without writing
  --yes                          Confirm a non-interactive migration
  --version                      Show version
  --help                         Show help
`;

export class SafetyError extends Error {}

function parseScope(value: string | undefined): MigrationScope | undefined {
  if (value === undefined) return undefined;
  if (value === "workspace" || value === "user" || value === "both")
    return value;
  throw new Error(`Invalid --scope value: ${value}`);
}

export async function runCli(
  argv: string[],
  io: Pick<Console, "log" | "error"> = console,
): Promise<number> {
  try {
    const parsed = parseArgs({
      args: argv,
      options: {
        root: { type: "string" },
        scope: { type: "string" },
        "dry-run": { type: "boolean" },
        yes: { type: "boolean", short: "y" },
        version: { type: "boolean" },
        help: { type: "boolean" },
      },
      strict: true,
      allowPositionals: false,
    });
    if (parsed.values.help) {
      io.log(HELP);
      return 0;
    }
    if (parsed.values.version) {
      io.log(VERSION);
      return 0;
    }

    const resolved = await resolveWorkspaceRoot(
      process.cwd(),
      parsed.values.root,
    );
    io.log("Cursor → Kiro Migration");
    io.log(`Resolved root: ${resolved.root}`);
    if (resolved.warning) io.log(`Warning: ${resolved.warning}`);

    let scope = parseScope(parsed.values.scope);
    if (!scope)
      scope =
        process.stdin.isTTY && process.stdout.isTTY
          ? await promptScope()
          : "workspace";
    if (!scope) return 130;

    const scanned = await scan({ root: resolved.root, scope });
    for (const notice of scanned.notices) io.log(`Info: ${notice}`);
    let plan = await createMigrationPlan(scanned.candidates);
    io.log(renderTree(plan.analyses));

    if (process.stdin.isTTY && process.stdout.isTTY) {
      const selected = await selectArtifacts(plan.analyses);
      if (!selected) return 130;
      const selectedIds = new Set(
        selected
          .filter(analysis => analysis.selected)
          .map(analysis => analysis.candidate.id),
      );
      plan = await createMigrationPlan(scanned.candidates, selectedIds);
    }
    io.log(renderPlan(plan));
    if (parsed.values["dry-run"]) {
      io.log("Dry run complete. No files were written.");
      io.log(renderTerminalSummary(plan));
      return 0;
    }

    if (!parsed.values.yes) {
      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        io.error(
          "Non-interactive migration requires --yes. No files were written.",
        );
        return 130;
      }
      if (!(await confirmMigration())) return 130;
    }

    const output = reportEntry(resolved.root, plan);
    const reportIssues = await detectExistingDestinationIssues([output]);
    if (reportIssues.length > 0)
      throw new SafetyError(reportIssues.map(issue => issue.reason).join(" "));
    const snapshot = snapshotSelectedSources(plan.analyses);
    const result = await commitTransaction(
      [...plan.manifest, output],
      snapshot,
    );
    io.log(renderTerminalSummary(plan));
    io.log(
      `Created: ${result.created.length}; already migrated: ${result.alreadyPresent.length}.`,
    );
    io.log("Report: .cursor-to-kiro-report.md");
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.error(`cursor-to-kiro: ${message}`);
    return error instanceof SafetyError ||
      (error as { rollbackPerformed?: boolean }).rollbackPerformed
      ? 2
      : 1;
  }
}
