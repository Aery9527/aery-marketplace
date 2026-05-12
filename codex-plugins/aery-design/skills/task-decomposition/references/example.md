# Complete Example: the `order` System

> This example uses "build an order system where buyers can place, query, and cancel orders" as the scenario; it walks the full god-view → leaf → plan chain from scratch and covers `-draft` placeholders, `.metadata.md`, `list.md`, and `DC.SUBNAME` same-layer split. All naming is verified by `check.py`.
>
> **Technology-neutral disclaimer**: this skill is a generic specification and does NOT bind to any programming language, framework, or storage layer. To make the SBE / implementation boundary / interface definitions concrete and readable, the example uses a Go + document-store style as illustration; in practice, replace with whatever your project uses (Java + RDBMS, Python + Redis, Rust + custom storage, etc.).

## Scenario

- One sentence: buyers can create orders, query their own orders, and cancel orders that are not yet paid.
- Scope: `order` is a god-view containing three required sub-modules: `create` / `read` / `cancel`.
- Assumptions: `create` is fully done (design + plan + review — completed all six phases); `read` is still a placeholder draft created by the parent god-view; `cancel` entered leaf and used `DC.SUBNAME` same-layer split, finished plan, with 1100's review done and 1200's review still in draft.

## Full Directory Tree

```
docs/sys/
    .metadata.md
    list.md
    order/
        .metadata.md
        order-design.md                                     ← god-view (this layer narrative + sub-module list)
        create/
            .metadata.md
            order-create-design.md                          ← leaf
            order-create-plan-add_item.md                   ← plan (function-name topic)
            order-create-plan-add_item-review.md            ← Phase 3 review; Phase 4 already appended ## Main Agent Decision
            order-create-plan-submit.md                     ← plan (function-name topic)
            order-create-plan-submit-review.md              ← review for the submit plan
            order-create-plan-submit.01.md                  ← plan (1st batch SBE under same SUBNAME)
            order-create-plan-submit.01-review.md           ← review for the .01 batch
            order-create-plan-submit.02.md                  ← plan (2nd batch SBE under same SUBNAME)
            order-create-plan-submit.02-review-draft.md     ← .02 review not yet started
        read/
            .metadata.md
            order-read-design-draft.md                      ← unfilled placeholder
        cancel/
            .metadata.md
            order-cancel-design.md                          ← god-view (same-layer DC integrator)
            order-cancel-1000.aggregate-design.md           ← integrator (depends on 1100 / 1200)
            order-cancel-1100.refund-design.md              ← parallel with 1200
            order-cancel-1200.notify-design.md              ← parallel with 1100
            order-cancel-1100.refund-plan.md                ← corresponds to 1100.refund
            order-cancel-1100.refund-plan-review.md         ← review for 1100.refund plan
            order-cancel-1200.notify-plan.md                ← corresponds to 1200.notify
            order-cancel-1200.notify-plan-review-draft.md   ← 1200 review still in draft
```

Note: because `order-cancel-design.md` uses same-layer DC integration, this layer plays the god-view role; therefore this directory **MUST NOT** contain any `order-cancel-plan*.md`. Plan is fully handled by `order-cancel-1100.*` and `order-cancel-1200.*`.

## File Contents

### `docs/sys/.metadata.md`

```markdown
# docs/sys metadata

> This is the project root's docs/sys; no domain abbreviations to record.
```

### `docs/sys/list.md`

```markdown
# docs/sys Registry

<!-- This example is a single-repo illustration; for independent sub-module nodes, add lines like:
- [module-a](../../module-a/docs/sys)
-->
```

### `docs/sys/order/.metadata.md`

```markdown
# order metadata

- order: order — a record of a buyer's purchase intent for products.
```

### `docs/sys/order/order-design.md` (god-view)

````markdown
# order design (god-view)

## Functional Purpose

Provide buyers an end-to-end flow from creating to querying to canceling orders, serving as the order axis of the trading system.

## User Story

- As a buyer, I want to create orders, so that my purchase intent is recorded.
- As a buyer, I want to query my own orders, so that I can track status and history.
- As a buyer, I want to cancel unpaid orders, so that I can withdraw my purchase intent.

## System Requirements

- Consistency: order ID is globally unique; no duplicates may be produced at any stage.
- Idempotency: a duplicate creation request must not produce a second order.
- Audit: every order status transition must be traceable.

## Sub-modules

### Required

- [create](create/order-create-design.md) — create an order with a snapshot of items.
- [read](read/order-read-design-draft.md) — query orders by buyer.
- [cancel](cancel/order-cancel-design.md) — cancel unpaid orders and trigger refund / notification flows.

### Optional

<!-- e.g. split / merge / refund_partial may be added later; not in MVP scope. -->
````

### `docs/sys/order/create/order-create-design.md` (leaf)

````markdown
# order-create design

## Functional Purpose

Allow logged-in buyers to create a new order with a snapshot of item lines and prices at that moment.

## User Story

- As a buyer, I want to convert items in my cart into an order, so that I can proceed to checkout.
- As a buyer, I want to immediately see the order ID after creation, so that I can look it up later.

