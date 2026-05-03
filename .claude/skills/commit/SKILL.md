---
name: commit
description: >-
  用於在此 Skills Marketplace 儲存庫中準備 git commit——尤其是當使用者要求提交變更、
  選擇提交邊界、暫存檔案、撰寫 Conventional Commit 訊息，或將混合變更拆分為獨立 commit
  時使用。只要使用者提到「commit」「提交」「暫存」「git add」「寫 commit message」「幫我提交」，
  就應優先使用此 skill。
---

# commit

## 概覽

將目前工作樹轉化為一個高品質 commit。優先考量可用於 release note 的歷史紀錄：subject 應描述對 skill 行為、規格或文件的意義，而非描述哪些檔案被編輯。

## 工作流程

1. 執行 `git status --short`，同時檢視已暫存與未暫存的差異。
2. 判斷變更是否代表單一高層次意圖。若否，停下來並提議拆分為個別 commit。
3. 僅暫存屬於同一意圖的檔案。
4. 若某一檔案包含多個意圖的 hunk，使用 `git add -p` 確保每個 commit 保持連貫性。
5. 根據變更的語意選擇 `type` 與可選的 `scope`（見下方規範）。
6. 以英文、祈使語氣、高層次措辭撰寫 `type(scope): summary`。
7. 若 diff 只揭示底層實作細節而無法可靠推斷高層次意圖，在最終確定訊息前先問一個明確的問題。
8. 僅在有遷移說明、重大變更或 issue 參考時才加入 body。
9. 建立本地 commit。

## Scope 規範

本儲存庫的 scope 依照變更目標選用：

| 情境 | Scope |
|------|-------|
| 修改或新增特定 skill | 該 skill 名稱，例如 `write-md`、`image-to-html`、`commit` |
| 修改 Plugin Bundle 定義（marketplace.json） | `marketplace` |
| 僅修改 README 或頂層說明文件 | `docs` |
| 跨多個 skill 或全域性變更 | 省略 scope |

## Type 快速參考

| `type` | 使用時機 |
|--------|---------|
| `feat` | 新增 skill 或對外可見的行為 / 規格變更 |
| `fix` | 修正 skill 指令錯誤或修復不符預期的行為 |
| `refactor` | 不改變 skill 行為的重構（例如改善結構或措辭） |
| `docs` | 僅變更文件（README、SKILL.md 說明段落） |
| `test` | 新增或修改 evals |
| `chore` | 非功能性維護（例如整理 marketplace.json 排序） |
| `ci` | hook、自動化或 CI 工作流程變更 |

## 訊息規則

- 為未來的 release note 優化 subject：描述對使用者或 AI agent 行為有何變化，而非哪些檔案被修改。
- 有明確 scope 時保留 scope；跨多個 skill 的變更省略 scope。
- 避免低品質摘要：`update files`、`misc fix`、`tweak skill`。
- 避免以檔案為主體的 subject：`update SKILL.md`、`edit marketplace.json`。
- 若意圖不明確，寧可先問一個明確的澄清，也不要編造誤導性的訊息。

## 常見錯誤

- 在時間壓力下將不相關的變更（例如修 skill + 更新 marketplace）混入單一 commit
- 撰寫以檔案名稱描述的 subject，例如 `docs: update SKILL.md`
- 使用 `chore: update skills` 這類模糊摘要
- 忽略 `git add -p`，將屬於不同意圖的 hunk 一起暫存

## 範例

好的範例：

- `feat(image-to-html): add visual diff Python toolset`
- `fix(windows-script): correct BOM handling for PowerShell 5.1`
- `docs: rewrite README with plugin bundle overview`
- `feat(marketplace): register aery-go-dev bundle`
- `refactor(write-md): restructure Mermaid decision criteria`
- `feat(commit): add commit skill for this repository`

不好的範例：

- `docs: update SKILL.md`（描述操作而非意圖）
- `chore: update files`（無意義）
- `feat: add new skill`（缺少 scope，且過於模糊）
- `fix: improve skill`（不知道改了什麼行為）
