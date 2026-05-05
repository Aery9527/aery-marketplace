# Agent Instructions

## 專案概覽

這個 repo 是 AI Agent Skills marketplace，用來整理、維護並發布可重複使用的
agent skills。核心內容放在 `skills/`。每個 skill 以自己的 `SKILL.md` YAML
frontmatter 定義 `name` 與 `description`，並在內文描述觸發條件、工作流程、
規則與 references。`SKILL.md` 是英文主入口；若存在繁體中文版本，請讀取同目
錄對應的 `*_zhTW.md`。

`.claude-plugin/marketplace.json` 定義 Plugin Bundle，且是 bundle 與 skill
分組的 source of truth。`.agents/plugins/marketplace.json` 與 `codex-plugins/`
是給 Codex 使用的同步產物。其中 `codex-plugins/*/skills/` 內的封裝副本只保
留英文主檔，不得包含任何 `*_zhTW.md`。`README.md` 是給人類讀者看的專案層級
導覽文件，不是 skills 清單的 source of truth。

## Markdown 語系規則

- 本 repo 的雙語 Markdown 以英文檔作為主檔，繁體中文版本使用同 basename 加
  上 `*_zhTW.md`。
- 這條規則適用於 `SKILL.md`、`references/` 底下的 Markdown，以及像
  `AGENTS.md` 這類 repo 層級 instruction 文件。
- 修改任何雙語 Markdown 時，必須在同一次變更中同步更新英文主檔與對應的
  `*_zhTW.md`，禁止讓兩個版本漂移。

## Skills 維護

- 新增、刪除或修改 `skills/` 底下任何 skill 內容時，必須同步檢查並更新
  `README.md`，前提是專案層級用途或探索指引確實需要調整。
- 新增、刪除或修改 `skills/` 底下任何 skill 內容時，也必須同步檢查
  `.claude-plugin/marketplace.json` 是否仍正確反映 bundle 與 skill 分組；若
  skill 的歸屬、命名或包裝清單有變動，先更新 `.claude-plugin/marketplace.json`。
- `.agents/plugins/marketplace.json` 必須與 `.claude-plugin/marketplace.json`
  保持同步；不要手動雙寫，應執行 `scripts/sync-codex-plugins.ps1` 或
  `scripts/sync-codex-plugins.sh` 由腳本重寫 `.agents/plugins/marketplace.json`
  並重新同步 `codex-plugins/*/skills`。
- 不要手動修改 `codex-plugins/*/skills` 內的 skill 副本；正確流程是修改
  `skills/` source 後重新執行同步腳本。同步後的 Codex 封裝只保留英文主檔，
  整棵目錄中的 `*_zhTW.md` 都不應存在。
- `README.md` 只需要維持專案層級的簡短描述與探索指引，不要手動列舉目前的
  skill 清單。
- 若需要知道目前有哪些 skills，讀取 `skills/*/SKILL.md` 的 YAML
  frontmatter，使用 `name` 與 `description` 判斷 skill 名稱、用途與觸發時機。
- `skills/` 的實際清單與說明以各 `SKILL.md` frontmatter 為準，不要在
  `README.md` 複製這份清單，避免後續漂移。
- 新建 `skills/` 底下的 skill 時，`SKILL.md` 與所有 `references/` Markdown
  都必須先以英文作為主檔，再額外提供同 basename 的 `*_zhTW.md` 繁體中文版本。
- 若 skill 內容同時提供英文與繁體中文，保留 `SKILL.md` 或原始檔名作為英文主
  檔，繁體中文版本使用同 basename 的 `*_zhTW.md`；`references/` 內的 Markdown
  也遵循同樣規則。
- 任何後續修改都必須同步更新英文主檔與對應的 `*_zhTW.md`，禁止只改單一語系
  後讓兩邊內容漂移。
