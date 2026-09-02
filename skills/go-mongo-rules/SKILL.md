---
name: go-mongo-rules
description: >-
  Use when writing, modifying, or reviewing any MongoDB-related code — queries,
  aggregation pipelines, Go mongo-go-driver code, or MongoDB shell scripts
  (.js). Enforces type-safe comparisons, bson.M vs bson.D selection, and
  query-strategy decisions.
---

# Go Mongo Rules

MongoDB code MUST follow these rules on top of `code-rules`. If the project has explicit conventions, they MUST take precedence.

Go examples target mongo-go-driver v1 (`go.mongodb.org/mongo-driver`). In v2 the `primitive` types live in `bson`, such as `bson.ObjectID` and `bson.DateTime`; map names accordingly.

## Type Rules

- Before comparing, keying, or doing arithmetic on a value read from MongoDB, MUST confirm its BSON type from the schema or by printing it. MUST NOT assume a numeric field arrives as a native number.
- In shell scripts, an Int64 field arrives as `NumberLong` (legacy shell) or `Long` (mongosh), which is an object, and its string form differs by shell. MUST NOT use it directly as an object key, in `===`, or in arithmetic. When the value fits in `Number.MAX_SAFE_INTEGER`, convert with `Number()` first, so `set[t] = true` becomes `set[Number(t)] = true`; otherwise key by `.toString()` and compute with `BigInt`.
- MUST NOT compare dates through strings. In shell scripts compare date objects directly with `<`, `>`, or `.getTime()`; in Go use `time.Time.Before`, `After`, and `Equal`.
- In Go, MUST write a numeric field with the Go type that matches its BSON type: `int32` for Int32, `int64` for Int64, `float64` for Double. A Go `int` is encoded as Int32 when the value fits and Int64 otherwise, so writing `int` mixes stored types once values cross the Int32 range. Queries still match numerically, but `$type` filters distinguish the stored types and decoding into a narrower Go type breaks.
- MUST query an ObjectID field with `primitive.ObjectID` from `primitive.ObjectIDFromHex`, never with the hex string; a string never matches an ObjectID.
- MUST decode into Go types wide enough for the stored values. By default an Int64 that overflows `int32`, or a non-integral Double into any integer type, fails to decode.

## bson.M vs bson.D

- `bson.M` is unordered; `bson.D` is ordered. MUST use `bson.D` wherever the server reads key order, and `bson.M` everywhere else.
- Key order matters including in `$sort`, every multi-key `sortBy` such as in `$setWindowFields` and `$sortArray`, compound index keys in `mongo.IndexModel.Keys`, compound `hint`, the command document of `RunCommand` where the command name must be the first key, and an embedded document compared as a whole in a filter, because embedded-document equality matches field order.
- A multi-key `$sort` stage written as `bson.M` runs with a non-deterministic key priority; MUST write it as `bson.D{{Key: "day", Value: 1}, {Key: "user", Value: -1}}`. `SetSort` rejects a multi-key map outright with `ErrMapForOrderedArgument`.
- The pipeline itself MUST be `mongo.Pipeline` (`[]bson.D`), one `bson.D` per stage. A stage body whose own key order does not matter, such as `$match`, `$group`, and `$project`, stays `bson.M`, but any order-sensitive document nested inside it still uses `bson.D`.

## Query Strategy

- Before implementing a MongoDB operation, MUST decide from the context between one aggregation pipeline and direct commands, one or several. There is no default.
- Prefer aggregation when the server can finish the work in one request: cross-collection join (`$lookup`), merging collections (`$unionWith`), and grouped statistics (`$group`). MUST NOT emulate these from the application with N round-trips. `$unionWith` takes a literal collection name, so dynamically named collections are merged by building one stage per name known to the client.
- Prefer direct commands when the next step depends on a result the client must inspect, such as read a version then conditionally update, or when the operation is a single-document write. A pipeline branches only on document data through `$cond` and `$switch`, and writes only through `$out` and `$merge`, which are not allowed inside `session.WithTransaction`. `UpdateOne` and `UpdateMany` accept an aggregation pipeline as the update, and that does run inside a transaction.
- `Find` with `SetSkip`, `SetLimit`, `SetSort`, and `SetProjection` already runs server-side. MUST NOT switch to aggregation only to paginate, sort by stored fields, or project stored fields; use a pipeline when one step depends on another's output, such as sorting by a computed field.
- When neither side clearly wins, MUST NOT decide alone. Present both options with pros and cons on round-trips, data transferred, debuggability, and maintenance cost; give a recommendation only when one exists, and let the user choose.
- When the reason for the chosen strategy is not obvious from the code, MUST record the strategy and its reason in one comment on the operation, for example `// Strategy: one aggregation pipeline. Detail rows are split across per-day collections, so $unionWith merges them server-side instead of N Find calls.` An operation whose strategy is self-evident, such as a single-document CRUD or a plain `$group` count, needs no such comment.
