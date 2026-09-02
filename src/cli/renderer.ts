import type { MigrationPlan } from "../domain.js";
const GROUPS = [
  ["rule", "Rules"],
  ["skill", "Skills"],
  ["subagent", "Subagents"],
  ["hook", "Hooks"],
] as const;

export function renderPlan(plan: MigrationPlan): string {
  const lines = [];
  for (const [kind, title] of GROUPS) {
    const group = plan.analyses.filter(
      analysis => analysis.candidate.kind === kind,
    );
    const selected = group.filter(analysis => analysis.selected).length;
    const conflicts = group.filter(
      analysis => analysis.status === "CONFLICT",
    ).length;
    const native = group.filter(
      analysis => analysis.status === "NATIVE",
    ).length;
    lines.push(
      "",
      title,
      `  ${selected} selected`,
      `  ${conflicts} conflict skipped`,
    );
    if (native > 0) lines.push(`  ${native} native, 0 changes`);
  }
  lines.push("", "Files to create:");
  if (plan.manifest.length === 0) lines.push("  (none)");
  for (const entry of plan.manifest) lines.push(`  ${entry.displayPath}`);
  for (const analysis of plan.analyses) {
    if (analysis.reason || analysis.changes?.length) {
      lines.push(
        "",
        `${analysis.disposition === "draft" ? "DRAFT (not activated): " : ""}${analysis.candidate.identity}`,
      );
      if (analysis.reason) lines.push(`  ${analysis.reason}`);
      for (const change of analysis.changes ?? []) lines.push(`  ${change}`);
    }
  }
  lines.push("", "Cursor files modified: 0");
  return lines.join("\n");
}

export function renderTerminalSummary(plan: MigrationPlan): string {
  const migrated = plan.analyses.filter(
    analysis => analysis.selected && analysis.disposition !== "draft",
  ).length;
  const drafts = plan.analyses.filter(
    analysis => analysis.selected && analysis.disposition === "draft",
  ).length;
  const native = plan.analyses.filter(
    analysis => analysis.status === "NATIVE",
  ).length;
  const conflicts = plan.analyses.filter(
    analysis => analysis.status === "CONFLICT",
  ).length;
  return [
    "Migration complete",
    "────────────────────────────────",
    `Migrated:     ${migrated}`,
    `Drafts:       ${drafts} (not activated)`,
    `Native:       ${native}`,
    `Not migrated: ${conflicts}`,
    "Errors: 0",
  ].join("\n");
}
