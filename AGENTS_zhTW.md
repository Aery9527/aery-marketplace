# Agent Instructions

## 專案概覽

這個 repo 是 AI Agent Skills marketplace，用來整理、維護並發布可重複使用的
agent skills。核心內容放在 `skills/`。每個 skill 以自己的 `SKILL.md` YAML
frontmatter 定義 `name` 與 `description`，並在內文描述觸發條件、工作流程、
規則與 references。`SKILL.md` 是英文主入口；若存在繁體中文版本，請讀取同目
錄對應的 `*_zhTW.md`。

`.claude-plugin/marketplace.json` 定義 Plugin Bundle，與宣告 Codex 專用 bundle 的
`.agents/plugins/codex-only-bundles.json` 一同構成 bundle 與 skill 分組的
source of truth。`.agents/plugins/marketplace.json` 與 `codex-plugins/`
是給 Codex 使用的同步產物，由這兩份宣告一起產生。其中 `codex-plugins/*/skills/` 內的封裝副本只保
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
- 一個 bundle 只在一份目錄中宣告，放在哪份由「哪些 host 能安裝它」決定。
  `.claude-plugin/marketplace.json` 是 Claude Code 與 Copilot CLI 讀取的目錄，
  這些 host 用得到的 bundle 就宣告在那裡，Codex 也從同一筆條目封裝。只有 Codex
  能用的 bundle——例如其 skill 是用來驅動另一個 agent CLI——則改宣告在
  `.agents/plugins/codex-only-bundles.json`，避免它出現在無法執行它的 host。
  同一個 bundle 同時出現在兩份檔案是錯誤，同步腳本會直接拒絕。
- 新增、刪除或修改 `skills/` 底下任何 skill 內容時，也必須同步檢查
  宣告其所屬 bundle 的那份目錄是否仍正確反映 bundle 與 skill 分組；若 skill 的
  歸屬、命名或包裝清單有變動，先更新那份目錄。
- `.agents/plugins/marketplace.json` 必須與兩份 bundle 宣告保持同步；
  不要手動維護它，應執行 `scripts/sync-codex-plugins.ps1` 或
  `scripts/sync-codex-plugins.sh` 由腳本重寫 `.agents/plugins/marketplace.json`
  並重新同步 `codex-plugins/*/skills`。
- 不要手動修改 `codex-plugins/*/skills` 內的 skill 副本；正確流程是修改
  `skills/` source 後重新執行同步腳本。同步後的 Codex 封裝只保留英文主檔，
  整棵目錄中的 `*_zhTW.md` 都不應存在。
- skill 目錄底下的所有內容都會隨該 skill 一起封裝發佈，因此只寫給維護者看的文件
  不屬於那裡，應改放在 `docs/<skill-name>/`。修改
  `skills/claude-code-bridge/codex-plugin/` 底下任何內容前，先讀
  `docs/claude-code-bridge/UPSTREAM-PARITY.md`，並在同一次變更中更新它。
- Codex plugin 可能需要 skill 以外的 plugin-root 內容，例如 `commands/`、
  `agents/`、`scripts/` 與 `hooks.json`。這類內容的 source of truth 同樣放在
  `skills/` 底下：置於所屬 skill 內的 `codex-plugin/` overlay 目錄。同步腳本會
  把 overlay 的內容提升到 plugin root，並把 overlay 本身排除在封裝後的 skill
  之外。overlay 只擁有它自己宣告的 plugin-root 項目，且不得包含
  `.codex-plugin` 或 `skills`。
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
- skill 是要分發並安裝到別處的，它的目錄永遠無法保證與其他 skill 相鄰。在
  `SKILL.md` 或 `references/` 內，嚴禁使用相對 Markdown link 指向另一個
  skill——必須改用 inline code 寫出名稱，例如 `write-md`。相對連結只在同一個
  skill 目錄內有效，因為只有那個結構會隨封裝一起被搬移。
