import readline from "node:readline";
import type { MigrationTerminal } from "../runtime.js";

export interface MenuResult {
  index: number;
  cancelled: boolean;
}

export async function keyMenu(
  terminal: MigrationTerminal,
  render: (index: number) => string,
  length: number,
  initial = 0,
): Promise<MenuResult> {
  const { input, output } = terminal;
  if (!input.isTTY || !output.isTTY)
    return { index: initial, cancelled: false };
  readline.emitKeypressEvents(input);
  const previousRaw = input.isRaw;
  input.setRawMode(true);
  input.resume();
  let index = initial;
  const draw = (): void => {
    output.write(`\x1b[2J\x1b[H${render(index)}\n`);
  };
  draw();
  try {
    return await new Promise<MenuResult>(resolve => {
      const onKey = (_input: string, key: readline.Key): void => {
        if ((key.ctrl && key.name === "c") || key.name === "escape") {
          input.off("keypress", onKey);
          resolve({ index, cancelled: true });
        } else if (key.name === "up") {
          index = (index - 1 + length) % length;
          draw();
        } else if (key.name === "down") {
          index = (index + 1) % length;
          draw();
        } else if (key.name === "return") {
          input.off("keypress", onKey);
          resolve({ index, cancelled: false });
        }
      };
      input.on("keypress", onKey);
    });
  } finally {
    input.setRawMode(previousRaw ?? false);
    input.pause();
  }
}
