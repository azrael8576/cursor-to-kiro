import { lstat } from "node:fs/promises";
import path from "node:path";
import type { RuleCandidate, SourceScope } from "../domain.js";
import { parseMarkdown } from "../parser/frontmatter.js";
import { walkFiles } from "../util/fs.js";
import { decode, lf } from "../util/text.js";
import { errorMessage, readSourceFile } from "./helpers.js";

async function scanRuleFile(
  absolutePath: string,
  identity: string,
  scope: SourceScope,
  legacy: boolean,
  symlink: boolean,
): Promise<RuleCandidate> {
  if (symlink) {
    return {
      kind: "rule", id: `${scope}:rule:${identity}`, identity, legacy, scope, sourceFiles: [],
      parsed: { body: "", frontmatter: {}, raw: "" },
      discoveryConflict: "Rule artifact is a symlink; equivalent cross-platform behavior cannot be guaranteed.",
    };
  }
  try {
    const source = await readSourceFile(absolutePath, identity);
    const raw = decode(source.bytes);
    const parsed = legacy ? { body: lf(raw), frontmatter: {}, raw: lf(raw) } : parseMarkdown(raw);
    return {
      kind: "rule", id: `${scope}:rule:${identity}`, identity, legacy, scope,
      sourceFiles: [source], parsed,
    };
  } catch (error) {
    return {
      kind: "rule", id: `${scope}:rule:${identity}`, identity, legacy, scope, sourceFiles: [],
      parsed: { body: "", frontmatter: {}, raw: "" }, discoveryConflict: errorMessage(error),
    };
  }
}

export async function scanWorkspaceRules(root: string): Promise<RuleCandidate[]> {
  const found: RuleCandidate[] = [];
  const legacyPath = path.join(root, ".cursorrules");
  try {
    const stat = await lstat(legacyPath);
    found.push(await scanRuleFile(legacyPath, ".cursorrules", "workspace", true, stat.isSymbolicLink()));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const rulesRoot = path.join(root, ".cursor", "rules");
  const files = await walkFiles(rulesRoot, { include: (identity) => identity.endsWith(".mdc") });
  for (const file of files) {
    const identity = `.cursor/rules/${file.identity}`;
    found.push(await scanRuleFile(file.absolutePath, identity, "workspace", false, file.symlink));
  }
  return found;
}

export async function scanUserRules(home: string): Promise<RuleCandidate[]> {
  const root = path.join(home, ".cursor", "rules");
  const files = await walkFiles(root, { include: (identity) => identity.endsWith(".mdc") });
  return Promise.all(files.map((file) =>
    scanRuleFile(file.absolutePath, `~/.cursor/rules/${file.identity}`, "user", false, file.symlink),
  ));
}
