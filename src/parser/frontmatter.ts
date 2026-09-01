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
    throw new FrontmatterError(document.errors.map((error) => error.message).join("; "));
  }
  const value = document.toJS({ maxAliasCount: 0 }) as unknown;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new FrontmatterError("Frontmatter must be a YAML mapping");
  }
  return {
    body: raw.slice(closing + 5),
    frontmatter: value as Record<string, unknown>,
    raw,
  };
}
