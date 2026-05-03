# Agent Instructions

## 專案概覽

這個 repo 是 AI Agent Skills marketplace，用來整理、維護並發布可重複使用的 agent skills。核心內容放在 `skills\`，每個 skill 以自己的 `SKILL.md` YAML frontmatter 定義 `name` 與 `description`，並在內文描述觸發條件、工作流程、規則與 references。

`.claude-plugin\marketplace.json` 定義 Plugin Bundle，負責把多個 skills 組成可安裝的情境化套件。`README.md` 是給人快速理解專案用途與探索方式的文件，不是 skills 清單的來源。

## Skills 維護

- 新增、刪除或修改 `skills\` 底下任何 skill 內容時，必須同步檢查並更新 `README.md`。
- `README.md` 只需要維持專案層級的簡短描述與探索指引，不要手動列舉 `skills\` 目前有哪些 skills。
- 若需要知道目前有哪些 skills，讀取 `skills\*\SKILL.md` 的 YAML frontmatter，使用 `name` 與 `description` 判斷 skill 名稱、用途與觸發時機。
- `skills\` 的實際清單與說明以各 `SKILL.md` frontmatter 為準，避免 README 與 skill 內容重複維護後不同步。
