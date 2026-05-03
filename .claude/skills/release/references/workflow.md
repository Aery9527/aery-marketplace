# release workflow reference

## 使用時機

- 需要從上一個 version tag 收集 commit subjects
- 需要同步更新 marketplace version、README version 與 release-note
- 需要完成 `develop -> main -> tag -> push`

## 首次 release

1. 找不到任何 semver tag 時，讀取 `.claude-plugin/marketplace.json` 的 `metadata.version`
2. 用該 version 作為第一次 release version
3. release note 收錄全部歷史 commit subjects

## 一般 release

1. 找出最新 semver tag
2. 收集 `tag..HEAD` 間的 commit subjects
3. 依 major / minor / patch 規則提出建議版本
4. 先詢問使用者確認版本

## release note 格式

- 標題：`# vX.Y.Z`
- 範圍：`From: <previous-tag or repository start>`
- 摘要區塊：`## Features`、`## Fixes`、`## Docs`、`## Refactors`、`## Chores`
- 每一區塊列出對應 commit subjects

## README 更新

- 將 `Current version: vX.Y.Z` 放在 `README.md` 主標題下方

## release-note 清理

1. 列出 `release-note/v*.md`
2. 按 semver 由新到舊排序
3. 只保留最新 5 份
4. 刪除其餘檔案

## branch / tag / push

1. 若沒有 `develop`，執行 `git checkout -b develop main`
2. 在 `develop` 完成檔案更新與提交
3. 執行 `git checkout main`
4. 執行 `git merge --no-ff develop`
5. 執行 `git tag vX.Y.Z`
6. 執行 `git push origin develop`
7. 執行 `git push origin main`
8. 執行 `git push origin vX.Y.Z`

## 失敗分支

- 工作樹不乾淨：立即停止
- 建立或切換 `develop` 失敗：立即停止
- tag 已存在：立即停止
- merge conflict：立即停止並保留衝突現場
- push 失敗：立即停止並回報 push 失敗的 ref
