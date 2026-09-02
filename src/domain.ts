export type CompatibilityStatus = "EXACT" | "TRANSFORM" | "NATIVE" | "CONFLICT";
export type ArtifactKind = "rule" | "skill" | "subagent" | "hook" | "agents-md";
export type MigrationScope = "workspace" | "user" | "both";
export type SourceScope = "workspace" | "user";

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export interface SourceFile {
  absolutePath: string;
  identity: string;
  bytes: Uint8Array;
}

export interface ParsedMarkdown {
  body: string;
  frontmatter: Record<string, unknown>;
  raw: string;
}

export interface RuleCandidate {
  kind: "rule";
  id: string;
  identity: string;
  legacy: boolean;
  parsed: ParsedMarkdown;
  scope: SourceScope;
  sourceFiles: SourceFile[];
  discoveryConflict?: string;
}

export interface SkillCandidate {
  kind: "skill";
  id: string;
  identity: string;
  parsed: ParsedMarkdown;
  scope: SourceScope;
  sourceFiles: SourceFile[];
  sourceSkillRoot: string;
  sourceScopeRoot: string;
  destinationSkillRoot: string;
  scopeSemantics: "workspace" | "user" | "nested-subtree";
  skillName: string;
  organizationalDepth: number;
  discoveryConflict?: string;
}

export interface SubagentCandidate {
  kind: "subagent";
  id: string;
  identity: string;
  parsed: ParsedMarkdown;
  scope: SourceScope;
  sourceFiles: SourceFile[];
  nested: boolean;
  discoveryConflict?: string;
}

export interface CursorHookDefinition {
  command?: unknown;
  type?: unknown;
  prompt?: unknown;
  model?: unknown;
  timeout?: unknown;
  loop_limit?: unknown;
  failClosed?: unknown;
  matcher?: unknown;
  [field: string]: unknown;
}

export interface HookCandidate {
  kind: "hook";
  id: string;
  identity: string;
  trigger: string;
  index: number;
  definition: CursorHookDefinition;
  scope: SourceScope;
  sourceFiles: SourceFile[];
  parseError?: string;
  discoveryConflict?: string;
}

export interface AgentsMdCandidate {
  kind: "agents-md";
  id: string;
  identity: string;
  nested: boolean;
  scope: "workspace";
  sourceFiles: SourceFile[];
  discoveryConflict?: string;
}

export type Candidate =
  | RuleCandidate
  | SkillCandidate
  | SubagentCandidate
  | HookCandidate
  | AgentsMdCandidate;

export interface Analysis {
  candidate: Candidate;
  status: CompatibilityStatus;
  summary: string;
  reason?: string;
  cursorBehavior?: string;
  kiroGap?: string;
  fields?: string[];
  selected: boolean;
}

export interface ManifestEntry {
  absolutePath: string;
  displayPath: string;
  bytes: Uint8Array;
  artifactId: string;
  semanticKey: string;
}

export interface MigrationPlan {
  analyses: Analysis[];
  manifest: ManifestEntry[];
  selectedIds: string[];
  destinationConflicts: Analysis[];
}

export interface ScanResult {
  candidates: Candidate[];
  notices: string[];
}

export interface CommitResult {
  created: string[];
  alreadyPresent: string[];
  rollbackPerformed: boolean;
}
