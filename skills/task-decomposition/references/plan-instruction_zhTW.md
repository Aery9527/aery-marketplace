# plan.md 撰寫指引

> 想先看完整端到端範例（含 plan 模板、SBE 寫法、`.SEQUENCE` 拆分），參考 [example_zhTW.md](example_zhTW.md)。
>
> 進入此文件代表：你準備 **新增 / 修改 / 擴充** 任一份 `plan.md`。
> 對應的 `design.md` 必須先存在且為 `leaf`（`god-view` 目錄 **嚴禁** 出現任何 `plan.md`）；若尚未存在或需要同步調整，回到 [design-instruction_zhTW.md](design-instruction_zhTW.md)。
> 整體流程分三階段：**Skeleton**（列出所有 plan 檔以 `-draft.md` 暫存命名）→ **Content**（依 `DC` 相依性並行填充內容）→ **Implementation Gate**（全部完成才 gate 進入實作）。Phase 2 內 **不需** 逐份暫停 review，避免打斷並行流程。
>
> 常見誤區：跳過 Phase 1 直接寫 SBE。看似省一步，實際會失去「先列骨架讓使用者一次性 review 完整 plan 結構」與「依 `DC` 並行填充」的能力，**禁止** 此種捷徑。

## 撰寫流程

### 進入點選擇

- 首次為某 design 規劃 plan：從 Phase 1 開始。
- 修改 / 擴充既有 plan：跳過 Phase 1，直接走 Phase 2 的填充任務步驟處理目標檔，最後仍經 Phase 3 gate。

### Phase 1: Skeleton（規劃 plan 結構，sequential）

進入條件：對應 `design.md` 已 commit、使用者確認進入 plan 階段，且該 design 為 `leaf`（`god-view` 目錄 **嚴禁** 出現任何 `plan.md`，由其下層子 design 各自進入 plan 流程）。

1. 定位對應 `design.md`：依 `<DIRS>[-DC.SUBNAME]` 找到（規則見 [name-rules_zhTW.md](name-rules_zhTW.md)）。`leaf` design 必有對應 `plan.md`，且 `plan.md` 必須位於 `design.md` 同一個 `docs/sys/` 之下；缺失即代表功能未實現。
2. 規劃所有 plan 檔案：依 `design.md` 中的 user story、系統面需求、`DC.SUBNAME` 拆分等，列出此 design 需要的所有 plan 檔；命名遵循 [name-rules_zhTW.md](name-rules_zhTW.md)，並 **必須** 加上 `-draft` 暫存後綴：`<DIRS>[-DC.SUBNAME]-plan[-SUBNAME[.SEQUENCE]]-draft.md`。
3. 建立每份 `-draft.md`：檔案實體建立即可（內容可空白或僅含一行 placeholder 標題），**禁止** 在此階段撰寫 SBE 規格等實際內容。
4. 規範校驗：對每份 `-draft.md` 執行 `python <task-decomposition-skill-root>/scripts/check.py <檔案路徑>`，應回報 `PASS-NAME` + `PASS-DRAFT`。**嚴禁** AI 自行比對檔名、路徑，合法性一律以腳本回報為準。
    - 若涉及 `list.md` 或新增 `docs/sys/` 節點，**必須** 對相關 `docs/sys/` 目錄執行 `check.py` 驗證註冊表（`PASS-REGISTRY` / `FAIL-REGISTRY` / `FAIL-CYCLE`）。
5. 暫停等候 skeleton review：**必須** 暫停，等待使用者檢視整個 skeleton 是否完整滿足 `design.md` 的 user story 與系統面需求。
    - 不滿足：回到步驟 2 補上缺漏。
    - 滿足：進入步驟 6。
6. 提交 skeleton：將所有 `-draft.md` commit（依專案既有的提交規範執行）。

### Phase 2: Content（並行填充內容）

進入條件：Skeleton 已 commit。可由單一 agent 或多個 fork agent **並行** 執行（依 `DC` 相依性決定並行範圍）。

fork 觸發條件：當 `DC` 編碼顯示 ≥ 2 個獨立可並行任務（例如同 group 內彼此不相依的多個 plan），**必須** 主動詢問使用者是否啟用 fork agent；fork 動作需使用者明確授權，**禁止** 預設 fork。若未授權，採單 agent 依 `DC` 相依性循序處理。

**單一 `-draft.md` 的填充任務步驟**（每個 fork agent 執行一遍）：

1. 確認 `DC` 相依：依 `DC` 編碼確認此 plan 的前置依賴（高權重位數依賴低權重位數）已完成；前置未完成時 **嚴禁** 開始。
2. 撰寫內容：依下方「文件模板」填寫，以具體 input / output 範例呈現每一個 SBE 行為，**範例同時是實作目標與驗收標準**。
3. Rename：內容完成後將檔名從 `*-draft.md` 改為 `*.md`（移除 `-draft` 後綴）。
4. 規範校驗：對 rename 後的檔案執行 `check.py`，應回報 `PASS-NAME` + `PASS-LINES`（或 `WARN-LINES` 視主題切割決定）。
5. Commit：將該 plan 的內容變更 commit。**不需** 暫停等待逐份 review。

