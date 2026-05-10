# design.md Authoring Guide

> For an end-to-end example (god-view / leaf / draft / `DC.SUBNAME` same-layer split), see [example.md](example.md).
>
> Entering this document means: you are about to **add / modify / extend** some `design.md`.
> By scope size, design splits into two types that interlock as a "Russian doll" recursive decomposition:
> 1. `god-view` (the integrator type): scope still contains multiple independent sub-modules; this layer's design describes the outline + lists sub-modules (required + optional), and creates a `<child-DIRS>-design-draft.md` placeholder for each sub-module; this layer's design **MUST NOT** correspond to any plan.
> 2. `leaf` (the implementation type): scope no longer needs to be split into sub-directories; this layer can write an implementation-type design with corresponding plan (same-layer `DC.SUBNAME` split is still allowed for multiple design / plan files; in that case the top-level `<DIRS>-design.md` decides whether it corresponds to a plan based on its specific role); when done, enter the three-phase flow in [plan-instruction.md](plan-instruction.md).
>
> Any `-draft.md` is the starting point for the next round, recursing downward until all `leaf`s are complete. Each layer: complete → commit → pause for user review → only proceed to next layer / phase after user approval.

## Authoring Flow

Every design follows this flow; steps 3 / 4 / 8 branch by `god-view` / `leaf` type.

1. Confirm scope and file location:
    - **Pre-gate (MANDATORY for legacy projects first introducing this skill, or whenever a new scope is added)**: if the user did not explicitly specify which `docs/sys/` this design goes into, you **MUST** first proactively inventory and ask. **MUST NOT** assume the location or auto-create `docs/sys/`:
        - Inventory existing `docs/sys/` nodes in the project (root + every sub-module node registered via `list.md`); list them as options for the user.
        - If the project has no `docs/sys/` at all, explicitly say so and ask the initial location (root, an existing sub-module, or a new sub-module node).
        - Ask the user which `docs/sys/` this scope belongs to; if necessary, ask whether to register a new node in the upper-level `list.md`.
        - Only after the user explicitly specifies the location, proceed to the three branches below ("new feature / modify / draft handed down").
    - New feature: write a one-sentence "what problem does this feature solve". If you can't fit it in one sentence, this layer is almost certainly `god-view`.
        - Decide `docs/sys` location by scope: scope belongs entirely to a sub-module → that sub-module's `docs/sys/`; scope spans multiple sub-modules or is root-level → root's `docs/sys/`.
        - Boundary judgment: if a feature is mostly in one sub-module (rough estimate ≥ 80% of user story / system requirements belong to it), even with minor cross-module interactions, still place it in that sub-module's `docs/sys/`; cross-module dependencies go in the design's "Premises and Constraints" section.
        - When first using a sub-module's `docs/sys/`, you **MUST** create an empty `list.md` in it (even with no downstream nodes), and register the node in root or upper `list.md` (rules in [name-rules.md](name-rules.md)).
        - Then per [name-rules.md](name-rules.md), pick or create a directory under the chosen `docs/sys/`; newly created directories **MUST** also have a `.metadata.md` (empty file is fine).
    - Modify / extend existing: locate the target `design.md`; confirm this change still fits that scope; if it has spilled out, return to the "new feature" flow to split out a new file.
    - Draft handed down from upper-layer `god-view` (`*-design-draft.md`): location is fixed; start at step 2. **MUST NOT** assume this layer is `leaf`; **MUST** re-run step 2's `god-view` / `leaf` decision (this layer might still be `god-view` and need further splitting). This is the essence of "Russian doll" recursive decomposition. Rename happens at step 4.

2. Decide design type:
    - `god-view`: this layer's scope still requires further splitting into independent sub-directories (each sub-module gets its own `docs/sys/<sub>/` perspective with its own design / plan). Decision criteria (any one suffices): (a) you can list ≥ 2 sub-modules with clearly distinct responsibilities each worthy of its own sub-directory; or (b) one sentence cannot capture the overall scope. A `god-view` directory **MUST NOT** contain any `plan.md`; it does narrative integration only.
    - `leaf`: this layer's scope does not require further splitting into sub-directories; you can directly write the implementation-type design here with corresponding plan. If content grows too large, you may use same-layer `DC.SUBNAME` split for multiple design / plan files. In that case, `<DIRS>-design.md` degenerates into a god-view integrator (**no longer corresponds to any plan**), and plan is handled by each DC-split file (`<DIRS>-NNNN.SUBNAME-plan*.md`). Same-layer split does NOT count as downward decomposition. Decision: further sub-modules would only be function-level details, not worthy of independent sub-directories.
    - Boundary case (small same-layer split): even if you can list ≥ 2 sub-modules, if the total estimated content ≤ 300 lines (e.g. a "user auth system" with login + logout sub-domains), **prefer same-layer `DC.SUBNAME` split** (multiple design.md in same directory) over premature sub-directory creation; this layer is still considered `leaf`.

