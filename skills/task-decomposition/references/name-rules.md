# Path & Filename Rules

- All documents **MUST** live under some `docs/sys/`. When a project has multiple independent sub-modules with their own scope, each sub-module is allowed to have its own `docs/sys/`; cross-node links are registered via `list.md` (see "Multiple `docs/sys` Registration" below).
- These rules use path and filename to express a clear functional structure and execution direction; concise information alone sketches the system overview.
- Circular dependencies are **STRICTLY FORBIDDEN** under these rules; a clean dependency tree maintains module independence and reusability.

## Directory

- A directory name represents the meaning of a feature, e.g. `record/` for record-related features, `record/create/` for record creation, `record/read/` for record reading, etc.
- Nesting depth is unlimited, but each directory name **MUST** consist only of lowercase letters / digits (`[a-z0-9]`); other characters are **STRICTLY FORBIDDEN**.
- Keep directory names as short as possible — preferably a single word. If one word cannot capture the meaning, use one of the following:
    - Split downward into a sub-directory; if there is an obvious upper-lower feature relationship, you **MUST** split into sub-directories. For example "order creation" should be `order/create/`, not `order_create/`.
    - For domain-specific concepts that no single word can express, use an abbreviation, then explain the abbreviation's full name and meaning in `.metadata.md`.

## Filenames

The keywords appearing in filename rules are defined as follows:

- `DIRS`: the path's directory names from `docs/sys/` to the file's containing directory, joined by `-`. For example, `docs/sys/record/create/` has `DIRS = record-create` (after stripping `docs/sys/`).
- `DC` (dependence_code): a fixed 4-digit number expressing dependency relationships among files. Encoding rules:
    - Each digit is a group; same group = no dependency; **higher-position digits depend on lower-position digits**.
    - Each group has `0` as its root; `1-9` are tasks within that group with no mutual dependency, parallelizable. So `1-9` tasks must all complete before `0` can proceed.
    - Example: `1000`, `2000` are non-dependent tasks within the same group (thousands); they can run concurrently.
    - Example: `1000`, `1100`, `1200` are in the same group (thousands). Per "higher digit depends on lower digit": `1000` depends on both `1100` and `1200` finishing first; `1100` and `1200` can run in parallel.
    - Numbers thus go from high complexity (left) to low complexity (right): the leftmost group represents the largest scope; the rightmost the smallest.
    - The benefit: when a feature turns out to be too large, you can split downward without renaming unrelated files — just add lower-digit numbers (`1000` → `1100`, `1200`...).
    - **Top-level entry MUST start at the thousands group**: when a directory first introduces `DC` encoding, the top-level split MUST start at the thousands group (`1000`, `2000`, `3000`...). Starting directly at hundreds or smaller (`0100`, `0010`) is **FORBIDDEN**; lower digits are reserved for later downward splits.
    - `0000` is **STRICTLY FORBIDDEN**. By the rules above, `0000` would be the topmost integration document; that role is filled solely by the file with no `DC` (`<DIRS>-design.md`). `<DIRS>-0000-design.md` is **STRICTLY FORBIDDEN** to avoid two filenames simultaneously expressing "topmost".
    - If 4 digits are not enough, the directory's scope is **already too large**; you **MUST** split into sub-directories. Adding more digits is **STRICTLY FORBIDDEN**.
- `SUBNAME`: sub-name. **MUST** consist only of lowercase letters / digits / underscore (`[a-z0-9_]`); other characters **STRICTLY FORBIDDEN**. Used in filenames for secondary topic differentiation.
- `SEQUENCE`: a 2-digit sequence number, used mainly in `plan.md`.
- `draft`: a filename suffix marking a planned-but-not-started item. Avoids the need for a separate list registry.

### `.metadata.md`

- Holds extra metadata for the directory (the feature) — primarily abbreviation definitions. **STRICTLY FORBIDDEN** to describe any feature content.
- Every directory **MUST** have a `.metadata.md`; even with no content, the empty file **MUST** exist.

### `design.md`