## System Requirements

- Idempotency: duplicate sends with the same client request id must not produce more than one order.
- Consistency: an order, once created, must be immediately queryable by the same buyer.
- Audit: the creation event must retain timestamp and source IP.

## Acceptance Criteria

- After the buyer submits a creation request, the order ID is returned within 1 second.
- The same client request id sent N times produces only one order ID.
- Item quantity 0 or negative rejects the entire creation request.

## Premises and Constraints

- Buyer is already logged in (account module has handled user authentication).
- Item prices and stock are provided by the catalog module; this module only handles the order side.
- Out of scope: payment flow, inventory deduction — handled by separate modules.
````

### `docs/sys/order/create/order-create-plan-add_item.md`

````markdown
# order-create plan-add_item

> Corresponds to design: [order-create-design.md](order-create-design.md)

## Implementation Boundary

- package / module: `order/create`
- Files involved: `order/create/item.go`, `order/create/item_test.go`

## Interface Definitions

- `func AddItem(ctx, draftOrderID, skuID, quantity) error`

## System Requirements Mapping

- Consistency: wrap "read draft order + write item" in a storage-layer transaction to prevent concurrent interference.

## SBE Specs

### 1. Add an item to a draft order

- Input: `draftOrderID = "ord-d-001"`, `skuID = "sku-001"`, `quantity = 2`
- Output: returns `nil`; the storage layer's `order_drafts` collection adds an item `{sku:"sku-001", qty:2}` under `ord-d-001`.

### 2. Add the same item again

- Input: existing item `sku-001 qty=2`; call `AddItem(skuID="sku-001", quantity=3)` again.
- Output: returns `nil`; that item's quantity becomes `5`; **no** second item line is created.

### 3. Quantity zero is invalid

- Input: `quantity = 0`
- Output: returns `ErrInvalidQuantity`; the draft order is unchanged.

## External Dependencies

- Storage layer `order_drafts` collection
````

### `docs/sys/order/create/order-create-plan-submit.md` (with `.SEQUENCE` split)

When SBE test cases are too many, split into batches via the `.NN` sequence; this file holds the main narrative + template, while the actual cases go into `.01` / `.02`.

````markdown
# order-create plan-submit

> Corresponds to design: [order-create-design.md](order-create-design.md)
> SBE test cases split into [order-create-plan-submit.01.md](order-create-plan-submit.01.md)
> and [order-create-plan-submit.02.md](order-create-plan-submit.02.md).

## Implementation Boundary

- package / module: `order/create`
- Files involved: `order/create/submit.go`, `order/create/submit_test.go`

## Interface Definitions

- `func Submit(ctx, draftOrderID, clientRequestID) (orderID, error)`

## System Requirements Mapping

- Idempotency: implemented via the storage layer's unique index on `client_request_id`; on duplicate, read the existing record and return the same orderID.
- Audit: write to the `order_audit` ledger with timestamp and source IP.

## SBE Specs

> This file lists representative cases only; full happy path is in `.01`, edge / failure cases in `.02`.

## External Dependencies

- Storage layer `orders`, `order_audit` ledgers
````

### `docs/sys/order/create/order-create-plan-add_item-review.md` (includes Phase 4 main-agent decision)

````markdown
# order-create plan-add_item review

> Corresponds to plan: [order-create-plan-add_item.md](order-create-plan-add_item.md)
> Corresponds to design: [order-create-design.md](order-create-design.md)

## Review Summary

SBE covers the happy path and one invalid-quantity boundary case; however the race behavior for "adding the same item again" is not specified for concurrent callers — an extra SBE is recommended.

## Findings and Suggestions

### 1. Concurrent add of the same item

- Observation: the plan wraps "read draft + write item" in a transaction, but no SBE shows the expected outcome when two concurrent AddItem calls hit the same sku.
- Suggestion: add an SBE — two goroutines simultaneously call `AddItem(sku-001, +2)`; expected final quantity is +4 (not partial overwrite); neither returns ErrConflict.
- Impact: only this plan.

### 2. Upper bound on quantity is undefined

- Observation: the plan only rejects quantity = 0; behavior for extremely large values (e.g. INT_MAX) is undefined.
- Suggestion: align with the catalog module — cap at 1000; exceeding values return ErrInvalidQuantity.
- Impact: also touches design (catalog boundary assumption needs to be added to "Premises and Constraints").

## Main Agent Decision

### 1. Concurrent add of the same item

- Decision: accept-modify-plan
- Rationale: since the plan already uses a transaction, an SBE that pins down the concurrent expectation aligns implementation and acceptance.
- Action: add a 4th SBE in "SBE Specs" titled "Concurrent AddItem on the same sku"; input is two goroutines simultaneously calling +2; output is final qty = +4 with both returning nil.

### 2. Upper bound on quantity is undefined

- Decision: accept-modify-design
- Rationale: the upper bound is a boundary assumption between catalog and order; it should be made explicit in the design's "Premises and Constraints" first, then the plan can implement accordingly.
- Action: (route to design flow; not applied in this Phase 5)
````

### `docs/sys/order/cancel/order-cancel-design.md` (same-layer DC integrator god-view)

