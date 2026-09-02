import { keyMenu } from "./key-menu.js";
import type { MigrationTerminal } from "../runtime.js";

export async function confirmMigration(
  terminal: MigrationTerminal,
): Promise<boolean> {
  const options = ["Migrate", "Cancel"];
  const result = await keyMenu(
    terminal,
    index =>
      [
        "Confirm migration",
        "",
        ...options.map(
          (option, item) => `${item === index ? "❯" : " "} ${option}`,
        ),
      ].join("\n"),
    options.length,
  );
  return !result.cancelled && result.index === 0;
}
