import type { ReadStream, WriteStream } from "node:tty";

export interface MigrationTerminal {
  input: ReadStream;
  output: WriteStream;
}

export interface MigrationRuntime {
  cwd: string;
  home: string;
  kiroHome: string;
  terminal: MigrationTerminal;
  temporaryDirectory: (prefix: string) => Promise<string>;
}

export function isInteractive(runtime: MigrationRuntime): boolean {
  return runtime.terminal.input.isTTY && runtime.terminal.output.isTTY;
}
