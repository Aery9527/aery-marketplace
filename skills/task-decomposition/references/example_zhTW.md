# 完整範例：訂單系統 `order`

> 本範例以「建立一個訂單系統，買家能下單、查詢與取消訂單」為情境，從零開始走完
> god-view → leaf → plan 全鏈路，並涵蓋 `-draft` 暫存、`.metadata.md`、`list.md`、
> `DC.SUBNAME` 同層拆分等所有機制。所有命名以 `check.py` 驗證為準。
>
> **技術中立聲明**：本 skill 為通用型規範，不限定程式語言、framework 或儲存層。
> 範例為了讓 SBE / 實作邊界 / 介面定義具體可讀，採用了某種 Go + 文件型資料庫的
> 風格作為示意；實際使用此 skill 時請依專案實際技術棧自行替換（例如 Java + RDBMS、
> Python + Redis、Rust + 自訂 storage 等皆可）。

## 場景描述

- 一句話：買家可建立訂單、查詢自己訂單、取消尚未付款的訂單。
- scope：`order` 為 god-view，含 `create` / `read` / `cancel` 三個必要子模組。
- 假設目前 `create` 已完成 design + plan + review（已走完六階段），`read` 仍是
  god-view 建立的暫存 draft，`cancel` 進入 leaf 後因內容過多用 `DC.SUBNAME` 同層拆分
  並完成 plan，其中 1100 的 review 已寫完、1200 的 review 仍為 draft。

## 完整目錄樹

```
docs/sys/
    .metadata.md
    list.md
    order/
        .metadata.md
        order-design.md                                     ← god-view（本層敘事 + 子模組清單）
        create/
            .metadata.md
            order-create-design.md                          ← leaf
            order-create-plan-add_item.md                   ← plan（func 主題）
            order-create-plan-add_item-review.md            ← Phase 3 review；Phase 4 已追加 ## 主 agent 決議
            order-create-plan-submit.md                     ← plan（func 主題）
            order-create-plan-submit-review.md              ← 對應 submit plan 的 review
            order-create-plan-submit.01.md                  ← plan（同 SUBNAME 第 1 批 SBE）
            order-create-plan-submit.01-review.md           ← 對應 .01 那一批的 review
            order-create-plan-submit.02.md                  ← plan（同 SUBNAME 第 2 批 SBE）
            order-create-plan-submit.02-review-draft.md     ← .02 的 review 尚未開始
        read/
            .metadata.md
            order-read-design-draft.md                      ← 尚未撰寫的暫存
        cancel/
            .metadata.md
            order-cancel-design.md                          ← god-view（同層 DC 整合）
            order-cancel-1000.aggregate-design.md           ← 整合（依賴 1100 / 1200）
            order-cancel-1100.refund-design.md              ← 可與 1200 並行
            order-cancel-1200.notify-design.md              ← 可與 1100 並行
            order-cancel-1100.refund-plan.md                ← 對應 1100.refund
            order-cancel-1100.refund-plan-review.md         ← 對應 1100.refund plan 的 review
            order-cancel-1200.notify-plan.md                ← 對應 1200.notify
            order-cancel-1200.notify-plan-review-draft.md   ← 1200 review 尚在 draft
```

註：`order-cancel-design.md` 因採同層 DC 整合，本層擔任 god-view 角色，故本目錄
內 **嚴禁** 出現 `order-cancel-plan*.md`；plan 全由 `order-cancel-1100.*` 與
`order-cancel-1200.*` 承接。

## 各檔案內容

### `docs/sys/.metadata.md`

```markdown
# docs/sys metadata

> 本目錄為專案 root 的 docs/sys，無領域縮寫需要紀錄。
```

### `docs/sys/list.md`

```markdown
# docs/sys 註冊表

<!-- 本範例為單倉庫示意；若有獨立子模組節點，逐行加入：
- [module-a](../../module-a/docs/sys)
-->
```

### `docs/sys/order/.metadata.md`

```markdown
# order metadata

- order：訂單，買家對商品的一次採購意圖紀錄。
```

### `docs/sys/order/order-design.md`（god-view）

````markdown
# order design (god-view)

## 功能目的

提供買家從建立、查詢到取消訂單的端到端流程，作為交易系統的訂單主軸。

## User Story

