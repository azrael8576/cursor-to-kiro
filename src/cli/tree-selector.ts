import * as p from "@clack/prompts";
import type { Analysis } from "../domain.js";
import type { MigrationTerminal } from "../runtime.js";

export async function selectArtifacts(
  terminal: MigrationTerminal,
  initial: Analysis[],
): Promise<Analysis[] | undefined> {
  const migratable = initial.filter(
    analysis => analysis.status === "EXACT" || analysis.status === "TRANSFORM",
  );
  if (migratable.length === 0) return initial;
  const selected = await p.multiselect({
    input: terminal.input,
    output: terminal.output,
    message: "Select artifacts to migrate",
    options: migratable.map(analysis => ({
      value: analysis.candidate.id,
      label: analysis.candidate.identity,
      hint: analysis.status === "EXACT" ? "compatible" : "will be converted",
    })),
    initialValues: migratable
      .filter(analysis => analysis.selected)
      .map(analysis => analysis.candidate.id),
  });
  if (p.isCancel(selected)) return undefined;
  const selectedIds = new Set(selected);
  return initial.map(analysis => ({
    ...analysis,
    selected: selectedIds.has(analysis.candidate.id),
  }));
}
