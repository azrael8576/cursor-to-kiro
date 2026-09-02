import type { AgentsMdCandidate } from "../domain.js";
import { walkFiles } from "../util/fs.js";
import { readSourceFile } from "./helpers.js";

export async function scanAgentsMd(root: string): Promise<AgentsMdCandidate[]> {
  const files = await walkFiles(root, {
    include: identity =>
      identity === "AGENTS.md" || identity.endsWith("/AGENTS.md"),
  });
  return Promise.all(
    files.map(async file => {
      if (file.symlink) {
        return {
          kind: "agents-md" as const,
          id: `workspace:agents-md:${file.identity}`,
          identity: file.identity,
          nested: file.identity !== "AGENTS.md",
          scope: "workspace" as const,
          sourceFiles: [],
          discoveryConflict:
            "AGENTS.md is a symlink; equivalent cross-platform behavior cannot be guaranteed.",
        };
      }
      return {
        kind: "agents-md" as const,
        id: `workspace:agents-md:${file.identity}`,
        identity: file.identity,
        nested: file.identity !== "AGENTS.md",
        scope: "workspace" as const,
        sourceFiles: [await readSourceFile(file.absolutePath, file.identity)],
      };
    }),
  );
}
