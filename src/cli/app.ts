import { parseArgs } from "node:util";
import type { MigrationScope } from "../domain.js";
import {
  createMigrationPlan,
  prepareMigration,
} from "../planner/migration-plan.js";
import { isInteractive, type MigrationRuntime } from "../runtime.js";
import { scan } from "../scanner/index.js";
import { resolveWorkspaceRoot } from "../scanner/workspace-root.js";
import { commitTransaction } from "../transaction/transaction.js";
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

function parseScope(value: string | undefined): MigrationScope | undefined {
  if (value === undefined) return undefined;
  if (value === "workspace" || value === "user" || value === "both")
    return value;
  throw new Error(`Invalid --scope value: ${value}`);
}

export async function runCli(
  argv: string[],
  runtime: MigrationRuntime,
  io: Pick<Console, "log" | "error">,
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
      runtime.cwd,
      parsed.values.root,
    );
    io.log("Cursor → Kiro Migration");
    io.log(`Resolved root: ${resolved.root}`);
    if (resolved.warning) io.log(`Warning: ${resolved.warning}`);

    let scope = parseScope(parsed.values.scope);
    if (!scope)
      scope = isInteractive(runtime)
        ? await promptScope(runtime.terminal)
        : "workspace";
    if (!scope) return 130;

    const scanned = await scan({
      root: resolved.root,
      scope,
      home: runtime.home,
      kiroHome: runtime.kiroHome,
    });
    for (const notice of scanned.notices) io.log(`Info: ${notice}`);
    let plan = await createMigrationPlan(scanned.candidates);
    io.log(renderTree(plan.analyses));

    if (isInteractive(runtime)) {
      const selected = await selectArtifacts(runtime.terminal, plan.analyses);
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
      if (!isInteractive(runtime)) {
        io.error(
          "Non-interactive migration requires --yes. No files were written.",
        );
        return 130;
      }
      if (!(await confirmMigration(runtime.terminal))) return 130;
    }

    const prepared = await prepareMigration({
      candidates: scanned.candidates,
      root: resolved.root,
      selectedIds: new Set(
        plan.analyses
          .filter(analysis => analysis.selected)
          .map(analysis => analysis.candidate.id),
      ),
    });
    if (!prepared.ok) {
      io.error(`cursor-to-kiro: ${prepared.error.reasons.join(" ")}`);
      return 2;
    }
    const result = await commitTransaction(
      prepared.value.entries,
      prepared.value.sourceSnapshot,
      runtime.temporaryDirectory,
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
    return (error as { rollbackPerformed?: boolean }).rollbackPerformed ? 2 : 1;
  }
}
