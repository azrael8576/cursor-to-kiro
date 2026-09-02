import type { HookCandidate, Result } from "../domain.js";
import {
  output,
  type MigrationIssue,
  type PreparedArtifact,
} from "./artifacts.js";
import { adapterSource } from "./hook-adapter-source.js";

export interface HookAdapterConfig {
  trigger: string;
  command: string;
  timeout: number;
  failClosed: boolean;
  matcher?: string;
}

export function prepareHook(
  candidate: HookCandidate,
  root: string,
): Result<PreparedArtifact, MigrationIssue> {
  if (candidate.parseError)
    return {
      ok: false,
      error: { kind: "INVALID_FIELD", detail: candidate.parseError },
    };
  const targets = {
    sessionStart: "SessionStart",
    preToolUse: "PreToolUse",
    postToolUse: "PostToolUse",
    beforeSubmitPrompt: "UserPromptSubmit",
    stop: "Stop",
    beforeShellExecution: "PreToolUse",
    afterShellExecution: "PostToolUse",
    beforeMCPExecution: "PreToolUse",
    afterMCPExecution: "PostToolUse",
    beforeReadFile: "PreToolUse",
    afterFileEdit: "PostFileSave",
  };
  const target = targets[candidate.trigger as keyof typeof targets];
  if (!target)
    return {
      ok: false,
      error: {
        kind: "UNSUPPORTED_EVENT",
        detail: `${candidate.identity}: no supported lifecycle mapping for ${candidate.trigger}`,
      },
    };
  const fields = candidate.definition;
  if (fields.type !== undefined && fields.type !== "command")
    return {
      ok: false,
      error: {
        kind: "INVALID_FIELD",
        detail: `${candidate.identity}: type=${String(fields.type)}; Cursor prompt decisions cannot be expressed by Kiro prompt injection`,
      },
    };
  if (
    typeof fields.command !== "string" ||
    !fields.command.trim() ||
    fields.command.includes("\0")
  )
    return {
      ok: false,
      error: {
        kind: "INVALID_FIELD",
        detail: `${candidate.identity}: command must be a nonempty shell command`,
      },
    };
  if (
    fields.timeout !== undefined &&
    (typeof fields.timeout !== "number" ||
      !Number.isFinite(fields.timeout) ||
      fields.timeout < 0 ||
      fields.timeout > 2147483)
  )
    return {
      ok: false,
      error: {
        kind: "INVALID_FIELD",
        detail: `${candidate.identity}: timeout must be a finite nonnegative number <= 2147483 seconds`,
      },
    };
  if (fields.failClosed !== undefined && typeof fields.failClosed !== "boolean")
    return {
      ok: false,
      error: {
        kind: "INVALID_FIELD",
        detail: `${candidate.identity}: failClosed must be boolean`,
      },
    };
  if (fields.matcher !== undefined) {
    if (typeof fields.matcher !== "string")
      return {
        ok: false,
        error: {
          kind: "INVALID_FIELD",
          detail: `${candidate.identity}: matcher must be a regex string`,
        },
      };
    try {
      new RegExp(fields.matcher);
    } catch {
      return {
        ok: false,
        error: {
          kind: "INVALID_FIELD",
          detail: `${candidate.identity}: invalid matcher regex`,
        },
      };
    }
  }
  const config: HookAdapterConfig = {
    trigger: candidate.trigger,
    command: fields.command,
    timeout: typeof fields.timeout === "number" ? fields.timeout : 60,
    failClosed: fields.failClosed === true,
    ...(typeof fields.matcher === "string" ? { matcher: fields.matcher } : {}),
  };
  const id = `cursor-${candidate.trigger}-${candidate.index}`;
  const adapter = `.kiro/hooks/adapters/${id}.mjs`;
  const unknown = Object.keys(fields).filter(
    key =>
      !["command", "type", "timeout", "failClosed", "matcher"].includes(key),
  );
  const document = {
    version: "v1",
    hooks: [
      {
        name: id,
        trigger: target,
        enabled: false,
        timeout: config.timeout === 0 ? 0 : config.timeout + 2,
        action: { type: "command", command: `node '${adapter}'` },
      },
    ],
  };
  return {
    ok: true,
    value: {
      analysis: {
        candidate,
        status: "TRANSFORM",
        selected: true,
        disposition: "draft",
        summary:
          "Hook schema and adapter generated; disabled until its input/output contract is verified",
        changes: [
          `${candidate.trigger} → ${target}; version: 1 → v1; action.command → node ${adapter}`,
          `matcher → adapter using Cursor's original match subject; timeout → ${config.timeout}s plus 2s cleanup budget (0 remains unlimited)`,
          "enabled: false; Kiro stdin fields, tool names and original script dependencies require a target-version fixture before activation. The original command and project-root cwd are retained.",
          "Adapter supports permission allow/deny, prompt continue and additional_context. Unsupported control fields are diagnosed; no source hook is executed during migration.",
          ...unknown.map(
            key =>
              `UNSUPPORTED_FIELD: ${key}=${JSON.stringify(fields[key])}; preserved in cursor-source.json`,
          ),
        ],
      },
      entries: [
        output(
          candidate,
          root,
          `.kiro/hooks/${id}.json`,
          JSON.stringify(document, null, 2),
        ),
        output(candidate, root, adapter, adapterSource(config)),
        output(
          candidate,
          root,
          `.agents/docs/migration-drafts/hooks/${id}/cursor-source.json`,
          JSON.stringify({ trigger: candidate.trigger, ...fields }, null, 2),
        ),
      ],
      documents: [],
    },
  };
}
