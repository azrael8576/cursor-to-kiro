import type { ScanResult } from "../domain.js";
import { sortByIdentity } from "../util/paths.js";
import { scanWorkspaceHooks } from "./hooks-scanner.js";
import { scanWorkspaceRules } from "./rules-scanner.js";
import { scanWorkspaceSkills } from "./skills-scanner.js";
import { scanWorkspaceSubagents } from "./subagents-scanner.js";

export interface ScanOptions {
  root: string;
}

export async function scan(options: ScanOptions): Promise<ScanResult> {
  const candidates = (
    await Promise.all([
      scanWorkspaceRules(options.root),
      scanWorkspaceSkills(options.root),
      scanWorkspaceSubagents(options.root),
      scanWorkspaceHooks(options.root),
    ])
  ).flat();
  return { candidates: sortByIdentity(candidates), notices: [] };
}
