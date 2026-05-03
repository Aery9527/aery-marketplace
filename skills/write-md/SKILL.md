---
name: write-md
description: >-
  撰寫或編輯 Markdown 文件時使用。當使用者要求撰寫、建立、更新或整理任何 Markdown
  檔案時——包含功能文件、模組文件、架構總覽、README、技術規格、SKILL.md、
  agent instructions 或 workflow rule——應優先使用此 skill。產出前必須先判斷文件是
  給人類讀者還是給 AI agent 使用；若無法判斷，先詢問使用者。判斷完成後只讀取對應的
  reference 文件，不要同時載入兩套路徑。
---

# Write MD

撰寫與編輯 Markdown 文件。此主檔只保留通用規則與讀者分流；細節必須在判斷目標讀者後才讀取。

## 分流原則

1. 先判斷 Markdown 是給**人類讀者**看的，還是給 **AI agent** 使用的。
2. 若能判斷，**只讀取對應 reference**，不要同時載入兩種文件策略。
3. 若無法從使用者需求、檔案位置、檔名或內容用途判斷目標讀者，先詢問使用者，不要自行猜測。
4. 讀取 reference 後，依該 reference 的規則生成或修改 Markdown。

## Reference 選擇

| 目標讀者 | 典型檔案 / 情境 | 必讀 reference |
|----------|-----------------|----------------|
| 人類讀者 | README、使用者指南、功能文件、架構總覽、API 說明、設計提案、團隊技術文件 | `references/human-reader-docs.md` |
| AI agent | `SKILL.md`、agent instructions、system prompt、workflow rule、coding rule、eval spec、tool usage guideline | `references/ai-agent-docs.md` |

人類讀者文件若需要 Mermaid 語法細節或圖表類型範例，再額外讀取 `references/diagram-examples.md`。AI agent 文件不要讀取 Mermaid 範例，避免載入不必要 context。

## 通用語言規範

- 文件正文、標題、表格說明與一般敘述，預設使用繁體中文。
- 專有術語維持原文，例如產品名、服務名、library 名稱、API 名稱、command 名稱、CLI flags、environment variables、檔名、路徑與程式語言關鍵字。
- 說明檔案、目錄或參考文件時，人類讀者文件優先使用 Markdown link；AI agent 文件優先使用最精準、最不佔 context 的表示法。

## YAML frontmatter 注意事項

- 若 Markdown 文件帶有 YAML frontmatter，而欄位值內會出現 `: `（冒號後接空白），禁止直接使用未加引號的 plain scalar。
- Frontmatter key 若由規格固定（如 `name`、`description`、`title`），照規格本身書寫。
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
