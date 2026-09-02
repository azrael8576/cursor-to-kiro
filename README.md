# Cursor to Kiro


[![Quality](https://github.com/azrael8576/cursor-to-kiro/actions/workflows/quality.yml/badge.svg?branch=main)](https://github.com/azrael8576/cursor-to-kiro/actions/workflows/quality.yml)
[![GitHub release (with filter)](https://img.shields.io/github/v/release/azrael8576/cursor-to-kiro)](https://github.com/azrael8576/cursor-to-kiro/releases)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://github.com/azrael8576/cursor-to-kiro/blob/main/LICENSE)

![Logo](docs/images/logo.png)

`cursor-to-kiro` 是一個用來協助團隊將 Cursor 設定遷移到 Kiro 的互動式 CLI。

它會轉換有明確對應的設定，也接受已揭露差異的近似等價轉換。每筆結果會列出欄位與引用的改寫；未能保留的執行行為會產生**未啟用草稿**，輸入錯誤或真正無對應的事件則逐項回報。

CLI 不使用 LLM 改寫設定，不修改 Cursor 原始檔案。官方查證與限制見 [遷移規格](docs/relaxed-migration-review.md)、[Hooks adapter 研究](docs/hooks-adapter-research.md) 與 [相容性表](docs/compatibility-matrix.md)（2026-09-02）。目標格式為 Kiro IDE 1.x／CLI 3.x；本專案測試涵蓋產物與 adapter，但尚未在 Kiro 實機驗證。

---

## Development

```text
npm install
npm run check
npm run build
node dist/index.js --help
```

啟用 tracked pre-commit hook（每個 clone 一次）：

```text
git config core.hooksPath .githooks
```

建置後可直接執行：

```bash
cursor-to-kiro
cursor-to-kiro --root <path>
cursor-to-kiro --dry-run
cursor-to-kiro --yes
cursor-to-kiro --version
cursor-to-kiro --help
```

非互動寫入請加 `--yes`。預期的 `CONFLICT` 會回報，但不造成非零結束碼。

結束碼：`0` 成功（含預期衝突）、`1` 未預期 runtime 錯誤、`2` 安全／驗證失敗且未留下部分遷移、`130` 取消。

---

## Rules

來源：

```text
.cursorrules
.cursor/rules/**/*.mdc
```

相容的 Project Rule 會寫入：

```text
.cursor/rules/<path>.mdc
    ↓
.kiro/steering/<path-with-->.md
```

例如 `.cursor/rules/flutter/widget.mdc` → `.kiro/steering/flutter--widget.md`（巢狀路徑會扁平化，以 `--` 連接）。

啟用模式對應：

| Cursor | Kiro Steering |
| --- | --- |
| `alwaysApply: true` | `inclusion: always` |
| `globs` | `inclusion: fileMatch` + `fileMatchPattern` |
| 非空 `description`（無 globs） | `inclusion: auto` |
| 其餘手動規則 | `inclusion: manual` |

正文中的 Cursor 檔案引用（`mdc:` / `@path`）會轉成 Kiro 的 `#[[file:...]]`。

以下情況不會遷移：

* 未知 frontmatter 欄位
* legacy `.cursorrules`
* 未驗證的 glob 語法（例如 `!`、`{}`、`[]`、extglob）
* 遺失的引用目標、symlink、或其他 discovery conflict

---

## Skills

標準套件搬到 `.kiro/skills/<name>/`，保留資源結構與檔案權限。分類目錄可扁平化；同名或既有檔案衝突不覆寫。

| Cursor 設定 | 轉換結果 |
| --- | --- |
| 標準 Agent Skills 欄位 | 保留 frontmatter 與 bundle |
| `icon`、`color` | 保存在 `metadata.cursor.icon`／`metadata.cursor.color`，不保證 badge 外觀 |
| `disable-model-invocation: false` | 一般 skill |
| `disable-model-invocation: true` | `inclusion: manual` steering，bundle 放在 `.agents/docs/skills/` |
| `paths`／fallback `globs` | `inclusion: fileMatch` + `fileMatchPattern`，明列載入時機差異 |
| subtree skill | 保留 subtree 條件；無法證明 patterns 交集時產生草稿 |
| manual + scope、`allowed-tools`、未知欄位 | 非自動載入的草稿，保留來源欄位 |

標準 skill 的相對 Markdown 連結會依搬移位置重算，含跨套件連結。取消選取或目標衝突時，引用保留到來源檔。程式碼範例、email、MCP 名稱和外部網址不盲目替換。檔案名稱與 description 長度等標準限制會先驗證。

## Subagents

一般角色從 `.cursor/agents/<name>.md` 轉成 `.kiro/agents/<name>.json`，保留 name、description、正文；缺 name 時由檔名推導。

- `model: inherit`／未指定：使用 Kiro default，報告不再保證 parent-model inheritance。
- `readonly: true`：只提供 `read`，關閉 MCP；比 Cursor 更嚴格，不提供唯讀 shell。
- 一般 agent：明確提供 read/write/shell 與 Kiro skill resources；不自動批准工具，不繼承 Cursor 的 MCP／steering 設定。
- 指定 model、背景排程或未知欄位：產生 `.agents/docs/migration-drafts/agents/` 下的角色草稿及來源，避免錯誤啟用。

來源 live file mention 轉成 prompt 中的路徑與 agent `resources`：一般檔案使用 `file://`，已搬移 skill 使用 `skill://`。前者啟動時載入，後者按需載入。Kiro 可用自然語言指定「Use the reviewer agent ...」；CLI 不盲改含糊的 `/name`。

## Hooks

目前會為有對應事件的 command hook 產生：

- `.kiro/hooks/cursor-<event>-<index>.json`：standalone `version: "v1"`。
- `.kiro/hooks/adapters/*.mjs`：自包含的 Node.js adapter。
- `.agents/docs/migration-drafts/hooks/`：原始欄位備份。

**所有 hook 產物預設 `enabled: false`，報告標為 DRAFT。** 任意 script 的 stdin／工具名稱與執行需求無法由 hooks.json 完整證明；應先以目標 Kiro 版本驗證再啟用。遷移期間不執行 hook。

| Cursor | Kiro |
| --- | --- |
| `sessionStart` | `SessionStart` |
| `preToolUse`／`postToolUse` | `PreToolUse`／`PostToolUse` |
| `beforeSubmitPrompt` | `UserPromptSubmit` |
| `stop` | `Stop` |
| shell／MCP 執行前後 | 工具事件 + adapter 內的過濾與欄位轉換 |
| `beforeReadFile` | `PreToolUse` + read 過濾 |
| `afterFileEdit` | `PostFileSave`，需驗證觸發與 payload 差異 |

Adapter 處理 permission allow/deny、prompt continue、additional_context、退出碼與內層 timeout；matcher 留在 adapter 依 Cursor 的比對對象判斷。原 shell command 與 project-root cwd 保留；腳本和其依賴不搬移，執行需 Node.js 與來源腳本。

無對應的 `sessionEnd` 等事件逐項回報；Cursor prompt hook 不能直接等同 Kiro prompt injection。未知輸出、ask、修改 tool input/output、自動續跑等控制行為不會被靜默丟棄。
