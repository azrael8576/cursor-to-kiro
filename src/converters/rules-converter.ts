import path from "node:path";
import { stringify } from "yaml";
import type { ManifestEntry, RuleCandidate } from "../domain.js";
import { normalizeGlobs } from "../compatibility/rules.js";
import { generatedText } from "../util/text.js";

export function convertRule(candidate: RuleCandidate): ManifestEntry[] {
  const outputName = candidate.identity
    .replace(/^~?\/?\.?cursor\/rules\//, "")
    .replace(/\.mdc$/, ".md")
    .replaceAll("/", "--");
  const canonicalDisplayPath = `.agents/docs/rules/${outputName}`;
  return [
    {
      absolutePath: path.join(candidate.canonicalRuleRoot, outputName),
      displayPath: canonicalDisplayPath,
      bytes: generatedText(convertReferences(candidate.parsed.body)),
      artifactId: candidate.id,
      semanticKey: `rule-body:${candidate.identity}`,
    },
    {
      absolutePath: path.join(candidate.destinationRuleRoot, outputName),
      displayPath: `.kiro/steering/${outputName}`,
      bytes: generatedText(
        `---\n${stringify(destinationFrontmatter(candidate))}---\n#[[file:${canonicalDisplayPath}]]`,
      ),
      artifactId: candidate.id,
      semanticKey: `rule-steering:${candidate.identity}`,
    },
  ];
}

function destinationFrontmatter(
  candidate: RuleCandidate,
): Record<string, unknown> {
  const { alwaysApply, description, globs } = candidate.parsed.frontmatter;
  if (alwaysApply === true) return { inclusion: "always" };
  if (globs !== undefined)
    return { inclusion: "fileMatch", fileMatchPattern: normalizeGlobs(globs) };
  if (typeof description === "string" && description.trim() !== "")
    return {
      inclusion: "auto",
      name: path.basename(candidate.identity, ".mdc"),
      description,
    };
  return { inclusion: "manual" };
}

function convertReferences(body: string): string {
  return body
    .replace(/\[[^\]]+\]\(mdc:([^)]+)\)/g, "#[[file:$1]]")
    .replace(
      /@((?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+)(?=$|[\s),.;:!?])/g,
      "#[[file:$1]]",
    );
}
