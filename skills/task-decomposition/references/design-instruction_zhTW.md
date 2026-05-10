# design.md 撰寫指引

> 想先看完整端到端範例（god-view / leaf / draft / DC.SUBNAME 同層拆分），參考 [example_zhTW.md](example_zhTW.md)。
>
> 進入此文件代表：你準備 **新增 / 修改 / 擴充** 任一份 `design.md`。
> design 依 scope 大小分為兩種類型，互相銜接形成「俄羅斯娃娃」式的遞迴拆分：
> 1. `god-view`(上帝視角型)：scope 仍含多個獨立子模組；本層 design 描述輪廓 + 列出子模組（必要 + 擴充），為每個子模組建立 `<child-DIRS>-design-draft.md` 暫存檔；本層
     design **嚴禁** 對應 plan。
> 2. `leaf`(實作型)：scope 不再需要向下拆分子目錄，本層即可撰寫實作型 design 並對應 plan（同層仍可用 `DC.SUBNAME` 拆分為多份 design /
     plan，此時頂層 `<DIRS>-design.md` 視具體角色決定是否對應 plan）；完成後進入 [plan-instruction_zhTW.md](plan-instruction_zhTW.md) 三階段流程。
>
> 任何 `-draft.md` 都是下一輪的起點，遞迴往下直到所有 `leaf` 完成。每完成一層 → commit → 暫停等使用者 review → 取得同意才能進入下一層或下一階段

## 撰寫流程

每份 design 都跑這套流程；步驟 3 / 4 / 8 依 `god-view` / `leaf` 類型分支。

1. 確認 scope 與檔案位置：
    - **前置 gate（舊專案首次引入或新增 scope 時 必跑）**：若使用者未明確指定本次設計要放在哪個 `docs/sys/`，**必須** 先主動盤點並詢問，**禁止** 自行假設位置或自行建立 `docs/sys/`：
        - 盤點專案內現有 `docs/sys/` 節點（root 與所有透過 `list.md` 註冊的子模組節點），列給使用者作為選項。
        - 若專案尚無任何 `docs/sys/`，明確告知並詢問初始位置（放 root、放某個既有子模組、或新建子模組節點）。
        - 詢問本次 scope 應放在哪一個 `docs/sys/`，並視必要進一步詢問是否需在上層 `list.md` 註冊新節點。
        - 等使用者明確指定位置後，才進入下方「新增功能 / 修改 / 從上層接 draft」三條分支判斷。
    - 新增功能：用一句話寫出「這個功能解決什麼問題」。若一句話寫不清楚，本層幾乎肯定是 `god-view`。
        - 依 scope 範圍決定 `docs/sys` 位置：scope 完全屬於某個獨立子模組 → 放該子模組的 `docs/sys/`；scope 跨多個子模組或屬於 root 視角 → 放 root 的
          `docs/sys/`。
        - 邊界判斷：若功能主要屬於某個子模組（粗估 ≥ 80% 的 user story / 系統面需求屬於該模組），即使有少量跨模組互動，仍放在該子模組的 `docs/sys/`；跨模組依賴在
          design 的「前提與限制」章節說明即可。
        - 若新使用某個子模組的 `docs/sys/`，**必須** 在該子模組的 `docs/sys/` 下建立空 `list.md`（即使無下游節點），並在 root 或上層的 `list.md` 註冊該節點（規則見 [name-rules_zhTW.md](name-rules_zhTW.md)）。
        - 接著依 [name-rules_zhTW.md](name-rules_zhTW.md) 在所選 `docs/sys/` 下挑選或新增目錄；新建目錄 **必須** 同時建立 `.metadata.md`（即使無內容，空檔也要存在）。
    - 修改 / 擴充既有：定位目標 `design.md`，確認本次調整仍屬於該 scope；若已超出，回到「新增功能」流程拆出新檔。
    - 從上層 `god-view` 接過來的 `*-design-draft.md`：檔案位置已固定，從步驟 2 開始；**禁止** 預設本層即為 `leaf`，**必須** 重新走步驟 2 的 `god-view` / `leaf`
      判斷（本層仍可能是 `god-view` 需再向下拆分），這就是「俄羅斯娃娃」遞迴拆分的精髓；rename 在步驟 4 觸發。

