import * as p from "@clack/prompts";
import type { MigrationTerminal } from "../runtime.js";

export async function confirmMigration(
  terminal: MigrationTerminal,
): Promise<boolean> {
  const result = await p.confirm({
    input: terminal.input,
    output: terminal.output,
    message: "Proceed with migration?",
    initialValue: true,
  });
  return !p.isCancel(result) && result;
}
