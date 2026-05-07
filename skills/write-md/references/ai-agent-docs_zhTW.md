# AI Agent Markdown Rules

本文件只在 Markdown 的目標讀者是 AI agent 時讀取。AI agent 文件的重點是 context-efficient、精準、可執行，避免載入人類閱讀導向的導覽與 Mermaid 規則。

## 適用情境

- `SKILL.md`、agent instructions、system prompt、workflow rule、coding rule、eval spec、tool usage guideline。
- 內容目標是讓 AI agent 穩定執行規則，而不是讓人瀏覽學習。
- 文件會被長期載入 context window，重點是壓縮、精準、可執行。

## 必要輸出規格

- 嚴禁包含 `## 快速導覽` 或 `## 目錄`。
- 嚴禁包含 `[返回開頭]` 連結。
- 嚴禁使用 Mermaid。
- 嚴禁使用 Markdown table；改用條列清單或編號步驟。
- 除非使用者明確要求在 AI agent 文件中包含 Mermaid 語法說明，否則嚴禁讀取 [references/diagram-examples_zhTW.md](diagram-examples_zhTW.md)。
- 在繁體中文 AI agent 文件的最終產出內容中，表達強制要求時必須使用 `必須`；表達強烈禁止時必須使用 `嚴禁`。
- 在英文 AI agent 文件的最終產出內容中，表達強制要求時必須使用 `MUST`；表達強烈禁止時必須使用 `MUST NOT`。
- 規則必須直接、可執行；繁體中文 AI agent 文件優先使用 `必須` / `應` / `嚴禁` / 先後順序等明確語氣。
- 避免長篇例子；只保留必要的短例子、反例或判斷句。

## 文字替代格式

AI agent 文件若需要描述架構、流程、狀態或依賴，使用以下文字格式取代 Mermaid 或 table：

- 依賴關係：逐項條列，格式為「元件 — 依賴 — 責任」。
- 時序互動：編號步驟，逐步描述 actor、動作與結果。
- 狀態轉換：`from -> event -> to` transition list。
- 資料流：pipeline 條列，逐步寫明輸入、處理與輸出。
- 決策邏輯：優先序條列，使用「若 X 則 Y；否則 Z」語氣。

## 典型結構

```markdown
# {Skill / Rule / Workflow 名稱}

## 目的

這份文件要讓 agent 做什麼、何時使用、成功條件是什麼。

## 觸發條件

- 使用者提到 ...
- 任務涉及 ...

## 規則

- 必須 ...
- 嚴禁 ...
- 若 ... 則 ...

## 工作流程

1. 先 ...
2. 再 ...
3. 最後 ...

## 決策邏輯

- 若情境 A，執行 X。
- 若情境 B，執行 Y；否則執行 Z。
```

不適用的章節直接省略，依需求增加領域專屬章節。

## 撰寫準則

- 必須把「何時觸發」與「如何執行」分開，避免 agent 在錯誤情境套用規則。
- 規則順序必須符合實際執行順序，且嚴禁把例外放在遠離主流程的位置。
- 對高風險行為，必須使用禁止式語句，例如「嚴禁靜默忽略錯誤」。
- 對條件分支必須使用「若 ... 則 ...；否則 ...」格式。
- 對多選一決策必須使用優先序條列或「若 X 則 Y；否則 Z」語氣，且嚴禁使用 table。
- 若資訊只是給人理解背景、但不影響 agent 行為，必須刪除或壓縮。
