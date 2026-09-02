import readline from "node:readline";
import type { Analysis } from "../domain.js";
import type { MigrationTerminal } from "../runtime.js";
import { renderTree } from "./renderer.js";

export async function selectArtifacts(
  terminal: MigrationTerminal,
  initial: Analysis[],
): Promise<Analysis[] | undefined> {
  const { input, output } = terminal;
  if (initial.length === 0) return initial;
  if (!input.isTTY || !output.isTTY) return initial;
  readline.emitKeypressEvents(input);
  const previousRaw = input.isRaw;
  input.setRawMode(true);
  input.resume();
  let cursor = 0;
  let analyses = initial.map(analysis => ({ ...analysis }));
  const draw = (): void => {
    output.write(
      `\x1b[2J\x1b[H${renderTree(analyses, cursor)}\n\n↑ ↓ move   Space select   A select all migratable   Enter continue   Esc cancel\n`,
    );
  };
  draw();
  try {
    return await new Promise<Analysis[] | undefined>(resolve => {
      const onKey = (keyInput: string, key: readline.Key): void => {
        if ((key.ctrl && key.name === "c") || key.name === "escape") {
          input.off("keypress", onKey);
          resolve(undefined);
          return;
        }
        if (key.name === "up")
          cursor = (cursor - 1 + analyses.length) % analyses.length;
        else if (key.name === "down") cursor = (cursor + 1) % analyses.length;
        else if (key.name === "space") {
          const current = analyses[cursor];
          if (
            current &&
            (current.status === "EXACT" || current.status === "TRANSFORM")
          ) {
            analyses[cursor] = { ...current, selected: !current.selected };
          }
        } else if (keyInput.toLowerCase() === "a") {
          analyses = analyses.map(analysis =>
            analysis.status === "EXACT" || analysis.status === "TRANSFORM"
              ? { ...analysis, selected: true }
              : analysis,
          );
        } else if (key.name === "return") {
          input.off("keypress", onKey);
          resolve(analyses);
          return;
        }
        draw();
      };
      input.on("keypress", onKey);
    });
  } finally {
    input.setRawMode(previousRaw ?? false);
    input.pause();
  }
}
