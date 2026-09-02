import path from "node:path";
import { stringify } from "yaml";
import type {
  Analysis,
  Candidate,
  ManifestEntry,
  Result,
  SkillCandidate,
  SubagentCandidate,
} from "../domain.js";
import { generatedText, hashBytes } from "../util/text.js";
import { prepareHook } from "./hooks.js";

export type MigrationIssue =
  | { kind: "INVALID_FIELD"; detail: string }
  | { kind: "DISCOVERY_CONFLICT"; detail: string }
  | { kind: "UNSUPPORTED_EVENT"; detail: string }
  | { kind: "MISSING_REFERENCE_TARGET"; detail: string }
  | { kind: "UNSAFE_REFERENCE"; detail: string }
  | { kind: "REFERENCE_IO_ERROR"; detail: string };

export interface DocumentOutput {
  path: string;
  source: string;
  format: "markdown" | "agent";
}
export interface PreparedArtifact {
  analysis: Analysis;
  entries: ManifestEntry[];
  documents: DocumentOutput[];
}
export interface AgentConfig {
  name: string;
  description?: string;
  prompt: string;
  tools: string[];
  includeMcpJson: boolean;
  resources?: string[];
}

export function output(
  candidate: Candidate,
  root: string,
  displayPath: string,
  content: string,
): ManifestEntry {
  return {
    absolutePath: path.join(root, displayPath),
    displayPath,
    bytes: generatedText(content),
    artifactId: candidate.id,
    semanticKey: `${candidate.kind}:${candidate.identity}:${displayPath}`,
  };
}

export function prepareArtifact(
  candidate: Exclude<Candidate, { kind: "rule" }>,
  root: string,
): Result<PreparedArtifact, MigrationIssue> {
  if (candidate.discoveryConflict)
    return {
      ok: false,
      error: {
        kind: "DISCOVERY_CONFLICT",
        detail: candidate.discoveryConflict,
      },
    };
  if (!candidate.sourceFiles.length)
    return {
      ok: false,
      error: {
        kind: "DISCOVERY_CONFLICT",
        detail: `${candidate.identity}: no source file`,
      },
    };
  if (candidate.kind === "hook") return prepareHook(candidate, root);
  return candidate.kind === "skill"
    ? prepareSkill(candidate, root)
    : prepareAgent(candidate, root);
}

function invalid(detail: string): Result<never, MigrationIssue> {
  return { ok: false, error: { kind: "INVALID_FIELD", detail } };
}

function prepareAgent(
  candidate: SubagentCandidate,
  root: string,
): Result<PreparedArtifact, MigrationIssue> {
  const source = candidate.sourceFiles[0];
  if (!source) return invalid(`${candidate.identity}: no source file`);
  const fields = candidate.parsed.frontmatter;
  const name = fields.name ?? path.basename(candidate.identity, ".md");
  if (typeof name !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name))
    return invalid(
      `${candidate.identity}: name must be a lowercase hyphenated identifier`,
    );
  for (const key of ["readonly", "is_background"]) {
    if (fields[key] !== undefined && typeof fields[key] !== "boolean")
      return invalid(`${candidate.identity}: ${key} must be boolean`);
  }
  for (const key of ["description", "model"]) {
    if (
      fields[key] !== undefined &&
      (typeof fields[key] !== "string" || !fields[key].trim())
    )
      return invalid(`${candidate.identity}: ${key} must be a nonempty string`);
  }
  const unresolved = Object.keys(fields).filter(
    key =>
      !["name", "description", "model", "readonly", "is_background"].includes(
        key,
      ),
  );
  if (fields.model !== undefined && fields.model !== "inherit")
    unresolved.push(`MODEL_MAPPING_REQUIRED: model=${fields.model}`);
  if (fields.is_background === true)
    unresolved.push("is_background: background scheduling is not preserved");
  const draft = unresolved.length > 0;
  const config: AgentConfig = {
    name,
    ...(typeof fields.description === "string"
      ? { description: fields.description }
      : {}),
    prompt: candidate.parsed.body,
    tools: fields.readonly === true ? ["read"] : ["read", "write", "shell"],
    includeMcpJson: false,
    resources: ["skill://.kiro/skills/*/SKILL.md"],
  };
  const directory = draft
    ? `.agents/docs/migration-drafts/agents/${name}`
    : ".kiro/agents";
  const destination = `${directory}/${name}.json`;
  const changes = [
    "model: inherit/omitted → Kiro default; parent-model inheritance is not preserved.",
    "tools → explicit read/write/shell baseline; MCP, steering, permissions and parent tool inheritance require target configuration.",
  ];
  if (fields.readonly === true)
    changes.push(
      "readonly: true → tools: [read], includeMcpJson: false; read-only shell commands are unavailable.",
    );
  changes.push(...unresolved);
  const entries = [
    output(candidate, root, destination, JSON.stringify(config, null, 2)),
  ];
  if (draft)
    entries.push(
      output(candidate, root, `${directory}/source.md`, candidate.parsed.raw),
    );
  return {
    ok: true,
    value: {
      analysis: {
        candidate,
        status: "TRANSFORM",
        selected: true,
        summary: draft
          ? "Agent role converted to a non-activated draft"
          : "Agent role converted to Kiro",
        disposition: draft ? "draft" : "active",
        changes,
      },
      entries,
      documents: [
        { path: destination, source: source.absolutePath, format: "agent" },
      ],
    },
  };
}