3. Write content:
    - `god-view` flow:
        1. List this layer's sub-modules; classify each as "Required" or "Optional":
            - Required: indispensable; without it the system / module cannot function.
            - Optional: nice-to-have; can be added later; does not affect core operation.
        2. Review Gate 1 (list review, no artifact): pause and present the sub-module list to the user (**no files created yet**); confirm the list is complete and the required / optional split is correct. If unsatisfactory, return to this step. Once approved, proceed.
        3. Per the "`god-view` template" below, write this layer's design.md: this layer is narrative integration only and **MUST NOT** include implementation detail; the "Sub-modules" section lists required + optional with a link to each `<child-DIRS>-design-draft.md`.
    - `leaf` flow: per the "`leaf` template" below, directly write the actual design content with user story as main body; describe "what" and "why" only, **never** any programming implementation.

4. Handle child files / rename:
    - `god-view`: for each sub-module, create the directory + `.metadata.md` (empty file is fine) + `<child-DIRS>-design-draft.md` placeholder (file existence is enough; content can be empty or just a placeholder title line). `<child-DIRS>` **MUST** be "this layer's `DIRS` + sub-directory name" joined by `-` (e.g. this layer is `docs/sys/ecommerce/`; sub-directory `catalog/` has child-DIRS = `ecommerce-catalog`; filename `ecommerce-catalog-design-draft.md`; **NEVER** write `catalog-design-draft.md`). If this layer needs same-layer `DC` split instead of downward sub-directories, each DC-split file **MUST** include `SUBNAME` (e.g. `ecommerce-1000.checkout-design.md`, `ecommerce-2000.fulfillment-design.md`); naming rules fully defined in [name-rules.md](name-rules.md), validated by `check.py`.
    - `leaf`: if this file was handed down from an upper-level `-draft.md`, rename to remove the `-draft` suffix.

5. Rule validation: run `python <task-decomposition-skill-root>/scripts/check.py <file path>`:
    - `god-view`: validate this layer's design.md (expect `PASS-NAME` + `PASS-LINES`) and each child `-draft.md` (expect `PASS-NAME` + `PASS-DRAFT`); also validate that all newly created sub-directories have `.metadata.md` (expect `PASS-METADATA`).
    - `leaf`: validate this design.md (expect `PASS-NAME` + `PASS-LINES`); `FAIL-LINES` **MUST** be split (see "Split Decision" below).
    - **NEVER** compare filenames / paths / line counts yourself; legality is determined by the script.
    - If `list.md` or new `docs/sys/` nodes are involved, **MUST** also run `check.py` against the relevant `docs/sys/` directory (`PASS-REGISTRY` / `FAIL-REGISTRY` / `FAIL-CYCLE`).

6. Commit: commit this layer's design.md (`god-view` includes all child `-draft.md`) per the project's existing commit conventions.

