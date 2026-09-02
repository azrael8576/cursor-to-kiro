import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { scan } from "../src/scanner/index.js";
import { createMigrationPlan } from "../src/planner/migration-plan.js";
import { cleanupTemporary, tempDirectory, writeText } from "./helpers.js";

afterEach(cleanupTemporary);
const exec = promisify(execFile);

async function runAdapter(
  body: string,
  failClosed = false,
  input = "{}",
  trigger = "preToolUse",
  timeout = 3,
  matcher?: string,
) {
  const root = await tempDirectory();
  await writeText(root, "hook.mjs", body);
  await writeText(
    root,
    ".cursor/hooks.json",
    JSON.stringify({
      version: 1,
      hooks: {
        [trigger]: [
          {
            command: "node hook.mjs",
            timeout,
            failClosed,
            ...(matcher ? { matcher } : {}),
          },
        ],
      },
    }),
  );
  const plan = await createMigrationPlan((await scan({ root })).candidates);
  for (const entry of plan.manifest) {
    await mkdir(path.dirname(entry.absolutePath), { recursive: true });
    await writeFile(entry.absolutePath, entry.bytes);
  }
  const adapter = plan.manifest.find(entry =>
    entry.displayPath.endsWith(".mjs"),
  );
  expect(adapter).toBeDefined();
  // Input file prevents shell quoting from participating in protocol tests.
  await writeText(root, "input.json", input);
  const runner = `import {spawnSync} from 'node:child_process';import {readFileSync} from 'node:fs';const r=spawnSync(process.execPath,[${JSON.stringify(adapter?.absolutePath)}],{input:readFileSync('input.json'),encoding:'utf8'});process.stdout.write(JSON.stringify({status:r.status,stdout:r.stdout,stderr:r.stderr}));`;
  const result = await exec(
    process.execPath,
    ["--input-type=module", "-e", runner],
    { cwd: root },
  );
  return JSON.parse(result.stdout) as {
    status: number;
    stdout: string;
    stderr: string;
  };
}

describe("generated hook adapter protocol", () => {
  it("normalizes an explicit deny into exit 2 without leaking JSON", async () => {
    const result = await runAdapter(
      'console.log(JSON.stringify({permission:"deny",user_message:"blocked"}));',
    );
    expect(result).toMatchObject({ status: 2, stdout: "" });
    expect(result.stderr).toContain("blocked");
  });
  it("injects only explicit additional context", async () => {
    const result = await runAdapter(
      'console.log(JSON.stringify({additional_context:"Context"}));',
      false,
      "{}",
      "sessionStart",
    );
    expect(result).toMatchObject({ status: 0, stdout: "Context" });
  });
  it.each([false, true])(
    "applies failClosed=%s to crashes and invalid JSON",
    async failClosed => {
      for (const body of ["process.exit(1)", 'console.log("broken")']) {
        const result = await runAdapter(body, failClosed);
        expect(result.status).toBe(failClosed ? 2 : 0);
        expect(result.stdout).toBe("");
        expect(result.stderr).not.toBe("");
      }
    },
  );
  it("does not silently allow unsupported decisions", async () => {
    const result = await runAdapter(
      'console.log(JSON.stringify({permission:"ask"}));',
    );
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("UNSUPPORTED_OUTPUT");
  });
  it("uses the Cursor prompt matcher constant, not the prompt text", async () => {
    const result = await runAdapter(
      "console.log(JSON.stringify({continue:false}));",
      false,
      '{"prompt":"hello"}',
      "beforeSubmitPrompt",
      3,
      "^UserPromptSubmit$",
    );
    expect(result.status).toBe(2);
  });
  it("handles timeout before the outer hook deadline", async () => {
    const result = await runAdapter(
      "setInterval(()=>{},1000)",
      true,
      "{}",
      "preToolUse",
      0.05,
    );
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("TIMEOUT");
  });
  it("passes shell command through the verified input field and filters original matcher", async () => {
    const result = await runAdapter(
      'let s="";for await(const b of process.stdin)s+=b;const x=JSON.parse(s);console.log(JSON.stringify({permission:x.command==="git status"?"deny":"allow"}));',
      true,
      '{"tool_name":"shell","tool_input":{"command":"git status"}}',
      "beforeShellExecution",
      3,
      "^git",
    );
    expect(result.status).toBe(2);
  });
});
