# 文件路徑與檔名規範

- 所有文件 **必須** 一律放在某個 `docs/sys/` 底下；當專案已劃分多個獨立 scope 的子模組時，允許分屬各子模組自身的 `docs/sys/`，跨節點以 `list.md` 註冊(
  見下方「多
  docs/sys 註冊」)。
- 這套規範可以利用路徑與檔名呈現清晰的功能結構與執行方針，透過簡潔的資訊便可以勾勒出系統概觀。
- 這套規範下的功能 **嚴禁** 循環相依，藉由清晰的 dependency tree 維持模組獨立性與可重用性。

## 目錄

- 目錄名稱就代表功能的意思概念, 例如 `record/` 表示跟紀錄相關的功能，`record/create/` 表示跟紀錄創建相關的功能，`record/read/` 表示跟紀錄讀取相關的功能，以此類推。
- 巢狀深度不限，但每層目錄名稱 **必須** 只能是小寫英文/數字(`[a-z0-9]`)，**嚴禁** 包含其他符號。
- 目錄命名盡可能簡短，原則上以一個單字能表達最好，若無法以一個單字呈現其含意，有以下幾個做法:
    - 向下拆分目錄(功能)，若有很明顯的上下層功能關聯就 **必須** 往下拆分子目錄來劃分功能。例如 "訂單創建" 這樣一個功能就該拆成
      `order/create/`，而不是想要用 `order_create/` 來處理。
    - 如果是特定領域概念，無法使用一個單字完整表達，則可以使用縮寫來命名，然後在 `.metadata.md` 裡說明縮寫的全名與含義。

## 檔名

以下檔名描述會出現一些關鍵字，定義如下:

- `DIRS` 為路徑中所有目錄名稱以 `-` 串接的結果，因此從檔名就能大致了解功能範圍。例如: `docs/sys/record/create/` 這個路徑的 `DIRS` 就是 `record-create`(
  去掉 `docs/sys/`)。
- `DC` (dependence_code) 為一個固定 4 碼的數字，用來表示這些檔案之間的相依關係，編碼規則如下
    - 以每個位數為一個群組，同群組表示不相依，而 **高權重位數相依低權重位數**。
    - 每個 group 以 `0` 為根，`1-9` 表示該 group 互相不相依可並行的任務，所以意思就是 `1-9` 的任務必須全部完成後，`0` 才能進行。
    - 例如 `1000`, `2000` 為同個 group (千位數)內不相依的任務，這兩個任務可以併發執行。
    - 例如 `1000`, `1100`, `1200` 為同個 group (千位數)，根據 **高權重位數相依低權重位數** 原則解析就是 `1000` 必須依賴 `1100` 與 `1200` 完成，`1000`
      才可以進行，而 `1100` 與 `1200` 可以併發處理。
    - 因此數字從左到右，也代表該功能複雜度從高到低，越靠左的 group 代表越大的功能範圍，而越靠右的 group 代表越小的功能範圍。
    - 這樣設計的好處是發現如果功能太大了，就可以不動其他不相關的檔案命名，直接往下拆分檔案，使用位數更小的數字來做區分，例如本來以為 `1000`
      就可以完成任務，後續分析發現內容太多的話就可以直接拆分成 `1100`、`1200` 等等。
    - 頂層起點固定為千位數 group：一個目錄首次引入 `DC` 編碼時，頂層拆分一律從千位數 group 開始（`1000`、`2000`、`3000`...），**禁止** 直接從百位數或更小開始（如
      `0100`、`0010` 皆違規），百位數以下保留給後續往下拆分時使用。
    - `0000` **嚴禁** 使用，根據上述規則可以歸納出 `0000` 是最頂層整合的文件，一律由無 `DC` 的文件擔任(`<DIRS>-design.md`)，**嚴禁** 出現
      `<DIRS>-0000-design.md`
      這樣命名的文件，此為避免兩種命名同時表達「最頂層」造成混淆。
    - 若 4 碼數字不夠用的話，則表示當前目錄的功能已經 **過大** 了，**必須** 向下拆分子目錄來劃分功能，**嚴禁** 直接增加位數來編碼。
- `SUBNAME` 子名稱，**必須** 只能包含小寫英文/數字/底線(`[a-z0-9_]`)，**嚴禁** 包含其他符號。用於檔名上做次級主題區分。
- `SEQUENCE` 純 2 碼序列號，主要是 `plan.md` 在使用。
- `draft` 為檔案後綴命名，用於表示待規劃/實作的項目。主要用意是可用來記錄有那些東西已規劃但尚未開始，可避免維護額外的 list 紀錄。

### `.metadata.md`

- 用來放這個目錄(功能)一些額外的 metadata，主要是紀錄一些縮寫涵義之類的資訊，**嚴禁** 描述任何關於功能內容。
- 一個目錄下 **必定** 有一個 `.metadata.md`，就算沒有資訊需要描述，也 **必須** 要有該檔案的存在。

### `design.md`

