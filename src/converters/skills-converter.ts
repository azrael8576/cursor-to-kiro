import path from "node:path";
import type { ManifestEntry, SkillCandidate } from "../domain.js";
import { hashBytes } from "../util/text.js";
import { toPosixPath } from "../util/paths.js";

export function convertSkill(candidate: SkillCandidate): ManifestEntry[] {
  const skillFile = candidate.sourceFiles.find((file) => path.basename(file.absolutePath) === "SKILL.md");
  if (!skillFile) throw new Error(`Skill ${candidate.identity} has no readable SKILL.md`);
  const sourceDirectory = path.dirname(skillFile.absolutePath);
  const destinationDirectory = path.join(candidate.destinationSkillRoot, candidate.skillName);
  return candidate.sourceFiles.map((file) => {
    const relative = path.relative(sourceDirectory, file.absolutePath);
    const absolutePath = path.join(destinationDirectory, relative);
    const scopePrefix = candidate.scope === "user" ? "~/.kiro/skills" : ".kiro/skills";
    return {
      absolutePath,
      displayPath: `${scopePrefix}/${candidate.skillName}/${toPosixPath(relative)}`,
      bytes: file.bytes,
      artifactId: candidate.id,
      semanticKey: `skill:${candidate.skillName}:${toPosixPath(relative)}:${hashBytes(file.bytes)}`,
    };
  });
}
