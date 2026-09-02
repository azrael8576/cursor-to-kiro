# Cursor → Kiro Hooks：可轉換範圍與 adapter 設計

查證日期：2026-09-02。範圍：Cursor 官方 Hooks，以及 Kiro IDE 1.x / CLI 3.x 現行格式；舊版只用來辨識文件差異。本文件保留研究與設計依據；使用者已審閱，現已實作 disabled v1 hook 與 Node adapter。尚未完成 Kiro 實機驗證。

結論：不應把所有 hooks 一律判為 `CONFLICT`。格式化、稽核、開始時載入 context，以及僅需 allow/deny 的 guard，有可實作的轉換路徑；必須產生欄位轉換與執行協定 adapter。只有實際依賴無法取得的資料或無法表達的控制行為，才逐項列出衝突。這是依使用者接受近似等價而提出的產品政策，並非兩家宣告全面相容。

## 官方事實與文件矛盾

| 查證事項 | 現行事實／限制 | 官方來源 |
| --- | --- | --- |
| 目的格式 | IDE 1.0 / CLI 3.0 使用 `.kiro/hooks/*.json`、`version: "v1"`、`hooks` 陣列、PascalCase `trigger` 與 `action`。 | [Kiro Hooks](https://kiro.dev/docs/hooks/) |
| 舊格式 | `.kiro.hook` 的 `when`/`then` 是 IDE 舊格式；CLI 2.x agent profile 的 `hooks.agentSpawn` 等 lowerCamelCase 亦是舊格式，3.0 migration 頁明示勿再使用。 | [IDE 1.0 Hooks](https://kiro.dev/docs/ide/whats-new-v1/hooks/)、[CLI Hooks migration](https://kiro.dev/docs/cli/v3/hooks-migration/) |
| profile 文件矛盾 | configuration reference 前段寫 IDE 忽略 `hooks`，後段又寫 IDE/CLI 都接受；無法據此保證 profile hooks 在所有現行版本載入。 | [Configuration reference](https://kiro.dev/docs/custom-agents/configuration-reference/) |
| blocking 文件矛盾 | actions 頁寫 PreToolUse/PromptSubmit 的所有非零 exit 都阻擋；較新的 IDE migration 頁寫只有 exit 2 阻擋，其他非零是錯誤。adapter 應使用共同可確認的 0/2，而非透傳任意 exit。 | [Hook actions，2026-08-04](https://kiro.dev/docs/hooks/actions/)、[IDE 1.0 Hooks，2026-08-21](https://kiro.dev/docs/ide/whats-new-v1/hooks/) |
| 跨 surface 矛盾 | 主頁列 Web 支援 hooks，types 表卻將 Web 全列不支援；types 的 Agent Spawn 亦仍標 CLI only。不可把格式共通當成所有事件都跨 surface 可用。 | [Kiro Hooks](https://kiro.dev/docs/hooks/)、[Hook types](https://kiro.dev/docs/hooks/types/) |

因此現階段選定 standalone v1 為目的格式；報告必須記錄 IDE/CLI 與版本。舊 profile 支援狀態、Web 與細部 blocking 要列為待實機核對，不能由程式猜測。

## 事件與欄位：建議轉換契約

下表是本專案的**建議 mapping**。相近觸發時機不代表 payload 或結果協定相同。Kiro 的事件、matcher 對象可查 [CLI migration](https://kiro.dev/docs/cli/v3/hooks-migration/) 與 [Hook types](https://kiro.dev/docs/hooks/types/)；Cursor 原始行為可查 [Cursor Hooks](https://cursor.com/docs/hooks)。

| Cursor | Kiro standalone v1 | 建議條件／具體差異 |
| --- | --- | --- |
| `sessionStart` | `SessionStart` | 初始 context 或記錄可適配；若腳本必須修改後續 session 環境，另列不支援的 `env` 能力。 |
| `preToolUse` / `postToolUse` | `PreToolUse` / `PostToolUse` | 轉換 tool 名與實際讀取的 payload；不要只改事件大小寫。 |
| `beforeSubmitPrompt` | `UserPromptSubmit` | 轉 `continue` 決策；原 matcher 若比對事件常數，應在 adapter 比對原常數，不能搬成 Kiro prompt 文字篩選。 |
| `stop` | `Stop` | 清理、測試、通知可適配；要求 `followup_message` 自動續跑的腳本另列限制。 |
| `beforeShellExecution` / `afterShellExecution` | `PreToolUse` / `PostToolUse` + shell matcher | 原 shell command matcher 留在 adapter 比對 command，不能直接填到目標 tool matcher。 |
| `beforeMCPExecution` / `afterMCPExecution` | `PreToolUse` / `PostToolUse` + MCP matcher | 使用已解析的 server/tool 映射；不得只靠改成小寫辨識 MCP。缺少 transport/server 資料時針對依賴該資料的腳本報錯。 |
| `afterFileEdit` | `PostFileSave` | 可作單檔 formatter 的近似替代，但儲存與 agent edit 時機不同，可能包含使用者儲存；需揭露觸發範圍差異。原 matcher 比對 tool 類型，目標卻比對路徑；事件無 tool／來源資訊時無法保留該過濾。依賴完整 edits 清單者需額外能力。 |
| `beforeReadFile` | `PreToolUse` + read matcher | 可改寫只看路徑的 guard；讀取前完整 content/attachments 若無來源，不假造。 |
| `sessionEnd`、`preCompact`、Tab、thinking、subagent lifecycle 等 | 個別分析 | 不把 `sessionEnd` 假成每回合 `Stop`。只有使用者需求可以明確改成另一時機，才提出具體替代；缺少原始觀測資料時保留衝突。 |

轉換器的欄位責任（設計建議）：

- 將來源 `version: 1` 與事件鍵／陣列索引轉成目的檔、穩定 `name`、`trigger`、`action.type: command`、adapter command；保留來源定位供報告回查。
- 明確的 `timeout` 以秒轉移到 v1；不要乘 1000 或輸出舊格式 `timeout_ms`。Kiro v1 預設 60 秒、0 表示停用；Cursor 未設值的 platform default 不可宣稱與 60 秒相同，要在報告列出採用的目的預設。[Kiro timeout](https://kiro.dev/docs/hooks/)、[Cursor configuration](https://cursor.com/docs/hooks)
- 工具分類可起步對照 `Shell → shell`、`Read → read`、`Write → write`；`Grep/Delete/Task` 不可憑字面塞進該三類。目標 matcher 的類別、regex 與 internal tool name 混用仍需用真實事件樣本核對。[Kiro tool matching](https://kiro.dev/docs/hooks/types/)
- 只把能完整解析的原 matcher 轉成目的 regex；複雜 matcher 留在 adapter，或具名回報無法支援的形式。不能移除 matcher 讓 hook 擴大執行範圍。

## 執行 adapter，而非僅改 JSON

Kiro command 成功的 stdout 會進入 context，失敗的 stderr 會回送 agent；Kiro agent action 則是在對話加入 prompt。[Hook actions](https://kiro.dev/docs/hooks/actions/) 因此原 Cursor JSON stdout 不應直接外洩成 context。Cursor prompt hook 的 LLM 判定亦不能等同 Kiro prompt 注入。[Cursor Hooks](https://cursor.com/docs/hooks)

以下為實作提案，不是已存在功能：

1. adapter 接收 Kiro JSON，驗證本 hook 真正需要的欄位，組合 Cursor 相容輸入；保留原事件名稱與工具名稱契約。資料無來源就具名回報，不能捏造 `model`、`sandbox`、transcript、edits 或 session 狀態。
2. 執行來源 script，分開收集 stdout、stderr、exit、timeout。允許結果轉成 exit 0；明確 deny／`continue: false` 轉成 exit 2，訊息送 stderr。只將可支援的 `additional_context` 轉為 stdout，其他控制 JSON 不輸出到對話。
3. script crash、無效 JSON、內層 timeout 由 adapter 根據來源 `failClosed` 正規化成 0 或 2。外層 timeout 必須留出清理與回傳時間；wrapper 自身失敗仍是可報告限制，不能宣稱故障行為完全一致。
4. `ask` 需要互動批准、`updated_input`、`updated_mcp_tool_output`、session `env`、stop 自動續跑及 `loop_limit` 沒有在已查 Kiro command 契約找到對應。腳本實際用到時給具體限制；不要因為某事件「可能」產生這些欄位就拒絕所有腳本。
5. JSON 看不出任意 shell script 的全部需求。應對已知／可檢查的 script 產生 adapter 或改写 script；無法辨識者提供待核對契約，禁止用「不解析 stdin/stdout」的假设自動標為成功。移轉過程本身不執行使用者 hook。

例：只在 shell 執行前讀取 command、判斷 allow/deny 的 hook，可以轉成 `PreToolUse` 的 shell hook，adapter 將 Kiro tool input 中已驗證的 command 組成原格式，再把決策轉成 exit 0/2。若同一腳本要求 Cursor 的 `ask` UI，就只針對該需求列限制。

## 路徑、引用與搬移範圍

Cursor project hook 從專案根執行，user hook 則從 `~/.cursor/` 執行；Kiro 主頁描述 command 在專案根執行。[Cursor working directory](https://cursor.com/docs/hooks)、[Kiro command execution](https://kiro.dev/docs/hooks/)

建議保留原腳本並讓 adapter 以明確 cwd 呼叫。專案來源 `.cursor/hooks/check.sh` 可先保留；若要複製到 `.kiro/`，必須一併處理它的本機依賴、權限和相對讀取。引用轉換應採來源→目的 path map：只重寫已解析的 script 路徑或參數，不能全域替換 shell 字串中的 `.cursor`，也不能將 `@tool` matcher 當作 Markdown 引用轉寫。絕對路徑、環境變數、引號、含空白的路徑和 shell pipeline 都需保留語義。

Kiro 新 file hook 有 `{{filePath}}` 模板，但把任意舊命令直接改成此模板，不能同時保證原 stdin 契約和 shell quoting。[CLI migration](https://kiro.dev/docs/cli/v3/hooks-migration/) 建議優先透過 adapter 傳入資料，檔案路徑不作 shell 字串插值。

## 審閱時與舊程式的差距

`src/compatibility/hooks.ts` 現在無條件回報 `CONFLICT`；`src/converters/hooks-converter.ts` 無條件丟出不相容錯誤。這代表尚未實作 adapter，不是官方證據證明全部無法轉換。`src/scanner/hooks-scanner.ts` 現在只發現 workspace `.cursor/hooks.json`，且 `sourceFiles` 只含設定；若聲稱包含脚本搬移，還需新增依賴發現與輸出 manifest。

建議後續把「已有可驗證 adapter」與「相近但待補資料／能力」分開報告，不以全部放行或全部拒絕代替逐 hook 診斷。這是本專案設計建議。

## 已審閱測試清單

使用者已確認此清單。Node adapter 合約測試已執行；第 7 項 Kiro 實機測試尚未執行，因此輸出 hook 預設停用。

1. v1 schema、穩定命名、來源索引、重跑不重複、目的檔衝突和 malformed source。
2. 主要事件與 shell/read/MCP filter；反例確認 matcher 不會被搬到錯誤欄位；不支援事件逐項診斷。
3. 純副作用 script、allow、deny、prompt continue、context：結果正確且原始 JSON 不污染 context。
4. crash、exit 1/2、timeout、非法 JSON，分別搭配 `failClosed`；wrapper 外層 timeout 明確測試。
5. 每個不支援輸出及缺失輸入：回傳具名問題，不能靜默丟棄／假造。
6. cwd、空白與引號路徑、腳本相對依賴、缺檔、環境變數、source bytes 不变，移轉時不執行 hook。
7. 在指定 Kiro IDE 1.x / CLI 3.x 各跑真實 fixture，確認 stdin、tool 名稱、0/2 結果和觸發次數；紀錄版本以解決上述官方矛盾。未跑以前標記「文件設計驗證」，不宣稱 runtime 等價。
