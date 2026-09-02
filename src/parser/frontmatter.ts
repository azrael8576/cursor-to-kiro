import { parseDocument } from "yaml";
import type { ParsedMarkdown } from "../domain.js";
import { lf } from "../util/text.js";

export class FrontmatterError extends Error {}

export function parseMarkdown(rawInput: string): ParsedMarkdown {
  const raw = lf(rawInput);
  if (!raw.startsWith("---\n")) {
    return { body: raw, frontmatter: {}, raw };
  }
  const closing = raw.indexOf("\n---\n", 4);
  if (closing < 0) throw new FrontmatterError("Unterminated YAML frontmatter");
  const yaml = raw.slice(4, closing);
  const document = parseDocument(yaml, { uniqueKeys: true });
  if (document.errors.length > 0) {
    throw new FrontmatterError(
      document.errors.map(error => error.message).join("; "),
    );
  }
  let value: unknown;
  try {
    value = document.toJS({ maxAliasCount: 0 });
  } catch (error) {
    if (errorMessage(error) === "Alias resolution is disabled")
      throw new FrontmatterError(aliasResolutionMessage(yaml));
    throw error;
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new FrontmatterError("Frontmatter must be a YAML mapping");
  }
  return {
    body: raw.slice(closing + 5),
    frontmatter: value as Record<string, unknown>,
    raw,
  };
}

function errorMessage(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}

function aliasResolutionMessage(yaml: string): string {
  const literalAlias = yaml.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(\*\S.*)$/m);
  if (literalAlias) {
    const [, field, value] = literalAlias;
    return `INVALID_YAML_ALIAS: \`${field}: ${value}\` begins with \`*\`, which YAML interprets as an alias. If this is a literal value, quote it: \`${field}: "${value}"\`.`;
  }
  return "INVALID_YAML_ALIAS: YAML aliases are disabled. If an alias-like value is literal text, quote it.";
}
