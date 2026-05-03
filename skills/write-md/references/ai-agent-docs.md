# AI Agent Markdown Rules

本文件只在 Markdown 的目標讀者是 AI agent 時讀取。AI agent 文件的重點是 context-efficient、精準、可執行，避免載入人類閱讀導向的導覽與 Mermaid 規則。

## 適用情境

- `SKILL.md`、agent instructions、system prompt、workflow rule、coding rule、eval spec、tool usage guideline。
- 內容目標是讓 AI agent 穩定執行規則，而不是讓人瀏覽學習。
- 文件會被長期載入 context window，重點是壓縮、精準、可執行。

## 必要輸出規格

- 不要求 `## 快速導覽` 或 `## 目錄`。
- 不要求 `[返回開頭]` 連結。
- 不使用 Mermaid。
- 不讀取 `references/diagram-examples.md`，除非使用者明確要求在 AI agent 文件中包含 Mermaid 語法說明。
- 規則要直接、可執行，優先使用 MUST / SHOULD / 禁止 / 先後順序等明確語氣。
- 避免長篇例子；只保留必要的短例子、反例或判斷句。

## 文字替代格式

AI agent 文件若需要描述架構、流程、狀態或依賴，使用以下文字格式取代 Mermaid：

| 資訊類型 | 建議格式 |
|----------|----------|
| 依賴關係 | 「元件 / 依賴 / 責任」表格 |
| 時序互動 | 編號步驟，逐步描述 actor、動作與結果 |
| 狀態轉換 | `from -> event -> to` transition list |
| 資料流 | pipeline 條列，逐步寫明輸入、處理與輸出 |
| 決策邏輯 | 條件表或優先序清單 |

## 典型結構

```markdown
# {Skill / Rule / Workflow 名稱}

## 目的

這份文件要讓 agent 做什麼、何時使用、成功條件是什麼。

## 觸發條件

- 使用者提到 ...
- 任務涉及 ...

## 規則

- MUST ...
- 禁止 ...
- 若 ... 則 ...

## 工作流程

1. 先 ...
2. 再 ...
3. 最後 ...

## 判斷表

| 情境 | 做法 |
|------|------|
| ... | ... |
```

不適用的章節直接省略，依需求增加領域專屬章節。

## 撰寫準則

- 把「何時觸發」與「如何執行」分開，避免 agent 在錯誤情境套用規則。
- 規則順序要符合實際執行順序；不要把例外放在遠離主流程的位置。
- 對高風險行為使用禁止式語句，例如「禁止靜默忽略錯誤」。
- 對條件分支使用「若 ... 則 ...；否則 ...」格式。
- 對多選一決策使用表格，而不是長段落。
- 若資訊只是給人理解背景、但不影響 agent 行為，刪除或壓縮。