- Audience is humans; this is an SA document. Content is an abstract feature description; main body is `user story`, also covering system-level requirements (idempotency, concurrency control, scheduling, caveats, etc.).
- **MUST** strictly follow the naming rule `<DIRS>[-DC.SUBNAME]-design[-draft].md`; content MUST NOT exceed 300 lines.
- Every directory **MUST** have a top-level `<DIRS>-design.md`. When the directory's feature is small, this single file describes everything.
- When a top-level `<DIRS>-design.md` cannot fit the entire content (would exceed 300 lines), use one of these approaches:
    - Split with `-DC.SUBNAME` — multiple files in the same directory. Use this when the features being split **have no clear scope categorization**, so forcing them into sub-directories would be artificial. In this case `<DIRS>-design.md` becomes a `god-view` integrating those DC files; itself **does not** correspond to any `plan.md`.
    - Split into sub-directories, deferring detail to a deeper abstraction layer. Use this when the features being split **have clear scope categorization**, so sub-directories naturally divide them. In this case `<DIRS>-design.md` is not necessarily `god-view` — it can also have a corresponding `plan.md` that orchestrates sub-directory features — but is still bound by the 300-line limit.

### `plan.md`

- Audience is AI agents; this is an SD document. Content is a concrete implementation plan and **MUST** be expressed as `SBE`; each input/output example is simultaneously the implementation target and the acceptance criterion.
- **MUST** strictly follow the naming rule `<DIRS>[-DC.SUBNAME]-plan[-SUBNAME[.SEQUENCE]][-draft].md`; content MUST NOT exceed 500 lines.
- The `plan.md` filename prefix MUST correspond to its `design.md`: when the design has `DC` split, the plan must be `<DIRS>-DC.SUBNAME-plan*.md`; without `DC` split, the plan must be `<DIRS>-plan*.md`.
- When the top-level `<DIRS>-design.md` plays the `god-view` role, this directory **MUST NOT** contain any `plan.md`.
- When `plan.md` content benefits from organizing by function name, you may use `-SUBNAME` for the topic; not limited to function names — depends on the implementation analysis.
- When `-SUBNAME` is used to split multiple `plan.md` files and a particular plan still has too many `SBE` test cases (>500 lines), you **MUST** further split using `SEQUENCE` (e.g. `.01`, `.02`, ...) to reduce per-file implementation burden.

## Multiple `docs/sys` Registration (list.md)

- Every `docs/sys/` directory MUST have a `list.md` registry; even with no content, it MUST exist.
- When a project has multiple sub-modules with independent scope (e.g. monorepo submodule, microservice, subsystem, subproject, plugin — any internal unit with independent boundary), use this registration mechanism to distribute documents per sub-module's own `docs/sys/`.
- When a `design.md` / `plan.md` scope **belongs entirely** to a sub-module, the document **MUST** live under that sub-module's own `docs/sys/`. The upper-level `list.md` links to each sub-module's `docs/sys/`, forming a tree (or DAG) document hierarchy.
- Each registered path **MUST** actually exist, be a directory, and end with `docs/sys`.
- Circular dependencies are **STRICTLY FORBIDDEN**: if A's `list.md` registers B, then B (or any descendant) MUST NOT register A or any node along the chain.
- Sharing nodes across multiple registrations (DAG sharing) is allowed and not considered a cycle.
- The whole registry tree is verified by `check.py` (the same script handles both file-level naming / line-count checks and registry-level reference / cycle checks).

### `list.md` Content

````markdown
# docs/sys Registry

- [<display name>](<relative path .../docs/sys>)
- [<display name>](<relative path .../docs/sys>)
````

## Examples

### Directory naming

```
✓ record/
✓ record/create/
✓ record/create/validator/
✓ orderpayment/             ← pure [a-z0-9] is fine
✗ order_payment/            ← underscore FORBIDDEN; multi-word MUST split downward
✗ order-payment/            ← hyphen FORBIDDEN
✗ orderPayment/             ← uppercase FORBIDDEN
```

### How DIRS is generated

DIRS = all directory names from `docs/sys/` down to the file's containing directory, joined by `-`:

```
docs/sys/record/                    → DIRS = record
docs/sys/record/create/             → DIRS = record-create
docs/sys/order/payment/refund/      → DIRS = order-payment-refund
```

### `.metadata.md` placement

Every directory **MUST** contain a `.metadata.md` (even if empty):

```
docs/sys/
    .metadata.md                ← required
    record/
        .metadata.md            ← required
        record-design.md
        create/
            .metadata.md        ← required
            record-create-design.md
```

### `design.md` naming

Without `DC` split (single file is enough):

```
docs/sys/record/
    record-design.md            ← DIRS = record
    record-design-draft.md      ← in draft (content not yet written)

docs/sys/record/create/
    record-create-design.md     ← DIRS = record-create
```

