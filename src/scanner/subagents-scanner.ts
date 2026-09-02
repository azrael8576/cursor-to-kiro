import path from "node:path";
import type { SourceScope, SubagentCandidate } from "../domain.js";
import { parseMarkdown } from "../parser/frontmatter.js";
import { walkFiles } from "../util/fs.js";
import { decode } from "../util/text.js";
import { errorMessage, readSourceFile } from "./helpers.js";

async function scanRoot(
  root: string,
  prefix: string,
  scope: SourceScope,
): Promise<SubagentCandidate[]> {
  const files = await walkFiles(root, {
    include: identity => identity.endsWith(".md"),
  });
  return Promise.all(
    files.map(async file => {
      const identity = `${prefix}/${file.identity}`;
      if (file.symlink) {
        return {
          kind: "subagent" as const,
          id: `${scope}:subagent:${identity}`,
          identity,
          scope,
          parsed: { body: "", frontmatter: {}, raw: "" },
          sourceFiles: [],
          nested: file.identity.includes("/"),
          discoveryConflict:
            "Subagent artifact is a symlink; equivalent cross-platform behavior cannot be guaranteed.",
        };
      }
      try {
        const source = await readSourceFile(file.absolutePath, identity);
        return {
          kind: "subagent" as const,
          id: `${scope}:subagent:${identity}`,
          identity,
          scope,
          parsed: parseMarkdown(decode(source.bytes)),
          sourceFiles: [source],
          nested: file.identity.includes("/"),
        };
      } catch (error) {
        return {
          kind: "subagent" as const,
          id: `${scope}:subagent:${identity}`,
          identity,
          scope,
          parsed: { body: "", frontmatter: {}, raw: "" },
          sourceFiles: [],
          nested: file.identity.includes("/"),
          discoveryConflict: errorMessage(error),
        };
      }
    }),
  );
}

export function scanWorkspaceSubagents(
  root: string,
): Promise<SubagentCandidate[]> {
  return scanRoot(
    path.join(root, ".cursor", "agents"),
    ".cursor/agents",
    "workspace",
  );
}

export function scanUserSubagents(home: string): Promise<SubagentCandidate[]> {
  return scanRoot(
    path.join(home, ".cursor", "agents"),
    "~/.cursor/agents",
    "user",
  );
}
