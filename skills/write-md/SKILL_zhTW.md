---
name: write-md
description: >-
  撰寫或編輯 Markdown 文件時使用。當使用者要求撰寫、建立、更新或整理任何 Markdown
  檔案時——包含功能文件、模組文件、架構總覽、README、技術規格、SKILL.md、
  agent instructions 或 workflow rule——應優先使用此 skill。產出前必須先判斷文件是
  給人類讀者還是給 AI agent 使用；若無法判斷，必須先詢問使用者。判斷完成後，預設
  必須先讀取對應的 reference 文件；若同一任務明確需要同時維護兩種文件，則可以依需
  載入兩套路徑，但必須把各自規則分開套用。
---

# Write MD

撰寫與編輯 Markdown 文件。此主檔只保留通用規則與讀者分流；細節必須在判斷目標讀者後才讀取。

## 分流原則

1. 先判斷 Markdown 是給**人類讀者**看的，還是給 **AI agent** 使用的。AI agent 文件是指任何會被載入 agent context window 以控制其行為的檔案，例如 `SKILL.md`、`AGENTS.md`、`CLAUDE.md`、`GEMINI.md`、`CODEX.md`、system prompt 與 workflow rule。人類讀者文件是供人閱讀的內容，例如 README、使用指南、設計提案、API 說明。
2. 若能判斷，**必須先從對應 reference 開始**。若同一任務明確需要同時維護人類讀者文件與 AI agent 文件，之後可以依需求再載入另一套 reference，但必須把兩套規則分開，且各自只套用到對應的產出。
3. 若無法從使用者需求、檔案位置、檔名或內容用途判斷目標讀者，必須先詢問使用者，且嚴禁自行猜測。
4. 讀取 reference 後，必須依該 reference 的規則生成或修改 Markdown。

## 強制語氣規則

- 對英文文件的最終產出內容，表達強制要求時必須使用 `MUST`，表達強烈禁止時必須使用 `MUST NOT`。
- 對繁體中文文件的最終產出內容，表達強制要求時必須使用 `必須`，表達強烈禁止時必須使用 `嚴禁`。

## Reference 選擇

人類讀者文件（README、使用者指南、功能文件、架構總覽、API 說明、設計提案、團隊技術文件），讀取 [references/human-reader-docs_zhTW.md](references/human-reader-docs_zhTW.md)。

AI agent 文件（`SKILL.md`、agent instructions、system prompt、workflow rule、coding rule、eval spec、tool usage guideline），讀取 [references/ai-agent-docs_zhTW.md](references/ai-agent-docs_zhTW.md)。

人類讀者文件若需要 Mermaid 語法細節或圖表類型範例，再額外讀取 [references/diagram-examples_zhTW.md](references/diagram-examples_zhTW.md)。AI agent 文件嚴禁讀取 Mermaid 範例，避免載入不必要 context。

## 共通守則

以下規則不分目標讀者，一律適用。

- 任何指向檔案、目錄、標題錨點或外部資源的參照必須使用 Markdown link，且嚴禁使用裸路徑或裸 URL。link text 必須清楚說明目標名稱，讓讀者不點開也能知道連到哪裡。

## 通用語言規範

- 文件正文、標題、表格說明與一般敘述，預設使用繁體中文。
- 專有術語維持原文，例如產品名、服務名、library 名稱、API 名稱、command 名稱、CLI flags、environment variables、檔名、路徑與程式語言關鍵字。

## 內容取捨守則

- 必須只寫下能幫目標讀者完成任務的穩定資訊，例如用法、前置條件、輸入輸出、副作用、限制與失敗行為。
- 嚴禁把單次修正脈絡、作者提醒，或只為避免這次編輯再犯同樣錯誤而加的補丁式敘述寫進正式文件。
- 新增句子前必須先判斷：這句是在描述系統或流程本身，還是在解釋作者這次為什麼這樣改；如果只是後者，就嚴禁寫進文件。
- 如果刪掉某句話後，目標讀者並不會失去任何可行動的理解，那它通常就不屬於最終文件。

## YAML frontmatter 注意事項

- 若 Markdown 文件帶有 YAML frontmatter，而欄位值內會出現 `: `（冒號後接空白），嚴禁直接使用未加引號的 plain scalar。
- Frontmatter key 若由規格固定（如 `name`、`description`、`title`），必須照規格本身書寫。
- `description`、`summary`、`title` 等長句欄位，預設優先使用 `>-` block scalar；若內容很短，也可以直接用單引號或雙引號包住整段字串。
- 這條規則尤其適用於 `SKILL.md` 的 `description` 欄位，因為常會同時包含觸發詞、例句與帶冒號的片段。

安全寫法：

```yaml
name: skills-governance
description: >-
  用於建立或修改 `.agents/skills/` 下的專案客製 skills，或修改
  `aery-marketplace/aery-dev/` 並需要套用本 repo 的目錄邊界、
  相關文件同步與 Conventional Commit 規則時使用。
```
