---
name: claude-code-bridge
description: >-
  用於 Codex session 需要把工作交給 Claude Code 時 — 讓 Claude 審查當前 diff 或
  branch、挑戰某個設計決策、委派 bug 調查或修復、把 Codex 對話延續到 Claude Code
  內，或查詢、取得與取消背景 Claude job。當使用者提到「問 Claude」「讓 Claude 審」
  「委派給 Claude Code」「claude-review」「claude-rescue」「claude-transfer」，
  或詢問如何安裝、設定、排查此 bridge 時觸發。此 skill 只負責路由到正確的進入點，
  嚴禁自行執行審查或修復。
---

# Claude Code Bridge

## 用途

在 Codex 內執行 Claude Code。此 bridge 包裝本機的 `claude` CLI，因此直接沿用機器上
既有的 Claude Code 安裝、認證與設定。成功的定義是：把 Claude Code 自己的輸出原樣
回傳給使用者，長時間工作則以 job 形式追蹤。

此 skill 只把請求路由到某個進入點。嚴禁自行審查程式碼、撰寫修復，或摘要 Claude Code
的輸出。

## 觸發條件

- 使用者要求 Claude 或 Claude Code 審查、挑戰、調查、修復或延續工作。
- 使用者提到[進入點](#進入點)中列出的任一指令。
- 使用者詢問執行中或已完成的 Claude job。
- 使用者詢問如何安裝、認證或設定此 bridge。

## 規則

- 必須把 runtime 的 stdout 原樣回傳給使用者。嚴禁改寫、摘要，或在前後加上評論。
- 嚴禁對審查回報的問題採取行動。審查類進入點是唯讀的；修復必須由使用者另外提出。
- 當使用者要的是「把事情做完」而非「評估」時，必須路由到 `claude-rescue`，而非審查
  進入點。
- 當 runtime 回報 Claude Code 未安裝或未認證時，必須告知使用者執行 `/claude-setup`。
  嚴禁繞過失敗的 setup 檢查。
- 必須只提供在 [codex-plugin/commands/](codex-plugin) 底下確實存在對應 command 檔案的
  進入點。plugin 可能在部分內容尚未建置時就被安裝，因此下方列出的進入點是待查核的宣稱，
  不是保證。若請求所需的進入點不存在，必須說明此安裝的 bridge 未提供該功能並停止。
- 嚴禁直接呼叫 `claude` 執行檔。所有呼叫都必須經過
  [companion runtime](codex-plugin/scripts/claude-companion.mjs)，它負責 job 追蹤、
  狀態與輸出渲染。
- 嚴禁修改 `codex-plugins/` 底下任何內容。該目錄由 `scripts/sync-codex-plugins.ps1`
  從此 skill 目錄產生。

## 進入點

以下每一項都是由同一套 runtime 支撐的 Codex slash command。Codex 的 command 名稱不會
依 plugin 加上 namespace，因此一律帶 `claude-` 前綴。

- `/claude-review` — 唯讀審查 working tree，或以 `--base <ref>` 對 base ref 做 branch
  審查。不可導引，也不接受聚焦文字。
- `/claude-adversarial-review` — 唯讀審查，並挑戰所選方案、其取捨與假設。目標選取方式
  與 `/claude-review` 相同，且旗標之後可接聚焦文字。
- `/claude-rescue` — 委派調查、修復，或延續先前的 Claude 工作。預設具寫入能力。
- `/claude-transfer` — 把當前 Codex 對話延續到 Claude Code，回傳
  `claude --resume <session-id>` 指令。
- `/claude-status` — 此 repository 中進行中與近期的 Claude job。
- `/claude-result` — 已完成 job 的最終輸出。
- `/claude-cancel` — 停止進行中的背景 job。
- `/claude-setup` — 檢查 Claude Code 是否已安裝並認證，並啟用或停用 stop-time review
  gate。

## 決策邏輯

- 若使用者想要對既有工作取得評估，且未指名特定疑慮，使用 `/claude-review`。
- 若使用者想質疑方案、設計或取捨，或指名要聚焦的風險區域，使用
  `/claude-adversarial-review`。
- 若使用者要修改程式碼、診斷 bug，或延續先前的 Claude 工作，使用 `/claude-rescue`。
- 若使用者想把同一段對話帶到 Claude Code 內繼續，使用 `/claude-transfer`。
- 若審查或任務明顯很小，在前景執行；否則在背景執行並引導使用者使用
  `/claude-status`。
- 若使用者詢問已啟動的工作，進度用 `/claude-status`，最終輸出用 `/claude-result`。

## 需求

- 已安裝的 `claude` CLI。建議 Claude Code 2.1.205 或更新版本：此 bridge 透過 stream
  `system/init` 事件上的 `capabilities` 陣列做協定行為的 feature detection，較舊版本不會
  送出該欄位，因此像中斷執行中 job 這類能力在其上就是不可用。版本本身絕不阻擋執行。
- 已認證的 Claude Code 安裝。此 bridge 使用本機 CLI 的登入狀態，本身不保存任何憑證。
- Node.js 18.18 或更新版本，供 runtime scripts 使用。

## 維護

此 skill 是 Codex plugin for Claude Code 的反向移植，該專案把 bridge 跑在相反方向。
[UPSTREAM-PARITY.md](UPSTREAM-PARITY_zhTW.md) 釘住上游修訂版本、把每個上游檔案對應到
此處的對應物，並記錄反向實作無法重現的部分。

- 修改 [codex-plugin/](codex-plugin) 底下任何內容前，必須先讀
  [UPSTREAM-PARITY.md](UPSTREAM-PARITY_zhTW.md)，並在同一次變更中更新它。
- 在該區域對應的驗證通過之前，嚴禁把 File Map 的某一列標記為 `done`。
- 相關 skills，此處以名稱指稱而非連結，因為 skill 目錄不保證與其他 skill 相鄰：
  `claude-cli-runtime` 說明如何組出 runtime 呼叫、`claude-result-handling` 說明如何
  呈現回傳結果、`claude-code-prompting` 說明轉發前如何塑形請求。