- 身為買家，我希望能建立訂單，以便完成商品採購意圖的紀錄。
- 身為買家，我希望能查詢自己訂單，以便追蹤狀態與歷史。
- 身為買家，我希望能取消未付款訂單，以便撤回採購意圖。

## 系統面需求

- 一致性:訂單 ID 全域唯一,任何階段不得產生重複。
- 冪等性:同一筆建立請求重送不得產生第二筆訂單。
- 稽核:所有訂單狀態轉換需可追蹤。

## 子模組

### 必要

- [create](create/order-create-design.md) — 建立訂單與商品項目快照。
- [read](read/order-read-design-draft.md) — 依買家查詢訂單。
- [cancel](cancel/order-cancel-design.md) — 取消未付款訂單並觸發後續退款 / 通知。

### 擴充

<!-- 例如 split / merge / refund_partial 等可後續加入,目前 MVP 不在 scope 內 -->
````

### `docs/sys/order/create/order-create-design.md`（leaf）

````markdown
# order-create design

## 功能目的

讓已登入買家建立一筆新訂單，記錄商品項目與當下價格快照。

## User Story

- 身為買家，我希望能將購物車內商品轉為訂單，以便進行後續結帳。
- 身為買家，我希望訂單建立後立即看到訂單編號，以便回頭查詢。

## 系統面需求

- 冪等性:同一個 client request id 重送只會產生一筆訂單。
- 一致性:訂單建立後立即可被同一買家查詢到。
- 稽核:訂單建立事件需保留時間戳與來源 IP。

## 驗收條件

- 買家送出建立請求後,可在 1 秒內收到訂單編號。
- 同一個 client request id 重送 N 次,系統只回應同一筆訂單編號。
- 商品項目 quantity 為 0 或負數時,整筆建立請求被拒絕。

## 前提與限制

- 買家已登入(account 模組已完成 user 驗證)。
- 商品價格與庫存由 catalog 模組提供,本模組僅做訂單面紀錄。
- 不在 scope:付款流程、庫存扣減,各由獨立模組處理。
````

### `docs/sys/order/create/order-create-plan-add_item.md`

````markdown
# order-create plan-add_item

> 對應 design：[order-create-design.md](order-create-design.md)

## 實作邊界

- package / module：`order/create`
- 涉及檔案：`order/create/item.go`、`order/create/item_test.go`

## 介面定義

- `func AddItem(ctx, draftOrderID, skuID, quantity) error`

## 系統面需求對應

- 一致性：以儲存層 transaction 包裹「讀 draft order + 寫 item」確保不被併發干擾。

## SBE 規格

### 1. 將商品加入 draft 訂單

- Input：`draftOrderID = "ord-d-001"`、`skuID = "sku-001"`、`quantity = 2`
- Output：回傳 `nil`；儲存層 `order_drafts` 集合對 `ord-d-001` 新增一筆 item `{sku:"sku-001", qty:2}`

### 2. 同一商品再次加入

- Input：既有 item `sku-001 qty=2`；再次 `AddItem(skuID="sku-001", quantity=3)`
- Output：回傳 `nil`；該 item 數量更新為 `5`，**不**新增第二筆 item

### 3. 數量為 0 視為非法

- Input：`quantity = 0`
- Output：回傳 `ErrInvalidQuantity`；draft 訂單內容不變

## 外部依賴

- 儲存層 `order_drafts` collection
````

### `docs/sys/order/create/order-create-plan-submit.md`（含 `.SEQUENCE` 拆分）

當 SBE test case 過多時，以 `.NN` 序列號分批；本檔負責主敘事 + 模板，實際 case
分到 `.01` / `.02`。

````markdown
# order-create plan-submit

> 對應 design：[order-create-design.md](order-create-design.md)
> SBE test case 拆分至 [order-create-plan-submit.01.md](order-create-plan-submit.01.md)
> 與 [order-create-plan-submit.02.md](order-create-plan-submit.02.md)。

## 實作邊界

- package / module：`order/create`
- 涉及檔案：`order/create/submit.go`、`order/create/submit_test.go`

## 介面定義

- `func Submit(ctx, draftOrderID, clientRequestID) (orderID, error)`

## 系統面需求對應

