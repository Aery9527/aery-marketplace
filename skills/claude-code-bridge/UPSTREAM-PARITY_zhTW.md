# 上游對齊記錄

此 skill 是一次反向移植。`openai/codex-plugin-cc` 讓 Claude Code 呼叫 Codex；本套件
讓 Codex 呼叫 Claude Code。由於行為的來源存在於另一個 repository，本檔案就是兩者之間
的接合點：它釘住移植所依據的上游修訂版本、把每個上游檔案對應到此處的對應物，並記錄
反向方向無法重現的部分。

修改 `codex-plugin/` 底下任何內容前必須先讀本檔案，並在同一次變更中更新它。本檔案只
記錄**當前狀態與當前契約** — 某一列為何改變屬於 commit message，不屬於這裡。

## 上游釘選

| 欄位 | 值 |
|------|-----|
| Repository | `https://github.com/openai/codex-plugin-cc` |
| Commit | `db52e28f4d9ded852ab3942cea316258ae4ef346` |
| Commit 日期 | 2026-07-07 |
| Commit 標題 | Remove shell expansion for git commands (#447) |
| 上游 plugin 版本 | `1.0.6`（`plugins/codex/.claude-plugin/plugin.json`） |
| 上游授權 | Apache-2.0 |

## 如何閱讀本檔案

每個檔案追蹤兩項互相獨立的事實，分列兩欄，因為兩者漂移的原因不同。

**Plan** — 與上游的預期關係。只有當上游變動，或發現宿主限制時才會改變。

| Plan | 意義 |
|------|------|
| `port` | 直接重現行為 |
| `adapt` | 以不同的宿主機制重現行為，見[調適](#調適) |
| `partial` | 重現但有已記錄的損失，見[缺口](#缺口) |
| `open` | 可重現性尚未定案；必須由指名的 probe 決定，見[待驗證](#待驗證) |
| `drop` | 刻意不提供對應物，見[缺口](#缺口) |
| `new` | 本套件需要此檔案，上游沒有對應物 |
| `n/a` | 上游的基礎設施，本 repository 已用自己的方式解決 |
| `removed` | 上游已刪除此檔案；保留該列讓其對應物仍在審視範圍內 |

**State** — 對應物的交付狀態。

| State | 意義 |
|-------|------|
| `todo` | 預期會有對應物，但尚不存在 |
| `wip` | 對應物存在，但尚未滿足其 Plan |
| `done` | 對應物存在、滿足其 Plan，且其所屬區域的驗證通過 |
| `n/a` | 不預期有對應物，因為 Plan 是 `drop`、`n/a` 或 `removed` |

`done` 絕不是意圖宣告。它要求[驗證矩陣](#驗證矩陣)中該區域對應的驗證通過。

File Map 之後的章節 — [調適](#調適)、[缺口](#缺口) — 描述的是每個對應物必須滿足的
**契約**。某個對應物是否已經滿足，一律由 File Map 的 State 欄表示，絕不由這些章節表示。

## 追隨上游

追蹤的上游範圍是所有出現在 [File Map](#file-map) 中的路徑。全部一起 diff：

```sh
git clone https://github.com/openai/codex-plugin-cc
cd codex-plugin-cc
git diff --stat db52e28f4d9ded852ab3942cea316258ae4ef346..origin/main \
  -- plugins/codex/ tests/ scripts/bump-version.mjs .github/workflows/ \
     .claude-plugin/marketplace.json package.json package-lock.json \
     tsconfig.app-server.json .gitignore README.md LICENSE NOTICE
```

接著：

1. 每個變動的路徑都會出現在 File Map。只需重新檢視那些列，並把其 State 重設為 `wip`
   直到移植跟上為止。
2. 上游新增但 File Map 中不存在的路徑，代表對照表已過期 — 新增該列、選定其 Plan、把
   State 設為 `todo`，然後移植。
3. 上游刪除的路徑保留該列，Plan 改為 `removed`、State 改為 `n/a`。直接刪除該列會讓其
   對應物悄悄脫離審視。
4. 上游改名的路徑是一列而非兩列：改寫上游路徑，對應物保持不動。
5. 移植完成後，把[上游釘選](#上游釘選)的 pin 移到新的 commit 與版本。

把 diff 與 File Map 比對**目前是人工步驟**。File Map 以上游路徑為 key，正是為了讓它
*可以*被自動化：本移植自己的測試套件必須長出一個 parity test，走訪上游的受追蹤清單、
斷言每個路徑都恰好對應一列 File Map，並在新增、刪除或改名時失敗。在該測試存在之前，
步驟 1–4 都依賴執行升級的人。

## 驗證矩陣

某區域的列要被標記為 `done` 之前必須通過的驗證。

| 區域 | 驗證 |
|------|------|
| runtime libraries | `node --test codex-plugin/tests/` |
| companion 子指令 | `codex-plugin/tests/commands.test.mjs` 搭配 fake `claude` fixture |
| git 目標解析 | `codex-plugin/tests/git.test.mjs` |
| job 狀態 | `codex-plugin/tests/state.test.mjs` |
| 輸出渲染 | `codex-plugin/tests/render.test.mjs` |
| Claude session client | `codex-plugin/tests/claude-cli.test.mjs`、`codex-plugin/tests/stream-protocol.test.mjs` |
| 靜態資產（prompts、schemas、授權、manifest） | `scripts/sync-codex-plugins.ps1` 完成且 `scripts/verify_codex_plugins.py` 通過 |
| commands、agents、skills（文字） | 對照其映射的上游檔案人工審閱；無自動化關卡 |
| hooks | [待驗證](#待驗證)中的 TUI probe |

本 repository 沒有 CI，因此這些都在 release 前於本機執行。

## 版面對應

上游在 `plugins/codex/` 出貨單一 Claude Code plugin。本 repository 是 skills
marketplace，因此同一個套件由兩種來源形狀組裝：

| 上游位置 | 此處的 source of truth | 封裝到 |
|----------|------------------------|--------|
| `plugins/codex/skills/*` | `skills/claude-*/`（一般 skill 目錄） | `codex-plugins/aery-claude-code/skills/*` |
| `plugins/codex/` 底下其餘全部 | `skills/claude-code-bridge/codex-plugin/`（overlay） | `codex-plugins/aery-claude-code/`（plugin root） |

overlay 之所以存在，是因為 Codex plugin 把 `scripts/`、`commands/`、`agents/` 與
`hooks.json` 放在 *plugin root*，而不是放在某個 skill 內；但本 repository 要求所有原始
檔案都住在 `skills/` 底下。`scripts/sync-codex-plugins.ps1` 會把 overlay 的內容複製到
plugin root，並把 overlay 從 skill 複本中排除，方式與排除 `*_zhTW.md` 相同。

## File Map

Counterpart 欄的路徑相對於 `skills/claude-code-bridge/`，除非它以 repository 根層級的
路徑段開頭。

### Repository root

| 上游路徑 | 對應物 | Plan | State |
|----------|--------|------|-------|
| `LICENSE` | `codex-plugin/LICENSE`（Apache-2.0 全文，未修改） | port | done |
| `NOTICE` | `codex-plugin/NOTICE`（attribution，已加入本移植） | adapt | done |
| `README.md` | `skills/claude-code-bridge/SKILL.md` | adapt | wip |
| `package.json` | 無 — 零相依 ESM，測試以 `node --test` 執行 | n/a | n/a |
| `package-lock.json` | 無 — 沒有相依可鎖定 | n/a | n/a |
| `tsconfig.app-server.json` | `codex-plugin/scripts/lib/stream-protocol.mjs`（runtime 驗證取代 build 期型別） | adapt | done |
| `.gitignore` | repository 根層級 `.gitignore` | n/a | n/a |
| `.claude-plugin/marketplace.json` | repository 根層級 `.claude-plugin/marketplace.json` | n/a | n/a |
| `scripts/bump-version.mjs` | `release` skill（repository 層級） | n/a | n/a |
| `.github/workflows/pull-request-ci.yml` | 無 | drop | n/a |

上游用這三個檔案處理 Node toolchain 與 app-server protocol 的型別檢查。
stream-protocol probe 證實反向 runtime 不需要任何相依，因此 toolchain 檔案沒有對應物，
protocol 契約則改由 runtime validator 承擔，而非 build 步驟。

### Manifest 與封裝

| 上游路徑 | 對應物 | Plan | State |
|----------|--------|------|-------|
| `plugins/codex/.claude-plugin/plugin.json` | `codex-plugins/aery-claude-code/.codex-plugin/plugin.json` | adapt | wip |
| `plugins/codex/CHANGELOG.md` | `release-note/vX.Y.Z.md`（repository 層級） | n/a | n/a |
| `plugins/codex/LICENSE` | `codex-plugin/LICENSE` | port | done |
| `plugins/codex/NOTICE` | `codex-plugin/NOTICE` | adapt | done |

### 進入點

| 上游路徑 | 對應物 | Plan | State |
|----------|--------|------|-------|
| `plugins/codex/commands/review.md` | `codex-plugin/commands/claude-review.md` | adapt | todo |
| `plugins/codex/commands/adversarial-review.md` | `codex-plugin/commands/claude-adversarial-review.md` | adapt | todo |
| `plugins/codex/commands/rescue.md` | `codex-plugin/commands/claude-rescue.md` | adapt | todo |
| `plugins/codex/commands/transfer.md` | `codex-plugin/commands/claude-transfer.md` | adapt | todo |
| `plugins/codex/commands/status.md` | `codex-plugin/commands/claude-status.md` | partial | todo |
| `plugins/codex/commands/result.md` | `codex-plugin/commands/claude-result.md` | partial | todo |
| `plugins/codex/commands/cancel.md` | `codex-plugin/commands/claude-cancel.md` | partial | todo |
| `plugins/codex/commands/setup.md` | `codex-plugin/commands/claude-setup.md` | adapt | done |
| `plugins/codex/agents/codex-rescue.md` | `codex-plugin/agents/claude-rescue.md` | partial | todo |
| — | `codex-plugin/agents/openai.yaml` | new | todo |

### Runtime

| 上游路徑 | 對應物 | Plan | State |
|----------|--------|------|-------|
| `plugins/codex/scripts/codex-companion.mjs` | `codex-plugin/scripts/claude-companion.mjs` | adapt | wip |
| `plugins/codex/scripts/lib/codex.mjs` | `codex-plugin/scripts/lib/claude.mjs` | adapt | wip |
| `plugins/codex/scripts/lib/app-server.mjs` | `codex-plugin/scripts/lib/claude-cli.mjs` | adapt | done |
| `plugins/codex/scripts/lib/app-server-protocol.d.ts` | `codex-plugin/scripts/lib/stream-protocol.mjs`（runtime 驗證，非型別） | adapt | done |
| `plugins/codex/scripts/app-server-broker.mjs` | `codex-plugin/scripts/claude-broker.mjs` | adapt | todo |
| `plugins/codex/scripts/lib/broker-endpoint.mjs` | `codex-plugin/scripts/lib/broker-endpoint.mjs` | adapt | todo |
| `plugins/codex/scripts/lib/broker-lifecycle.mjs` | `codex-plugin/scripts/lib/broker-lifecycle.mjs` | adapt | todo |
| `plugins/codex/scripts/lib/claude-session-transfer.mjs` | `codex-plugin/scripts/lib/codex-session-transfer.mjs` | partial | todo |
| `plugins/codex/scripts/lib/args.mjs` | `codex-plugin/scripts/lib/args.mjs` | port | done |
| `plugins/codex/scripts/lib/fs.mjs` | `codex-plugin/scripts/lib/fs.mjs` | port | done |
| `plugins/codex/scripts/lib/git.mjs` | `codex-plugin/scripts/lib/git.mjs` | port | done |
| `plugins/codex/scripts/lib/process.mjs` | `codex-plugin/scripts/lib/process.mjs` | adapt | done |
| `plugins/codex/scripts/lib/prompts.mjs` | `codex-plugin/scripts/lib/prompts.mjs` | port | todo |
| `plugins/codex/scripts/lib/workspace.mjs` | `codex-plugin/scripts/lib/workspace.mjs` | port | done |
| `plugins/codex/scripts/lib/state.mjs` | `codex-plugin/scripts/lib/state.mjs` | adapt | done |
| `plugins/codex/scripts/lib/render.mjs` | `codex-plugin/scripts/lib/render.mjs` | adapt | wip |
| `plugins/codex/scripts/lib/job-control.mjs` | `codex-plugin/scripts/lib/job-control.mjs` | adapt | todo |
| `plugins/codex/scripts/lib/tracked-jobs.mjs` | `codex-plugin/scripts/lib/tracked-jobs.mjs` | adapt | todo |

最後四個 `adapt` 列帶的是宿主語意而非純邏輯：`state.mjs` 在 `CLAUDE_PLUGIN_DATA` 底下
解析狀態、`job-control.mjs` 與 `tracked-jobs.mjs` 建模 app-server 的進度事件、
`render.mjs` 輸出 `codex resume` 後續指令。每一個都需要改寫其宿主相關的那一半。

### Hooks 與 prompts

| 上游路徑 | 對應物 | Plan | State |
|----------|--------|------|-------|
| `plugins/codex/hooks/hooks.json` | `codex-plugin/hooks.json` | adapt | todo |
| `plugins/codex/scripts/session-lifecycle-hook.mjs` | `codex-plugin/scripts/session-lifecycle-hook.mjs` | adapt | todo |
| `plugins/codex/scripts/stop-review-gate-hook.mjs` | `codex-plugin/scripts/stop-review-gate-hook.mjs` | adapt | todo |
| `plugins/codex/prompts/adversarial-review.md` | `codex-plugin/prompts/adversarial-review.md` | port | todo |
| `plugins/codex/prompts/stop-review-gate.md` | `codex-plugin/prompts/stop-review-gate.md` | port | todo |
| `plugins/codex/schemas/review-output.schema.json` | `codex-plugin/schemas/review-output.schema.json` | port | todo |

兩個 hook script 都是 `adapt` 而非 `port`，但理由不同。
`session-lifecycle-hook.mjs` 在 `SessionStart` 時把狀態匯出到 `CLAUDE_ENV_FILE`，並在
`SessionEnd` 時拆除 broker；Codex 的 hook payload 與環境契約都不同，而它要拆除的對象
又取決於 broker 的決策。`stop-review-gate-hook.mjs` 讀取 `last_assistant_message` 並
spawn `codex-companion task --json`；它需要 Codex 的 `Stop` payload 形狀，以及反向
companion 的 task 契約。

### Skills

| 上游路徑 | 對應物 | Plan | State |
|----------|--------|------|-------|
| `plugins/codex/skills/codex-cli-runtime/SKILL.md` | `skills/claude-cli-runtime/SKILL.md` | adapt | todo |
| `plugins/codex/skills/codex-result-handling/SKILL.md` | `skills/claude-result-handling/SKILL.md` | adapt | todo |
| `plugins/codex/skills/gpt-5-4-prompting/SKILL.md` | `skills/claude-code-prompting/SKILL.md` | adapt | todo |
| `plugins/codex/skills/gpt-5-4-prompting/references/prompt-blocks.md` | `skills/claude-code-prompting/references/prompt-blocks.md` | adapt | todo |
| `plugins/codex/skills/gpt-5-4-prompting/references/codex-prompt-recipes.md` | `skills/claude-code-prompting/references/claude-prompt-recipes.md` | adapt | todo |
| `plugins/codex/skills/gpt-5-4-prompting/references/codex-prompt-antipatterns.md` | `skills/claude-code-prompting/references/claude-prompt-antipatterns.md` | adapt | todo |
| — | `skills/claude-code-bridge/SKILL.md` | new | wip |
| — | `skills/claude-code-bridge/UPSTREAM-PARITY.md` | new | wip |

三個上游 skill 全部是 `adapt`。它們的內文直接以名稱指示 agent 呼叫 `codex-companion`、
Codex CLI 與 Codex session；每一條這類指示都必須依 Claude CLI 契約改寫。

### Tests

| 上游路徑 | 對應物 | Plan | State |
|----------|--------|------|-------|
| `tests/helpers.mjs` | `codex-plugin/tests/helpers.mjs` | port | done |
| `tests/git.test.mjs` | `codex-plugin/tests/git.test.mjs` | adapt | done |
| `tests/process.test.mjs` | `codex-plugin/tests/process.test.mjs` | port | done |
| `tests/state.test.mjs` | `codex-plugin/tests/state.test.mjs` | adapt | done |
| `tests/render.test.mjs` | `codex-plugin/tests/render.test.mjs` | adapt | todo |
| `tests/commands.test.mjs` | `codex-plugin/tests/commands.test.mjs` | adapt | wip |
| `tests/runtime.test.mjs` | `codex-plugin/tests/runtime.test.mjs` | adapt | todo |
| `tests/fake-codex-fixture.mjs` | `codex-plugin/tests/fake-claude-fixture.mjs` | adapt | done |
| `tests/broker-endpoint.test.mjs` | `codex-plugin/tests/broker-endpoint.test.mjs` | adapt | todo |
| `tests/bump-version.test.mjs` | 無 | n/a | n/a |
| — | `codex-plugin/tests/stream-protocol.test.mjs` | new | done |
| — | `codex-plugin/tests/claude-cli.test.mjs` | new | done |

`runtime.test.mjs` 是 `adapt`：它驅動一個 fake Codex app server 並演練原生 import 與
broker interrupt，這些都無法原封不動保留。

## 宿主能力比較

兩個宿主並非互為鏡像。以下每項宣稱都附上其依據。`help` 指本機 `--help` 輸出、`probe`
指本機跑過的拋棄式 plugin 或 process、`docs` 指官方文件、`unverified` 指該宣稱在任何東西
依賴它之前仍需要一次 probe。

### 被委派的 CLI 提供什麼

上游透過 Codex **app server**（長壽命 JSON-RPC process）驅動 Codex。反向移植驅動的是
`claude` CLI。對照版本為 `claude` 2.1.227。

| 上游 app-server 能力 | Claude Code CLI 對應物 | 依據 |
|----------------------|------------------------|------|
| 結構化輸出（`schemas/review-output.schema.json`） | `--json-schema`；文件記載搭配 `--output-format json`，結果落在 `structured_output` | docs |
| turn streaming 與進度事件 | `--output-format stream-json --verbose`；turn 以 `result` 事件結束。token 級的 delta 另需 `--include-partial-messages`，runtime 目前未傳 | docs, probe |
| 模型選擇 | `--model <alias\|full-name>` | help |
| thread 持久化與 resume | `--session-id <uuid>`、`--resume <id>`、`--continue`、`--fork-session`；自 v2.1.223 起 `--resume` 可跨 project 尋找 session | docs, help |
| thread 命名（`buildPersistentTaskThreadName`） | `--name <name>` | help |
| 唯讀與可寫入執行 | `--permission-mode`（鎖定執行用 `dontAsk`）、`--tools`、`--allowed-tools` | docs |
| 原生 `/review`（`runAppServerReview`） | `claude -p "/code-review"` — 使用者可呼叫的 skill 會在 `-p` 的 prompt 字串內展開 | docs |
| 長壽命 process 服務連續 turn | `-p --input-format stream-json --output-format stream-json`；單一 process 在同一個 `session_id` 下服務兩個 turn，stdin 關閉後以 0 結束 | probe |
| turn 中斷（`interruptAppServerTurn`） | 帶 `{subtype: "interrupt"}` 的 `control_request`；由 `control_response` 回應，該 turn 以 `result`/`error_during_execution` 結束，且 session 仍可繼續使用 | probe |
| 執行後的 session metadata | `system/init` 事件，或 `--output-format json` 中的 `session_id` | docs |
| 分離式背景執行 | **無對應物** — `-p` 會拒絕 `--bg`；bridge 必須自行管理分離的子行程 | docs |
| 推理強度選擇 | `--effort <low\|medium\|high\|xhigh\|max>` | help — 見[缺口](#缺口) |
| 乾淨關閉語意 | SIGTERM 會中止該 turn、終止 Bash process tree、執行 `SessionEnd` hooks，並以 143 結束 | docs |

### 宿主 plugin 系統提供什麼

對照版本為 `codex-cli` 0.147.0 及其出貨的 plugin（`figma`、`replayio`）。

| Claude Code plugin 能力 | Codex plugin 對應物 | 依據 |
|-------------------------|---------------------|------|
| 帶 `name` / `description` frontmatter 的 `skills/*/SKILL.md` | 相同，另加 `disable-model-invocation` | probe, shipped plugin |
| `commands/*.md` slash commands | `commands/*.md`；在任何已出貨 plugin 中都未觀察到 frontmatter | shipped plugin |
| `agents/*.md` subagents | `agents/*.md` 加上 `agents/openai.yaml`；未觀察到 frontmatter | shipped plugin |
| `hooks/hooks.json` | `plugin.json` 的 `hooks` 欄位，或預設的 `hooks/hooks.json` | docs, binary strings |
| `${CLAUDE_PLUGIN_ROOT}` | `${PLUGIN_ROOT}`、`${PLUGIN_DATA}`；`${CLAUDE_PLUGIN_ROOT}` 仍被接受 | docs, binary strings |
| hook `command` 接受任意 shell 字串 | 必須是裸執行檔名稱，或包含在 plugin root 內的 `./` 路徑 | docs, binary strings |
| `SessionStart`、`SessionEnd`、`Stop` hook 事件 | 名稱相同，另有 `PreToolUse`、`PostToolUse`、`PermissionRequest`、`PreCompact`、`PostCompact`、`UserPromptSubmit`、`SubagentStart`、`SubagentStop` | docs |
| `Stop` hook 以 `decision: "block"` 阻擋 | 相同 | docs |
| plugin hooks 確實會觸發 | 在 `codex exec` 下未觀察到 | probe — 見[待驗證](#待驗證) |

## 調適

行為被保留、但機制不同的契約。此處沒有任何功能損失。

- **指令命名** — Codex plugin 的 command 不依 plugin 加 namespace，因此 `/codex:review`
  變成 `/claude-review` 而非 `/claude:review`。每個 command 檔案改帶 `claude-` 前綴。
- **結構化輸出** — 上游要求 app server 產出符合 `schemas/review-output.schema.json` 的
  輸出。對應物把同一份 schema 傳給 `claude --json-schema`，因此 schema 檔案本身可原樣
  移植。由於單一 process 必須服務連續 turn，session 一律使用
  `--output-format stream-json`，並從最終的 `result` 事件讀取 `structured_output`。
  stream-json 的 `result` 是否帶有 `structured_output` 列於[待驗證](#待驗證)。
- **背景執行** — 上游以背景任務啟動 companion 並在 workspace state 中追蹤來達成分離。
  `-p` 會拒絕 `--bg`，因此對應物必須自行 spawn 並監管分離的子行程；`claude agents`
  管理的是 Claude Code 自己的背景 session，不是替代品。
- **`hooks.json` 位置** — 上游放在 `hooks/hooks.json`。對應物放在 plugin root 並在
  `plugin.json` 宣告 `"hooks": "./hooks.json"`，與 Codex 自家出貨 plugin 的做法一致。
- **協定契約** — 上游以 `app-server-protocol.d.ts` 在 build 期做型別檢查。對應物沒有
  build 步驟，因此等價契約由 `stream-protocol.mjs` 在 runtime 強制執行。每個 frame 都
  必須是帶字串 `type` 的 JSON object；bridge 實際依賴的 `system`、`result` 與
  `control_response` 三種 frame 會逐欄位檢查：必填欄位必須存在且型別正確，選填欄位可以
  缺席或為 `null`，但帶其他錯誤型別時明確失敗。`type` 無法辨識的
  frame 則原樣放行，因為 CLI 會隨時間新增事件型別。feature detection 讀取 `system/init`
  上的 `capabilities` 陣列，而非比對版本字串；版本只是建議，絕不阻擋執行。
- **Prompt skill** — `gpt-5-4-prompting` 教的是 GPT-5.4 的 prompting。其對應物教的是
  Claude Code 的 prompting，因此檔案有對應關係，但內容是重新撰寫而非翻譯。

## 缺口

反向方向無法完整重現的行為。每一項都指名實作它的上游檔案，讓未來上游對該檔案的變動能
落在一個已知的限制上。

### 已捨棄

- **CI workflow** — `.github/workflows/pull-request-ci.yml`。這是專案選擇而非宿主限制：
  本 repository 沒有 CI。取代它的品質關卡是[驗證矩陣](#驗證矩陣)，在 release 前於本機
  執行。

### 已降級

- **推理強度範圍** — `scripts/codex-companion.mjs` 中的 `VALID_REASONING_EFFORTS` 接受
  `none|minimal|low|medium|high|xhigh`。`claude` CLI 接受 `low|medium|high|xhigh|max`。
  `none` 與 `minimal` 沒有對應物，必須明確拒絕而非默默改寫；`max` 在此可用，且沒有上游
  對應物。
- **決定性的 command 內文** — `commands/status.md`、`commands/result.md`、
  `commands/cancel.md`。上游用 `` !`...` `` 替換在 command 內文直接執行 companion
  script，因此該 script 一定會跑。在已出貨的 Codex command 檔案中未觀察到任何替換語法，
  因此對應物改為指示模型去執行該 script。模型原則上可能改寫或跳過該呼叫。
- **Command metadata** — `commands/` 底下所有檔案。上游在 frontmatter 宣告
  `description`、`argument-hint`、`allowed-tools` 與 `disable-model-invocation`。已出貨
  的 Codex command 檔案都沒有 frontmatter，因此參數提示改寫在內文，工具存取也無法逐一
  指令限制。
- **Subagent 宣告** — `agents/codex-rescue.md`。上游在 frontmatter 宣告 `model`、
  `tools` 與 `skills`，把 rescue 轉發者釘在單一模型且只有 `Bash`。已出貨的 Codex agent
  檔案都沒有 frontmatter，因此同樣的限制只能寫成要求 agent 遵守的指示。
- **Session transfer** — `commands/transfer.md`、
  `scripts/lib/claude-session-transfer.mjs`。上游使用 Codex 官方文件化的 external-agent
  session importer，把 Claude Code transcript 轉成真正的 Codex thread，產生可見且可延續
  的 turn。Claude Code 沒有 session importer — `claude import` 匯入的是 Codex 的
  *設定*，不是對話。因此對應物改為以一段 handoff prompt 建立 bridge 自有的 Claude
  session，內含轉換後的 Codex transcript 與其出處，並回傳 `claude --resume <session-id>`
  指令。它承諾的是可延續的工作，**不是**原生可見的匯入歷史。直接在
  `~/.claude/projects/` 底下合成 session 檔案的做法被刻意否決：該格式未文件化且屬私有，
  寫入它有損毀真實使用者 session 的風險。

## 待驗證

無法在本機定案的宣稱。每一項都指名可定案的 probe，以及依賴該答案的列。任何項目在其
probe 執行之前，嚴禁從 `open` 移到具體的 Plan。

- **stream-json 下的結構化輸出。** `--json-schema` 的文件記載搭配 `--output-format json`，
  但 bridge 的 session 一律是 stream-json。Probe：透過 session 執行一次帶 schema 的 turn，
  確認最終 `result` 事件是否帶有 `structured_output`。若沒有，審查家族就必須另外做一次
  一次性的 `--output-format json` 呼叫。決定下一個里程碑的審查路徑。
- **未追蹤檔案的蒐集會跟隨 symlink。** `scripts/lib/git.mjs` 的 `collectReviewContext`
  以 `statSync`／`readFileSync` 讀取未追蹤檔案，因此 working tree 中的 symlink 可能把
  repository 之外的檔案帶進 review context。此行為承襲自上游。Probe：以指向 repo 外的
  symlink 確認，之後改用 `lstat` 並跳過 symlink，且回報被跳過的項目。決定審查家族如何
  組出 context。
- **唯讀強制。** 上游審查時以 `sandbox: read-only` 執行 Codex。Probe：確認
  `--permission-mode dontAsk` 加上工具 allow-list 是否真的能擋下編輯、Bash 寫入，以及
  透過被允許的工具間接達成的寫入。決定審查家族是否真正唯讀。
- **Handoff transfer。** Probe：建立一個 bridge 自有的 session、在第二個行程中 resume
  它、確認出處文字存在於回復後的 context，並確認 bridge 本身沒有在
  `~/.claude/projects/` 底下寫入任何東西。決定 `transfer` 的契約。
- **Plugin `Stop` hook 執行。** 一個宣告 `"hooks": "./hooks.json"` 並帶 `Stop` handler
  的 probe plugin，在 `codex exec` 下五種 command 形式（裸 `.mjs`、`node ./path`、
  `.cmd` shim、巢狀 `./skills/...` 路徑、`${PLUGIN_ROOT}`）皆未被執行。repository 層級
  的 `.codex/hooks.json` 同樣未被執行。這與「`codex exec` 完全不跑 hooks」一致，但並未
  被證明。Probe：在 Codex TUI 中重跑。決定 review gate 是否根本可重現。
- **Hook 工作目錄。** 文件指出 hook command 從 session 工作目錄執行，而 `./` 路徑在
  plugin root 內解析。對應物依賴 `${PLUGIN_ROOT}` 而非相對解析；上述 TUI probe 應確認
  何者成立。
