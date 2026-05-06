---
name: go-mongo-rules
description: >-
  MongoDB development rules and pitfall prevention. Use this skill for any task
  involving MongoDB queries, aggregation pipelines, Go mongo-go-driver code, or
  MongoDB shell scripts (.js). Covers: implicit type-matching traps for
  NumberLong/ISODate in JS shell, correct usage of bson.M vs bson.D in Go
  (especially for order-dependent stages like $sort/$group), and decision
  principles for single aggregation request vs multiple commands with
  documentation requirements. Always read this skill before adding, modifying,
  or reviewing any MongoDB-related code.
---

# MongoDB Development Rules

## Overview

Prevent common MongoDB pitfalls, standardize BSON type selection and aggregation
decisions, and ensure every MongoDB operation is type-safe, low round-trip, and
expresses clear intent.

---

## Rule 1: Type Safety — Confirm Types Before Comparison

MongoDB's type system has implicit conversions across different contexts (JS shell,
Go driver, BSON wire protocol). Always confirm the target type before any comparison
or key operation.

### JavaScript / Mongo Shell

Values returned by the MongoDB shell may be `NumberLong` (BSON Int64), which is an
**object**, not a native JS number.

**Most common trap: using NumberLong as an Object key**

```js
// Wrong — NumberLong as Object key calls .toString()
//    produces "NumberLong(260128)", parseInt("NumberLong(260128)") → NaN
const targetSet = {};
dc.targets.forEach(function(t) {
    targetSet[t] = true;               // key = "NumberLong(260128)" ← invisible bug
});
const yymmdd = parseInt(key, 10);      // NaN → wrong collection name → silent miss

// Correct — explicitly convert to JS number before using as key
dc.targets.forEach(function(t) {
    targetSet[Number(t)] = true;       // key = "260128" ✓
});
```

**Other NumberLong traps**

```js
// Strict equality — NumberLong is an object, === is always false
if (doc.yymmdd === 260205) { ... }     // always false → use Number(doc.yymmdd) === 260205

// Arithmetic — NumberLong does not auto-coerce
var next = doc.yymmdd + 1;            // "[object Object]1" → use Number(doc.yymmdd) + 1
```

**ISODate comparison**

```js
// ISODate is an object; direct < > comparison works (implements valueOf)
if (doc.createdAt >= ISODate("2026-02-01T00:00:00Z")) { ... }  // OK

// Do NOT stringify for comparison — toString() format is not stable
if (doc.createdAt.toString() > "2026-02-01") { ... }  // undefined behavior
```

> When processing cursor results in shell scripts, for any numeric field, first
> print `typeof` or observe whether the shell output shows `NumberLong(...)`.
> If so, wrap every use of that field with `Number()`.

### Go / mongo-go-driver

```go
// Common BSON type mappings:
// MongoDB Int32  ↔  Go int32   / primitive.Int32
// MongoDB Int64  ↔  Go int64   / primitive.Int64
// MongoDB Double ↔  Go float64
// MongoDB Date   ↔  Go time.Time / primitive.DateTime
// MongoDB OID    ↔  Go primitive.ObjectID

// Wrong: querying an Int64 field with int may not match (int defaults to Int32 encoding)
filter := bson.M{"yymmdd": 260205}        // may be encoded as Int32

// Correct: explicitly specify Int64
filter := bson.M{"yymmdd": int64(260205)}

// Wrong: querying an ObjectID field with a string
filter := bson.M{"_id": "507f1f77bcf86cd799439011"}

// Correct: parse to primitive.ObjectID first
oid, _ := primitive.ObjectIDFromHex("507f1f77bcf86cd799439011")
filter := bson.M{"_id": oid}
```

---

## Rule 2: bson.M vs bson.D — Use bson.D Only When Order Matters

- `bson.M` — underlying structure: `map[string]any` — **Unordered** — use for: filter, projection, `$match` conditions
- `bson.D` — underlying structure: `[]bson.E` (ordered slice) — **Ordered** — use for: `$sort`, aggregation stages that depend on order

**Decision criterion for bson.D: does the result depend on declaration order?**