- 冪等性：以儲存層 unique index `client_request_id` 實作；重複送入時讀既有紀錄回傳同一 orderID。
- 稽核：寫入 `order_audit` 紀錄表，記錄時間戳與來源 IP。

## SBE 規格

> 本檔僅列代表 case；完整 happy path 在 `.01`，邊界 / 失敗 case 在 `.02`。

## 外部依賴

- 儲存層 `orders`、`order_audit` 紀錄表
````

### `docs/sys/order/create/order-create-plan-add_item-review.md`（已含 Phase 4 主 agent 決議）

````markdown
# order-create plan-add_item review

> 對應 plan：[order-create-plan-add_item.md](order-create-plan-add_item.md)
> 對應 design：[order-create-design.md](order-create-design.md)

## 審查摘要

整體 SBE 覆蓋 happy path 與一個 invalid quantity 邊界 case；唯獨對「同一商品再次加入」的 race 行為缺少並發場景的明確規範，建議補一組 SBE。

## 發現與建議

### 1. 並發加入同一商品

- 觀察：plan 已用 transaction 包裹「讀 draft + 寫 item」，但 SBE 未呈現兩個 concurrent AddItem 同時對同一 sku 加入時的預期結果。
- 建議：補一組 SBE — 兩個 goroutine 同時呼叫 `AddItem(sku-001, +2)`，預期 quantity 最終為 +4（不是部分覆蓋），任一方不得回傳 ErrConflict。
- 影響範圍：僅本 plan。

### 2. 數量上限未定義

- 觀察：plan 只拒絕 quantity = 0；對極大值（如 INT_MAX）行為未定義。
- 建議：與 catalog 模組對齊上限 1000，超過回 ErrInvalidQuantity。
- 影響範圍：也需動到 design（catalog 邊界假設需補充）。

## 主 agent 決議

### 1. 並發加入同一商品

- 決議：accept-modify-plan
- 理由：plan 既已用 transaction 處理，補上對應 SBE 才能讓實作 / 驗收一致。
- 套用動作：在「SBE 規格」中新增第 4 組 case「並發 AddItem 同一 sku」，input 為兩個 goroutine 同時 +2、output 為最終 qty=+4 且皆回傳 nil。

### 2. 數量上限未定義

- 決議：accept-modify-design
- 理由：上限屬於 catalog 與 order 之間的邊界假設，應先在 design 的「前提與限制」明確列出後，再讓 plan 對應實作。
- 套用動作：（轉 design 流程處理，本 Phase 5 不套用）
````

### `docs/sys/order/cancel/order-cancel-design.md`（同層 DC 整合 god-view）

````markdown
# order-cancel design (god-view)

## 功能目的

讓買家取消未付款訂單，並觸發退款（若已預授權）與通知。

## User Story

- 身為買家，我希望能取消未付款訂單，以便撤回採購意圖。

## 系統面需求

- 一致性：退款與通知需在訂單狀態轉為 cancelled 之後才執行。
- 失敗復原：通知失敗不應 rollback 訂單取消狀態。

## 子模組（同層 DC 整合）

本模組以 `DC.SUBNAME` 同層拆分，因 refund / notify 屬同 scope 但敘事過長：

- [order-cancel-1000.aggregate-design.md](order-cancel-1000.aggregate-design.md) — 取消主流程，依賴 1100 與 1200 完成後才能進行。
- [order-cancel-1100.refund-design.md](order-cancel-1100.refund-design.md) — 退款執行細節，可與 1200 並行。
- [order-cancel-1200.notify-design.md](order-cancel-1200.notify-design.md) — 通知執行細節，可與 1100 並行。
````

註：DC 整合 design 自身擔任 god-view 角色時，本目錄內 **嚴禁** 出現
`order-cancel-plan*.md`；plan 一律對應到 `order-cancel-1100.refund-plan.md` 與
`order-cancel-1200.notify-plan.md`。

## check.py 驗證輸出範例

```bash
python <SKILL_ROOT>/scripts/check.py \
    docs/sys/order/order-design.md \
    docs/sys/order/create/order-create-design.md \
    docs/sys/order/create/order-create-plan-submit.01.md \
    docs/sys/order/create/order-create-plan-add_item-review.md \
    docs/sys/order/create/order-create-plan-submit.02-review-draft.md \
    docs/sys/order/read/order-read-design-draft.md \
    docs/sys/order/cancel/order-cancel-1100.refund-design.md \
    docs/sys/order/cancel/order-cancel-1200.notify-plan-review-draft.md \
    docs/sys
```

