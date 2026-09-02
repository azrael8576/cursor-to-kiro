import { parseArgs } from "node:util";
import * as p from "@clack/prompts";
import pc from "picocolors";
import {
  createMigrationPlan,
  prepareMigration,
} from "../planner/migration-plan.js";
import { isInteractive, type MigrationRuntime } from "../runtime.js";
import { scan } from "../scanner/index.js";
import { resolveWorkspaceRoot } from "../scanner/workspace-root.js";
import { commitTransaction } from "../transaction/transaction.js";
import { confirmMigration } from "./confirmation.js";
import { renderPlan, renderTerminalSummary } from "./renderer.js";
import { selectArtifacts } from "./tree-selector.js";
import {
  AURORA_BACKGROUND,
  AURORA_BORDER,
  AURORA_COLORS,
  AURORA_SPARKS,
  BOLD,
  DIM,
  LOGO_LINES,
  RESET,
  TEXT,
} from "./theme.js";

export const VERSION = "0.1.0";

function showLogo(runtime: MigrationRuntime): void {
  const width = Math.max(
    runtime.terminal.output.columns ?? 0,
    ...LOGO_LINES.map(line => line.length + 8),
  );
  const edge = ` ${AURORA_SPARKS} `;
  const border = "─".repeat(Math.max(0, width - edge.length * 2 - 2));
  runtime.terminal.output.write("\n");
  runtime.terminal.output.write(
    `\x1b[48;5;${AURORA_BACKGROUND}m\x1b[38;5;${AURORA_BORDER}m╭${edge}${border}${edge}╮${RESET}\n`,
  );
  for (const [index, line] of LOGO_LINES.entries()) {
    const third = Math.ceil(line.length / AURORA_COLORS.length);
    const colored = AURORA_COLORS.map((color, colorIndex) => {
      const start = colorIndex * third;
      return `\x1b[38;5;${color}m${line.slice(start, start + third)}`;
    }).join("");
    const firework = index === 0 || index === LOGO_LINES.length - 2 ? "✦" : "·";
    const leftPadding = `\x1b[38;5;${AURORA_BORDER}m│\x1b[38;5;81m ${firework}`;
    const rightPadding = " ".repeat(Math.max(0, width - (4 + line.length)));
    runtime.terminal.output.write(
      `\x1b[48;5;${AURORA_BACKGROUND}m${leftPadding}${colored}${rightPadding}\x1b[38;5;${AURORA_BORDER}m│${RESET}\n`,
    );
  }
  runtime.terminal.output.write(
    `\x1b[48;5;${AURORA_BACKGROUND}m\x1b[38;5;${AURORA_BORDER}m╰${edge}${border}${edge}╯${RESET}\n`,
  );
  runtime.terminal.output.write("\n");
}

const HELP = `
${BOLD}Usage:${RESET} cursor-to-kiro [options]

${BOLD}Options:${RESET}
  --root <path>   Scan this project instead of the detected project root
  --dry-run       Scan and preview without writing files
  -y, --yes       Confirm migration without an interactive prompt
  --version       Show version number
  --help          Show this help message

${BOLD}Examples:${RESET}
  ${DIM}$${RESET} ${TEXT}cursor-to-kiro${RESET}
  ${DIM}$${RESET} ${TEXT}cursor-to-kiro --dry-run${RESET}
  ${DIM}$${RESET} ${TEXT}cursor-to-kiro --root ./my-project --yes${RESET}
`;

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
    const interactive = isInteractive(runtime);
    if (interactive) {
      showLogo(runtime);
      p.intro(pc.bgCyan(pc.black(" cursor-to-kiro ")), {
        input: runtime.terminal.input,
        output: runtime.terminal.output,
      });
    } else {
      io.log(`${BOLD}Cursor → Kiro${RESET}`);
      io.log(`${DIM}Project: ${resolved.root}${RESET}`);
      if (resolved.warning) io.log(`${DIM}${resolved.warning}${RESET}`);
    }

    const spinner = interactive
      ? p.spinner({
          input: runtime.terminal.input,
          output: runtime.terminal.output,
        })
      : undefined;
    spinner?.start("Scanning project…");
    const scanned = await scan({
      root: resolved.root,
    });
    spinner?.stop(`Found ${scanned.candidates.length} artifacts`);
    for (const notice of scanned.notices) io.log(`Info: ${notice}`);
    let plan = await createMigrationPlan(scanned.candidates);

    if (interactive && !parsed.values.yes) {
      const selected = await selectArtifacts(runtime.terminal, plan.analyses);
      if (!selected) {
        p.cancel("Migration cancelled", {
          input: runtime.terminal.input,
          output: runtime.terminal.output,
        });
        return 130;
      }
      const selectedIds = new Set(
        selected
          .filter(analysis => analysis.selected)
          .map(analysis => analysis.candidate.id),
      );
      plan = await createMigrationPlan(scanned.candidates, selectedIds);
    }
    if (interactive) {
      p.note(renderPlan(plan), "Migration plan", {
        input: runtime.terminal.input,
        output: runtime.terminal.output,
      });
    } else io.log(renderPlan(plan));
    if (parsed.values["dry-run"]) {
      if (interactive) {
        p.outro(pc.green("Dry run complete. No files were written."), {
          input: runtime.terminal.input,
          output: runtime.terminal.output,
        });
      } else {
        io.log("Dry run complete. No files were written.");
        io.log(renderTerminalSummary(plan));
      }
      return 0;
    }

    if (!parsed.values.yes) {
      if (!interactive) {
        io.error(
          "Non-interactive migration requires --yes. No files were written.",
        );
        return 130;
      }
      if (!(await confirmMigration(runtime.terminal))) {
        p.cancel("Migration cancelled", {
          input: runtime.terminal.input,
          output: runtime.terminal.output,
        });
        return 130;
      }
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
    const completion = `Created: ${result.created.length}; already migrated: ${result.alreadyPresent.length}.`;
    if (interactive) {
      p.outro(pc.green(`Migration complete. ${completion}`), {
        input: runtime.terminal.input,
        output: runtime.terminal.output,
      });
    } else {
      io.log(renderTerminalSummary(plan));
      io.log(completion);
      io.log("Report: .cursor-to-kiro-report.md");
    }
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.error(`cursor-to-kiro: ${message}`);
    return (error as { rollbackPerformed?: boolean }).rollbackPerformed ? 2 : 1;
  }
}
