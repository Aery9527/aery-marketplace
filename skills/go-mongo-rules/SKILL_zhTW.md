---
name: go-mongo-rules
description: >-
  撰寫、修改或 review 任何 MongoDB 相關程式碼時使用——查詢、aggregation pipeline、
  Go mongo-go-driver 程式碼或 MongoDB shell 腳本（.js）。
  強制型別安全比對、bson.M 與 bson.D 選用，以及查詢策略決策。
---

# Go Mongo Rules

MongoDB 程式碼必須在 `code-rules` 之上遵守以下規則。若專案已有明確規範，必須優先遵循專案規範。

Go 範例以 mongo-go-driver v1（`go.mongodb.org/mongo-driver`）為準。v2 的 `primitive` 型別移至 `bson`，例如 `bson.ObjectID`、`bson.DateTime`，請自行對應名稱。

## 型別原則

- 對從 MongoDB 讀出的值做比對、當 key 或算術前，必須先由 schema 或印出結果確認其 BSON 型別。嚴禁假設數值欄位回來就是原生 number。
- 在 shell 腳本中，Int64 欄位回來是 `NumberLong`（legacy shell）或 `Long`（mongosh），它是物件，且字串形式因 shell 而異。嚴禁直接用作 object key、`===` 或算術。值在 `Number.MAX_SAFE_INTEGER` 範圍內時先以 `Number()` 轉換，因此 `set[t] = true` 必須寫成 `set[Number(t)] = true`；超出範圍則以 `.toString()` 當 key、以 `BigInt` 運算。
- 嚴禁把日期轉成字串再比對。shell 腳本中日期物件直接用 `<`、`>` 或 `.getTime()` 比對；Go 使用 `time.Time.Before`、`After`、`Equal`。
- 在 Go 中，寫入數值欄位必須使用與 BSON 型別相符的 Go 型別：Int32 用 `int32`、Int64 用 `int64`、Double 用 `float64`。Go 的 `int` 在值放得下時編碼為 Int32，否則為 Int64，因此用 `int` 寫入會在值跨越 Int32 範圍後讓同一欄位混雜型別。查詢仍能以數值比對，但 `$type` 會區分儲存型別，解碼進較窄的 Go 型別也會壞掉。
- 查詢 ObjectID 欄位必須用 `primitive.ObjectIDFromHex` 得到的 `primitive.ObjectID`，嚴禁直接用 hex 字串；字串永遠比不到 ObjectID。
- 解碼時必須使用足以容納既有值的 Go 型別。預設情況下，溢出 `int32` 的 Int64，或非整數的 Double 解碼進任何整數型別，都會解碼失敗。

## bson.M vs bson.D

- `bson.M` 無序；`bson.D` 有序。凡 server 會讀取 key 順序的地方必須用 `bson.D`，其他地方一律 `bson.M`。
- key 順序有意義的地方包括：`$sort`、所有多 key 的 `sortBy`（例如 `$setWindowFields`、`$sortArray`）、`mongo.IndexModel.Keys` 的複合索引 key、複合 `hint`、`RunCommand` 的指令文件（指令名稱必須是第一個 key），以及 filter 中整個比對的 embedded document，因為 embedded document 相等比對包含欄位順序。
- 多 key 的 `$sort` stage 寫成 `bson.M` 會執行，但 key 優先順序不確定；必須寫成 `bson.D{{Key: "day", Value: 1}, {Key: "user", Value: -1}}`。`SetSort` 則直接以 `ErrMapForOrderedArgument` 拒絕多 key 的 map。
- pipeline 本身必須是 `mongo.Pipeline`（`[]bson.D`），每個 stage 一個 `bson.D`。stage 本身 key 順序無意義者，例如 `$match`、`$group`、`$project`，維持 `bson.M`，但其中巢狀的順序敏感文件仍用 `bson.D`。

## 查詢策略

- 實作任何 MongoDB 操作前，必須依情境在單次 aggregation pipeline 與直接指令（一次或多次）之間做出決定。沒有預設答案。
- 當 server 能在一次請求內完成工作時偏向 aggregation：跨 collection join（`$lookup`）、合併多個 collection（`$unionWith`）、分組統計（`$group`）。嚴禁在應用層用 N 次 round-trip 模擬這些操作。`$unionWith` 只接受字面的 collection 名稱，動態命名的 collection 由 client 端依已知名稱逐一組裝 stage 合併。
- 當下一步取決於 client 必須檢視的結果（例如先讀版本號再條件更新）、或操作是單文件寫入時偏向直接指令。pipeline 只能依文件資料透過 `$cond`、`$switch` 分支，寫入只能透過 `$out`、`$merge`，而這兩者不允許在 `session.WithTransaction` 內使用。`UpdateOne`、`UpdateMany` 可接受 aggregation pipeline 作為 update，且可在 transaction 內執行。
- `Find` 搭配 `SetSkip`、`SetLimit`、`SetSort`、`SetProjection` 本來就在 server 端執行。嚴禁只為了分頁、依既有欄位排序或投影既有欄位而改用 aggregation；當某一步依賴前一步的輸出（例如依計算欄位排序）才使用 pipeline。
- 兩者無明顯優劣時，嚴禁自行決定。以 round-trip 次數、傳輸資料量、可除錯性、維護成本列出兩個方案的優缺點；只在確有傾向時給建議，由使用者選擇。
- 當所選策略的原因無法從程式碼直接看出時，必須在該操作上以一則註解記錄策略與原因，例如 `// 策略：單次 aggregation pipeline。明細分散在每日 collection，以 $unionWith 在 server 端合併，取代 N 次 Find。` 策略不言自明的操作，例如單文件 CRUD 或單純的 `$group` 計數，不需要此註解。