````markdown
# order-cancel design (god-view)

## Functional Purpose

Let a buyer cancel an unpaid order and trigger refund (if pre-authorized) and notification flows.

## User Story

- As a buyer, I want to cancel unpaid orders, so that I can withdraw my purchase intent.

## System Requirements

- Consistency: refund and notification execute only after order status transitions to cancelled.
- Failure recovery: notification failure must NOT roll back the order cancellation status.

## Sub-modules (same-layer DC integration)

This module uses `DC.SUBNAME` same-layer split because refund / notify share the same scope but the narrative is too long:

- [order-cancel-1000.aggregate-design.md](order-cancel-1000.aggregate-design.md) — main cancellation flow; depends on 1100 and 1200 finishing first.
- [order-cancel-1100.refund-design.md](order-cancel-1100.refund-design.md) — refund execution detail; parallel with 1200.
- [order-cancel-1200.notify-design.md](order-cancel-1200.notify-design.md) — notification execution detail; parallel with 1100.
````

Note: when a DC integrator design itself plays the god-view role, this directory **MUST NOT** contain any `order-cancel-plan*.md`; plan is fully handled by `order-cancel-1100.refund-plan.md` and `order-cancel-1200.notify-plan.md`.

## `check.py` Validation Output

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

Expected output (one line per check):

```
[PASS-NAME] docs/sys/order/order-design.md (design) DIRS='order'
[PASS-METADATA] docs/sys/order/order-design.md — .metadata.md present in same directory
[PASS-LINES] docs/sys/order/order-design.md (design) 35/300 lines

[PASS-NAME] docs/sys/order/create/order-create-design.md (design) DIRS='order-create'
[PASS-METADATA] docs/sys/order/create/order-create-design.md — .metadata.md present in same directory
[PASS-LINES] docs/sys/order/create/order-create-design.md (design) 28/300 lines

[PASS-NAME] docs/sys/order/create/order-create-plan-submit.01.md (plan) DIRS='order-create'
[PASS-METADATA] docs/sys/order/create/order-create-plan-submit.01.md — .metadata.md present in same directory
[PASS-LINES] docs/sys/order/create/order-create-plan-submit.01.md (plan) 120/500 lines

[PASS-NAME] docs/sys/order/create/order-create-plan-add_item-review.md (review) DIRS='order-create'
[PASS-METADATA] docs/sys/order/create/order-create-plan-add_item-review.md — .metadata.md present in same directory
[PASS-LINES] docs/sys/order/create/order-create-plan-add_item-review.md (review) 48/500 lines

[PASS-NAME] docs/sys/order/create/order-create-plan-submit.02-review-draft.md (review, draft) DIRS='order-create'
[PASS-METADATA] docs/sys/order/create/order-create-plan-submit.02-review-draft.md — .metadata.md present in same directory
[PASS-DRAFT] docs/sys/order/create/order-create-plan-submit.02-review-draft.md — placeholder file, content not written; remove `-draft` suffix on rename when complete

[PASS-NAME] docs/sys/order/read/order-read-design-draft.md (design, draft) DIRS='order-read'
[PASS-METADATA] docs/sys/order/read/order-read-design-draft.md — .metadata.md present in same directory
[PASS-DRAFT] docs/sys/order/read/order-read-design-draft.md — placeholder file, content not written; remove `-draft` suffix on rename when complete

[PASS-NAME] docs/sys/order/cancel/order-cancel-1100.refund-design.md (design) DIRS='order-cancel'
[PASS-METADATA] docs/sys/order/cancel/order-cancel-1100.refund-design.md — .metadata.md present in same directory
[PASS-LINES] docs/sys/order/cancel/order-cancel-1100.refund-design.md (design) 60/300 lines

[PASS-NAME] docs/sys/order/cancel/order-cancel-1200.notify-plan-review-draft.md (review, draft) DIRS='order-cancel'
[PASS-METADATA] docs/sys/order/cancel/order-cancel-1200.notify-plan-review-draft.md — .metadata.md present in same directory
[PASS-DRAFT] docs/sys/order/cancel/order-cancel-1200.notify-plan-review-draft.md — placeholder file, content not written; remove `-draft` suffix on rename when complete

[PASS-REGISTRY] docs/sys — 1 node, no cycles, all list.md / .metadata.md present
```

## Recursive Decomposition Trace from This Example

1. `order` is one-sentence describable but still contains ≥ 2 independent sub-directories → `god-view`. Create `create/` / `read/` / `cancel/` each with a `<child-DIRS>-design-draft.md`.
2. Enter `create` and re-decide: scope no longer needs sub-directories → `leaf`. Write the design and proceed to the plan three-phase flow.
3. Enter `read`: not yet started, so the `-draft` suffix is preserved.
4. Enter `cancel` and re-decide: refund / notify are not easily distinguishable as independent sub-directories but the content is too large → use same-layer `DC.SUBNAME` split. This layer's design degenerates into a narrative integrator (god-view); plan is handled per 1100 / 1200.

At each layer: split scope → confirm with one sentence → write design → `check.py` → commit → review → decide the next layer.