- 此文件受眾是人類，屬 SA 文件，內容為抽象的功能描述，主體為 `user story`，內容也會包含系統面需求（如冪等性、並行控制、排程、注意等）。
- **必須** 嚴格遵守命名規則 `<DIRS>[-DC.SUBNAME]-design[-draft].md`，內容不超過 300 行。
- **必定** 有一個 `<DIRS>-design.md` 頂層文件在每一個目錄下，當該目錄所代表的功能不多時，可以直接由這的頂層文件描述完畢即可。
- 當一個 `<DIRS>-design.md` 頂層文件無法描述完功能內容時 (會超過 300 行)，則使用以下分式處理:
    - 使用 `-DC.SUBNAME` 拆分 `design.md`，在同個目錄拆分多份文件，適用於這些需要被拆分的功能 **已無明確的 scope 分類** 時，就無需硬要分類子目錄規劃功能了。此時
      `<DIRS>-design.md` 頂層文件則擔任 `god-view`，將組合這些 DC 文件來描述功能，本身將不再對應 `plan.md`。
    - 使用子目錄將功能再向下細分，以較高的抽象層收斂設計/實作細節，適用於這些需要被拆分的功能 **有明確的 scope 分類** 時，就可以直接使用子目錄來規劃功能了。此時
      `<DIRS>-design.md` 頂層文件就不一定是 `god-view`，而是同時也可以對應 `plan.md` 來將子目錄功能組裝使用，但依然受限於 `design.md` 300 行限制。

### `plan.md`

- 受眾是 AI agent，屬 SD 文件，內容為具體實作計畫，**必須** 以 `SBE` 呈現規格；每組 input/output 範例同時作為實作目標與驗收標準。
- **必須** 嚴格遵守命名規則 `<DIRS>[-DC.SUBNAME]-plan[-SUBNAME[.SEQUENCE]][-draft].md`，內容不超過 500 行。
- `plan.md` 檔名 prefix 區塊必須與 `design.md` 對應，有拆分 `DC` 時需對應 `<DIRS>-DC.SUBNAME-plan*.md`，無拆分 `DC` 時則對應 `<DIRS>-plan*.md`。
- 當 `<DIRS>-design.md` 頂層文件則擔任 `god-view` 時，此目錄內 **嚴禁** 出現任何 `plan.md` 文件。
- 當 `plan.md` 內容可能需要以 func name 作為實作細節描述時則可以使用 `-SUBNAME` 表示主題，但並不侷限是 func name，視當下實作細節分析而定。
- 當使用了 `-SUBNAME` 劃分多個 `plan.md` 時，若該 plan 會有許多 `SBE` 的 test case 定義導致一個 `plan.md` 會超過 500 行時，**必須** 使用 `SEQUENCE`
  拆分多個文件，例如 `.01`, `.02`, ...等等，以此降低每次一個檔案的實作負擔。

## 多 docs/sys 註冊 (list.md)

- 每個 `docs/sys/` 目錄底下必定有一個 `list.md` 註冊表，儘管沒有內容也必須存在。
- 當專案內部已劃分多個獨立 scope 的子模組時（例如 monorepo 的 submodule、microservice、subsystem、subproject、plugin 等任何具備獨立邊界的內部單位），就可以使用這個註冊機制來分屬各子模組自身的
  `docs/sys/`。
- 當 `design.md` / `plan.md` 的 scope **完全** 屬於某個子模組時，文件就 **必須** 放在該子模組自身的 `docs/sys/` 底下；透過上層的 `list.md` link 到各子模組的
  `docs/sys/`，建立樹狀（或 DAG）的文件層級。
- 每個被註冊的路徑 **必須** 真的存在、為目錄、且以 `docs/sys` 結尾。
- **嚴禁** 循環相依：A 的 list.md 註冊 B，B（或其後代）的 list.md 不得回頭註冊 A 或鏈路上任一節點。
- 同一節點被多處註冊（DAG 共用）允許，不視為循環。
- 整個註冊樹由 `check.py` 驗證（同一腳本同時負責檔案層級的命名 / 行數檢查與註冊表層級的引用 / 循環檢查）。

### `list.md` 內容

````markdown
# docs/sys 註冊表

- [<顯示名稱>](<相對路徑.../docs/sys>)
- [<顯示名稱>](<相對路徑.../docs/sys>)
````

## 範例

### 目錄命名

```
✓ record/
✓ record/create/
✓ record/create/validator/
✓ orderpayment/             ← 純 [a-z0-9] 即可
✗ order_payment/            ← 嚴禁底線，多單字一律向下拆
✗ order-payment/            ← 嚴禁連字號
✗ orderPayment/             ← 嚴禁大寫
```

### DIRS 的生成規則

DIRS 等於 `docs/sys/` 之下、至檔案所在目錄為止，所有目錄名稱以 `-` 串接：

```
docs/sys/record/                    → DIRS = record
docs/sys/record/create/             → DIRS = record-create
docs/sys/order/payment/refund/      → DIRS = order-payment-refund
```

### `.metadata.md` 位置

每個目錄底下 **必定** 有一個 `.metadata.md`（即使無內容也需空檔存在）：

