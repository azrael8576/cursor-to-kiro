import path from "node:path";
import type { ManifestEntry, Result } from "../domain.js";
import { generatedText } from "../util/text.js";
import type {
  AgentConfig,
  MigrationIssue,
  PreparedArtifact,
} from "./artifacts.js";

export interface ReferenceDependencies {
  inspect: (absolutePath: string) => Promise<Result<void, MigrationIssue>>;
}

export async function rewriteArtifactReferences(
  artifact: PreparedArtifact,
  root: string,
  mappings: ReadonlyMap<string, string>,
  dependencies: ReferenceDependencies,
): Promise<Result<PreparedArtifact, MigrationIssue>> {
  const entries: ManifestEntry[] = [...artifact.entries];
  const changes = [...(artifact.analysis.changes ?? [])];
  for (const document of artifact.documents) {
    const index = entries.findIndex(
      entry => entry.displayPath === document.path,
    );
    const entry = entries[index];
    if (!entry)
      return {
        ok: false,
        error: {
          kind: "DISCOVERY_CONFLICT",
          detail: `Missing output ${document.path}`,
        },
      };
    let original: string;
    try {
      original = new TextDecoder("utf-8", { fatal: true }).decode(entry.bytes);
    } catch {
      return {
        ok: false,
        error: {
          kind: "INVALID_FIELD",
          detail: `${document.source}: invalid UTF-8 Markdown`,
        },
      };
    }
    const config: AgentConfig | undefined =
      document.format === "agent"
        ? (JSON.parse(original) as AgentConfig)
        : undefined;
    const text = config ? config.prompt : original;
    const resources: string[] = [];
    let issue: MigrationIssue | undefined;
    const resolve = async (
      rawTarget: string,
      live: boolean,
    ): Promise<string | undefined> => {
      const parts = rawTarget.split(/(?=[#?])/);
      const file = parts.shift() ?? "";
      let decoded: string;
      try {
        decoded = decodeURIComponent(file);
      } catch {
        issue = {
          kind: "UNSAFE_REFERENCE",
          detail: `${document.source}: invalid encoded path ${rawTarget}`,
        };
        return;
      }
      const source = path.resolve(
        live ? root : path.dirname(document.source),
        decoded,
      );
      const relative = path.relative(root, source);
      if (
        relative === ".." ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative)
      ) {
        issue = {
          kind: "UNSAFE_REFERENCE",
          detail: `${document.source}: ${rawTarget} escapes the workspace`,
        };
        return;
      }
      const checked = await dependencies.inspect(source);
      if (!checked.ok) {
        issue = {
          ...checked.error,
          detail: `${document.source}: ${rawTarget} → ${source}: ${checked.error.detail}`,
        };
        return;
      }
      const target = mappings.get(source) ?? source;
      if (live && config) {
        const relativeTarget = path
          .relative(root, target)
          .split(path.sep)
          .join("/");
        const scheme = /^\.kiro\/skills\/[^/]+\/SKILL\.md$/.test(relativeTarget)
          ? "skill"
          : "file";
        resources.push(`${scheme}://${relativeTarget}`);
        return ["`", relativeTarget, parts.join(""), "`"].join("");
      }
      // Skills use standard Markdown, never steering-only interpolation.
      const base = config ? root : path.dirname(entry.absolutePath);
      const destRelative = path
        .relative(base, target)
        .split(path.sep)
        .join("/");
      const encoded = destRelative
        .split("/")
        .map(segment => encodeURIComponent(segment))
        .join("/");
      return `${encoded}${parts.join("")}`;
    };
    let inFence = "";
    let inFrontmatter = false;
    const lines = text.split("\n");
    for (const [n, line] of lines.entries()) {
      if (!config && n === 0 && line === "---") {
        inFrontmatter = true;
        continue;
      }
      if (inFrontmatter) {
        if (line === "---") inFrontmatter = false;
        continue;
      }
      const fence = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
      if (fence) {
        if (!inFence) inFence = fence;
        else if (fence[0] === inFence[0] && fence.length >= inFence.length)
          inFence = "";
        continue;
      }
      if (inFence) continue;
      const pieces = line.split(/(`+[^`]*`+)/g);
      for (const [p, segment] of pieces.entries()) {
        if (p % 2 !== 0) continue;
        const regex =
          /\[([^\]]*)\]\(([^)]+)\)|(?<![\w@])@((?:[\w.-]+\/)*[\w-]+(?:\.[\w-]+)+)/g;
        let rewritten = "",
          end = 0;
        for (const match of segment.matchAll(regex)) {
          rewritten += segment.slice(end, match.index);
          const link = match[2]?.trim();
          const parsedLink = link?.startsWith("<")
            ? /^<([^>]+)>(.*)$/.exec(link)
            : /^(.*?)(\s+["'][^"']*["'])?$/.exec(link ?? "");
          const raw = match[3] ?? parsedLink?.[1] ?? link ?? "";
          const title = parsedLink?.[2] ?? "";
          const live = match[3] !== undefined || raw.startsWith("mdc:");
          if (
            !live &&
            (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(raw) ||
              raw.startsWith("#") ||
              raw.startsWith("//"))
          ) {
            rewritten += match[0];
            end = match.index + match[0].length;
            continue;
          }
          const destination = await resolve(raw.replace(/^mdc:/, ""), live);
          if (issue) return { ok: false, error: issue };
          const replacement =
            destination === undefined
              ? match[0]
              : live && config
                ? destination
                : `[${match[1] ?? raw.replace(/^mdc:/, "")}](${destination}${title})`;
          if (replacement !== match[0])
            changes.push(`reference: ${match[0]} → ${replacement}`);
          rewritten += replacement;
          end = match.index + match[0].length;
        }
        pieces[p] = rewritten + segment.slice(end);
      }
      lines[n] = pieces.join("");
    }
    const rewritten = lines.join("\n");
    if (config) {
      config.prompt = rewritten;
      if (resources.length) {
        config.resources = [
          ...new Set([...(config.resources ?? []), ...resources]),
        ];
        changes.push(
          "Cursor live file references → agent resources (file:// loads at startup; skill:// loads on demand)",
        );
      }
    }
    if (rewritten !== text || resources.length)
      entries[index] = {
        ...entry,
        bytes: generatedText(
          config ? JSON.stringify(config, null, 2) : rewritten,
        ),
      };
  }
  return {
    ok: true,
    value: {
      ...artifact,
      entries,
      analysis: { ...artifact.analysis, changes },
    },
  };
}
