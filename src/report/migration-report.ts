import type { Analysis, ManifestEntry, MigrationPlan } from "../domain.js";
import { generatedText } from "../util/text.js";
import path from "node:path";

const TITLES: Record<Analysis["candidate"]["kind"], string> = {
  rule: "Rules",
  skill: "Skills",
  subagent: "Subagents",
  hook: "Hooks",
};

function outputsFor(entries: ManifestEntry[], id: string): string[] {
  return entries
    .filter(entry => entry.artifactId === id)
    .map(entry => entry.displayPath)
    .sort();
}

export function renderMigrationReport(plan: MigrationPlan): string {
  const lines = [
    "# Cursor → Kiro Migration Report",
    "",
    "Generated deterministically from the selected source tree. This report explains what will migrate and what needs attention.",
    "",
  ];
  for (const kind of ["rule", "skill", "subagent", "hook"] as const) {
    const group = plan.analyses.filter(
      analysis => analysis.candidate.kind === kind,
    );
    lines.push(`## ${TITLES[kind]}`, "");
    if (group.length === 0) {
      lines.push("None detected.", "");
      continue;
    }
    for (const analysis of group) {
      const marker =
        analysis.status === "NATIVE" ? "●" : analysis.selected ? "✓" : "✗";
      lines.push(
        `### ${marker} ${analysis.candidate.identity}`,
        "",
        `- Status: \`${analysis.status}\`${statusExplanation(analysis.status)}`,
      );
      if (analysis.selected) {
        for (const output of outputsFor(plan.manifest, analysis.candidate.id))
          lines.push(`- Output: \`${output}\``);
      } else if (analysis.status === "CONFLICT") {
        lines.push("- Result: **Not migrated automatically.**");
      }
      if (analysis.selected && analysis.disposition === "draft")
        lines.push(
          "- Result: **DRAFT — not activated; resolve the listed differences before enabling**",
        );
      lines.push(`- Migration: ${analysis.summary}`);
      for (const change of analysis.changes ?? [])
        lines.push(`- Detail: ${change}`);
      if (analysis.reason) lines.push(`- Why: ${analysis.reason}`);
      if (analysis.cursorBehavior)
        lines.push(`- Cursor behavior: ${analysis.cursorBehavior}`);
      if (analysis.kiroGap)
        lines.push(
          `- Why Kiro cannot strictly preserve it: ${analysis.kiroGap}`,
        );
      lines.push("");
    }
  }
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
  lines.push(
    "## Summary",
    "",
    `- Migrated: ${migrated}`,
    `- Drafts (not activated): ${drafts}`,
    `- Native: ${native}`,
    `- Not migrated: ${conflicts}`,
    "- Errors: 0",
    "- Cursor files modified: 0",
    "",
  );
  return lines.join("\n");
}

function statusExplanation(status: Analysis["status"]): string {
  if (status === "TRANSFORM") return " — will migrate";
  if (status === "NATIVE") return " — already supported";
  if (status === "EXACT") return " — equivalent configuration";
  return " — needs attention";
}

export function reportEntry(root: string, plan: MigrationPlan): ManifestEntry {
  return {
    absolutePath: path.join(root, ".cursor-to-kiro-report.md"),
    displayPath: ".cursor-to-kiro-report.md",
    bytes: generatedText(renderMigrationReport(plan)),
    artifactId: "__report__",
    semanticKey: "migration-report-v1",
  };
}
