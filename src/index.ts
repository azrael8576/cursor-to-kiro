#!/usr/bin/env node
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runCli } from "./cli/app.js";

process.exitCode = await runCli(
  process.argv.slice(2),
  {
    cwd: process.cwd(),
    terminal: { input: process.stdin, output: process.stdout },
    temporaryDirectory: prefix => mkdtemp(path.join(os.tmpdir(), prefix)),
  },
  console,
);
