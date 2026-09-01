import path from "node:path";
import type { SkillCandidate, SourceFile, SourceScope } from "../domain.js";
import { parseMarkdown } from "../parser/frontmatter.js";
import { walkFiles } from "../util/fs.js";
import { decode } from "../util/text.js";
import { toPosixPath } from "../util/paths.js";
import { errorMessage, readSourceFile } from "./helpers.js";

interface LocatedSkill {
  skillFile: string;
  skillFileIdentity: string;
  sourceSkillRoot: string;
  sourceScopeRoot: string;
  relativeSkillDirectory: string;
  nestedProject: boolean;
  symlink: boolean;
}

function locateWorkspaceSkill(root: string, absolutePath: string, identity: string, symlink: boolean): LocatedSkill | undefined {
  const parts = identity.split("/");
  let marker = -1;
  for (let index = 0; index < parts.length - 2; index += 1) {
    if ((parts[index] === ".cursor" || parts[index] === ".agents") && parts[index + 1] === "skills") marker = index;
  }
  if (marker < 0 || parts.at(-1) !== "SKILL.md") return undefined;
  const prefix = parts.slice(0, marker);
  const relativeSkillDirectory = parts.slice(marker + 2, -1).join("/");
  if (!relativeSkillDirectory) return undefined;
  return {
    skillFile: absolutePath,
    skillFileIdentity: identity,
    sourceSkillRoot: path.join(root, ...prefix, parts[marker]!, "skills"),
    sourceScopeRoot: prefix.length === 0 ? "." : prefix.join("/"),
    relativeSkillDirectory,
    nestedProject: prefix.length > 0,
    symlink,
  };
}

async function buildSkill(
  located: LocatedSkill,
  scope: SourceScope,
  destinationSkillRoot: string,
  displayPrefix: string,
): Promise<SkillCandidate> {
  const skillDirectory = path.dirname(located.skillFile);
  const skillName = path.basename(skillDirectory);
  const relativeParts = located.relativeSkillDirectory.split("/");
  const identity = scope === "workspace" ? located.skillFileIdentity : `${displayPrefix}/${located.skillFileIdentity}`;
  let sourceFiles: SourceFile[] = [];
  let discoveryConflict: string | undefined;
  try {
    const bundle = await walkFiles(skillDirectory, { excludeDirectory: () => false });
    const symlink = located.symlink || bundle.some((file) => file.symlink);
    if (symlink) {
      discoveryConflict = "Skill package contains or relies on a symlink; equivalent cross-platform behavior cannot be guaranteed.";
    } else {
      sourceFiles = await Promise.all(bundle.map((file) =>
        readSourceFile(file.absolutePath, `${identity.slice(0, -"SKILL.md".length)}${file.identity}`),
      ));
    }
    const skillSource = sourceFiles.find((file) => file.absolutePath === located.skillFile);
    const parsed = skillSource ? parseMarkdown(decode(skillSource.bytes)) : { body: "", frontmatter: {}, raw: "" };
    return {
      kind: "skill", id: `${scope}:skill:${identity}`, identity, parsed, scope, sourceFiles,
      sourceSkillRoot: toPosixPath(located.sourceSkillRoot),
      sourceScopeRoot: located.sourceScopeRoot,
      destinationSkillRoot,
      scopeSemantics: located.nestedProject ? "nested-subtree" : scope,
      skillName,
      organizationalDepth: Math.max(0, relativeParts.length - 1),
      ...(discoveryConflict ? { discoveryConflict } : {}),
    };
  } catch (error) {
    return {
      kind: "skill", id: `${scope}:skill:${identity}`, identity,
      parsed: { body: "", frontmatter: {}, raw: "" }, scope, sourceFiles,
      sourceSkillRoot: toPosixPath(located.sourceSkillRoot), sourceScopeRoot: located.sourceScopeRoot,
      destinationSkillRoot,
      scopeSemantics: located.nestedProject ? "nested-subtree" : scope,
      skillName, organizationalDepth: Math.max(0, relativeParts.length - 1),
      discoveryConflict: errorMessage(error),
    };
  }
}

export async function scanWorkspaceSkills(root: string): Promise<SkillCandidate[]> {
  const files = await walkFiles(root, { include: (identity) => identity.endsWith("/SKILL.md") });
  const located = files.map((file) => locateWorkspaceSkill(root, file.absolutePath, file.identity, file.symlink))
    .filter((value): value is LocatedSkill => value !== undefined);
  return Promise.all(located.map((skill) => buildSkill(skill, "workspace", path.join(root, ".kiro", "skills"), "")));
}

export async function scanUserSkills(home: string, kiroHome: string): Promise<SkillCandidate[]> {
  const candidates: SkillCandidate[] = [];
  for (const container of [".cursor", ".agents"] as const) {
    const root = path.join(home, container, "skills");
    const files = await walkFiles(root, { include: (identity) => identity === "SKILL.md" || identity.endsWith("/SKILL.md") });
    for (const file of files) {
      const directory = path.posix.dirname(file.identity);
      if (directory === ".") continue;
      const located: LocatedSkill = {
        skillFile: file.absolutePath,
        skillFileIdentity: file.identity,
        sourceSkillRoot: root,
        sourceScopeRoot: "~",
        relativeSkillDirectory: directory,
        nestedProject: false,
        symlink: file.symlink,
      };
      candidates.push(await buildSkill(located, "user", path.join(kiroHome, "skills"), `~/${container}/skills`));
    }
  }
  return candidates;
}