**Phase 2 結束判定**：所有 `-draft.md` 都已 rename 完畢、且全部 plan `check.py` 校驗通過。

**主 agent 責任**：發起 Phase 2 的主 agent（不論是否啟用 fork 子 agent）負責收攏所有任務完成狀態。fork 子 agent 完成個別 plan 後即終止，**不負責** Phase 3 觸發。在所有子 agent 結束、且確認無 `-draft.md` 殘留後（指令見 Phase 3 步驟 1），**主 agent 必須** 進入 Phase 3 gate，**禁止** 沉默等待或讓流程自然停止。

### Phase 3: Implementation Gate（最終確認）

進入條件：Phase 2 結束（無任何 `-draft.md` 殘留）。

1. 確認 `docs/sys/` 內 **無任何 `-draft.md` 殘留**，依執行環境擇一執行：
    - POSIX (bash / zsh)：`find <docs/sys 路徑> -name "*-draft.md"`
    - Windows PowerShell：`Get-ChildItem -Path <docs/sys 路徑> -Filter "*-draft.md" -Recurse`
    - 跨平台：`python -c "import pathlib; [print(p) for p in pathlib.Path('<docs/sys 路徑>').rglob('*-draft.md')]"`
2. 暫停等候最終 review：**必須** 暫停，等待使用者檢視整體 plan 結構與內容。
3. 詢問下一步：**必須** 主動詢問下一步動作（進入實作、還有其他規劃、結束本次任務）；**禁止** 未經同意就自行進入實作。

## 必含要素

- 實作邊界：列出涉及的 package / module / 檔案路徑。
- 介面定義：要新增或修改的 function / type / interface 簽章。
- 系統面需求對應實作：對應 `design.md` 中「系統面需求」的每一項，列出本次採用的實作技術（如以資料庫 unique index 實作冪等、以 scheduler 實作排程、以 distributed lock 防 race 等）。design 為「需要什麼」，plan 為「怎麼做」。
- SBE 規格：每個行為以「Input → Output」格式呈現，範例必須具體可執行。
- 外部依賴：所需的其他 package、外部服務、前置 plan。

## 文件模板

新增或修改 `plan.md` 時依此骨架填寫，章節標題與順序 **嚴禁** 變更，以保持所有 plan 文件格式一致：

````markdown
# <DIRS>[-DC.SUBNAME] plan[-SUBNAME[.SEQUENCE]]

> 對應 design：[<DIRS>[-DC.SUBNAME]-design.md](<相對路徑>)

## 實作邊界

- package / module：<路徑>
- 涉及檔案：<檔案路徑列表>

## 介面定義

<列出新增 / 修改的 function、type、interface 簽章。>

## 系統面需求對應

- <design 系統面需求類別>：<本次採用的實作技術>
- <design 系統面需求類別>：<本次採用的實作技術>

## SBE 規格

### 1. <行為描述>

- Input：<具體可執行的值>
- Output：<具體回傳值與副作用>

### 2. <行為描述>

- Input：...
- Output：...

## 外部依賴

- <依賴的 package / 外部服務 / 前置 plan>
````

## 禁止內容（屬 `design.md` 範疇）

- 重複論述「為什麼要做這個功能」 — 直接引用 `design.md`。
- 抽象的 user story — 應已在對應 `design.md` 中定義。

## SBE 撰寫要點

每組 SBE **必須** 滿足：

1. 具體輸入：給可貼上即可執行的值（如 `userID = "u-12345"`），不寫抽象描述（如 `合法的 userID`）。
2. 具體輸出：明確列出回傳值與副作用（如 `回傳成功；目標儲存層新增一筆紀錄`）。
3. 覆蓋邊界：除 happy path 外，至少包含一組失敗或邊界 case。

## 拆分判斷

當 `check.py` 回報 `WARN-LINES` 時建議拆分（非強制；視主題是否能合理切割）。拆分順序：

1. 首選：以 `SUBNAME` 區分主題 — 例如以 func name 命名（須轉為 snake_case），`<DIRS>-plan-<func_name>.md`；SUBNAME 僅允許 `[a-z0-9_]`，camelCase / kebab-case 皆違規。
2. 次選：同 `SUBNAME` 下再用序列號 — 當單一 `SUBNAME` 內仍有大量 SBE test case，以 `.01`、`.02` 等分檔（SEQUENCE 用 `.NN` 不是 `-NN`）。

## 完成檢查（適用於 Phase 2 每份內容完成的 plan）

- [ ] 對應 `design.md` 存在
- [ ] 每個行為都有具體 input / output 範例
- [ ] design 中每一項「系統面需求」都有對應的實作技術說明
- [ ] 不含「為什麼要做」的抽象論述
- [ ] 已 rename 移除 `-draft` 後綴
- [ ] `check.py` 回報 `PASS-NAME` + `PASS-LINES`，或 `WARN-LINES` 但已合理拆分
- [ ] 若 `design.md` 同步需調整，已完成同步
