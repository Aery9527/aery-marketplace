---
name: engineering-principles
description: 軟體設計與架構的核心守則速查 —— 涵蓋 SOLID、CUPID、code-level 原則、架構層 HA / 容錯模式、Observability 與工程哲學。當使用者要做 system design、code review、重構、技術選型、模組切分、API 設計、微服務拆分、評估技術債，或討論可維護性、可擴展性、高可用性時都應載入這個 skill。即使使用者沒明確說「設計原則」，只要任務牽涉到「怎麼寫才好」、「架構怎麼切」、「為什麼要這樣寫」這類設計判斷，也應主動參照。
---

# Engineering Principles

語言無關的軟體設計守則。預設讀者是經驗豐富的工程師 —— 只列項目與決策規則，不解釋基礎概念，不放長例子。

## 快速導覽

- [0. 核心心態（先於一切）](#0-核心心態先於一切)
- [1. Agent 套用規則](#1-agent-套用規則)
- [2. Code-Level 原則](#2-code-level-原則)
- [3. 架構層級](#3-架構層級)
- [4. 可維運性（Operability）](#4-可維運性operability)
- [5. 安全與韌性](#5-安全與韌性)
- [6. 開發流程紀律](#6-開發流程紀律)
- [7. 套用判準（Decision Framework）](#7-套用判準decision-framework)
- [8. Review Checklist](#8-review-checklist)
- [9. Anti-Patterns 警示](#9-anti-patterns-警示)

---

## 0. 核心心態（先於一切）

- 原則是工具不是教條。先看 context（規模、團隊、生命週期、風險），再決定套用強度。
- 過早抽象比重複更糟。複雜度由需求驅動，不由「未來可能會用到」驅動。
- 任何違反原則的決定必須是「明確選擇」而非「沒想過」。
- 讀的次數遠多於寫的次數。一切設計以可讀性與可變更性為終極指標。

[返回開頭](#快速導覽)

---

## 1. Agent 套用規則

- 預設選擇最簡單、可讀、可驗證的方案；不要為了展示設計能力而增加結構。
- 先沿用專案既有 pattern、命名、錯誤處理與測試風格；只有既有做法明顯阻礙需求時才局部改善。
- 不為未證實的未來需求預先引入 abstraction、interface、framework、background job、cache 或 event system；但在明確架構邊界、外部副作用邊界、測試替身需求或已知多實作場景，應使用小而穩定的 interface。
- 行為變更必須可測試或可驗證；不可只改實作而不確認對外行為。
- 錯誤處理不得 silent fallback、broad catch、吞錯或偽裝成功；錯誤要依專案慣例向上傳遞、記錄或回報。
- 外部輸入、I/O、network、database、time、randomness 都是邊界；邊界要驗證、timeout、可觀測。
- 當 correctness、simplicity、maintainability、performance、extensibility 衝突時，優先序為：correctness → simplicity → maintainability → performance → extensibility。
- 只重構與當前任務強相關的區域；不要把「順手改善」擴張成無邊界重寫。

[返回開頭](#快速導覽)

---

## 2. Code-Level 原則

### SOLID
- **SRP** — 一個 class 只能有一個改變的理由。
- **OCP** — 對擴展開放、對修改封閉。
- **LSP** — 子類必須能無痛替換父類；違反就代表繼承關係錯了。
- **ISP** — 介面要小而專，不強迫 client 依賴用不到的方法。
- **DIP** — 高低層皆依賴抽象，靠 DI 注入實作。

### 通用準則
- **DRY** — 重複的是「知識」而非「形狀」。
- **KISS / YAGNI** — 簡單優先；不寫推測性需求。
- **SoC** — 不同關注點分離。
- **High Cohesion, Low Coupling** — 一切設計的根本指標。
- **Law of Demeter** — 只跟直接朋友說話。
- **Composition over Inheritance**。
- **Tell, Don't Ask** — 命令物件做事，不查狀態後在外面下決定。
- **Fail Fast** — 錯誤越早暴露越好，不靜默吞錯。
- **Principle of Least Astonishment** — 行為不違反讀者直覺。
- **Encapsulate What Varies** — 隔離易變部分。
- **Pure Function 優先** — 副作用集中、邊界明確。

### 替代視角
- **CUPID**（Dan North）— Composable / Unix philosophy / Predictable / Idiomatic / Domain-based。從規則導向轉為特質導向。
- **GRASP**（Larman）— Information Expert、Creator、Controller、Low Coupling、High Cohesion、Polymorphism、Pure Fabrication、Indirection、Protected Variations。

[返回開頭](#快速導覽)

---

## 3. 架構層級

### 結構性原則
- **12-Factor App** — 雲原生服務的部署 / 設定 / 狀態紀律。
- **Stateless Services** — 狀態外移，利於水平擴展與容錯。
- **DDD** — Bounded Context、Aggregate、Ubiquitous Language。
- **Hexagonal / Clean / Onion Architecture** — domain 與 infrastructure 解耦。
- **Event-Driven / CQRS / Event Sourcing** — 適用於高吞吐、審計、複雜狀態演進場景。
- **API 紀律** — 版本化、向後相容、明確錯誤語義、契約測試。
- **Schema-First** — 介面契約先於實作。

### 分散式系統認知
- **CAP** — 分區發生時 C 與 A 必擇其一，必須有意識。
- **PACELC** — 無分區時仍要在 Latency 與 Consistency 間取捨。
- **Idempotency** — 任何可重試操作的前提。
- **Exactly-once 是幻覺** — 設計為 at-least-once + idempotent。
- **Backpressure** — 上游必須能感知下游壅塞。
- **Clock Skew / Ordering** — 不假設多節點時間一致；必要時用 logical clock。

### 容錯模式（Release It!）
- **Timeout** — 任何遠端呼叫都要有，且必須短於上游 timeout。
- **Retry with Exponential Backoff + Jitter**。
- **Circuit Breaker** — 阻止級聯失敗。
- **Bulkhead** — 資源隔離，避免單點拖垮整體。
- **Graceful Degradation** — 局部失效時提供降級體驗。
- **Liveness vs Readiness Probe** — 語義不同，不混用。

### 資料與一致性
- **Single Source of Truth**。
- **Schema Evolution** — Backward 與 Forward 相容皆需考量。
- **Saga / Outbox Pattern** — 跨服務交易的標準解。
- **Cache Strategy** — 明確 TTL、失效時機與一致性語義。
- **Read / Write Path 分離** — 高負載系統的基本動作。

[返回開頭](#快速導覽)

---

## 4. 可維運性（Operability）

- **Observability 三本柱** — Metrics、Logs、Traces；缺一不可。
- **Structured Logging** — 機器可解析優於人類可讀。
- **Correlation / Trace ID** — 跨服務請求必備。
- **SLI / SLO / Error Budget** — 量化可靠性目標而非感覺。
- **Infrastructure as Code** — 環境必須可重建。
- **Immutable Deployment** — 不在 production 手動改設定。
- **Blue/Green、Canary、Feature Flag** — 降低部署風險的標配。
- **Runbook / Postmortem 文化** — 失敗是組織知識來源。

[返回開頭](#快速導覽)

---

## 5. 安全與韌性

- **Principle of Least Privilege**。
- **Defense in Depth** — 多層防禦，不依賴單一邊界。
- **Secure by Default** — 預設值即安全選項。
- **Zero Trust** — 不信任內網流量。
- **Secret Management** — 永不寫死、永不入 repo。
- **Input Validation at Boundary** — 所有外部輸入皆敵意輸入。
- **Audit Trail** — 重要操作可追溯。

[返回開頭](#快速導覽)

---

## 6. 開發流程紀律

- **Boy Scout Rule** — 離開時讓 code 比進來時乾淨。
- **Code Review as Knowledge Transfer** — 不只是抓 bug。
- **Tests as Specification** — 測試描述意圖而非實作。
- **Test Pyramid** — 多單元、適中整合、少 E2E。
- **Reversibility-Aware Decision Making** — 不可逆決策需更謹慎；可逆決策可快試錯。
- **Trunk-Based / Short-Lived Branches** — 減少 merge 地獄。
- **Conventional Commits / 明確變更語義**。

[返回開頭](#快速導覽)

---

## 7. 套用判準（Decision Framework）

每次套用任何原則前自問：

1. **生命週期** — 一次性 script vs. 長期服務？
2. **變動頻率** — 穩定 vs. 高速演進？
3. **團隊規模** — 一人 vs. 多人協作？
4. **風險等級** — 內部工具 vs. 對外金流 / 醫療 / 安全關鍵？
5. **可逆性** — 決策出錯能否輕易回頭？

**判準對照：**
- 低生命週期 / 低變動 / 單人 / 低風險 → 寬鬆套用，避免過度設計。
- 高生命週期 / 高變動 / 多人 / 高風險 → 嚴格套用，接受抽象成本。
- 不可逆決策 → 永遠採取最保守路線。

[返回開頭](#快速導覽)

---

## 8. Review Checklist

Review、重構或實作完成前，快速掃過：

- **Correctness** — happy path、edge case、錯誤路徑、concurrency / retry / idempotency 是否合理。
- **Boundary** — input validation、permission、timeout、resource cleanup、I/O failure 是否有處理。
- **Design Fit** — 是否符合既有架構邊界；是否新增了不必要 abstraction 或耦合。
- **Change Safety** — 行為變更是否有測試、回滾方式、相容性與 migration 考量。
- **Operability** — 重要失敗是否可觀測；log / metric / trace 是否足以定位問題。
- **Performance** — 是否引入 N+1、無界迴圈 / 查詢 / goroutine / queue、過度 allocation 或不受控 cache。

[返回開頭](#快速導覽)

---

## 9. Anti-Patterns 警示

當以下訊號出現，停下來重新思考：

- 為了滿足某條原則而引入的抽象，沒有第二個使用者。
- Interface 只有一個 implementation 且沒有測試替身需求。
- Class 名稱含 `Manager`、`Helper`、`Utils`、`Processor` 等模糊詞。
- 單一檔案 / function / class 過長，但拆分後反而難讀。
- 「以後會用到」「未來可能擴展」作為設計理由。
- 為了 DRY 而把不相關但長得像的邏輯合併。
- 強行套用設計模式而非解決實際問題。
- 為了避免破壞既有流程而加入 silent fallback，讓錯誤延後到更難追的位置。
- 為了「保持彈性」而延後 schema、API 或錯誤語義的明確決策。

[返回開頭](#快速導覽)

---

最終守則：**設計品質 = 在當下 context 下做出最合理的取捨**。原則提供詞彙與框架，但最終判斷仍是工程師自己的責任。
