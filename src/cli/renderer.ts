import type { Analysis, MigrationPlan } from "../domain.js";

const ICONS = {
  EXACT: "✓",
  TRANSFORM: "↻",
  NATIVE: "●",
  CONFLICT: "✗",
} as const;
const GROUPS = [
  ["rule", "Rules"],
  ["skill", "Skills"],
  ["subagent", "Subagents"],
  ["hook", "Hooks"],
  ["agents-md", "AGENTS.md"],
] as const;

export function renderTree(analyses: Analysis[], cursor = -1): string {
  const lines = ["Migration tree", "────────────────────────────────"];
  let itemIndex = 0;
  for (const [kind, title] of GROUPS) {
    const group = analyses.filter(analysis => analysis.candidate.kind === kind);
    lines.push("", `▼ ${title.padEnd(30)} ${group.length}`);
    for (const analysis of group) {
      const current = itemIndex === cursor ? "❯" : " ";
      const box =
        analysis.status === "CONFLICT"
          ? "⨯"
          : analysis.status === "NATIVE"
            ? " "
            : analysis.selected
              ? "☑"
              : "☐";
      lines.push(
        `${current} ${box} ${ICONS[analysis.status]} ${analysis.candidate.identity}`,
      );
      if (analysis.status === "CONFLICT" && analysis.reason)
        lines.push(`      ${analysis.reason}`);
      itemIndex += 1;
    }
  }
  return lines.join("\n");
}

export function renderPlan(plan: MigrationPlan): string {
  const lines = ["Migration Plan", "────────────────────────────────"];
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
  lines.push("", "Cursor files modified: 0");
  return lines.join("\n");
}

export function renderTerminalSummary(plan: MigrationPlan): string {
  const migrated = plan.analyses.filter(analysis => analysis.selected).length;
  const native = plan.analyses.filter(
    analysis => analysis.status === "NATIVE",
  ).length;
  const conflicts = plan.analyses.filter(
    analysis => analysis.status === "CONFLICT",
  ).length;
  return [
    "Cursor → Kiro Migration Report",
    "────────────────────────────────────",
    `Migrated:        ${migrated}`,
    `Native:          ${native}`,
    `Not migrated:    ${conflicts}`,
    "Errors:          0",
  ].join("\n");
}
