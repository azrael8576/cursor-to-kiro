import readline from "node:readline";

export interface MenuResult {
  index: number;
  cancelled: boolean;
}

export async function keyMenu(
  render: (index: number) => string,
  length: number,
  initial = 0,
): Promise<MenuResult> {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    return { index: initial, cancelled: false };
  readline.emitKeypressEvents(process.stdin);
  const previousRaw = process.stdin.isRaw;
  process.stdin.setRawMode(true);
  process.stdin.resume();
  let index = initial;
  const draw = (): void => {
    process.stdout.write(`\x1b[2J\x1b[H${render(index)}\n`);
  };
  draw();
  try {
    return await new Promise<MenuResult>(resolve => {
      const onKey = (_input: string, key: readline.Key): void => {
        if ((key.ctrl && key.name === "c") || key.name === "escape") {
          process.stdin.off("keypress", onKey);
          resolve({ index, cancelled: true });
        } else if (key.name === "up") {
          index = (index - 1 + length) % length;
          draw();
        } else if (key.name === "down") {
          index = (index + 1) % length;
          draw();
        } else if (key.name === "return") {
          process.stdin.off("keypress", onKey);
          resolve({ index, cancelled: false });
        }
      };
      process.stdin.on("keypress", onKey);
    });
  } finally {
    process.stdin.setRawMode(previousRaw ?? false);
    process.stdin.pause();
  }
}
