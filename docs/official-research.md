# Cursor → Kiro Strict Migration：官方文件研究

> ## 2026-09-02 revalidation — Project Rules → Steering correction
>
> This section supersedes the earlier conservative conclusion for ordinary
> root `.cursor/rules/**/*.mdc` project rules. The current official documents
> explicitly describe the same four activation concepts: Cursor has Always,
> Specific Files, Intelligently, and Manual; Kiro has `always`, `fileMatch`,
> `auto`, and `manual`. A converter must preserve the documented fields and
> report only concrete unsupported source data, rather than reject all rules
> because the two products do not publish an implementation-level glob-engine
> identity guarantee.
>
> | Cursor source condition | Kiro destination | Conversion | Exact documented caveat / failure condition |
> | --- | --- | --- | --- |
> | `alwaysApply: true` | `inclusion: always` | Do **not** copy `description` or `globs`: Cursor documents both as ignored in this state. | No Kiro field is needed. If the source has other, non-Cursor frontmatter, report that key. |
> | `alwaysApply: false` and nonempty `globs` | `inclusion: fileMatch`; `fileMatchPattern` | Preserve each glob as an array entry. Cursor permits comma-separated patterns; parse a scalar on commas, trim entries; a YAML sequence is already an array. | Reject/report only a glob value that is neither a string nor a string sequence, or an empty result. Kiro documents scalar and array patterns. |
> | `alwaysApply: false`, no `globs`, nonempty `description` | `inclusion: auto`; `name`; `description` | Derive deterministic `name` from normalized relative rule path (or filename if unique), preserving `description`. Kiro requires both fields for `auto`. | A missing/blank `description` is not auto: it maps to manual. A generated name is a destination identifier, not a Cursor source field. |
> | `alwaysApply: false`, no `globs`, no `description` | `inclusion: manual` | Preserve body. | Invocation spelling differs: Cursor documents `@rule`; Kiro documents `#steering-file-name` and slash commands. This is a concrete UX non-equivalence, not a reason to reject the artifact. |
> | omitted `alwaysApply` | infer the same three cases above, treating it as `false` only if the source parser establishes that Cursor-compatible default; otherwise report `alwaysApply` as missing/invalid. | Do not silently coerce malformed boolean values. | Cursor's published table only specifies `true`/`false`; a non-boolean is a source-schema failure. |
>
> **Pattern compatibility.** Both official documents explicitly demonstrate
> `*`, `**`, extension patterns, directory patterns, and arrays / multiple
> patterns. Cursor's rule examples include `*.ts`, `**/*.ts`, `src/**`, and
> comma-separated patterns; Kiro's steering examples include `*.tsx`,
> `app/api/**/*`, `**/*.test.*`, `src/components/**/*`, plus an array of
> patterns. Therefore a source list consisting of ordinary string glob
> patterns is transferable verbatim to Kiro's `fileMatchPattern` array. The
> vendors do not specify the underlying matcher implementation or every exotic
> grammar feature (for example braces, extglobs, negation, or character
> classes). Mark those *specific patterns* `UNVERIFIED_PATTERN` if encountered;
> do not mark documented `*`/`**` patterns as conflicts.
>
> **Live file references.** Cursor officially documents `@filename.ts` for
> rule file inclusion. Kiro officially documents `#[[file:<relative path>]]`.
> Convert Markdown links whose URL is `mdc:<workspace-relative-path>` to
> `#[[file:<same path>]]`, retaining the surrounding prose (the Kiro syntax is
> the live reference; the Markdown label is not). For example,
> `[BaseApiRequest](mdc:lib/repo/api/base_api_request.dart)` becomes
> `#[[file:lib/repo/api/base_api_request.dart]]`. Also convert standalone
> Cursor `@relative/path` references when they are syntactically recognizable.
> If a target does not exist in the source workspace, emit a concrete
> `MISSING_REFERENCE_TARGET` failure naming the source rule, token, and path;
> otherwise this is a normal transformation.
>
> **Current input audit (`/Users/weihe/GamaPlay/flutter_gtw_ui`).** All nine
> `.cursor/rules/*.mdc` files have `alwaysApply: false` and a nonempty YAML
> string-list `globs`, so all map to `inclusion: fileMatch` with the same
> patterns. There are no unsupported frontmatter keys. Two bodies contain
> migratable `mdc:` links: `api-calling-structure.mdc` (7) and
> `routing-pattern.mdc` (6). The remaining seven have no `mdc:` links. This
> input has **zero documented field-level incompatibilities**. The only
> possible per-item failures during conversion are a filesystem-missing
> reference target or an I/O/YAML write failure, each of which must be named
> directly in the report.
>
> Primary sources (revalidated 2026-09-02): [Cursor Rules](https://cursor.com/docs/rules)
> (activation table, glob examples, `@` references) and [Kiro Steering](https://kiro.dev/docs/steering/)
> (inclusion modes, required `auto` fields, scalar/array `fileMatchPattern`,
> manual invocation, and `#[[file:...]]` references).

- 查證日期：**2026-09-02**
- 適用目標：Cursor 現行官方規格 → Kiro IDE 1.x / Kiro CLI 3.x
- 研究限制：只採 Cursor、Kiro 官方文件，以及兩者共同引用的 Agent Skills 官方規格。本文不把產品需求提示中的 mapping 當成事實來源。
- 判定原則：只有官方文件足以證明 observable semantics 等價時才允許 `EXACT` / `TRANSFORM`；原生共用且不用搬移者為 `NATIVE`；其他一律 `CONFLICT`。

## Executive summary：V1 strict contract

| Artifact | 保守結論 | Strict contract | 官方來源 | 查證日期 |
|---|---|---|---|---|
| 根目錄 `AGENTS.md` | 兩者都原生讀取 workspace root 的同一個 Markdown 檔 | `NATIVE`；不可複製、改寫或另產生 Kiro artifact | [Cursor Rules](https://prod.cursor.com/docs/rules)、[Kiro Steering](https://kiro.dev/docs/steering/) | 2026-09-02 |
| 巢狀 `AGENTS.md` | Cursor 明示只在該目錄及子目錄工作時套用，並合併父層且較具體者優先；Kiro 只明示會遞迴發現並載入，未明示同一套 subtree/precedence 規則 | 檔案本身不搬移，但 compatibility 必須報 `CONFLICT` / evidence insufficient；不可宣稱完整 `NATIVE` semantic equivalence | [Cursor Rules](https://prod.cursor.com/docs/rules)、[Kiro Steering](https://kiro.dev/docs/steering/) | 2026-09-02 |
| Cursor root Skill（標準欄位，無額外 scope/trigger semantics） | 兩者皆採 Agent Skills package 與 progressive disclosure；但目錄不同 | 僅 `name`、`description`、正文及 bundle files，且沒有 Cursor-only/未知欄位時，可 `TRANSFORM` 複製到 `.kiro/skills/<name>/`；保留 bytes 與相對結構 | [Cursor Skills](https://prod.cursor.com/docs/skills)、[Kiro Skills](https://kiro.dev/docs/skills/)、[Agent Skills spec](https://agentskills.io/specification) | 2026-09-02 |
| Cursor nested project Skill | Cursor 明示 `.cursor/skills/` / `.agents/skills/` 可出現在 repo 任意子目錄，並自動限制於該 subtree；Kiro 只文件化 project-root `.kiro/skills/`，未文件化 nested subtree scope | `CONFLICT`；禁止 flatten 到 root `.kiro/skills/` | [Cursor Skills](https://prod.cursor.com/docs/skills)、[Kiro Skills](https://kiro.dev/docs/skills/)、[Kiro configuration scopes](https://kiro.dev/docs/configuration/) | 2026-09-02 |
| Skill `paths` / legacy `globs` | Cursor 用檔案 glob 控制何時 surfaced；Kiro 的 Skill schema/文件沒有同等欄位 | `CONFLICT`；禁止移除或改成 description 猜測 | [Cursor Skills](https://prod.cursor.com/docs/skills)、[Kiro Skills](https://kiro.dev/docs/skills/) | 2026-09-02 |
| Skill `disable-model-invocation`, `icon`, `color` | Cursor 有明確 invocation/UI semantics；Kiro Skill 文件沒有相同欄位 | `CONFLICT`（即使 icon/color 看似 UI-only，也不可默默丟欄位） | [Cursor Skills](https://prod.cursor.com/docs/skills)、[Kiro Skills](https://kiro.dev/docs/skills/) | 2026-09-02 |
| `.cursorrules` | Cursor 官方稱 legacy root file，舊行為等同 Always Apply；Kiro 可表達 always steering，但兩產品適用 surface 與 reference syntax 未被證明完全相同 | 預設 `CONFLICT`；不可只複製正文後聲稱等價 | [Cursor Rules help](https://prod.cursor.com/help/customization/rules)、[Kiro Steering](https://kiro.dev/docs/steering/) | 2026-09-02 |
| `.cursor/rules/*.mdc` | Cursor 有 Always / intelligent / glob / manual 四種 activation；Kiro steering 有 always / auto / fileMatch / manual 類似機制，但 glob engine、surface、nested scope、引用語法與 precedence 未完整證明一致 | 只可對經 compatibility allowlist 明確證明的狹窄欄位組合做 `TRANSFORM`；任何未知 frontmatter、nested scope、`@file` reference 或無法證明的 pattern 都 `CONFLICT` | [Cursor Rules](https://prod.cursor.com/docs/rules)、[Kiro Steering](https://kiro.dev/docs/steering/) | 2026-09-02 |
| Custom Subagents / Custom Agents | 檔案都可表達 name/description/prompt/model/tools，但 runtime defaults 不同：Cursor 預設 model=`inherit` 且繼承 parent tools；Kiro custom sub-agent 採 assigned agent config，預設模型是 Kiro default，並有不同 resources/permissions inheritance | artifact-level 預設 `CONFLICT`；不能只做 frontmatter rename | [Cursor Subagents](https://prod.cursor.com/docs/subagents)、[Kiro Sub-agents](https://kiro.dev/docs/custom-agents/subagents/)、[Kiro agent config](https://kiro.dev/docs/custom-agents/configuration-reference/) | 2026-09-02 |
| Hooks | 兩者 schema、event set、matcher target、working directory、blocking/output protocol、failure default 及 stop-loop semantics 都不同 | 預設逐 hook `CONFLICT`；名稱相似不代表可轉換。除非未來 compatibility definition 為特定 trigger/action/schema 寫出且測過完整 adapter | [Cursor Hooks](https://prod.cursor.com/docs/hooks)、[Kiro Hooks](https://kiro.dev/docs/hooks/)、[Kiro Hook triggers](https://kiro.dev/docs/hooks/types/)、[Kiro Hook actions](https://kiro.dev/docs/hooks/actions/) | 2026-09-02 |
| Cursor Settings User Rules / Team Rules | account/server-backed，不應解析 Cursor internal DB | `NOT_DISCOVERABLE`；不是 runtime error | [Cursor Rules help](https://prod.cursor.com/help/customization/rules)、[Cursor Rules](https://prod.cursor.com/docs/rules) | 2026-09-02 |

## 1. Cursor Rules、legacy `.cursorrules`、`AGENTS.md`

### 1.1 Project Rules

| Claim | 官方來源 | 查證日期 |
|---|---|---|
| Project Rules 是 `.cursor/rules/` 內的 `.mdc` 檔；一般 `.md` 會被 rules system 忽略。 | [Cursor Rules — Project rules / Rule file structure](https://prod.cursor.com/docs/rules) | 2026-09-02 |
| Rule frontmatter 的核心欄位是 `description`、`globs`、`alwaysApply`。 | [Cursor Rules — Rule anatomy](https://prod.cursor.com/docs/rules) | 2026-09-02 |
| `alwaysApply: true` 永遠加入；`false` + `globs` 在 matching file 進入 context 時加入；`false` + description + 無 globs 由 Agent 判斷；三者皆無則只在 `@` mention 時加入。 | [Cursor Rules — Rule anatomy](https://prod.cursor.com/docs/rules) | 2026-09-02 |
| Cursor 的 glob 文件包含 `*`、`**`、`*.ts`、`**/*.ts`、`src/**`，多 pattern 以逗號分隔。 | [Cursor Rules — Glob pattern examples](https://prod.cursor.com/docs/rules) | 2026-09-02 |
| Rule body 可用 `@filename.ts` 引入檔案；這不是 Kiro 的 `#[[file:...]]` 語法。 | [Cursor Rules — FAQ](https://prod.cursor.com/docs/rules)、[Kiro Steering — File references](https://kiro.dev/docs/steering/) | 2026-09-02 |
| Cursor rules 只影響 Agent Chat，不影響 Tab、Inline Edit 或 Bugbot；User Rules 也不套用 Inline Edit。 | [Cursor Rules help — troubleshooting](https://prod.cursor.com/help/customization/rules)、[Cursor Rules — FAQ](https://prod.cursor.com/docs/rules) | 2026-09-02 |
| 現行文件支援 root `.cursor/rules/` 之下的分類子目錄，且以完整 file path 識別同名 rule；但沒有再明示 repository 任意 subtree 可另設 `apps/web/.cursor/rules/` 並獲得 location scope。 | [Cursor Rules](https://prod.cursor.com/docs/rules)、[Cursor Rules help — organize rules](https://prod.cursor.com/help/customization/rules) | 2026-09-02 |

Strict implication：workspace scanner 的文件化範圍是 `<root>/.cursor/rules/**/*.mdc`，不是 `**/.cursor/rules/**/*.mdc`。不能只依 activation mode 名稱相似就做全域 mapping；至少必須驗證 pattern subset、surface、scope、file reference、unknown fields，其中任一項無法保留即 `CONFLICT`。（此結論根據上一表官方 facts，查證日期 2026-09-02。）

### 1.2 Legacy `.cursorrules`

| Claim | 官方來源 | 查證日期 |
|---|---|---|
| `.cursorrules` 位於 project root，屬 legacy；Cursor 官方建議把內容複製成新 Project Rule 並設成 Always Apply，明稱這與舊行為相符。 | [Cursor Rules help — migrate from .cursorrules](https://prod.cursor.com/help/customization/rules) | 2026-09-02 |
| 官方 migration 指引最後一步會刪除 `.cursorrules`；本 CLI 的 source-integrity 要求禁止採用該刪除步驟。 | [Cursor Rules help — migrate from .cursorrules](https://prod.cursor.com/help/customization/rules) | 2026-09-02 |

Strict implication：`always` 本身可能轉成 Kiro steering `inclusion: always`，但只有在正文不含需轉譯的 Cursor reference/semantics、且產品 surface 差異被 compatibility contract 明確接受時才可能 `TRANSFORM`；V1 保守預設為 `CONFLICT`。（來源：[Cursor Rules help](https://prod.cursor.com/help/customization/rules)、[Kiro Steering](https://kiro.dev/docs/steering/)，查證日期 2026-09-02。）

### 1.3 `AGENTS.md`

| Claim | 官方來源 | 查證日期 |
|---|---|---|
| Cursor 支援 root 與任意子目錄的 `AGENTS.md`；巢狀檔在其目錄或子目錄工作時自動套用，與父目錄指令合併，較具體者優先。 | [Cursor Rules — AGENTS.md](https://prod.cursor.com/docs/rules) | 2026-09-02 |
| Kiro 支援 root `AGENTS.md`，也會發現 workspace 子目錄中的 `AGENTS.md`；它不支援 steering inclusion mode，且「always included」。 | [Kiro Steering — Agents.md](https://kiro.dev/docs/steering/) | 2026-09-02 |
| Kiro 可把 global `AGENTS.md` 放在 `~/.kiro/steering/`。 | [Kiro Steering — Agents.md](https://kiro.dev/docs/steering/) | 2026-09-02 |
| Kiro 文件沒有在該段落明定 nested `AGENTS.md` 與 parent 的合併 precedence，也沒有像 Cursor 一樣明說只作用於該 subtree。 | [Kiro Steering — Agents.md](https://kiro.dev/docs/steering/) | 2026-09-02 |

Strict implication：workspace root `AGENTS.md` 是 `NATIVE`；巢狀檔保持原地、不遷移，但 semantic compatibility 回報 evidence-insufficient `CONFLICT`。Kiro global `~/.kiro/steering/AGENTS.md` 不是 Cursor workspace `AGENTS.md` 的目的地。（來源同上，查證日期 2026-09-02。）

## 2. Cursor 與 Kiro Agent Skills

### 2.1 共通標準

| Claim | 官方來源 | 查證日期 |
|---|---|---|
| Agent Skills package 至少含 `SKILL.md`，可另含 `scripts/`、`references/`、`assets/`；`SKILL.md` 是 YAML frontmatter + Markdown body。 | [Agent Skills specification](https://agentskills.io/specification) | 2026-09-02 |
| 標準 required fields 是 `name`、`description`；optional 是 `license`、`compatibility`、`metadata`、experimental `allowed-tools`。 | [Agent Skills specification — Frontmatter](https://agentskills.io/specification) | 2026-09-02 |
| 標準採 progressive disclosure：啟動時載 metadata，activated 後載完整 `SKILL.md`，resources 按需載入。 | [Agent Skills specification — Progressive disclosure](https://agentskills.io/specification) | 2026-09-02 |
| Cursor 與 Kiro 都宣告支援 Agent Skills open standard 與 progressive/on-demand loading。 | [Cursor Skills](https://prod.cursor.com/docs/skills)、[Kiro Skills](https://kiro.dev/docs/skills/) | 2026-09-02 |

Strict implication：只有共同標準且兩端文件支援的內容可原樣保存；`allowed-tools` 在標準本身就是 experimental 且 implementation support 可變，故若存在要 `CONFLICT`，不可假設 Kiro 執行等價。（來源：[Agent Skills specification](https://agentskills.io/specification)，查證日期 2026-09-02。）

### 2.2 Cursor locations 與額外 semantics

| Claim | 官方來源 | 查證日期 |
|---|---|---|
| Cursor project skills：`.agents/skills/`、`.cursor/skills/`；user skills：`~/.agents/skills/`、`~/.cursor/skills/`。 | [Cursor Skills — Skill directories](https://prod.cursor.com/docs/skills) | 2026-09-02 |
| Cursor 另相容 `.claude/skills/`、`.codex/skills/` 及 user equivalents；它們不是本產品明定 source scope，V1 不應自行擴張掃描範圍。 | [Cursor Skills — Skill directories](https://prod.cursor.com/docs/skills) | 2026-09-02 |
| Cursor 遞迴掃 skill root；skill root 內的 category folder 只是組織，identity 來自直接包含 `SKILL.md` 的 folder。 | [Cursor Skills — Nested skill directories](https://prod.cursor.com/docs/skills) | 2026-09-02 |
| Cursor 也尋找 repository 任意子目錄中的 `.cursor/skills/` / `.agents/skills/`；skill 自動 scoped 到該目錄的 files。 | [Cursor Skills — Nested skill directories](https://prod.cursor.com/docs/skills) | 2026-09-02 |
| Cursor `paths` 是 string/list glob，只有在 Agent reading/editing matching files 時才 surfaced；legacy `globs` 仍作 fallback。 | [Cursor Skills — Frontmatter / Scoping](https://prod.cursor.com/docs/skills) | 2026-09-02 |
| Cursor `disable-model-invocation: true` 使 skill 僅可用 `/skill-name` 明確觸發；另有 `icon`、`color`、`metadata`。 | [Cursor Skills — Frontmatter fields](https://prod.cursor.com/docs/skills) | 2026-09-02 |

### 2.3 Kiro locations 與 semantics

| Claim | 官方來源 | 查證日期 |
|---|---|---|
| Kiro workspace skills 位於 project root `.kiro/skills/`；global skills 位於 `~/.kiro/skills/`。同名時 workspace 優先。 | [Kiro Skills — Skill scope](https://kiro.dev/docs/skills/) | 2026-09-02 |
| Kiro 文件化的 frontmatter 是 `name`、`description`、`license`、`compatibility`、`metadata`；未文件化 Cursor `paths`、legacy `globs`、`disable-model-invocation`、`icon`、`color`。 | [Kiro Skills — Frontmatter fields](https://kiro.dev/docs/skills/) | 2026-09-02 |
| Kiro skill 可由 relevance 自動 activate，也可作 slash command 明確 invoke。 | [Kiro Skills — Using skills](https://kiro.dev/docs/skills/) | 2026-09-02 |
| Kiro configuration scope 只列 global `~/.kiro/skills/` 與 project-root `.kiro/skills/`；沒有文件化 nested project `.kiro/skills/` 的 subtree semantics。 | [Kiro configuration scopes](https://kiro.dev/docs/configuration/)、[Kiro Skills](https://kiro.dev/docs/skills/) | 2026-09-02 |

Strict conversion allowlist：root/global Cursor skill 若只含 `name`、`description`、Kiro 明示接受的 optional fields、body 與 bundle files，可 `TRANSFORM` 目錄；任何 nested project root、`paths`、`globs`、`disable-model-invocation`、`icon`、`color`、`allowed-tools` 或未知欄位均 `CONFLICT`。所有相對 references 必須仍解析到相同 bundle file。（來源為本節各官方連結，查證日期 2026-09-02。）

## 3. Custom Subagents / Custom Agents 與 runtime defaults

### 3.1 Cursor

| Claim | 官方來源 | 查證日期 |
|---|---|---|
| Cursor project custom subagents：`.cursor/agents/`；user：`~/.cursor/agents/`；另兼容 Claude/Codex locations。Project 同名優先，且 `.cursor` 優先於 compatibility locations。 | [Cursor Subagents — File locations](https://prod.cursor.com/docs/subagents) | 2026-09-02 |
| 格式是 Markdown + YAML frontmatter；fields 為 `name`、`description`、`model`、`readonly`、`is_background`；defaults 分別 filename、無、`inherit`、`false`、`false`。 | [Cursor Subagents — Configuration fields](https://prod.cursor.com/docs/subagents) | 2026-09-02 |
| subagent 有獨立 context window，沒有 prior conversation history；parent 必須把必要資訊放進 prompt。 | [Cursor Subagents — How subagents work](https://prod.cursor.com/docs/subagents) | 2026-09-02 |
| foreground 會 block 並立即回傳結果；background 立即返回、獨立執行。 | [Cursor Subagents — Foreground vs background](https://prod.cursor.com/docs/subagents) | 2026-09-02 |
| 預設 `model: inherit` 使用 parent model；明確 model 仍可能因 team restriction、plan 或 legacy Max Mode 而 fallback。 | [Cursor Subagents — Model configuration](https://prod.cursor.com/docs/subagents) | 2026-09-02 |
| local subagents 預設共享 parent checkout，並繼承 parent 的全部 tools（含 MCP）；cloud subagent 是例外。 | [Cursor Subagents — Isolated project copies / FAQ](https://prod.cursor.com/docs/subagents) | 2026-09-02 |
| Cursor 可 nested delegation，但只有 main 與 direct subagents 可再 launch；grandchild 不能更深，且需 Task tool access，hooks/policies 可阻止。 | [Cursor Subagents — FAQ](https://prod.cursor.com/docs/subagents) | 2026-09-02 |
| background outputs 寫入 `~/.cursor/subagents/`。 | [Cursor Subagents — FAQ](https://prod.cursor.com/docs/subagents) | 2026-09-02 |
| Cursor 文件沒有完整保證 custom subagent 對 Project/User Rules、nested `AGENTS.md`、Skills/resources、parent permission policy 或完整 parent system prompt 的 inheritance；除 clean context、task prompt 與 tools 外不得推論。 | [Cursor Subagents](https://prod.cursor.com/docs/subagents) | 2026-09-02 |

### 3.2 Kiro IDE 1.x / CLI 3.x

| Claim | 官方來源 | 查證日期 |
|---|---|---|
| Kiro workspace custom agents：`.kiro/agents/<name>.json|md`；global：`~/.kiro/agents/`；workspace 同名優先。Nested directories 支援，agent name 是相對路徑去副檔名。 | [Kiro Custom agents](https://kiro.dev/docs/custom-agents/)、[Creating agents](https://kiro.dev/docs/custom-agents/creating/) | 2026-09-02 |
| IDE 1.0 / CLI 3.0 config 支援 JSON 或 Markdown；核心 fields 含 `name`、`description`、prompt/body、`model`、`tools`、`excludedTools`、`permissions`、`resources`、`includeMcpJson` 等。 | [Kiro agent configuration reference](https://kiro.dev/docs/custom-agents/configuration-reference/)、[IDE 1.0 agent config](https://kiro.dev/docs/ide/whats-new-v1/agent-config/) | 2026-09-02 |
| model 未指定時使用 Kiro default model；指定 model unavailable 時 fallback 到 default 並 warning。官方沒有說它繼承 parent agent model。 | [Kiro agent configuration reference — Model](https://kiro.dev/docs/custom-agents/configuration-reference/) | 2026-09-02 |
| custom agent 可作 sub-agent；Kiro 依 `description` 選擇或由 user 指定。Sub-agent 有自己的 context window、tools、permissions，完成後把 findings 交還 main。 | [Kiro Sub-agents](https://kiro.dev/docs/custom-agents/subagents/) | 2026-09-02 |
| Kiro sub-agent 與 main 共享 steering、MCP、workspace file access、permissions configuration；conversation history、context window、spec state、hook triggers 隔離。 | [Kiro Sub-agents — inheritance table](https://kiro.dev/docs/custom-agents/subagents/) | 2026-09-02 |
| 委派 custom agent 時採該 agent 自己的 `tools` / `permissions`; parent 以 `toolsSettings.subagent.availableAgents` / `trustedAgents` 控制可 spawn/trust 的 agents。 | [Kiro Sub-agents — configuring access](https://kiro.dev/docs/custom-agents/subagents/)、[Kiro agent config — toolsSettings](https://kiro.dev/docs/custom-agents/configuration-reference/) | 2026-09-02 |
| Kiro IDE/CLI sub-agents 可平行，但文件化的互動式流程是 main waits until all complete；沒有 Cursor `is_background` frontmatter 的對等欄位。 | [Kiro Sub-agents — surface behavior](https://kiro.dev/docs/custom-agents/subagents/) | 2026-09-02 |
| Kiro custom agent 預設繼承 default resources（steering、skills、`AGENTS.md`）；`chat.disableInheritingDefaultResources=true` 可關掉，default `false`，built-in agents 永遠繼承。 | [Kiro agent configuration reference — default resource inheritance](https://kiro.dev/docs/custom-agents/configuration-reference/) | 2026-09-02 |

### 3.3 官方文件矛盾與缺口

Kiro [Steering](https://kiro.dev/docs/steering/) 同時寫「custom agents 不自動 include steering，必須放進 `resources`」；較完整的 [agent configuration reference](https://kiro.dev/docs/custom-agents/configuration-reference/) 則寫 default 會繼承 steering/skills/`AGENTS.md`，除非 `chat.disableInheritingDefaultResources=true`。兩頁皆為 Kiro 官方且頁面標示 2026-08-04 更新；本研究於 2026-09-02 查證。Strict contract 必須把依賴此預設的 migration 判為 evidence-insufficient `CONFLICT`，不能任選其中一頁當永久真相。

Kiro 文件也沒有證明以下項目與 Cursor 相同：Cursor `readonly` 的完整限制集合、Cursor parent-tool inheritance、Cursor `model: inherit`、Cursor foreground/background frontmatter、Cursor nested delegation depth、Cloud runtime。故 custom subagent artifact 即使只有看似相同的 name/description/body，也不能僅靠 frontmatter mapping 宣稱 `EXACT` / `TRANSFORM`。（來源：[Cursor Subagents](https://prod.cursor.com/docs/subagents)、[Kiro Sub-agents](https://kiro.dev/docs/custom-agents/subagents/)、[Kiro config reference](https://kiro.dev/docs/custom-agents/configuration-reference/)，查證日期 2026-09-02。）

## 4. Hooks lifecycle 與 schemas

### 4.1 Cursor Hooks

| Claim | 官方來源 | 查證日期 |
|---|---|---|
| Hooks 是 spawned processes，stdin/stdout 都用 JSON；可 observe、block 或 modify agent behavior。 | [Cursor Hooks — overview](https://prod.cursor.com/docs/hooks) | 2026-09-02 |
| Project file `<root>/.cursor/hooks.json`，user file `~/.cursor/hooks.json`；enterprise system paths另有 macOS `/Library/Application Support/Cursor/hooks.json`、Linux/WSL `/etc/cursor/hooks.json`、Windows `C:\ProgramData\Cursor\hooks.json`。 | [Cursor Hooks — Configuration](https://prod.cursor.com/docs/hooks) | 2026-09-02 |
| 多 scope 全部 matching hooks 都執行；merge conflict priority 是 Enterprise > Team > Project > User。Project command cwd 是 project root；user cwd 是 `~/.cursor/`。 | [Cursor Hooks — Configuration](https://prod.cursor.com/docs/hooks) | 2026-09-02 |
| top-level schema `version: 1`、`hooks` map；每 script 可有 `command`、`type: command|prompt`、`timeout`、`loop_limit`、`failClosed`、`matcher`。 | [Cursor Hooks — Configuration options](https://prod.cursor.com/docs/hooks) | 2026-09-02 |
| Command hook 的 stdin/stdout 是 JSON；exit 0 使用 JSON output，exit 2 阻擋 action，其他非零預設視為 failure 且 fail-open，除非 `failClosed: true`。 | [Cursor Hooks — command protocol](https://prod.cursor.com/docs/hooks) | 2026-09-02 |
| `type: "prompt"` hook 另有 `prompt` 與 optional `model`；`$ARGUMENTS` 會被 input JSON 取代，evaluator 回 `{ "ok": boolean, "reason"?: string }`。這是 LLM-based hook semantics，不可轉成 Kiro command action。 | [Cursor Hooks — prompt hooks](https://prod.cursor.com/docs/hooks) | 2026-09-02 |
| Cursor per-script table 把 `matcher` 寫成 object，但官方 examples 與 Plugins reference 使用 regex-like string；這是官方 schema inconsistency，V1 不可自行擴張成 undocumented object parser。 | [Cursor Hooks — matcher configuration](https://prod.cursor.com/docs/hooks)、[Cursor Plugins reference](https://prod.cursor.com/docs/reference/plugins) | 2026-09-02 |
| Agent lifecycle 包含 `sessionStart`, `sessionEnd`, `preToolUse`, `postToolUse`, `postToolUseFailure`, `subagentStart`, `subagentStop`, shell/MCP/read/edit/prompt/compact/stop/response/thought events；另有 Tab events 與 `workspaceOpen` app event。 | [Cursor Hooks — Hook categories](https://prod.cursor.com/docs/hooks) | 2026-09-02 |
| `preToolUse` 可 allow/deny 與 replace `updated_input`; schema 雖接受 `ask` 但目前不 enforce。 | [Cursor Hooks — preToolUse](https://prod.cursor.com/docs/hooks) | 2026-09-02 |
| `subagentStart` 可 allow/deny；`ask` 當 deny。`subagentStop` 可輸出 `followup_message`，預設 loop limit 5。 | [Cursor Hooks — subagent lifecycle](https://prod.cursor.com/docs/hooks) | 2026-09-02 |
| Hook crash/timeout/invalid JSON 預設 fail-open；`failClosed: true` 才 block。 | [Cursor Hooks — before execution](https://prod.cursor.com/docs/hooks) | 2026-09-02 |
| `sessionStart` / `sessionEnd` 是 fire-and-forget；sessionStart 可回 `env` 與 `additional_context`，但不能可靠 block。 | [Cursor Hooks — session lifecycle](https://prod.cursor.com/docs/hooks) | 2026-09-02 |

### 4.2 Kiro Hooks（IDE 1.x / CLI 3.x）

| Claim | 官方來源 | 查證日期 |
|---|---|---|
| 新格式是 standalone `<scope>/.kiro/hooks/<id>.json`，top-level `{ "version": "v1", "hooks": [...] }`；IDE 1.0 / CLI 3.0 引入。 | [Kiro Hooks — file schema](https://kiro.dev/docs/hooks/) | 2026-09-02 |
| hook item required `name`、`trigger`、`action.type`; optional `description`、regex `matcher`、`timeout`（default 60，0 disables）、`enabled`、Stop-only `confirm`。Action 是 `command` 或 `agent`。 | [Kiro Hooks — field reference](https://kiro.dev/docs/hooks/) | 2026-09-02 |
| Global hooks `~/.kiro/hooks/`、project hooks `.kiro/hooks/`；scopes merged。 | [Kiro configuration scopes](https://kiro.dev/docs/configuration/) | 2026-09-02 |
| v1 triggers：`PostFileSave`, `PostFileCreate`, `PostFileDelete`, `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `SessionStart`, `Stop`, `PreTaskExec`, `PostTaskExec`；surface availability 不同，例如 task hooks IDE-only。 | [Kiro Hooks](https://kiro.dev/docs/hooks/)、[Kiro Hook triggers](https://kiro.dev/docs/hooks/types/) | 2026-09-02 |
| command 從 project root 執行並從 stdin 收 JSON。exit 0 的 stdout 加入 agent context；非零的 stderr 回 agent；`PreToolUse` 會 block tool、`UserPromptSubmit` 會 block prompt。 | [Kiro Hooks — how hooks work](https://kiro.dev/docs/hooks/)、[Kiro Hook actions](https://kiro.dev/docs/hooks/actions/) | 2026-09-02 |
| agent action 會把 prompt 注入目前 conversation；在 Prompt Submit 會 append 到 user prompt。 | [Kiro Hook actions](https://kiro.dev/docs/hooks/actions/) | 2026-09-02 |
| CLI 3.0 的舊 embedded camelCase hook 已遷移為 standalone PascalCase v1；legacy inline field 在 Kiro 官方頁面仍有互相矛盾的相容敘述，不能當 V1 destination SSOT。 | [Kiro CLI 3.0](https://kiro.dev/docs/cli/v3/)、[Kiro hooks migration](https://kiro.dev/docs/cli/v3/hooks-migration/)、[Kiro agent config](https://kiro.dev/docs/custom-agents/configuration-reference/) | 2026-09-02 |

### 4.3 Strict hook conclusion

Cursor command hooks期待 JSON stdout decision object，Kiro command hooks以 process exit code 決定 block，且把 stdout/stderr送入 agent context；同名 `PreToolUse` 也因此不是 1:1。Cursor `sessionStart` fire-and-forget 而 Kiro `SessionStart` 是新 v1 event；Cursor `stop` 可自動 follow-up loop，Kiro Stop 的文件化額外行為是 command confirmation；Cursor 另有 subagent、Tab、workspace-open、compaction 等 Kiro 無同 lifecycle 的事件。所有這些 claim 的來源為 [Cursor Hooks](https://prod.cursor.com/docs/hooks)、[Kiro Hooks](https://kiro.dev/docs/hooks/)、[Kiro Hook actions](https://kiro.dev/docs/hooks/actions/)；查證日期 2026-09-02。

所以 V1 不能按 trigger 名字 rename 後搬移。每個 hook 預設 `CONFLICT`；只有未來 compatibility allowlist 能證明 event timing、matcher domain、cwd、stdin、stdout/stderr、exit/failure、timeout、blocking、prompt/context injection 全部一致，或生成 deterministic adapter 並驗證等價時，才可 `TRANSFORM`。（同上來源，查證日期 2026-09-02。）

## 5. IDE 1.x / CLI 3.x 與 filesystem scope matrix

Kiro 官方稱 IDE 1.0 / CLI 3.0 使用 unified agent harness；`.kiro` configuration 可跨 IDE/CLI，但各 surface 的可用 feature 仍依官方 availability table 判斷，不能因「unified」就推定所有 lifecycle 相同。（來源：[Kiro CLI 3.0](https://kiro.dev/docs/cli/v3/)、[Kiro configuration scopes](https://kiro.dev/docs/configuration/)，查證日期 2026-09-02。）

| Artifact | Cursor workspace filesystem | Cursor user/global filesystem | Kiro workspace filesystem | Kiro user/global filesystem | Runtime disposition | 官方來源 | 查證日期 |
|---|---|---|---|---|---|---|---|
| Rules / Steering | `.cursor/rules/**/*.mdc`; root `.cursorrules` | `~/.cursor/rules` local files 有官方 help 記載；Settings User Rules / Team Rules 是 account/server-backed | `.kiro/steering/*.md` | `~/.kiro/steering/*.md` | Settings/Team rules `NOT_DISCOVERABLE`; 不讀 internal DB | [Cursor Rules](https://prod.cursor.com/docs/rules)、[Cursor help](https://prod.cursor.com/help/customization/rules)、[Kiro Steering](https://kiro.dev/docs/steering/) | 2026-09-02 |
| `AGENTS.md` | root + subdirectories | 沒有 Cursor global AGENTS filesystem location文件 | root + subdirectories | `~/.kiro/steering/AGENTS.md` | workspace root `NATIVE`; nested semantic warning | [Cursor Rules](https://prod.cursor.com/docs/rules)、[Kiro Steering](https://kiro.dev/docs/steering/) | 2026-09-02 |
| Skills | `.cursor/skills/`, `.agents/skills/`，含 nested project roots | `~/.cursor/skills/`, `~/.agents/skills/` | root `.kiro/skills/` | `~/.kiro/skills/` | root/common subset `TRANSFORM`; nested/scoped `CONFLICT` | [Cursor Skills](https://prod.cursor.com/docs/skills)、[Kiro Skills](https://kiro.dev/docs/skills/) | 2026-09-02 |
| Custom agents | `.cursor/agents/*.md` | `~/.cursor/agents/*.md` | `.kiro/agents/*.md|json` | `~/.kiro/agents/*.md|json` | runtime defaults 不等價，`CONFLICT` | [Cursor Subagents](https://prod.cursor.com/docs/subagents)、[Kiro Custom agents](https://kiro.dev/docs/custom-agents/) | 2026-09-02 |
| Hooks | `.cursor/hooks.json` + referenced scripts | `~/.cursor/hooks.json` + `~/.cursor/hooks/` | `.kiro/hooks/*.json` | `~/.kiro/hooks/*.json` | schema/lifecycle 不等價，`CONFLICT` | [Cursor Hooks](https://prod.cursor.com/docs/hooks)、[Kiro Hooks](https://kiro.dev/docs/hooks/)、[Kiro configuration](https://kiro.dev/docs/configuration/) | 2026-09-02 |

Kiro CLI `KIRO_HOME` 可覆蓋 `~/.kiro`，且影響 global agents、skills、steering、settings、sessions 等；user-scope scanner 若宣稱支援 CLI 3.x，應尊重此官方 override，不可硬編 home path。（來源：[Kiro CLI Settings — environment variables](https://kiro.dev/docs/cli/reference/settings/)，查證日期 2026-09-02。）

Cursor 的官方 help 同時區分 account User Rules（sync）與 `~/.cursor/rules` local files（不 sync）；scanner 必須只掃後者，前者報 `NOT_DISCOVERABLE`。Cursor Skills 頁另說 User Rules 不在 filesystem；這與 help 頁對 local user rule files 的細分看似衝突，實作應把兩者建模為不同來源種類，不可把 UI/account rules 假裝成 `~/.cursor/rules`。（來源：[Cursor Rules help](https://prod.cursor.com/help/customization/rules)、[Cursor Skills — migration](https://prod.cursor.com/docs/skills)，查證日期 2026-09-02。）

## 6. Machine-readable compatibility definitions 應固定的 guardrails

以下是由上述官方 claims 直接導出的 V1 guardrails；導出日期 2026-09-02：

1. `AGENTS.md` scanner 只記錄，不產生 destination write；root 標 `NATIVE`，nested 額外記錄 scope-semantic evidence gap。（來源：[Cursor Rules](https://prod.cursor.com/docs/rules)、[Kiro Steering](https://kiro.dev/docs/steering/)）
2. Skills 先驗證 Agent Skills package，再拒絕所有 unknown / Cursor-only semantic frontmatter；nested project skill 無條件 `CONFLICT`，不可 flatten。（來源：[Cursor Skills](https://prod.cursor.com/docs/skills)、[Kiro Skills](https://kiro.dev/docs/skills/)、[Agent Skills spec](https://agentskills.io/specification)）
3. Rule converter 不得採「四種 Cursor modes 名稱對四種 Kiro inclusion modes」的寬鬆表；每一 field combination、pattern 與 reference 必須 allowlisted，否則 `CONFLICT`。（來源：[Cursor Rules](https://prod.cursor.com/docs/rules)、[Kiro Steering](https://kiro.dev/docs/steering/)）
4. Subagent compatibility 要比較 runtime defaults；V1 不得因 `name` / `description` / body 可搬就通過。`model: inherit`、`readonly`、`is_background` 或任何 tool/resource/permission dependence 都足以 conflict；即使沒有明寫這些欄位，兩平台 defaults 仍未證明相同。（來源：[Cursor Subagents](https://prod.cursor.com/docs/subagents)、[Kiro Sub-agents](https://kiro.dev/docs/custom-agents/subagents/)、[Kiro config reference](https://kiro.dev/docs/custom-agents/configuration-reference/)）
5. Hook analyzer 解析 Cursor `version: 1` map 與 Kiro `version: "v1"` array 為不同 AST；不得以 trigger string rename 當轉換。所有 unknown event/output field 都 fail closed 成 `CONFLICT`。（來源：[Cursor Hooks](https://prod.cursor.com/docs/hooks)、[Kiro Hooks](https://kiro.dev/docs/hooks/)）
6. User scope 只走已文件化 paths；Cursor account/team rules 是 `NOT_DISCOVERABLE`；Kiro user root 要納入 `KIRO_HOME` override。（來源：[Cursor Rules help](https://prod.cursor.com/help/customization/rules)、[Kiro CLI Settings](https://kiro.dev/docs/cli/reference/settings/)）
7. Kiro 官方文件內部矛盾（custom-agent default steering inheritance、inline hooks vs standalone v1）本身是 compatibility evidence gap；直到官方 contract 消歧前不得選擇較方便的解讀。（來源：[Kiro Steering](https://kiro.dev/docs/steering/)、[Kiro config reference](https://kiro.dev/docs/custom-agents/configuration-reference/)、[Kiro Hooks](https://kiro.dev/docs/hooks/)、[Kiro CLI 3.0](https://kiro.dev/docs/cli/v3/)）

## 7. Official source index

所有來源均於 **2026-09-02** 查證：

- Cursor：[Rules](https://prod.cursor.com/docs/rules)、[Rules help / filesystem locations / `.cursorrules`](https://prod.cursor.com/help/customization/rules)、[Agent Skills](https://prod.cursor.com/docs/skills)、[Subagents](https://prod.cursor.com/docs/subagents)、[Hooks](https://prod.cursor.com/docs/hooks)
- Kiro：[Steering / AGENTS.md](https://kiro.dev/docs/steering/)、[Agent Skills](https://kiro.dev/docs/skills/)、[Custom agents](https://kiro.dev/docs/custom-agents/)、[Agent config reference](https://kiro.dev/docs/custom-agents/configuration-reference/)、[Sub-agents](https://kiro.dev/docs/custom-agents/subagents/)、[Hooks schema](https://kiro.dev/docs/hooks/)、[Hook triggers](https://kiro.dev/docs/hooks/types/)、[Hook actions](https://kiro.dev/docs/hooks/actions/)、[Configuration scopes](https://kiro.dev/docs/configuration/)、[CLI 3.0](https://kiro.dev/docs/cli/v3/)、[CLI hooks migration](https://kiro.dev/docs/cli/v3/hooks-migration/)、[IDE 1.0 agent config](https://kiro.dev/docs/ide/whats-new-v1/agent-config/)、[CLI settings / `KIRO_HOME`](https://kiro.dev/docs/cli/reference/settings/)
- Open standard：[Agent Skills specification](https://agentskills.io/specification)
