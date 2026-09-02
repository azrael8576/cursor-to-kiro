# Cursor → Kiro：近似等價遷移查證與實作審閱

查證日期：2026-09-02。目標為目前官方文件的 Kiro IDE 1.x／CLI 3.x；不推定舊版、Web、Mobile 具備相同能力。

狀態：使用者已審閱並授權實作。下方保留原審閱規格，官方文件並未保證全面等價；目前實作與限制以 [相容性表](compatibility-matrix.md) 為準。

實作狀態：subagent／skill 可執行轉換，無法保留的條件輸出未啟用草稿；command hook 產生 v1 JSON 與 adapter，但全部 enabled false。未加入模型服務查詢或模型映射選項，明確 model ID 留在草稿供使用者設定。inline prompt 與 resources 引用轉換已實作；外部 prompt `file://` 是規格參考，本 CLI 目前採 inline prompt。含糊的 `/agent-name` 不自動改寫。來源 shell command／脚本位置保留，不聲稱完成任意腳本依賴搬移。

驗證：63 個測試（含生成 adapter 的實際 Node 執行）、format/lint/typecheck；尚無 Kiro 實機驗證。測試清單下方的 H3／E2 以 disabled draft 揭露無法保留條件，不代表所有控制協定都已適配。

## 審閱時結論與舊實作狀況

可以協助轉換這三種功能，不能繼續以「兩產品預設值不完全相同」一律拒絕。每筆遷移應列出來源欄位、目的欄位、引用改寫及行為差異；真正缺少對應能力時，才回報具體阻礙。

| 類型 | 目前程式 | 新策略提案 |
| --- | --- | --- |
| Subagent | `src/compatibility/subagents.ts` 全部 CONFLICT；converter 直接 throw | 產生 Kiro custom agent，角色及提示詞可轉；模型、權限、背景執行分別處理 |
| Skill | 共通欄位才複製，分類子目錄與 scope 一律拒絕 | 標準 bundle 搬移；分類目錄可扁平化；manual/scoped 內容可轉 steering，明列載入方式差異 |
| Hook | 所有事件 CONFLICT；converter 直接 throw | 逐事件／欄位辨識，生成目標 schema 與有測試的 adapter，無法還原的行為具名回報 |
| 引用 | rules 有 `mdc:`／`@path` 替換；skills 只複製 bytes | 依目的檔用途解析，不把所有引用套成同一種 URI |

