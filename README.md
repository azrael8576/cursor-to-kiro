# Cursor → Kiro Migration CLI

`cursor-to-kiro` 是一個用來協助團隊將 Cursor 設定遷移到 Kiro 的互動式 CLI。

它採取 **Strict Migration** 原則：

> 只有在 Cursor 與 Kiro 的設定語義經官方規格證明相容時才會自動遷移。
> 如果發現欄位、行為或生命週期存在不一致，該項目不會被強制轉換；CLI 會列出原因，交由使用者自行處理。

CLI 不會用 LLM 改寫設定，也不會修改任何 Cursor 原始檔案。相容契約以 [compatibility matrix](docs/compatibility-matrix.md) 與 [official research](docs/official-research.md) 為準（最近查證：2026-09-02）。

目前會掃描並分析 Rules、Skills、Subagents、Hooks。能安全轉換的自動完成；不能安全轉換的清楚標示原因。

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

只有同時滿足以下條件才會遷移：

* 位於 project root Skill 位置（非巢狀 subtree Skill）
* frontmatter 僅含 Agent Skills 共用欄位（如 `name`、`description`）
* 沒有 Cursor-only 欄位（如 `paths`、`globs`、`disable-model-invocation`）

遷移結果為 byte-preserving 目錄複製：

```text
.cursor/skills/<name>/...
    ↓
.kiro/skills/<name>/...
```

---

## Subagents 相容性

| Cursor 設定 | 處理 |
| --- | --- |
| `name` / `description` / body | 不足以單獨證明可遷移 |
| `model` / `readonly` / `is_background` | ❌ 無嚴格等價 |
| 即使沒有上述執行欄位 | ❌ 仍不遷移 |

Cursor 與 Kiro 在預設 model、tool、resource、permission inheritance 上不同。只要無法證明完整 runtime 等價，整個 Subagent 都不會自動遷移。

---

## Hooks 相容性

名稱相似不代表可轉換：

| Cursor Hook | 近似 Kiro 名稱 | 處理 |
| --- | --- | --- |
| `sessionStart` | `SessionStart` | ❌ 協議不等價 |
| `preToolUse` | `PreToolUse` | ❌ 協議不等價 |
| `postToolUse` | `PostToolUse` | ❌ 協議不等價 |
| `beforeSubmitPrompt` | `UserPromptSubmit` | ❌ 協議不等價 |
| `stop` | `Stop` | ❌ 協議不等價 |
| `sessionEnd` / `beforeShellExecution` / `afterShellExecution` / `beforeMCPExecution` / `afterMCPExecution` / `subagentStart` / `subagentStop` / `preCompact` 等 | 無 1:1 生命週期契約 | ❌ 不遷移 |

差異包含 stdin/stdout 決策協議、exit-code、fail-open/fail-closed、以及 context injection。CLI 會解析並回報每個 Hook，但不會產生 Kiro Hook 檔。
