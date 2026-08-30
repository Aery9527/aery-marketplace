---
name: arch-rules
description: >-
  軟體設計與開發的關鍵字提示。在閱讀、撰寫、除錯、重構、審查、設計或演進軟體時載入。
  看到具名原則、模式與實務時，喚起其通行概念與取捨；只套用與當下情境相關者。
---

# Arch Rules

把每個關鍵字當成思考提示：喚起其既有概念、前提與取捨。套用相關觀念，不要強行套用完整清單。
關鍵字衝突時，依作用範圍、風險與證據取捨；互斥方案是選項，不是累加規則。

## 工程心態

- **First Principles** — 從事實推導。
- **KISS** — 移除非本質複雜度。
- **YAGNI** — 只做已證實需求。
- **DRY** — 一份知識只有一個來源。
- **Principle of Least Astonishment** — 行為不使人意外。
- **Reversibility** — 保留低成本退路。
- **Measure, Don't Guess** — 先量測，再最佳化。
- **Technical Debt** — 讓未來成本可見。
- **Boy Scout Rule** — 讓碰過的程式碼更乾淨。

## 需求與決策

- **Specification by Example（SBE）** — 用範例定義行為。
- **Acceptance Criteria / Definition of Done** — 讓完成可觀察。
- **Design by Contract / Invariants** — 說明必須成立的條件。
- **Ubiquitous Language** — 一致使用領域語言。
- **ADR / RFC** — 記錄重大決策。
- **Traceability** — 連結需求、變更與證據。
- **Risk-Based Engineering** — 把嚴謹度用在高失敗成本處。

## 程式碼與物件設計

- **SOLID** — 為變更設計，不教條套用。
- **SRP** — 一個一致的改變理由。
- **OCP** — 擴充時不擾動已驗證行為。
- **LSP** — 維持可替換性。
- **ISP** — 為 consumer 保持窄契約。
- **DIP** — 讓依賴指向 policy。
- **CUPID** — 偏好可組合、慣用、可預測的程式碼。
- **GRASP** — 有意識地分配責任。
- **Separation of Concerns** — 分離獨立的改變理由。
- **High Cohesion / Low Coupling** — 聚合相關行為，限制依賴。
- **Composition over Inheritance** — 明確組合行為。
- **Law of Demeter** — 限制對協作者的認知。
- **Tell, Don't Ask** — 讓行為靠近資料。
- **Encapsulate What Varies** — 隔離變動。
- **Pure Functions / Immutability** — 減少隱藏狀態。
- **Make Invalid States Unrepresentable** — 用結構表達 invariant。
- **Fail Fast** — 在根因附近暴露錯誤。
- **Explicit Dependencies** — 讓需求可見。
- **Resource Ownership / RAII** — 讓資源清理具確定性。

## 架構與 API

- **DDD / Bounded Context / Aggregate** — 讓邊界符合 domain。
- **Hexagonal / Clean / Onion / Ports and Adapters** — 隔離 policy 與 infrastructure。
- **Modular Monolith** — 先證明分散的必要性。
- **Microservices** — 只為明確自治而分散。
- **API-First / Contract-First / Schema-First** — 實作前先同意邊界。
- **Backward Compatibility / Deprecation / Semantic Versioning** — 無意外地演進。
- **Hyrum's Law** — 所有可觀察行為都可能成為依賴。
- **Conway's Law** — 系統結構映照溝通結構。
- **Evolutionary Architecture / Fitness Functions** — 讓架構可驗證。
- **Strangler Fig Pattern** — 漸進取代系統。
- **12-Factor App / Stateless Services** — 外移部署關注點與狀態。

## 資料與分散式系統

- **ACID / BASE** — 明確選擇交易語義。
- **CAP / PACELC** — 說清楚一致性、可用性與延遲取捨。
- **Idempotency** — 讓 retry 安全。
- **At-Most-Once / At-Least-Once / Exactly-Once Semantics** — 定義遺失與重複行為。
- **Event-Driven / CQRS / Event Sourcing** — 必要時分離時間、意圖與狀態。
- **Saga / Outbox** — 有意識地協調分散狀態。
- **Schema Evolution / Expand-Contract** — 以相容方式遷移。
- **Data Ownership / Source of Truth** — 明確資料權威。
- **Cache Invalidation / TTL** — 定義陳舊程度。
- **Backpressure / Load Shedding / Rate Limiting** — 限制過載。
- **Clock Skew / Ordering / Logical Clocks** — 不假設共享時間。