2. 判斷 design 類型：
    - `god-view`：本層 scope 仍需再向下拆分為獨立的子目錄（每個子模組各自擁有自己的 `docs/sys/<sub>/` 視角，含各自的 design / plan）。判斷依據（任一成立即
      `god-view`）：(a) 能列出 ≥ 2 個彼此職責清楚切分、值得各自獨立子目錄承載的子模組；或 (b) 一句話寫不清楚整體 scope。`god-view` 目錄內 **嚴禁** 出現任何 `plan.md`，本層僅做敘事整合。
    - `leaf`：本層 scope 不需要再向下拆分子目錄，可直接於本層撰寫實作型 design 並對應 plan；若本層內容過多需要同層 `DC.SUBNAME` 拆分時，本層 `<DIRS>-design.md` 退化為 god-view 整合（**不再對應 plan**），plan 全由各 DC 拆檔（`<DIRS>-NNNN.SUBNAME-plan*.md`）各自承接，此種同層拆分不視為向下拆分。判斷依據：再列子模組也僅是 function 級細節，無法形成值得獨立子目錄承載的職責切分。
    - 邊界情況（小型同層拆分）：即使能列出 ≥ 2 個子模組，若整體預估 ≤ 300 行（例如「用戶認證系統」含登入 + 登出兩個簡單 sub-domain），**優先用 `DC.SUBNAME` 拆檔在同層**處理（同層多份 design.md），避免過早建立子目錄；此時本層仍視為 `leaf`。

3. 撰寫內容：
    - `god-view` 流程：
        1. 列出本層子模組，每個分入「必要」或「擴充」：
            - 必要：缺一不可、使本系統 / 模組無法成立的子模組。
            - 擴充：可選的、後續可加入、不影響核心運作的子模組。
        2. Review Gate 1（清單 review，無 artifact）：暫停展示子模組清單給使用者檢視（**此時尚未建立任何檔案**），確認清單完整、必要 /
           擴充劃分正確。不滿足回此步驟修正；滿足後進下一動作。
        3. 依下方「`god-view` 模板」寫入本層 design.md：本層為敘事整合，**禁止** 涉及實作細節；「子模組」一節列必要 + 擴充，每項附 link 至各
           `<child-DIRS>-design-draft.md`。
    - `leaf` 流程：依下方「`leaf` 模板」直接撰寫實質 design 內容，以 user story 為主體，描述「是什麼」與「為什麼」，**完全不涉及程式實作**。

4. 處理子檔 / rename：
    - `god-view`：為每個子模組建立目錄、`.metadata.md`（即使無內容，空檔也要存在）與 `<child-DIRS>-design-draft.md` 暫存檔（檔案實體建立即可，內容空白或僅含一行 placeholder 標題）。`<child-DIRS>` **必須** 是「本層 `DIRS` + 子目錄名」以 `-` 串接的完整結果（例：本層為 `docs/sys/ecommerce/`，子目錄 `catalog/` 的 child-DIRS = `ecommerce-catalog`，檔名為 `ecommerce-catalog-design-draft.md`，**禁止** 寫成 `catalog-design-draft.md`）。若本層需要在同目錄使用 `DC` 拆分而非向下拆子目錄，每份 DC 拆檔 **必須** 同時帶 `SUBNAME`（例：`ecommerce-1000.checkout-design.md`、`ecommerce-2000.fulfillment-design.md`）；命名規則完整定義於 [name-rules_zhTW.md](name-rules_zhTW.md)，由 `check.py` 校驗。
    - `leaf`：若本份是從上層 `-draft.md` 接過來的，rename 移除 `-draft` 後綴。

