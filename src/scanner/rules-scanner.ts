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
  canonicalRuleRoot: string,
  destinationRuleRoot: string,
  referenceRoot: string,
): Promise<RuleCandidate> {
  if (symlink) {
    return {
      kind: "rule",
      id: `${scope}:rule:${identity}`,
      identity,
      legacy,
      scope,
      sourceFiles: [],
      canonicalRuleRoot,
      destinationRuleRoot,
      parsed: { body: "", frontmatter: {}, raw: "" },
      discoveryConflict:
        "Rule artifact is a symlink; equivalent cross-platform behavior cannot be guaranteed.",
    };
  }
  try {
    const source = await readSourceFile(absolutePath, identity);
    const raw = decode(source.bytes);
    const parsed = legacy
      ? { body: lf(raw), frontmatter: {}, raw: lf(raw) }
      : parseMarkdown(raw);
    const referenceIssue = await findReferenceIssue(parsed.body, referenceRoot);
    return {
      kind: "rule",
      id: `${scope}:rule:${identity}`,
      identity,
      legacy,
      scope,
      sourceFiles: [source],
      canonicalRuleRoot,
      destinationRuleRoot,
      parsed,
      ...(referenceIssue ? { referenceIssue } : {}),
    };
  } catch (error) {
    return {
      kind: "rule",
      id: `${scope}:rule:${identity}`,
      identity,
      legacy,
      scope,
      sourceFiles: [],
      canonicalRuleRoot,
      destinationRuleRoot,
      parsed: { body: "", frontmatter: {}, raw: "" },
      discoveryConflict: errorMessage(error),
    };
  }
}

export async function scanWorkspaceRules(
  root: string,
): Promise<RuleCandidate[]> {
  const found: RuleCandidate[] = [];
  const legacyPath = path.join(root, ".cursorrules");
  try {
    const stat = await lstat(legacyPath);
    found.push(
      await scanRuleFile(
        legacyPath,
        ".cursorrules",
        "project",
        true,
        stat.isSymbolicLink(),
        path.join(root, ".agents", "docs", "rules"),
        path.join(root, ".kiro", "steering"),
        root,
      ),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const rulesRoot = path.join(root, ".cursor", "rules");
  const files = await walkFiles(rulesRoot, {
    include: identity => identity.endsWith(".mdc"),
  });
  for (const file of files) {
    const identity = `.cursor/rules/${file.identity}`;
    found.push(
      await scanRuleFile(
        file.absolutePath,
        identity,
        "project",
        false,
        file.symlink,
        path.join(root, ".agents", "docs", "rules"),
        path.join(root, ".kiro", "steering"),
        root,
      ),
    );
  }
  return found;
}

function referenceTokens(
  body: string,
): Array<{ token: string; target: string }> {
  const references: Array<{ token: string; target: string }> = [];
  for (const match of body.matchAll(/\[[^\]]+\]\(mdc:([^)]+)\)/g)) {
    const target = match[1];
    if (target) references.push({ token: `mdc:${target}`, target });
  }
  for (const match of body.matchAll(
    /@((?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+)(?=$|[\s),.;:!?])/g,
  )) {
    const target = match[1];
    if (target) references.push({ token: `@${target}`, target });
  }
  return references;
}

async function findReferenceIssue(
  body: string,
  referenceRoot: string,
): Promise<string | undefined> {
  for (const { token, target } of referenceTokens(body)) {
    const absolutePath = path.resolve(referenceRoot, target);
    const relativePath = path.relative(referenceRoot, absolutePath);
    if (relativePath.startsWith("..") || path.isAbsolute(relativePath))
      return `UNSAFE_REFERENCE_TARGET: ${token}.`;
    try {
      const stat = await lstat(absolutePath);
      if (!stat.isFile()) return `INVALID_REFERENCE_TARGET: ${token}.`;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return `MISSING_REFERENCE_TARGET: ${token}.`;
      throw error;
    }
  }
  return undefined;
}
