import { describe, expect, it } from "vitest";
import { FrontmatterError, parseMarkdown } from "../src/parser/frontmatter.js";
import { parseHooksJson } from "../src/parser/hooks-json.js";

describe("frontmatter parser", () => {
  it("normalizes parsed text without rewriting the source", () => {
    const parsed = parseMarkdown("---\r\nname: demo\r\ndescription: Test\r\n---\r\nBody\r\n");
    expect(parsed.frontmatter).toEqual({ name: "demo", description: "Test" });
    expect(parsed.body).toBe("Body\n");
  });

  it("fails closed for duplicate or unterminated frontmatter", () => {
    expect(() => parseMarkdown("---\nname: a\nname: b\n---\nBody")).toThrow(FrontmatterError);
    expect(() => parseMarkdown("---\nname: a")).toThrow(FrontmatterError);
  });
});

describe("hooks parser", () => {
  it("sorts triggers and preserves every definition", () => {
    const parsed = parseHooksJson(JSON.stringify({ version: 1, hooks: { stop: [{ command: "b" }], preToolUse: [{ command: "a" }] } }));
    expect(parsed.hooks.map((hook) => hook.trigger)).toEqual(["preToolUse", "stop"]);
  });

  it("rejects unknown top-level versions", () => {
    expect(() => parseHooksJson('{"version":"1","hooks":{}}')).toThrow("version must be 1");
  });
});
