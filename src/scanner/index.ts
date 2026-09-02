import type { MigrationScope, ScanResult } from "../domain.js";
import { sortByIdentity } from "../util/paths.js";
import { scanAgentsMd } from "./agents-md-scanner.js";
import { scanUserHooks, scanWorkspaceHooks } from "./hooks-scanner.js";
import { scanUserRules, scanWorkspaceRules } from "./rules-scanner.js";
import { scanUserSkills, scanWorkspaceSkills } from "./skills-scanner.js";
import {
  scanUserSubagents,
  scanWorkspaceSubagents,
} from "./subagents-scanner.js";

export interface ScanOptions {
  root: string;
  scope: MigrationScope;
  home: string;
  kiroHome: string;
}

export async function scan(options: ScanOptions): Promise<ScanResult> {
  const groups = [];
  const notices: string[] = [];
  if (options.scope === "workspace" || options.scope === "both") {
    groups.push(
      scanWorkspaceRules(options.root),
      scanWorkspaceSkills(options.root),
      scanWorkspaceSubagents(options.root),
      scanWorkspaceHooks(options.root),
      scanAgentsMd(options.root),
    );
  }
  if (options.scope === "user" || options.scope === "both") {
    groups.push(
      scanUserRules(options.home),
      scanUserSkills(options.home, options.kiroHome),
      scanUserSubagents(options.home),
      scanUserHooks(options.home),
    );
    notices.push(
      "Cursor Settings User Rules and Team Rules: Not discoverable from filesystem.",
    );
  }
  const candidates = (await Promise.all(groups)).flat();
  return { candidates: sortByIdentity(candidates), notices };
}