function prepareSkill(
  candidate: SkillCandidate,
  root: string,
): Result<PreparedArtifact, MigrationIssue> {
  const fields = candidate.parsed.frontmatter;
  const { name, description, metadata, compatibility, license } = fields;
  if (
    typeof name !== "string" ||
    name.length > 64 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) ||
    name !== candidate.skillName
  )
    return invalid(
      `${candidate.identity}: name must match the directory and contain 1–64 lowercase alphanumeric/hyphen characters`,
    );
  if (
    typeof description !== "string" ||
    !description.trim() ||
    description.length > 1024
  )
    return invalid(
      `${candidate.identity}: description must contain 1–1024 characters`,
    );
  if (
    compatibility !== undefined &&
    (typeof compatibility !== "string" ||
      !compatibility.trim() ||
      compatibility.length > 500)
  )
    return invalid(
      `${candidate.identity}: compatibility must contain 1–500 characters`,
    );
  if (license !== undefined && typeof license !== "string")
    return invalid(`${candidate.identity}: license must be a string`);
  if (
    metadata !== undefined &&
    (metadata === null ||
      typeof metadata !== "object" ||
      Array.isArray(metadata) ||
      Object.values(metadata).some(value => typeof value !== "string"))
  )
    return invalid(
      `${candidate.identity}: metadata must map strings to strings`,
    );
  const manual = fields["disable-model-invocation"];
  if (manual !== undefined && typeof manual !== "boolean")
    return invalid(
      `${candidate.identity}: disable-model-invocation must be boolean`,
    );
  for (const key of ["icon", "color"]) {
    if (fields[key] !== undefined && typeof fields[key] !== "string")
      return invalid(`${candidate.identity}: ${key} must be a string`);
  }
  const patternsValue = fields.paths ?? fields.globs;
  let patterns: string[] = [];
  if (patternsValue !== undefined) {
    if (typeof patternsValue === "string")
      patterns = patternsValue.split(",").map(value => value.trim());
    else if (
      Array.isArray(patternsValue) &&
      patternsValue.every(value => typeof value === "string")
    )
      patterns = patternsValue.map(value => value.trim());
    else
      return invalid(
        `${candidate.identity}: paths/globs must be a string or string array`,
      );
    if (!patterns.length || patterns.some(value => !value))
      return invalid(`${candidate.identity}: paths/globs must not be empty`);
  }
  const unresolved = Object.keys(fields).filter(
    key =>
      ![
        "name",
        "description",
        "license",
        "compatibility",
        "metadata",
        "icon",
        "color",
        "disable-model-invocation",
        "paths",
        "globs",
      ].includes(key),
  );
  const nested = candidate.scopeSemantics === "nested-subtree";
  const scoped = nested || patterns.length > 0;
  if (manual === true && scoped)
    unresolved.push(
      "manual + paths/subtree: simultaneous invocation and scope conditions require review",
    );
  if (
    patterns.some(pattern => /[!{}[\]()\\]|(^|\/)\.\.(\/|$)|^\//.test(pattern))
  )
    unresolved.push("paths: unsupported glob grammar or non-relative path");
  // Cursor nested scope and its paths are intersected. Anchored project paths
  // can be retained; unanchored ** paths are prefixed. Other cases need review.
  if (nested) {
    const scope = candidate.sourceScopeRoot;
    if (!patterns.length) patterns = [`${scope}/**`];
    else
      patterns = patterns.map(pattern => {
        if (pattern.startsWith(`${scope}/`)) return pattern;
        if (pattern.startsWith("**/")) return `${scope}/${pattern}`;
        unresolved.push(
          `paths: cannot prove intersection of ${scope}/** and ${pattern}`,
        );
        return pattern;
      });
  }
  const draft = unresolved.length > 0;
  const steering = scoped || manual === true;
  const id = nested
    ? `${candidate.sourceScopeRoot.replaceAll("/", "--")}--${name}`
    : name;
  const base = draft
    ? `.agents/docs/migration-drafts/skills/${id}`
    : steering
      ? `.agents/docs/skills/${id}`
      : `.kiro/skills/${name}`;
  const sourceMain = candidate.sourceFiles.find(
    file => file.identity === candidate.identity,
  );
  if (!sourceMain) return invalid(`${candidate.identity}: missing SKILL.md`);
  const sourceDirectory = path.dirname(sourceMain.absolutePath);
  const changes: string[] = [...unresolved];
  if (candidate.organizationalDepth)
    changes.push(`directory: organizational folders → ${base}`);
  if (steering)
    changes.push(
      `skill activation → ${manual === true ? "manual" : "fileMatch"} steering; progressive discovery/UI differs. Bundle → ${base}`,
    );
  const common = {
    name,
    description,
    ...(license === undefined ? {} : { license }),
    ...(compatibility === undefined ? {} : { compatibility }),
    ...(metadata === undefined ? {} : { metadata: { ...metadata } }),
  };
  for (const key of ["icon", "color"]) {
    if (typeof fields[key] === "string") {
      const existing = common.metadata ?? {};
      if (Object.hasOwn(existing, `cursor.${key}`))
        return invalid(
          `${candidate.identity}: metadata cursor.${key} collision`,
        );
      common.metadata = { ...existing, [`cursor.${key}`]: fields[key] };
      changes.push(
        `${key}: ${fields[key]} → metadata.cursor.${key}; Kiro badge appearance is not preserved`,
      );
    }
  }
  if (manual === false)
    changes.push(
      "disable-model-invocation: false → standard automatic skill discovery",
    );
  const entries: ManifestEntry[] = [];
  const documents: DocumentOutput[] = [];
  for (const source of candidate.sourceFiles) {
    const relative = path
      .relative(sourceDirectory, source.absolutePath)
      .split(path.sep)
      .join("/");
    const main = source === sourceMain;
    const displayPath = `${base}/${main && (draft || steering) ? "instructions.md" : relative}`;
    const rewriteHeader =
      main &&
      (steering ||
        draft ||
        fields.icon !== undefined ||
        fields.color !== undefined ||
        manual === false);
    const bytes = rewriteHeader
      ? generatedText(`---\n${stringify(common)}---\n${candidate.parsed.body}`)
      : source.bytes;
    entries.push({
      absolutePath: path.join(root, displayPath),
      displayPath,
      bytes,
      artifactId: candidate.id,
      semanticKey: `skill:${name}:${relative}:${hashBytes(source.bytes)}`,
      sourceAbsolutePath: source.absolutePath,
      ...(source.mode === undefined ? {} : { mode: source.mode }),
    });
    if (relative.endsWith(".md"))
      documents.push({
        path: displayPath,
        source: source.absolutePath,
        format: "markdown",
      });
  }
  if (steering) {
    const displayPath = draft
      ? `${base}/steering.md`
      : `.kiro/steering/${id}.md`;
    const frontmatter =
      manual === true
        ? { inclusion: "manual" }
        : { inclusion: "fileMatch", fileMatchPattern: patterns };
    entries.push(
      output(
        candidate,
        root,
        displayPath,
        `---\n${stringify(frontmatter)}---\n#[[file:${base}/instructions.md]]`,
      ),
    );
  }
  if (draft || steering)
    entries.push(
      output(
        candidate,
        root,
        `${base}/cursor-source.txt`,
        candidate.parsed.raw,
      ),
    );
  return {
    ok: true,
    value: {
      analysis: {
        candidate,
        status: "TRANSFORM",
        selected: true,
        summary: draft
          ? "Skill converted to a non-activated draft"
          : steering
            ? "Skill converted to Kiro steering and a passive bundle"
            : "Skill package converted to Kiro",
        disposition: draft ? "draft" : "active",
        changes,
      },
      entries,
      documents,
    },
  };
}
