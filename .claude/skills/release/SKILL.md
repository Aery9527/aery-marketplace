---
name: release
description: >-
  用於在此 Skills Marketplace 儲存庫中執行 release 流程——尤其是當使用者提到「release」、
  「發版」、「cut release」、「打 tag」、「版本升級」、「release note」、
  「publish marketplace version」或要從 commit messages 彙整版本說明時使用。
  此 skill 必須處理 `.claude-plugin/marketplace.json` 的 version、`README.md` 的當前版本描述、
  `codex-plugins/*/.codex-plugin/plugin.json` 的 version、`release-note/vX.X.X.md`
  的建立、`develop -> main` 合併、tag 與 push。
---

# release

## 概覽

將此 repo 的 release 流程標準化：從上一個 semver tag 之後的 commit subjects 推薦下一版版本號，生成 release note，更新 version 關聯檔案，並完成 `develop -> main -> tag -> push -> develop`。

## 前置檢查

1. 執行 `git status --short`；若工作樹不乾淨，停止並要求使用者先整理。
2. 檢查 `develop` 是否存在；若不存在，自動從 `main` 建立。
3. 切到 `develop` 後再執行所有 release 內容修改。
4. 只接受 `vX.Y.Z` 形式的 semver tag。

## 版本判斷

- 若沒有任何 semver tag，使用 `.claude-plugin/marketplace.json` 的當前 `metadata.version` 作為第一次 release 的 version。
- 若 commit messages 含 `BREAKING CHANGE`、Conventional Commit 的 `!`、或明確 breaking 語意，建議 major。
- 若沒有 breaking 但有 `feat`，建議 minor。
- 其餘如 `fix`、`docs`、`refactor`、`test`、`chore`、`ci`，建議 patch。
- 提出建議版本後，必須先詢問使用者確認，不可直接定版。

## 輸出要求

- 更新 `.claude-plugin/marketplace.json` 的 `metadata.version`
- 執行 `scripts/sync-codex-plugins.ps1` 或 `scripts/sync-codex-plugins.sh`，同步
  `.agents/plugins/marketplace.json`、`codex-plugins/*/skills`，以及
  `codex-plugins/*/.codex-plugin/plugin.json` 的 `version`
- 在 release commit 前執行 `python scripts/verify_codex_plugins.py`，確認
  `codex-plugins/*/skills` 與 source `skills` 完全一致；規則是不可多、不可少，
  且檔案內容必須完全相同，唯一允許的差異是移除 `*_zhTW.md`
- 在 `README.md` 最上方加入 `Current version: [vX.Y.Z](release-note/vX.Y.Z.md)`
- 建立 `release-note/vX.Y.Z.md`
- `release-note/vX.Y.Z.md` 的固定文字、章節標題與條列摘要必須使用繁體中文
- 若原始 commit subject 為英文，必須整理成繁體中文敘述；必要時可在括號補充原始 subject
- 只保留最新 5 份 release note

## git 流程

1. 在 `develop` 提交 release 相關變更。
2. merge `develop` 到 `main`。
3. 在 `main` 建立 `vX.Y.Z` tag。
4. push `develop`、`main` 與 tag。
5. 只有在上述步驟全部成功完成後，才自動切換回 `develop`。

## 停止條件

- 工作樹不乾淨
- `develop` 建立或切換失敗
- tag 已存在
- merge conflict
- push 失敗

遇到停止條件時，明確說明停在哪一步，以及哪些動作已完成。

## 參考文件

- 需要完整命令順序、首次 release、release note 結構或失敗分支時，讀 `references/workflow.md`
