---
name: code-rules
description: >-
  可維護程式碼的具體實作規則。在撰寫、修改、重構或審查程式碼時載入，尤其適用於
  命名、函式、介面、型別、錯誤、logging、I/O 邊界、資源所有權、並行與測試。
  優先遵循專案與語言的既有慣例；較高層次的設計取捨使用 `arch-rules`。
---

# Code Rules

讓程式碼的行為、依賴、失敗與所有權明確。除非既有專案或語言慣例不安全，或與必要行為
矛盾，否則以既有慣例為準。只套用與當下變更相關的規則。

## 變更邊界

- 改變行為前，先讀取 caller、測試與相鄰程式碼。
- 說明哪些行為必須改變、哪些必須維持相容，以及如何驗證兩者。
- 做最小且完整的變更；不要把無關清理與行為變更混在一起。
- 重構時維持公開行為。把 exported contract 與已儲存資料視為 migration boundary。
- 只有在已證實的變化、穩定邊界或必要 test seam 出現時才加入抽象，不為推測建立抽象。

## 命名與結構

- 依 domain 意義與責任命名，不依機制命名，也避免 `Manager`、`Helper`、`Utils` 等模糊角色。
- 一個函式聚焦一個可觀察結果；只有新單元具明確名稱與契約時才抽取。
- 讓相關狀態與行為靠近，分離不相關的改變理由。
- 優先 early return，避免深層巢狀；讓主要路徑容易閱讀。
- boolean mode flag 若會選擇不同的行為，改用獨立操作或明確 option type。
- 只有參數共同構成一個概念時才分組；不要只為減少數量建立 parameter object。
- 註解說明意圖、限制或取捨，不重述程式碼。

## 介面與型別

- 在需要替換的 consumer 或架構邊界定義介面，不要在每個 implementation 旁建立介面。
- 介面依角色設計並保持精簡，以 `Reader`、`Validator`、`Publisher` 等能力命名。
- 單一 implementation 若沒有真實邊界或 test seam，不要建立介面。
- 依賴 caller 實際使用的最小契約；回傳最精確且有用的型別。
- 優先使用 composition。只有 substitutability 穩定且受保證時才使用 inheritance。
- 用 domain type 表達 domain concept，不要到處傳遞原始 string 或 number。
- 明確表達 optionality，不使用只有慣例才知道意義的 sentinel value。
- 可行時讓無效狀態無法表示；否則只在 construction 或 trust boundary 驗證一次。
- 讓 zero、null 與 default 行為安全且不意外，否則明確要求 construction。
- 公開型別與介面保持最小；已發布契約透過 additive change、deprecation 與 migration 演進。

範例——consumer 需要讀取能力，不需要整個 service：

```text
Bad:  UserService { create, update, delete, find, list, export, ... }
Good: UserReader  { find(userId) -> User }
```

## 錯誤與控制流程

- 不吞錯、不回傳假成功，也不 silent fallback；除非 fallback 本身就是契約的一部分。
- 增加可採取行動的 context，同時保留原始 cause 與機器可辨識的 identity。
- caller 需要不同處理時，區分無效輸入、資料不存在、衝突、暫時性依賴失敗與內部缺陷。
- 只有能復原、轉成 boundary contract 或決定最終結果的層級才處理錯誤。
- 不要每一層都同時 log 並向上傳遞相同失敗；底層補充 context，由 owning boundary 記錄。
- 縮小 catch 範圍。cleanup 放在 `defer`、`finally`、RAII 或語言等價的 lifetime mechanism。
- 傳遞 cancellation 與 deadline；不要把取消轉成一般失敗，也不要繼續已放棄的工作。
- exhaustive branch 遇到未處理的新 case 時必須明確失敗。

## Logging

- 記錄有助於解釋狀態轉換、外部互動、降級行為或最終失敗的事件。
- 優先使用具穩定名稱與 typed field 的 structured event，不使用插值 prose。
- 專案沒有 level policy 時：`DEBUG` 用於診斷、`INFO` 記錄重要生命週期事件、`WARN` 記錄可復原降級、`ERROR` 記錄需要處理的失敗結果。
- 一個失敗通常只記錄一次，由擁有 response、retry、job result 或 process termination 的邊界記錄。
- 加入相關 identifier，例如 operation、entity ID、dependency、outcome、duration、trace ID 或 correlation ID。
- message 與 field name 保持穩定；變動資料放在 field。
- 不記錄 credential、token、secret、原始 authorization header 或不必要的個人資料；寫入 log 前先遮蔽。
- 限制 payload 大小與 field cardinality；預設不傾印完整 request、response 或 object。
- 依 runtime 慣例保留 error cause 或 stack，不要在多個 field 重複記錄。
- Logging 不是 error handling；caller 仍必須收到正確結果。

範例——穩定事件搭配安全 context：

```text
Bad:  "payment failed: " + request + error
Good: payment_capture_failed { payment_id, provider, error_code, trace_id }
```

## 邊界、狀態與資源

- 在入口邊界驗證不可信輸入；內部程式碼使用已驗證型別。
- 依目的地 context encode output；database query 與外部 command 必須 parameterize。
- 明確標示 side-effect boundary：network、storage、filesystem、clock、randomness 與 process execution。
- 遠端與 blocking work 要有 timeout、cancellation path；可安全 retry 時才設定 bounded retry policy。
- 明確定義 ownership 與 lifetime；creator 必須釋放資源，或明確移交所有權。
- 限制 queue、concurrency、memory、recursion、batching 與 fan-out；超量時明確拒絕或 load shedding。
- 共享 mutable state 只使用一種清楚的 synchronization strategy；不要混用 lock、atomic 與臨時 flag。
- 讓 partial success 可見；multi-step write 前先定義 transaction、rollback、idempotency 與 retry 行為。

## 測試與完成

- 測試可觀察行為與契約，不測 private implementation structure。
- 涵蓋 success path、boundary value、預期失敗與本次修改的 regression。
- 在有意義的 integration boundary 使用真實 collaborator；只在 genuine seam 使用 test double。
- 控制 time、randomness、concurrency 與 external I/O，讓測試保持 deterministic。
- 舊保證仍通過、新行為已驗證、失敗可觀測，且沒有資源或 secret leak，變更才算完成。