```
docs/sys/
    .metadata.md                ← 必存
    record/
        .metadata.md            ← 必存
        record-design.md
        create/
            .metadata.md        ← 必存
            record-create-design.md
```

### `design.md` 命名

無 `DC` 拆分（單檔即可描述）：

```
docs/sys/record/
    record-design.md            ← DIRS = record
    record-design-draft.md      ← 暫存中（內容尚未撰寫）

docs/sys/record/create/
    record-create-design.md     ← DIRS = record-create
```

有 `DC.SUBNAME` 同層拆分（內容過大但無明確子目錄分類）：

```
docs/sys/record/
    record-design.md            ← god-view 整合（無 DC，永遠存在）
    record-1000.aggregate-design.md     ← DC=1000 SUBNAME=aggregate（依賴 1100 / 1200）
    record-1100.create-design.md        ← 可與 1200 並行
    record-1200.read-design.md          ← 可與 1100 並行
    ✗ record-0000.foo-design.md         ← 嚴禁：0000 與無 DC 主 design 角色重疊
    ✗ record-1000-design.md             ← 嚴禁：DC 出現必須帶 SUBNAME
```

god-view 角色由 `record-design.md` 擔任時，此目錄 **嚴禁** 出現任何 `record-plan*.md`。

### `plan.md` 命名

`plan.md` 檔名 prefix 必須與對應 `design.md` 對應：

```
docs/sys/record/
    record-design.md
    record-plan.md                          ← 對應 record-design.md
    record-plan-create_record.md            ← SUBNAME = create_record
    record-plan-create_record.01.md         ← 同 SUBNAME 下第 1 批 SBE test case
    record-plan-create_record.02.md         ← 同 SUBNAME 下第 2 批 SBE test case
    record-plan-create_record.01-draft.md   ← 暫存中

當 design 有 DC.SUBNAME 拆分時：
    record-1100.create-design.md
    record-1100.create-plan.md              ← 對應 1100.create design
    record-1100.create-plan-validate.md     ← 對應 1100.create design + plan SUBNAME
```

### `DC` 編碼

```
record-1000.integrate-design.md   ← 最大 scope，依賴 1100 與 1200 完成後才能進行
record-1100.create-design.md      ← 子任務，可與 1200 並行
record-1200.read-design.md        ← 子任務，可與 1100 並行

後來發現 1100 內容太多，直接拆為：
    record-1100.create-design.md   → 依賴 1110 與 1120
    record-1110.validate-design.md → 可與 1120 並行
    record-1120.persist-design.md  → 可與 1110 並行
（1200、1000 的命名不受影響）

✗ record-0001.foo-design.md       ← 嚴禁從小位數 group 開始編碼
✗ record-0000.foo-design.md       ← 嚴禁 0000
✗ record-1000-design.md           ← 嚴禁 DC 不帶 SUBNAME
```

### 多 docs/sys 註冊（list.md）

結構範例，project root 聚合兩個子模組的文件節點：

```
project-root/
  docs/sys/
    .metadata.md
    list.md                         ← root 的上帝視角（註冊各子模組）
    system/
      .metadata.md
      system-design.md              ← 跨子模組的系統級設計（必須放在子目錄下，不可直接放在 docs/sys/ 根層）

module-a/
  docs/sys/                         ← module-a 自身的功能設計
    .metadata.md
    list.md                         ← 即使無下游節點也必存（空 bullet 清單即可）

module-b/
  docs/sys/                         ← module-b 自身的功能設計
    .metadata.md
    list.md
```

`project-root/docs/sys/list.md` 內容：

```markdown
# docs/sys 註冊表

- [module-a](../../module-a/docs/sys)
- [module-b](../../module-b/docs/sys)
```

驗證指令：

```
python <task-decomposition-skill-root>/scripts/check.py project-root/docs/sys
```

可能輸出：

```
✓ [PASS-REGISTRY]    project-root/docs/sys — 3 個節點，無循環，所有 list.md 完備
✗ [FAIL-LIST-MISSING] module-a/docs/sys — 缺少 list.md（即使無下游節點也要空檔存在）
✗ [FAIL-CYCLE]       循環相依：project-root/docs/sys -> module-b/docs/sys -> project-root/docs/sys
✗ [FAIL-REGISTRY]    project-root/docs/sys/list.md:3 — 引用路徑不存在 '../../missing/docs/sys'
```

### 檔名校驗錯誤訊息範例

```
✗ [FAIL-NAME]          catalog-design-draft.md — DIRS 不一致：檔名為 'catalog'，路徑推導為 'ecommerce-catalog'
✗ [FAIL-NAME]          record-design.draft.md — 檔名不符 design / plan 命名規範（draft 後綴須為 -draft 不是 .draft）
✗ [FAIL-NAME]          record-0000.foo-design.md — DC 嚴禁使用 '0000'
✗ [FAIL-METADATA]      record-design.md — 同目錄缺少 .metadata.md
✗ [FAIL-GODVIEW-PLAN]  record-plan.md — 同目錄同時存在 DC 拆分 design 與 plan*.md
```
