#!/usr/bin/env node
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runCli } from "./cli/app.js";

const home = os.homedir();
const configuredKiroHome = process.env.KIRO_HOME;
const kiroHome = configuredKiroHome
  ? path.resolve(configuredKiroHome)
  : path.join(home, ".kiro");

process.exitCode = await runCli(
  process.argv.slice(2),
  {
    cwd: process.cwd(),
    home,
    kiroHome,
    terminal: { input: process.stdin, output: process.stdout },
    temporaryDirectory: prefix => mkdtemp(path.join(os.tmpdir(), prefix)),
  },
  console,
);
