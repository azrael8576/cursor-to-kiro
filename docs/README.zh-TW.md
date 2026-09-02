# Cursor to Kiro


[![Quality](https://github.com/azrael8576/cursor-to-kiro/actions/workflows/quality.yml/badge.svg?branch=main)](https://github.com/azrael8576/cursor-to-kiro/actions/workflows/quality.yml)
[![GitHub Release](https://img.shields.io/github/v/release/azrael8576/cursor-to-kiro)](https://github.com/azrael8576/cursor-to-kiro/releases)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://github.com/azrael8576/cursor-to-kiro/blob/main/LICENSE)

![Logo](images/logo.png)

一個互動式 CLI，協助你把 Cursor 設定搬到 Kiro。

挑選要遷移的項目，`cursor-to-kiro` 會自動轉換相容的設定，並在完成後清楚列出哪些項目沒有對應、需要人工確認。

---

## 安裝與使用

```bash
npm install
npm run build
npm link          # 全域可用 cursor-to-kiro 指令
```

```bash
cd <your-repo>
cursor-to-kiro
```

---

## 相容性

支援四類設定：**Rules**、**Skills**、**Subagents**、**Hooks**。

| 圖示 | 意義 |
| --- | --- |
| ✅ | 支援，直接轉換 |
| ⚠️ | 部分支援，轉換後會標註差異或產生待確認草稿 |
| ❌ | 不支援，會逐項回報 |

### Rules

| 項目 | 狀態 |
| --- | --- |
| `.cursor/rules/**/*.mdc` Project Rules | ✅ |
| `alwaysApply` / `globs` / `description` 啟用模式 | ✅ |
| 正文中的檔案引用（`mdc:` / `@path`） | ✅ |
| Legacy `.cursorrules` | ❌ |
| 未知 frontmatter 欄位 | ❌ |
| 進階 glob 語法（`!`、`{}`、`[]`、extglob） | ❌ |
| 遺失的引用目標、symlink、discovery conflict | ❌ |

### Skills

| 項目 | 狀態 |
| --- | --- |
| 標準 Agent Skills（frontmatter + bundle） | ✅ |
| 資源結構與檔案權限 | ✅ |
| 相對 Markdown 連結（含跨套件） | ✅ |
| `icon` / `color` | ⚠️ 保留於 metadata，不保證 badge 外觀 |
| `disable-model-invocation: true` | ⚠️ 轉為 manual steering |
| `paths` / `globs` 載入條件 | ⚠️ 標註載入時機差異 |
| Subtree skills | ⚠️ 無法驗證 patterns 交集時產生草稿 |
| `allowed-tools`、manual scope、未知欄位 | ⚠️ 保留來源欄位，不自動載入 |
| 檔案名稱、description 長度等標準限制 | ✅ 轉換前先驗證 |

### Subagents

| 項目 | 狀態 |
| --- | --- |
| 一般角色（name / description / 正文） | ✅ |
| 檔案引用轉為 agent resources（`file://` / `skill://`） | ✅ |
| `readonly: true` | ⚠️ 僅提供唯讀檔案存取，較 Cursor 嚴格 |
| `model: inherit` / 未指定 | ⚠️ 使用 Kiro 預設，不保證繼承 parent model |
| 指定 model、背景排程、未知欄位 | ⚠️ 產生待確認草稿 |
| Cursor 的 MCP / steering 自動繼承 | ❌ |

### Hooks

> 所有 hook 產物預設停用（`enabled: false`）並標記為 DRAFT。請以目標 Kiro 版本驗證後再啟用。

| Cursor 事件 | Kiro 對應 | 狀態 |
| --- | --- | --- |
| `sessionStart` | `SessionStart` | ✅ |
| `preToolUse` / `postToolUse` | `PreToolUse` / `PostToolUse` | ✅ |
| `beforeSubmitPrompt` | `UserPromptSubmit` | ✅ |
| `stop` | `Stop` | ✅ |
| `beforeReadFile` | `PreToolUse` + read 過濾 | ✅ |
| shell / MCP 執行前後 | 工具事件 + adapter 轉換 | ⚠️ 需驗證 |
| `afterFileEdit` | `PostFileSave` | ⚠️ 需驗證觸發與 payload 差異 |
| `sessionEnd` 等無對應事件 | — | ❌ |

---
