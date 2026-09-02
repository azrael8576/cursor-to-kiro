# Cursor → Kiro compatibility matrix

查證與實作更新：2026-09-02。以 [遷移規格](relaxed-migration-review.md) 和 [Hooks adapter 查證](hooks-adapter-research.md) 為依據。`TRANSFORM` 表示已轉換產物；`disposition: draft` 表示尚未啟用，不能算作完整 runtime 遷移成功。

| Artifact / field | 目前處理 | 差異／限制 |
| --- | --- | --- |
| Project Rules | `TRANSFORM`：always / auto / fileMatch / manual steering | 既有未知欄位、未驗證 glob、缺少引用仍逐項衝突 |
| Root standard Skill | `TRANSFORM`：搬移目錄 | 保留 bytes（需改引用時除外）與檔案權限 |
| Organizational Skill folder | `TRANSFORM`：扁平化 | 保留名稱；碰撞時不覆寫 |
| Skill `icon` / `color` | `TRANSFORM`：namespaced metadata | 不重現 badge 外觀 |
| Skill manual only | `TRANSFORM`：manual steering + passive bundle | 載入／UI 與原 skill 不完全相同 |
| Skill paths / nested subtree | `TRANSFORM`：fileMatch steering + passive bundle | 只轉可表達的範圍；交集不明時草稿 |
| Skill manual + scope / allowed-tools / unknown fields | `TRANSFORM`, draft | 保留原始資料，不自動載入 |
| Basic Subagent | `TRANSFORM`：Kiro JSON agent | Kiro default model；明確工具集合與 skill resources；不繼承 Cursor MCP／steering |
| Subagent readonly | `TRANSFORM`：tools read only | 較嚴格，移除 shell／MCP |
| Subagent model ID / background / unknown fields | `TRANSFORM`, draft | 不猜模型或背景排程等價 |
| Supported command Hook | `TRANSFORM`, draft, enabled false | v1 JSON + Node adapter + original fields；需實機驗證 |
| Hook prompt / unsupported lifecycle | `CONFLICT` | 具名回報缺少對應行為 |
| Missing / unsafe reference; invalid field | `CONFLICT` | 回報來源、欄位或 token 與目標 |
| Existing destination / case collision | `CONFLICT` | 不覆寫；其他 artifact 引用回到仍存在的來源 |

主要來源：[Cursor Skills](https://cursor.com/docs/skills)、[Cursor Subagents](https://cursor.com/docs/subagents)、[Cursor Hooks](https://cursor.com/docs/hooks)、[Kiro Skills](https://kiro.dev/docs/skills/)、[Kiro Agents](https://kiro.dev/docs/custom-agents/creating/)、[Kiro Hooks](https://kiro.dev/docs/hooks/)。

Rules 的既有行為及未處理項目請見 [README](../README.md)。root／nested `AGENTS.md` 不列入此 CLI 遷移產物；本文不把它們宣稱為已驗證的跨產品 runtime 等價。