官方依據：[Cursor Subagents](https://cursor.com/docs/subagents)、[Kiro custom agents](https://kiro.dev/docs/custom-agents/creating/)、[Cursor Skills](https://cursor.com/docs/skills)、[Kiro Skills](https://kiro.dev/docs/skills/)。Hooks 詳細查證見 [hooks-adapter-research.md](hooks-adapter-research.md)。

## Subagent：欄位與使用方式

Kiro 官方支援 `.kiro/agents/` 下的 Markdown／JSON agent；自訂 agent 可在 IDE／CLI 被當成 subagent 呼叫。這足以支持角色遷移，不能推論執行時完全等價。[建立 agent](https://kiro.dev/docs/custom-agents/creating/)、[呼叫 subagent](https://kiro.dev/docs/chat/subagents/)

| Cursor 來源 | 目的地提案 | 差異與必要處理 |
| --- | --- | --- |
| `.cursor/agents/reviewer.md` | `.kiro/agents/reviewer.json` | JSON 可明確產生欄位；檔名與 name 衝突要先偵測 |
| `name`、`description` | 同名欄位 | 缺 name 可依來源檔名推導；缺 description 不臆造角色說明 |
| Markdown body | JSON `prompt` | 保留角色正文；有檔案依賴時依下節處理 |
| `model: inherit` 或省略 | 省略目的 model，報告改採 Kiro default | 是已揭露的近似轉換，不能宣稱繼承同一個 parent model |
| 明確 model ID | 對照使用者目標環境可用模型／明確提供的映射 | 不猜 `composer-*` 的等價模型；缺映射回報 `MODEL_MAPPING_REQUIRED`，保留其他可轉內容為待完成草稿 |
| model 的 `[effort=…,context=…]` 參數 | 逐參數查證或回報 | 不把 Cursor 參數字串原樣交給 Kiro |
| `readonly: false`／省略 | 不新增 readonly 限制 | 不額外自動批准工具 |
| `readonly: true` | 提供 `tools: ["read"]` 的受限 agent | 保留查閱用途但比 Cursor 更嚴格，失去唯讀 shell；不得只把 readonly 寫成自然語言後開放 shell/MCP |
| `is_background: false`／省略 | 使用目標一般 subagent 流程 | 報告目標排程差異 |
| `is_background: true` | 可產生同步角色草稿並明列不保留背景排程 | 不自動把它標成等價且啟用；若使用者接受同步替代，再採用角色檔 |

Cursor 的上述五個 frontmatter 欄位與預設值有官方依據；Kiro 未文件化 `readonly`／`is_background` 同名契約。[Cursor configuration fields](https://cursor.com/docs/subagents)

工具可用性與免確認權限是不同概念。產生的 `tools` 必須來自已知目標能力，不應一律塞入 `*`；`allowedTools` 不能拿來模擬 readonly。Kiro 的權限可透過 capability 規則限制，拒絕規則優先。[Kiro Permissions](https://kiro.dev/docs/permissions/)

來源 `/reviewer 請檢查修改` 的使用說明可轉成「Use the reviewer agent to review the changes」。只有確定為 agent 呼叫的 token 才改寫，不能把所有 `/name`（含 shell 絕對路徑或 skill 指令）替換。[Cursor invoking](https://cursor.com/docs/subagents)、[Kiro invoking](https://kiro.dev/docs/chat/subagents/)

## Skills：共通搬移與替代載入

| Cursor 來源 | 目的地提案 | 差異與必要處理 |
| --- | --- | --- |
| 標準 root skill | `.kiro/skills/<name>/` | 保留共通 frontmatter、scripts、references、assets；不需改寫時維持 bytes |
| `.cursor/skills/category/<name>/` | `.kiro/skills/<name>/` | 分類層可移除；相同 name 碰撞仍需回報；這不等同 subtree scope |
| `icon`、`color` | 保存在命名空間 metadata／轉換報告 | Kiro 不保證重現 badge 樣式，不因此拒絕整個工作流程 |
| `disable-model-invocation: false` | 移除該來源專屬欄位並記錄 | 保留一般按相關性載入的用途 |
| `disable-model-invocation: true` | `.kiro/steering/<name>.md`，`inclusion: manual` | 將正文與資源保存在 `.agents/docs/skills/<name>/`；不用可被自動發現的 skill 副本，以免繞過手動限制 |
| `paths`／fallback `globs` | steering `inclusion: fileMatch`、`fileMatchPattern` | Cursor 是限制 skill 被列出；steering 是符合檔案時載入指令。屬較積極載入的近似替代，必須提示 |
| `apps/web/.cursor/skills/<name>/` | 產生包含 subtree 條件的 steering | 不直接變成全 workspace skill。若另有 paths，必須保留交集，不可合併成 OR |
| `allowed-tools` | 保留原值，逐工具評估 | 實驗性預批准欄位；不能直接等同 Kiro agent 的權限，也不能當成強制 allowlist |

以上是轉換提案。官方確認共通 skill 結構與相對引用；Cursor 額外提供 scope／manual 欄位；Kiro steering 提供 fileMatch／manual。[Agent Skills specification](https://agentskills.io/specification)、[Cursor Skills](https://cursor.com/docs/skills)、[Kiro Skills](https://kiro.dev/docs/skills/)、[Kiro Steering](https://kiro.dev/docs/steering/)

補充規則：

- 同時有 manual 與 paths：manual 是必要條件；目的端不能用 fileMatch 自動載入。無法用既有 schema 保留全部條件時，提供具差異說明的 manual 草稿。
- `paths` 與 `globs` 同時出現時依 Cursor fallback 語義处理，不合併成更寬範圍。
- 改成 steering 的 bundle 主檔使用 `instructions.md`，避免 scanner 將 `.agents/docs/skills/` 下的 `SKILL.md` 誤識別為另一份 skill。
- 改用 steering 會失去部分 skill UI／progressive disclosure 體驗；保留 license、compatibility、metadata 到 accompanying 文件，不能靜默丟失。
- 必須驗證 name、description 非空及長度（64／1024）、目錄與 name 一致、metadata 型別；不能只驗證為 string。[Agent Skills specification](https://agentskills.io/specification)

## 引用轉換：先解析來源，再算目的相對位置

| 使用位置 | 目的語法／處理 |
| --- | --- |
| Steering 中的檔案載入 | `#[[file:<workspace-relative-path>]]`；`mdc:` 與可識別的 Cursor 檔案 mention 轉成該語法 |
| JSON agent 的外部 system prompt | `prompt: "file://./prompts/reviewer.md"`；此相對路徑以 agent 設定檔目錄為基準 |
| JSON agent 的啟動檔案資源 | `resources: ["file://README.md"]`；使用對应 resource 規則，勿套用 prompt 的基準假設 |
| JSON agent 的 skill 資源 | `resources: ["skill://.kiro/skills/review/SKILL.md"]`，保留按需載入 |
| 標準 skill 的 `references/guide.md` | 整包搬移時保留相對路徑，不改成 steering 插值 |
| 搬移後跨 bundle 的 Markdown 連結 | 由來源位置解出實際目標，再以目的位置重算連結；保留 anchor、URL 與可辨識的 label |

來源：[Kiro agent configuration reference](https://kiro.dev/docs/custom-agents/configuration-reference/)、[Kiro Steering](https://kiro.dev/docs/steering/)、[Agent Skills file references](https://agentskills.io/specification#file-references)。

不要假設 agent prompt／skill body 也會解析 steering 的 `#[[file:...]]`。需要在 agent 中載入來源 `@file` 時，可轉成文件化的 `resources`，並在 prompt 保留閱讀意圖；按需引用與啟動載入的差異必須列入報告。`mdc:` 作為來源表示法沿用本專案現有輸入支援，不能聲稱本次已由官方確認其完整語法。

建立來源 → 目的 artifact 映射之後才改引用；只對被選取且成功產生的檔案重定位。Email、MCP `@server/tool`、網址、code fence 中的文字與不明 `/name` 不盲目替換。遺失目標、歧義、越界、symlink 回報來源檔、欄位／token、目標路徑。

## Hooks 與官方文件矛盾

現行目的格式為 `.kiro/hooks/*.json`、`version: "v1"`、`hooks` 陣列與 PascalCase trigger。`.kiro.hook` 與 CLI 2.x 的內嵌 profile hooks 是舊格式。[Kiro Hooks](https://kiro.dev/docs/hooks/)、[CLI 3.x migration](https://kiro.dev/docs/cli/v3/hooks-migration/)

逐事件、matcher、stdin/stdout、exit code、timeout、command 工作目錄的對應及測試見 [Hooks adapter 查證](hooks-adapter-research.md)。有些行為需要 adapter；不能只換事件名稱便宣稱 script 能用。

同一份 [Kiro configuration reference](https://kiro.dev/docs/custom-agents/configuration-reference/) 的 Version comparison 寫 `hooks` 只限 CLI、IDE 忽略；Hooks field 段落卻寫 CLI 與 IDE 都接受。此為文件內部矛盾。本工具應區分目標 surface，先使用該 surface 清楚文件化的格式；跨 surface 自動啟用要有實際載入驗證，不能任選一段當作已證明。

## 已審閱測試清單

每個案例先寫測試，確認預期失敗，再實作。新轉換應回傳具名 Result；輸入與目的地依賴顯式傳入。沿既有接點做最小變更，不為本次遷移重整整個專案。

| 編號 | 驗收情境與預期 |
| --- | --- |
| A1 | 基本 subagent 產生可解析 Kiro agent，保留 name／description／prompt；省略 name 使用檔名 |
| A2 | inherit／無 model 可近似轉換且有 default-model 差異；有效映射保留；未知 model／參數提供具體待處理項 |
| A3 | readonly true 產生 read-only 工具集合、無 shell／MCP；false 不新增限制；非 boolean 具名失敗 |
| A4 | background true 產生未啟用草稿及排程差異；false 正常轉；未知 frontmatter 逐欄位報告 |
| S1 | 共通 skill 保留資源 bytes 與可執行方式；64／65 name、1024／1025 description、空白與錯型別邊界 |
| S2 | 分類子目錄扁平化成功；同名、大小寫、既有目的檔碰撞不覆寫 |
| S3 | icon／color 保留可追溯資料；manual false 正常 skill，manual true 僅手動 steering，沒有自動 skill 副本 |
| S4 | paths 字串／陣列、globs fallback、兩者同時存在；subtree 與 paths 保留交集；無法表達時列明限制 |
| S5 | manual + paths 不自動啟動；未知欄位與 allowed-tools 不默默丟失或擴大授權 |
| R1 | 同包相對引用、跨包引用、搬移 artifact 引用、未選取目標、anchor、含空白路徑解析正確 |
| R2 | steering／prompt／resources／skill 使用各自語法與路徑基準；email、MCP、URL、code fence 不誤改 |
| R3 | missing／ambiguous／symlink／越界引用得到含 source、token、target 的具名問題 |
| H1 | 已支援事件產生正確目標 schema；不同 surface 不混用 key；未知事件逐筆回報 |
| H2 | adapter 合約驗證 stdin 欄位、matcher、stdout 決策、stderr、退出碼、timeout、failClosed 及 cwd；詳見 hooks 文件 |
| H3 | 欄位不能保留、缺少 stdin 資料、ask／updated input 等無實作對應時，不生成錯誤的已啟用 hook |
| E1 | dry-run 不寫入；原始檔不變；第二次執行無新差異；中途失敗回滾所有新產物 |
| E2 | 報告區分已轉換、近似差異、未啟用草稿、具體衝突；包含欄位／引用前後值 |

現有 `tests/compatibility.test.ts` 中 golden subagent 必為 CONFLICT、所有 nested/scoped skill 必拒絕，以及 `tests/golden.test.ts` 固定輸出數量，是舊政策的測試。需要先依本次已明確提出的新政策審閱後更新；不能當成實作壞掉時修改測試的理由。

實作完成後執行 `npm run check`、`npm run build`，並對實際 Kiro 版本驗證新 schema 能載入及 hooks 行為。單元測試通過不等於官方 runtime 已驗證。