5. 規範校驗：執行 `python <task-decomposition-skill-root>/scripts/check.py <檔案路徑>`：
    - `god-view`：對本層 design.md（應 `PASS-NAME` + `PASS-LINES`）與每份 child `-draft.md`（應 `PASS-NAME` + `PASS-DRAFT`）逐一驗證；同時驗證所有新建子目錄含 `.metadata.md`（應 `PASS-METADATA`）。
    - `leaf`：對本份 design.md 驗證（應 `PASS-NAME` + `PASS-LINES`）；`FAIL-LINES` **必須** 拆分（見下方「拆分判斷」）。
    - **嚴禁** 自行比對檔名 / 路徑 / 行數，合法性一律以腳本回報為準。
    - 若涉及 `list.md` 或新增 `docs/sys/` 節點，**必須** 額外對相關 `docs/sys/` 目錄執行 `check.py`（`PASS-REGISTRY` / `FAIL-REGISTRY` / `FAIL-CYCLE`）。

6. 提交：將本層 design.md（`god-view` 含所有 child `.draft.md`）commit（依專案既有的提交規範執行）。

7. Review Gate 2（commit 後內容 review）：**必須** 暫停作業，等待使用者確認已 commit 的本層內容（`god-view`：本層 design.md + 所有 child `-draft.md`
   ；`leaf`：本份 design.md）。
    - 使用者要求調整：**回到步驟 1** 重新走流程，再次提交、再次等待。
    - 使用者確認無誤：進入步驟 8。
    - 註：`god-view` 共經過 2 次 review gate（步驟 3 子彈 2 + 本步驟），`leaf` 僅本步驟 1 次。

8. 詢問接續：
    - `god-view`：使用者選擇要進入哪個 / 哪些子模組繼續。對選定的 `<child-DIRS>-design-draft.md`，將其視為下一輪的起點，**遞迴回到步驟 1**，**禁止** 預設子模組為 `leaf`，必須重新走 `god-view` / `leaf` 判斷。**禁止**
      未經同意自行進入子模組。
        - **fork 觸發條件**：當使用者選定 ≥ 2 個子模組同時進行時，**必須** 主動詢問是否啟用 fork agent 平行展開；fork 動作本身需使用者明確授權，**禁止**
          預設 fork。若使用者未指示或未授權 fork，採單 agent 循序處理。
    - `leaf`：**必須** 主動詢問是否接續進入 plan 規劃；**禁止** 未經同意自行進入 plan
      流程。獲得同意後載入 [plan-instruction_zhTW.md](plan-instruction_zhTW.md)，依其三階段流程（Skeleton → Content → Implementation Gate）執行。實作型
      design 必有對應 `plan.md`，缺失即代表功能未實現；`god-view` design 不對應 plan（詳見 SKILL 強相依關係）。

## 必含要素

依類型不同，必含要素分為兩組：

### `god-view` design

- 功能目的：本層 scope 的整體目的（why）。
- User Story：本層 scope 整體層級的使用情境（可較抽象，因細節由子模組各自承接）。
- 系統面需求：本層 scope 整體層級的系統需求（如冪等、並行、排程等跨模組要求）。
- 子模組：列必要 + 擴充模組，每項一句話說明職責，並附 link 至各 `<child-DIRS>-design-draft.md`。

### `leaf` design

- 功能目的：用一段話闡述為何要做這個功能（why）。
- User Story：以「身為 X，我希望 Y，以便 Z」格式條列使用情境（user-facing what）。
- 系統面需求：條列系統層級必須保證的行為（排程、冪等性、並行控制、一致性、失敗復原、效能、稽核、權限等）。描述「需要什麼」，不描述「怎麼做」。若無相關需求寫「無」。
- 驗收條件：人類可讀的「達成何種狀態即視為完成」（done definition）。
- 前提與限制：明確列出設計的依賴條件與邊界假設。

