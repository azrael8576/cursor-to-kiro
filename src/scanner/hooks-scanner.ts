import { lstat } from "node:fs/promises";
import path from "node:path";
import type { HookCandidate, SourceScope } from "../domain.js";
import { parseHooksJson } from "../parser/hooks-json.js";
import { decode } from "../util/text.js";
import { errorMessage, readSourceFile } from "./helpers.js";

async function scanHooksFile(
  absolutePath: string,
  identity: string,
  scope: SourceScope,
): Promise<HookCandidate[]> {
  try {
    const stat = await lstat(absolutePath);
    if (stat.isSymbolicLink()) {
      return [
        {
          kind: "hook",
          id: `${scope}:hook:${identity}`,
          identity,
          trigger: "(file)",
          index: 0,
          definition: {},
          scope,
          sourceFiles: [],
          discoveryConflict:
            "hooks.json is a symlink; equivalent cross-platform behavior cannot be guaranteed.",
        },
      ];
    }
    const source = await readSourceFile(absolutePath, identity);
    try {
      const parsed = parseHooksJson(decode(source.bytes));
      return parsed.hooks.map(({ trigger, index, definition }) => ({
        kind: "hook",
        id: `${scope}:hook:${identity}:${trigger}:${index}`,
        identity: `${identity}#${trigger}[${index}]`,
        trigger,
        index,
        definition,
        scope,
        sourceFiles: [source],
      }));
    } catch (error) {
      return [
        {
          kind: "hook",
          id: `${scope}:hook:${identity}`,
          identity,
          trigger: "(parse-error)",
          index: 0,
          definition: {},
          scope,
          sourceFiles: [source],
          parseError: errorMessage(error),
        },
      ];
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export function scanWorkspaceHooks(root: string): Promise<HookCandidate[]> {
  return scanHooksFile(
    path.join(root, ".cursor", "hooks.json"),
    ".cursor/hooks.json",
    "workspace",
  );
}

export function scanUserHooks(home: string): Promise<HookCandidate[]> {
  return scanHooksFile(
    path.join(home, ".cursor", "hooks.json"),
    "~/.cursor/hooks.json",
    "user",
  );
}