7. Review Gate 2 (post-commit content review): **MUST** pause and wait for the user to confirm the committed content (`god-view`: this layer's design.md + all child `-draft.md`; `leaf`: this design.md).
    - User requests adjustments: **return to step 1**, redo the flow, recommit, wait again.
    - User confirms: proceed to step 8.
    - Note: `god-view` goes through 2 review gates (step 3 bullet 2 + this step); `leaf` only this one.

8. Ask what's next:
    - `god-view`: user picks which sub-module(s) to enter next. Treat the chosen `<child-DIRS>-design-draft.md` as the starting point for the next round and **recursively return to step 1**. **MUST NOT** assume the sub-module is `leaf`; **MUST** re-run the `god-view` / `leaf` decision. **MUST NOT** enter sub-modules without user approval.
        - **Fork trigger**: if the user picks ≥ 2 sub-modules to proceed simultaneously, you **MUST** proactively ask whether to enable fork agents for parallel execution. Forking requires explicit user authorization; **MUST NOT** default to fork. Without authorization, use a single agent sequentially.
    - `leaf`: **MUST** proactively ask whether to enter plan planning next; **MUST NOT** enter the plan flow without user approval. Once approved, load [plan-instruction.md](plan-instruction.md) and follow its three-phase flow (Skeleton → Content → Implementation Gate). Implementation-type design must have corresponding `plan.md`; missing one means the feature is unimplemented. `god-view` design has no corresponding plan (see SKILL strong-dependency relations).

## Required Elements

Required elements differ by type:

### `god-view` design

- Functional purpose: this layer's overall scope purpose (why).
- User Story: this layer's overall use cases (can be abstract; details handled per sub-module).
- System requirements: this layer's overall system-level requirements (idempotency, concurrency, scheduling, cross-module concerns).
- Sub-modules: list required + optional, each with a one-sentence responsibility, plus a link to each `<child-DIRS>-design-draft.md`.

### `leaf` design

- Functional purpose: a paragraph explaining why this feature exists (why).
- User Story: list use cases in "As a X, I want Y, so that Z" format (user-facing what).
- System requirements: list system-level guarantees that MUST hold (scheduling, idempotency, concurrency, consistency, failure recovery, performance, audit, authorization, etc.). Describe "what is needed", not "how"; if none, write "None".
- Acceptance criteria: human-readable "what state counts as done" (done definition).
- Premises and constraints: explicit dependencies and boundary assumptions.

## Document Templates

Pick the template matching the type. Section titles and order **MUST NOT** be changed, to keep all design files in a consistent format.

### `god-view` design template

````markdown
# <DIRS>[-DC.SUBNAME] design (god-view)

## Functional Purpose

<Overall purpose of this layer's scope, one paragraph.>

## User Story

- As a <role>, I want <overall goal>, so that <overall benefit>.
- As a <role>, I want <overall goal>, so that <overall benefit>.

## System Requirements

- <category>: <overall requirement at this layer>
- <category>: <overall requirement at this layer>

## Sub-modules

### Required

- [<sub-module name>](<relative path/<child-DIRS>-design-draft.md>) — <one-sentence responsibility>
- [<sub-module name>](<relative path/<child-DIRS>-design-draft.md>) — <one-sentence responsibility>

### Optional

- [<sub-module name>](<relative path/<child-DIRS>-design-draft.md>) — <one-sentence responsibility>
- [<sub-module name>](<relative path/<child-DIRS>-design-draft.md>) — <one-sentence responsibility>
````

### `leaf` design template

````markdown
# <DIRS>[-DC.SUBNAME] design

## Functional Purpose

<One paragraph explaining what problem this feature solves and why.>

## User Story

- As a <role>, I want <action>, so that <benefit>.
- As a <role>, I want <action>, so that <benefit>.

## System Requirements

- <category>: <concrete requirement>
- <category>: <concrete requirement>

## Acceptance Criteria

- <human-verifiable done state 1>
- <human-verifiable done state 2>

## Premises and Constraints

- <dependency, boundary assumption, or out-of-scope item>
````

## Forbidden Content (belongs to `plan.md`)

- Programming language, framework, library, function, or interface names.
- Data structures, API paths, database query syntax.
- Concrete input / output examples (these are SBE — go in `plan.md`).
- Concrete implementation techniques for "system requirements" (e.g. using a database unique index for idempotency, using a scheduler for scheduling, using distributed lock to prevent races). System requirements only describe the requirement itself; implementation goes in `plan.md`.

## Split Decision

When `check.py` reports `FAIL-LINES`, you **MUST** split (`leaf` only; `god-view` rarely exceeds because it's narrative). Splitting order:

1. First choice: split into sub-directories — when the feature can be cleanly divided into independent sub-domains (this layer typically becomes `god-view`).
2. Second choice: same-layer `DC.SUBNAME` split — when sub-domains are not easily distinguishable but the content can still be grouped, use `DC.SUBNAME` encoding (each DC-split file MUST carry SUBNAME); rules in [name-rules.md](name-rules.md).

## Completion Checklist

- [ ] `check.py` reports `PASS-NAME` + `PASS-LINES` (`leaf`), or `PASS-NAME` + `PASS-LINES` + all child `PASS-DRAFT` (`god-view`).
- [ ] No programming implementation detail anywhere in the file.
- [ ] `god-view`: every listed sub-module has its directory, `.metadata.md`, and `<child-DIRS>-design-draft.md` created.
- [ ] `god-view`: no `plan.md` in this directory (god-view MUST NOT correspond to plan).
- [ ] `leaf`: proactively asked the user whether to enter plan planning next (the corresponding `plan.md` is handled in [plan-instruction.md](plan-instruction.md), not in this design's checklist).
- [ ] If handed down from `*-draft.md`, the `-draft` suffix has been removed by rename.