With `DC.SUBNAME` same-layer split (content too large but no clear sub-directory categorization):

```
docs/sys/record/
    record-design.md            ← god-view integrator (no DC, always exists)
    record-1000.aggregate-design.md     ← DC=1000 SUBNAME=aggregate (depends on 1100 / 1200)
    record-1100.create-design.md        ← parallel with 1200
    record-1200.read-design.md          ← parallel with 1100
    ✗ record-0000.foo-design.md         ← FORBIDDEN: 0000 overlaps with the no-DC main design
    ✗ record-1000-design.md             ← FORBIDDEN: DC must come with SUBNAME
```

When `record-design.md` plays the god-view role, this directory **MUST NOT** contain any `record-plan*.md`.

### `plan.md` naming

The `plan.md` filename prefix MUST correspond to its `design.md`:

```
docs/sys/record/
    record-design.md
    record-plan.md                          ← corresponds to record-design.md
    record-plan-create_record.md            ← SUBNAME = create_record
    record-plan-create_record.01.md         ← 1st batch of SBE test cases under same SUBNAME
    record-plan-create_record.02.md         ← 2nd batch of SBE test cases under same SUBNAME
    record-plan-create_record.01-draft.md   ← in draft

When the design has DC.SUBNAME split:
    record-1100.create-design.md
    record-1100.create-plan.md              ← corresponds to 1100.create design
    record-1100.create-plan-validate.md     ← corresponds to 1100.create design + plan SUBNAME
```

### `DC` encoding

```
record-1000.integrate-design.md   ← largest scope, depends on 1100 and 1200 finishing first
record-1100.create-design.md      ← sub-task, parallel with 1200
record-1200.read-design.md        ← sub-task, parallel with 1100

Later 1100 grew too large; split it directly:
    record-1100.create-design.md   → depends on 1110 and 1120
    record-1110.validate-design.md → parallel with 1120
    record-1120.persist-design.md  → parallel with 1110
(1200 and 1000 names unaffected)

✗ record-0001.foo-design.md       ← FORBIDDEN: starting from a smaller-digit group
✗ record-0000.foo-design.md       ← FORBIDDEN: 0000
✗ record-1000-design.md           ← FORBIDDEN: DC without SUBNAME
```

### Multiple `docs/sys` registration (list.md)

Structural example — project root aggregates two sub-module document nodes:

```
project-root/
  docs/sys/
    .metadata.md
    list.md                         ← root's god-view (registers each sub-module)
    system/
      .metadata.md
      system-design.md              ← cross-module system-level design (MUST be in a sub-directory; cannot sit directly under docs/sys/ root)

module-a/
  docs/sys/                         ← module-a's own feature design
    .metadata.md
    list.md                         ← MUST exist even with no downstream nodes (empty bullet list is fine)

module-b/
  docs/sys/                         ← module-b's own feature design
    .metadata.md
    list.md
```

`project-root/docs/sys/list.md` content:

```markdown
# docs/sys Registry

- [module-a](../../module-a/docs/sys)
- [module-b](../../module-b/docs/sys)
```

Validation command:

```
python <SKILL_ROOT>/scripts/check.py project-root/docs/sys
```

Possible output:

```
✓ [PASS-REGISTRY]    project-root/docs/sys — 3 nodes, no cycles, all list.md / .metadata.md present
✗ [FAIL-LIST-MISSING] module-a/docs/sys — list.md missing (must exist as empty file even with no downstream nodes)
✗ [FAIL-CYCLE]       circular dependency: project-root/docs/sys -> module-b/docs/sys -> project-root/docs/sys
✗ [FAIL-REGISTRY]    project-root/docs/sys/list.md:3 — referenced path does not exist '../../missing/docs/sys'
```

### Filename validation error examples

```
✗ [FAIL-NAME]          catalog-design-draft.md — DIRS mismatch: filename says 'catalog' but path-derived 'ecommerce-catalog'
✗ [FAIL-NAME]          record-design.draft.md — does not match design / plan naming (draft suffix MUST be -draft, NOT .draft)
✗ [FAIL-NAME]          record-0000.foo-design.md — DC '0000' is STRICTLY FORBIDDEN
✗ [FAIL-METADATA]      record-design.md — .metadata.md missing in same directory
✗ [FAIL-GODVIEW-PLAN]  record-plan.md — same directory has both DC-split design and plan*.md
```
