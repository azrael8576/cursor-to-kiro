import type { CursorHookDefinition } from "../domain.js";

export interface ParsedHooksFile {
  hooks: Array<{ trigger: string; index: number; definition: CursorHookDefinition }>;
}

export function parseHooksJson(raw: string): ParsedHooksFile {
  const value = JSON.parse(raw) as unknown;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("hooks.json must contain a JSON object");
  }
  const root = value as Record<string, unknown>;
  if (root.version !== 1) throw new Error("Cursor hooks.json version must be 1");
  if (root.hooks === null || typeof root.hooks !== "object" || Array.isArray(root.hooks)) {
    throw new Error("Cursor hooks.json hooks must be an object");
  }
  const hooks: ParsedHooksFile["hooks"] = [];
  for (const trigger of Object.keys(root.hooks as Record<string, unknown>).sort()) {
    const definitions = (root.hooks as Record<string, unknown>)[trigger];
    if (!Array.isArray(definitions)) throw new Error(`Hook ${trigger} must be an array`);
    definitions.forEach((definition, index) => {
      if (definition === null || typeof definition !== "object" || Array.isArray(definition)) {
        throw new Error(`Hook ${trigger}[${index}] must be an object`);
      }
      hooks.push({ trigger, index, definition: definition as CursorHookDefinition });
    });
  }
  return { hooks };
}