預期輸出（每行一條校驗結果）：

```
[PASS-NAME] docs/sys/order/order-design.md (design) DIRS='order'
[PASS-METADATA] docs/sys/order/order-design.md — 同目錄 .metadata.md 存在
[PASS-LINES] docs/sys/order/order-design.md (design) 35/300 行

[PASS-NAME] docs/sys/order/create/order-create-design.md (design) DIRS='order-create'
[PASS-METADATA] docs/sys/order/create/order-create-design.md — 同目錄 .metadata.md 存在
[PASS-LINES] docs/sys/order/create/order-create-design.md (design) 28/300 行

[PASS-NAME] docs/sys/order/create/order-create-plan-submit.01.md (plan) DIRS='order-create'
[PASS-METADATA] docs/sys/order/create/order-create-plan-submit.01.md — 同目錄 .metadata.md 存在
[PASS-LINES] docs/sys/order/create/order-create-plan-submit.01.md (plan) 120/500 行

[PASS-NAME] docs/sys/order/create/order-create-plan-add_item-review.md (review) DIRS='order-create'
[PASS-METADATA] docs/sys/order/create/order-create-plan-add_item-review.md — 同目錄 .metadata.md 存在
[PASS-LINES] docs/sys/order/create/order-create-plan-add_item-review.md (review) 48/500 行

[PASS-NAME] docs/sys/order/create/order-create-plan-submit.02-review-draft.md (review, draft) DIRS='order-create'
[PASS-METADATA] docs/sys/order/create/order-create-plan-submit.02-review-draft.md — 同目錄 .metadata.md 存在
[PASS-DRAFT] docs/sys/order/create/order-create-plan-submit.02-review-draft.md — 暫存檔，內容尚未撰寫，完成後 rename 移除 -draft 後綴

[PASS-NAME] docs/sys/order/read/order-read-design-draft.md (design, draft) DIRS='order-read'
[PASS-METADATA] docs/sys/order/read/order-read-design-draft.md — 同目錄 .metadata.md 存在
[PASS-DRAFT] docs/sys/order/read/order-read-design-draft.md — 暫存檔，內容尚未撰寫，完成後 rename 移除 -draft 後綴

[PASS-NAME] docs/sys/order/cancel/order-cancel-1100.refund-design.md (design) DIRS='order-cancel'
[PASS-METADATA] docs/sys/order/cancel/order-cancel-1100.refund-design.md — 同目錄 .metadata.md 存在
[PASS-LINES] docs/sys/order/cancel/order-cancel-1100.refund-design.md (design) 60/300 行

[PASS-NAME] docs/sys/order/cancel/order-cancel-1200.notify-plan-review-draft.md (review, draft) DIRS='order-cancel'
[PASS-METADATA] docs/sys/order/cancel/order-cancel-1200.notify-plan-review-draft.md — 同目錄 .metadata.md 存在
[PASS-DRAFT] docs/sys/order/cancel/order-cancel-1200.notify-plan-review-draft.md — 暫存檔，內容尚未撰寫，完成後 rename 移除 -draft 後綴

[PASS-REGISTRY] docs/sys — 1 個節點，無循環，所有 list.md 完備
```

## 從本範例看遞迴拆分軌跡

1. `order` 一句話寫得清楚但仍含 ≥ 2 個獨立子目錄 → `god-view`，建立 `create/` / `read/` / `cancel/` 三個 `<child-DIRS>-design-draft.md`。
2. 進入 `create` 重新判斷：scope 不再需要向下拆分子目錄 → `leaf`，撰寫 design 後進入 plan 三階段流程。
3. 進入 `read` 因尚未啟動撰寫，保留 `-draft` 後綴。
4. 進入 `cancel` 重新判斷：refund / notify 不易劃分為獨立子目錄但內容過多 → 採同層 `DC.SUBNAME` 拆分，本層 design 退化為敘事整合（god-view），plan 由 1100 / 1200 各自承接。

每一層都跑：拆 scope → 用一句話確認 → 寫 design → `check.py` → commit → review → 再決定下一層。
