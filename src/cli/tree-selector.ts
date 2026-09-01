import readline from "node:readline";
import type { Analysis } from "../domain.js";
import { renderTree } from "./renderer.js";

export async function selectArtifacts(initial: Analysis[]): Promise<Analysis[] | undefined> {
  if (initial.length === 0) return initial;
  if (!process.stdin.isTTY || !process.stdout.isTTY) return initial;
  readline.emitKeypressEvents(process.stdin);
  const previousRaw = process.stdin.isRaw;
  process.stdin.setRawMode(true);
  process.stdin.resume();
  let cursor = 0;
  let analyses = initial.map((analysis) => ({ ...analysis }));
  const draw = (): void => {
    process.stdout.write(`\x1b[2J\x1b[H${renderTree(analyses, cursor)}\n\n↑ ↓ move   Space select   A select all migratable   Enter continue   Esc cancel\n`);
  };
  draw();
  try {
    return await new Promise<Analysis[] | undefined>((resolve) => {
      const onKey = (input: string, key: readline.Key): void => {
        if (key.ctrl && key.name === "c" || key.name === "escape") {
          process.stdin.off("keypress", onKey);
          resolve(undefined);
          return;
        }
        if (key.name === "up") cursor = (cursor - 1 + analyses.length) % analyses.length;
        else if (key.name === "down") cursor = (cursor + 1) % analyses.length;
        else if (key.name === "space") {
          const current = analyses[cursor];
          if (current && (current.status === "EXACT" || current.status === "TRANSFORM")) {
            analyses[cursor] = { ...current, selected: !current.selected };
          }
        } else if (input.toLowerCase() === "a") {
          analyses = analyses.map((analysis) =>
            analysis.status === "EXACT" || analysis.status === "TRANSFORM"
              ? { ...analysis, selected: true }
              : analysis,
          );
        } else if (key.name === "return") {
          process.stdin.off("keypress", onKey);
          resolve(analyses);
          return;
        }
        draw();
      };
      process.stdin.on("keypress", onKey);
    });
  } finally {
    process.stdin.setRawMode(previousRaw ?? false);
    process.stdin.pause();
  }
}
