# Agent Instructions

## 專案概覽

這個 repo 是 AI Agent Skills marketplace，用來整理、維護並發布可重複使用的 agent skills。核心內容放在 `skills\`，每個 skill 以自己的 `SKILL.md` YAML frontmatter 定義 `name` 與 `description`，並在內文描述觸發條件、工作流程、規則與 references。`SKILL.md` 是英文主入口；若需要繁體中文版本，讀取同目錄的 `*_zhTW.md`。

`.claude-plugin\marketplace.json` 定義 Plugin Bundle，負責把多個 skills 組成可安裝的情境化套件，且是 bundle 與 skill 分組的 source of truth。`.agents\plugins\marketplace.json` 與 `codex-plugins\` 是給 Codex 使用的同步產物；其中 `codex-plugins\*\skills\` 是 English-only packaged copy，不包含任何 `*_zhTW.md`。`README.md` 是給人快速理解專案用途與探索方式的文件，不是 skills 清單的來源。

## Skills 維護

- 新增、刪除或修改 `skills\` 底下任何 skill 內容時，必須同步檢查並更新 `README.md`。
- 新增、刪除或修改 `skills\` 底下任何 skill 內容時，也必須同步檢查 `.claude-plugin\marketplace.json` 是否仍正確反映 bundle 與 skill 分組；若 skill 的歸屬、命名或包裝清單有變動，先更新 `.claude-plugin\marketplace.json`。
- `.agents\plugins\marketplace.json` 必須與 `.claude-plugin\marketplace.json` 保持同步；不要手動雙寫，應執行 `scripts\sync-codex-plugins.ps1` 或 `scripts/sync-codex-plugins.sh` 由腳本重寫 `.agents\plugins\marketplace.json`，並重新同步 `codex-plugins\*\skills\`。
- 不要手動修改 `codex-plugins\*\skills\` 內的 skill 副本；正確流程是修改 `skills\` source 後重新執行同步腳本。同步後的 Codex 封裝只保留英文主檔，整棵目錄中的 `*_zhTW.md` 都不應存在。
- `README.md` 只需要維持專案層級的簡短描述與探索指引，不要手動列舉 `skills\` 目前有哪些 skills。
- 若需要知道目前有哪些 skills，讀取 `skills\*\SKILL.md` 的 YAML frontmatter，使用 `name` 與 `description` 判斷 skill 名稱、用途與觸發時機。
- `skills\` 的實際清單與說明以各 `SKILL.md` frontmatter 為準，避免 README 與 skill 內容重複維護後不同步。
- 新建 `skills\` 底下的 skill 時，`SKILL.md` 與所有 `references\` Markdown 都必須先以英文作為主檔，再額外提供同 basename 的 `*_zhTW.md` 繁體中文版本。
- 若 skill 內容同時提供英文與繁體中文，保留 `SKILL.md` / 原檔名作為英文主檔，繁體中文版本使用同 basename 的 `*_zhTW.md`；`references\` 內的 Markdown 也遵循同樣規則。
- 任何後續修改都必須同步更新英文主檔與對應的 `*_zhTW.md`，禁止只改單一語系後讓兩邊內容漂移。
