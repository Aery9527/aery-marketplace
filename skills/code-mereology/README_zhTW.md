# code-mereology

一套開發流程，它唯一的規格文件是設計文件；長期產出是測試、實作程式碼與選配的效能紀錄，另可用暫存的延後變更 plan 保留日後才要做的工作。名字取自 mereology（部分整體論）——研究「部分與整體關係」的學問；「一個模組是某物的一部分」與「它只是依賴某物」之間的區別，貫穿了它整個文件模型。

## 快速導覽

- [它解決什麼問題](#它解決什麼問題)
- [四個階段](#四個階段)
- [文件模型](#文件模型)
- [檔名規則](#檔名規則)
- [值得知道的決策](#值得知道的決策)
- [規則放在哪裡](#規則放在哪裡)

---

## 它解決什麼問題

設計文件會腐爛。它描述某個東西怎麼運作，程式碼往前走了，一年後沒有人信任那份文件到願意打開它。

這個 skill 的解法是：讓文件可能寫錯的東西變少。設計文件說明一個模組做什麼、擁有什麼職責、有哪些要注意的地方——但從不說明它怎麼做到。介面是指向真實程式碼的 Markdown link，而不是它的複本。行為由測試釘住，而不是由散文描述。留在文件裡的，是變動最慢的那一部分。

這裡沒有長期保存的實作計畫或獨立 SBE 文件。暫存的 `sd-*-plan.md` 可以用個別條目保留一個以上延後中的提案，但沒有一筆是現行設計或已確認規格，每筆條目在自己交付後就會個別刪除。凍結後的範例只活在失敗測試裡——測試無法在不變紅的情況下與程式碼脫節。

[返回開頭](#快速導覽)

---

## 四個階段

每個階段各自獨立載入。每個階段都寫明動手之前需要什麼、自己會產出什麼，因此任一階段都能在沒有前置脈絡的情況下接手。

```mermaid
flowchart TD
    Design["Phase 1 — modular design<br/>documents and module boundaries"]
    Spec["Phase 2 — SBE as failing tests<br/>examples become red tests"]
    Build["Phase 3 — implementation<br/>turn them green, one at a time"]
    Measure["Phase 4 — performance<br/>optional, any time later"]
    Plan["Deferred change plan<br/>temporary intent outside the phases"]

    Plan -.->|"user chooses to execute"| Design
    Design -->|"user confirms each document"| Spec
    Spec -->|"user confirms the failing tests"| Build
    Build -.->|"if it is worth measuring"| Measure

    classDef gated stroke:#1f6feb,stroke-width:2px
    classDef optional stroke:#797979,stroke-width:2px,stroke-dasharray:4 2
    class Design,Spec,Build gated
    class Measure,Plan optional
```

兩條實線箭頭是使用者的 gate。agent 嚴禁靠自己的判斷跨過它們：使用者必須確認每一份文件，才能往下打開它的模組；必須確認那組失敗的測試，才能寫下第一行實作。

Phase 2 與 Phase 3 是每個 leaf 模組各跑一輪，而不是整棵樹跑一輪。

[返回開頭](#快速導覽)

---

## 文件模型

文件分兩層下降。主題層說明「組裝起來的整體交付什麼」，模組層說明「單一組件做什麼、邊界在哪」。讀者從主題進入，再往下走到組件。

```mermaid
flowchart TD
    subgraph TopicLayer["Topic layer — under docs/"]
        RootBd["bd-checkout.md"]
        SubBd["bd-payment.md"]
    end

    subgraph ModuleLayer["Module layer — beside the code"]
        Overview["sd-payment.md — overview"]
        Charge["sd-charge.md — leaf"]
        Risk["sd-risk.md — leaf"]
        Code["charge.go"]
    end

    RootBd --> SubBd
    SubBd --> Overview
    Overview --> Charge
    Overview --> Risk
    Charge --> Code
    Charge -.->|"depends on"| Risk

    classDef topic stroke:#1f6feb,stroke-width:2px
    classDef module stroke:#2ea043,stroke-width:2px
    classDef code stroke:#797979,stroke-width:2px,stroke-dasharray:4 2
    class RootBd,SubBd topic
    class Overview,Charge,Risk module
    class Code code
```

實線箭頭是組成——一個節點由什麼構成。虛線箭頭是依賴——一個模組需要別處提供什麼能力。依賴不等於組成，因此 `sd-charge.md` 即使連了出去，它仍然是 leaf。

Phase 3 會從它剛實作完的 leaf 沿這張圖反向回溯，所以每一條邊都必須是真實的連結，而不是靠語意暗示的關係。

[返回開頭](#快速導覽)

---

## 檔名規則

| 檔名 | 位置 | 主題 |
|------|------|------|
| `bd-<主題>.md` | scope 根目錄下的 `docs/` | 組裝起來的整體交付什麼——一項業務需求、一段架構說明、一條端到端的 data flow |
| `sd-<功能>.md` | 與它所描述的程式碼放在一起 | 單一模組：它的職責、邊界與注意事項 |
| `sd-<功能>-plan.md` | 與既有設計文件放在一起 | 預計日後執行的暫存工作，每份檔案可有多筆以 `---` 分隔的條目；不在文件圖中，各筆條目交付後個別刪除 |
| `sd-<功能>-perf.md` | 與它所量測的程式碼放在一起 | 最近三次的效能量測結果，每筆釘在一個 commit 上 |

monorepo 採用同一模型的巢狀結構：repository 根目錄一個 `docs/` 說明各 submodule 如何組裝，每個 submodule 根目錄再各有一個說明自己內部。

[返回開頭](#快速導覽)

---

## 值得知道的決策

以下是第一次讀規則時最可能感到意外的幾個選擇。

**凍結後的範例只存在於測試。** 延後的條目可以先帶著提案用的暫時範例，但 Phase 2 必須重新驗證，並把確認後的案例寫成失敗測試。該筆條目隨後會被刪除，不會留下第二個真相來源。

**延後 plan 是意圖，不是規格。** 它可以不被任何文件連結，等到使用者選擇執行。執行時仍必須通過正常的設計與測試 gate；工作與設計文件一致後，該筆條目就刪除。

**plan 的每筆條目先寫為什麼，才寫要做什麼。** 設計文件交付後仍會不斷收到新的變更需求，因此一份 plan 檔案可能裝著好幾筆在不同時間點記下、以 `---` 分隔的條目。每筆條目開頭都要寫促成它的需求——單看 delta，等到當時的情境被遺忘後，後續讀者無從判斷它是否還值得執行。

**設計文件上限 300 行，圖不計入。** 超過就代表這個模組承載太多，唯一容許的反應是把它切開——為了塞進上限而壓縮敘述是明文禁止的。

**由使用者刪減測試，而不是勾選清單。** 判斷具體的 input 與 output 比判斷對它們的抽象描述更容易，因此拿來檢視的是測試本身，而不是一份逐項打勾的案例清單。

**每個測試檔都在檔頭註解寫出自己所屬的設計文件。** 靠「文件就放在程式碼旁邊」來推斷擁有者，一路可行到某個資料夾多出第二份設計文件為止，然後它就無聲失效。

**既有模組是一次補一個能力面。** 當新功能依賴到一份沒有設計文件的程式碼時，解法不是先把那整個模組寫完，而是一份只涵蓋被依賴能力面、並標記為 partial 的 leaf。它一次長一個能力面——Phase 2 不肯替一個文件尚未涵蓋的行為定規格——直到最後一面也寫完，標記就拿掉。

[返回開頭](#快速導覽)

---

## 規則放在哪裡

本檔案是概覽。agent 實際遵循的規則在 [SKILL_zhTW.md](SKILL_zhTW.md) 以及它路由過去的各階段 reference：

- [Phase 1 — 模組化設計](references/phase1-design_zhTW.md)
- [Phase 2 — SBE 落成失敗測試](references/phase2-sbe_zhTW.md)
- [Phase 3 — 實作](references/phase3-tdd_zhTW.md)
- [Phase 4 — 效能驗證](references/phase4-benchmark_zhTW.md)

另有三支腳本支援這套流程：[count_lines.py](scripts/count_lines.py) 負責行數上限，[list_planned.py](scripts/list_planned.py) 負責列出目標尚未存在的連結，[list_plans.py](scripts/list_plans.py) 負責列出 repository 中仍存在的延後 plan。

[返回開頭](#快速導覽)