## 文件模板

依類型挑對應模板填寫，章節標題與順序 **嚴禁** 變更，以保持所有 design 文件格式一致。

### `god-view` design 模板

````markdown
# <DIRS>[-DC.SUBNAME] design (god-view)

## 功能目的

<本層 scope 的整體目的，一段話。>

## User Story

- 身為 <角色>，我希望 <整體目標>，以便 <整體效益>。
- 身為 <角色>，我希望 <整體目標>，以便 <整體效益>。

## 系統面需求

- <類別>：<本層整體要求>
- <類別>：<本層整體要求>

## 子模組

### 必要

- [<子模組名>](<相對路徑/<child-DIRS>-design-draft.md>) — <一句話說明該模組職責>
- [<子模組名>](<相對路徑/<child-DIRS>-design-draft.md>) — <一句話說明該模組職責>

### 擴充

- [<子模組名>](<相對路徑/<child-DIRS>-design-draft.md>) — <一句話說明該模組職責>
- [<子模組名>](<相對路徑/<child-DIRS>-design-draft.md>) — <一句話說明該模組職責>
````

### `leaf` design 模板

````markdown
# <DIRS>[-DC.SUBNAME] design

## 功能目的

<一段話說明此功能解決什麼問題、為何要做。>

## User Story

- 身為 <角色>，我希望 <行為>，以便 <效益>。
- 身為 <角色>，我希望 <行為>，以便 <效益>。

## 系統面需求

- <類別>：<具體要求>
- <類別>：<具體要求>

## 驗收條件

- <可被人類驗證的完成狀態 1>
- <可被人類驗證的完成狀態 2>

## 前提與限制

- <依賴條件、邊界假設或不在 scope 內的事項>
````

## 禁止內容（屬 `plan.md` 範疇）

- 程式語言、framework、套件、函式、介面名稱。
- 資料結構、API 路徑、資料庫 query 語法。
- 具體 input / output 範例（屬於 SBE，寫在 `plan.md`）。
- 達成「系統面需求」的具體實作技術（如以資料庫 unique index 實作冪等、以 scheduler 實作排程、以 distributed lock 防 race 等）。系統面需求只描述要求本身，實作方式寫在
  `plan.md`。

## 拆分判斷

當 `check.py` 回報 `FAIL-LINES` 時 **必須** 拆分（`leaf` 才會觸發；`god-view` 因僅敘事整合通常不會超標）。拆分順序：

1. 首選：向下拆子目錄 — 若功能可清楚劃分為多個獨立 sub-domain（此時本層通常會轉為 `god-view`）。
2. 次選：同層 `DC.SUBNAME` 拆檔 — 若 sub-domain 不易劃分但內容仍可分組，使用 `DC.SUBNAME` 編碼（每份 DC 拆檔必須附帶 SUBNAME），規則見 [name-rules_zhTW.md](name-rules_zhTW.md)。

## 完成檢查

- [ ] `check.py` 回報 `PASS-NAME` + `PASS-LINES`（`leaf`）或 `PASS-NAME` + `PASS-LINES` + 所有 child `PASS-DRAFT`（`god-view`）
- [ ] 全文無任何程式實作細節
- [ ] `god-view`：所有列出的子模組都已建立目錄、`.metadata.md` 與 `<child-DIRS>-design-draft.md`
- [ ] `god-view`：本目錄內無任何 `plan.md`（god-view 嚴禁對應 plan）
- [ ] `leaf`：已主動詢問使用者是否接續進入 plan 規劃（對應 `plan.md` 進入 [plan-instruction_zhTW.md](plan-instruction_zhTW.md) 後處理，不在本份 design
  完成檢查範圍內）
- [ ] 若是從 `*-draft.md` 接過來，已 rename 移除 `-draft` 後綴