## 可靠性與維運

- **Timeout / Deadline / Cancellation** — 限制等待與工作。
- **Retry / Backoff / Jitter** — 選擇性重試，避免同步重試風暴。
- **Circuit Breaker / Bulkhead** — 隔離級聯失敗。
- **Graceful Degradation / Fail-Safe** — 讓失敗傷害有界。
- **Liveness / Readiness / Health Checks** — 探測正確問題。
- **Observability / Logs / Metrics / Traces / Profiles** — 讓行為可解釋。
- **Structured Logging / Correlation IDs** — 跨邊界連結事件。
- **SLI / SLO / Error Budget** — 量化可靠性。
- **Backup / Restore / RPO / RTO** — 證明可復原。
- **Runbook / Chaos Engineering** — 為故障準備並演練。

## 資安、隱私與安全

- **Threat Modeling** — 針對合理濫用設計。
- **Least Privilege / Zero Trust** — 最小化假定權限。
- **Defense in Depth / Secure by Default** — 讓安全成為預設路徑。
- **Input Validation / Output Encoding** — 防守每個 trust boundary。
- **Secrets Management** — 不讓憑證進入程式碼與 log。
- **Supply Chain Security / SBOM** — 知道並驗證依賴。
- **Privacy by Design / Data Minimization** — 少收集、少保留。
- **Audit Trail / Non-Repudiation** — 讓敏感操作可歸責且難以否認。
- **Safety Engineering / Hazard Analysis** — 限制 bug 以外的傷害。

## 測試與品質

- **Tests as Specification** — 測試意圖，不測實作細節。
- **TDD / BDD** — 用回饋與範例驅動設計。
- **Test Pyramid / Testing Trophy** — 平衡速度與信心。
- **Unit / Integration / Contract / E2E** — 在正確邊界測試。
- **Property-Based / Fuzz / Mutation Testing** — 搜尋範例之外的缺陷。
- **Regression / Golden Master / Snapshot Testing** — 謹慎鎖定預期行為。
- **Deterministic / Hermetic Tests** — 移除無關變異。
- **Test Doubles / Mocks / Fakes** — 只在真實接縫替換。
- **Shift Left / Shift Right** — 發布前後都驗證。

## 效能與並行

- **Big O / Data Structures** — 讓複雜度符合存取模式。
- **Profiling / Benchmarking** — 最佳化已量測瓶頸。
- **Load / Stress / Soak Testing** — 測試真實極限。
- **Amdahl's Law / Little's Law** — 尊重擴展與 queue 數學。
- **Bounded Resources** — 限制 queue、task、memory 與 fan-out。
- **Structured Concurrency / Cancellation** — 讓生命週期明確。
- **Race Freedom / Atomicity / Isolation** — 讓共享狀態安全。
- **N+1 / Batching / Streaming** — 控制 I/O 放大。

## 交付與協作

- **CI / CD** — 持續整合與交付。
- **Trunk-Based Development / Short-Lived Branches** — 降低 merge 延遲。
- **Small Batches / Incremental Delivery** — 限制變更風險。
- **Code Review / Pairing / Mob Programming** — 提早共享 context。
- **Conventional Commits / Semantic Release** — 讓變更意圖可被機器讀取。
- **IaC / Reproducible Builds / Immutable Deployment** — 讓環境可重現。
- **Blue-Green / Canary / Feature Flags** — 降低 blast radius。
- **Documentation as Code** — 讓文件與系統一起演進。
- **Blameless Postmortem / Continuous Improvement** — 把失敗轉成學習。

## 互動

- **Human-Centered Design / Developer Experience** — 為真實使用者最佳化。
- **Accessibility / WCAG / Inclusive Design** — 為多元能力設計。
- **i18n / l10n** — 分離語言與 locale。
- **Progressive Enhancement / Responsive Design** — 保留核心體驗。
- **Error UX / Graceful Recovery** — 讓失敗可理解、可復原。