```go
// Wrong — $sort with bson.M: map is unordered, sort key priority is
//         non-deterministic (hard-to-reproduce bug)
bson.M{"$sort": bson.M{"day": 1, "user": -1}}

// Correct — $sort with bson.D: guarantees day sorts before user
bson.D{{Key: "$sort", Value: bson.D{
    {Key: "day", Value: 1},
    {Key: "user", Value: -1},
}}}

// Correct aggregation pipeline
pipeline := mongo.Pipeline{
    bson.D{{Key: "$match",  Value: bson.M{"flag": 0}}},          // $match internals unordered → bson.M
    bson.D{{Key: "$group",  Value: bson.D{
        {Key: "_id",   Value: "$user"},
        {Key: "count", Value: bson.M{"$sum": 1}},
    }}},
    bson.D{{Key: "$sort",   Value: bson.D{{Key: "count", Value: -1}}}}, // $sort → bson.D
    bson.D{{Key: "$limit",  Value: 10}},
}
```

**Quick rules**:
- `$sort` → always `bson.D`
- filter / `$match` conditions → `bson.M` (unless field order has business significance)
- the pipeline itself → `mongo.Pipeline` (`[]bson.D`)

---

## Rule 3: Evaluate Query Strategy — Choose the Best Approach per Context

Before implementing any MongoDB operation, perform a context analysis, then decide
between aggregation and multiple commands. **There is no one-size-fits-all answer**;
the table below provides clear leanings and decision guidance.

### Clear Preference: Aggregation

- Cross-collection join — `$lookup` completes on the server side, avoids N+1
- Merging results across multiple collections — `$unionWith` returns in one request, avoids multiple round-trips
- Aggregated statistics (count/sum/avg) — `$group` completes in a single scan; multiple queries cannot replace it
- Cross-collection queries with dynamic collection names — only aggregation can dynamically assemble `$unionWith` stages
- Pagination — `$skip + $limit` limits data volume on the server side

### Clear Preference: Multiple Commands

- Transactional writes required — aggregation cannot perform writes inside `session.WithTransaction`
- Business logic depends on previous result to decide next action — e.g., "read version → conditional upsert"; branching logic cannot be expressed in a pipeline
- Simple CRUD (single-doc insert/update/delete) — direct commands are clearer; aggregation adds unnecessary complexity

### No Clear Preference — Present Trade-offs for the User to Decide

When the context does not fit any of the above categories (e.g., small cross-collection
query, deciding whether to refactor existing multi-command logic), **do not decide
unilaterally — present the analysis first**:

```
Option A: Single aggregation pipeline
  Pros:
    - 1 round-trip, lower latency
    - Server-side filtering, smaller data transfer
  Cons:
    - Higher pipeline complexity, harder to debug
    - If data volume is small, performance difference is negligible;
      pipeline adds maintenance cost

Option B: Multiple commands (Find x N)
  Pros:
    - Intuitive logic, easy to read and debug
    - Each step's result can be independently logged/verified
  Cons:
    - N+1 risk; noticeable latency with large datasets
    - Application layer must handle join/merge

Recommendation: [Provide a recommendation if there is a clear lean; otherwise let
the user decide based on maintainability/performance requirements]
```

---

## Rule 4: Declare the Execution Strategy for Every MongoDB Task

Before implementing any MongoDB operation, **declare in a code comment or description**:

```go
// Query strategy: Aggregation (single pipeline)
// Reason: needs to merge results across multiple gp_{yymmdd}_detail collections;
//         dynamically assembles stages via $unionWith to avoid N separate Find requests.
```

```go
// Query strategy: Multiple commands (Find + UpdateOne)
// Reason: requires optimistic lock — read version first, then conditionally update;
//         cannot complete writes inside a single aggregation.
```

```js
// Query strategy: Aggregation ($unionWith across dynamic collections)
// Reason: detail data is spread across gp_YYMMDD_detail collections per date,
//         plus DetailConsume cross-date targets; must merge server-side before $match.
```

**Declaration format**:
```
Query strategy: <Single aggregation pipeline | Multiple commands | Hybrid>
Reason: <One sentence explaining why this strategy was chosen, or the constraint
         that prevents using aggregation>
```

---

## Quick Checklist (Review Before Every MongoDB Task)

- [ ] Have all numeric fields extracted from cursor/query results been type-confirmed (especially NumberLong / Int64)?
- [ ] Are any NumberLong/BSON objects being used directly as map keys, array indices, or in arithmetic?
- [ ] In Go code, does `$sort` and every order-dependent aggregation stage use `bson.D`?
- [ ] Has a context analysis been done to confirm aggregation vs multiple commands (if no clear preference, have trade-offs been listed)?
- [ ] Has the "query strategy" and reason been declared in a comment?
