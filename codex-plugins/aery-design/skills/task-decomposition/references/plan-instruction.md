# plan.md Authoring Guide

> For an end-to-end example (including plan template, SBE writing, `.SEQUENCE` split), see [example.md](example.md).
>
> Entering this document means: you are about to **add / modify / extend** some `plan.md`.
> The corresponding `design.md` MUST already exist and MUST be `leaf` (a `god-view` directory **MUST NOT** contain any `plan.md`); if not yet existing or needs adjustment, return to [design-instruction.md](design-instruction.md).
> The whole flow is three phases: **Skeleton** (list all plan files with the `-draft.md` placeholder suffix) → **Content** (parallel-fill content per `DC` dependency) → **Implementation Gate** (only after every plan is complete may implementation begin). Inside Phase 2, **DO NOT** pause for per-file review, to avoid breaking the parallel flow.
>
> Common pitfall: skipping Phase 1 and writing SBE directly. This appears to save a step but actually loses the abilities to (a) let the user review the full plan structure in one shot and (b) parallel-fill per `DC`. Such a shortcut is **FORBIDDEN**.

## Authoring Flow

### Entry-point selection

- First time planning a plan for a design: start at Phase 1.
- Modifying / extending an existing plan: skip Phase 1 and go straight to Phase 2's fill task on the target file; still go through Phase 3 gate at the end.

### Phase 1: Skeleton (planning the plan structure, sequential)

Entry condition: corresponding `design.md` is committed; user has approved entering the plan phase; the design is `leaf` (a `god-view` directory **MUST NOT** contain any `plan.md`; its descendant designs each enter their own plan flow).

1. Locate the corresponding `design.md`: find it by `<DIRS>[-DC.SUBNAME]` (rules in [name-rules.md](name-rules.md)). Every `leaf` design must have corresponding `plan.md` in the same `docs/sys/` as the design; missing it means the feature is unimplemented.
2. Plan all plan files: per the design's user stories, system requirements, `DC.SUBNAME` splits, etc., list every plan file this design needs; naming follows [name-rules.md](name-rules.md), and the `-draft` placeholder suffix **MUST** be appended: `<DIRS>[-DC.SUBNAME]-plan[-SUBNAME[.SEQUENCE]]-draft.md`.
3. Create each `-draft.md`: just create the file (content can be empty or just a placeholder title); writing actual SBE specs at this stage is **FORBIDDEN**.
4. Rule validation: run `python <SKILL_ROOT>/scripts/check.py <file path>` against each `-draft.md` (see SKILL "Script Execution Convention" for how `<SKILL_ROOT>` is resolved); expect `PASS-NAME` + `PASS-DRAFT`. **NEVER** compare filenames / paths yourself; legality is determined by the script.
    - If `list.md` or new `docs/sys/` nodes are involved, **MUST** also run `check.py` against the relevant `docs/sys/` (`PASS-REGISTRY` / `FAIL-REGISTRY` / `FAIL-CYCLE`).
5. Pause for skeleton review: **MUST** pause and wait for the user to verify that the skeleton fully covers the design's user stories and system requirements.
    - Not satisfied: return to step 2 to fill gaps.
    - Satisfied: proceed to step 6.
6. Commit skeleton: commit all `-draft.md` files per the project's existing commit conventions.

### Phase 2: Content (parallel content fill)

Entry condition: skeleton committed. May be executed by a single agent or multiple fork agents **in parallel** (parallelism range determined by `DC` dependencies).

Fork trigger: when `DC` encoding shows ≥ 2 mutually independent parallelizable tasks (e.g. multiple plans in the same group with no inter-dependencies), you **MUST** proactively ask the user whether to enable fork agents; forking requires explicit user authorization, **defaulting to fork is FORBIDDEN**. Without authorization, use a single agent sequentially per `DC` dependency.

**Single `-draft.md` fill task** (each fork agent runs this once):

1. Confirm `DC` dependency: per `DC` encoding, confirm this plan's prerequisites (higher digit depends on lower) are complete; starting before prerequisites finish is **STRICTLY FORBIDDEN**.
2. Write content: per the "Document Template" below, with concrete input / output examples for every SBE behavior. **Examples are simultaneously the implementation target and the acceptance criteria**.
3. Rename: when content is complete, rename from `*-draft.md` to `*.md` (remove the `-draft` suffix).
4. Rule validation: run `check.py` against the renamed file; expect `PASS-NAME` + `PASS-LINES` (or `WARN-LINES` based on splitting decision).
5. Commit: commit this plan's content change. **No need** to pause for per-file review.

**Phase 2 termination**: all `-draft.md` files have been renamed and all plan `check.py` validations pass.

**Main agent responsibility**: the main agent that initiated Phase 2 (whether or not fork agents are enabled) is responsible for collecting all task completion states. Fork agents terminate after finishing their individual plan and are **NOT** responsible for triggering Phase 3. Once all child agents have ended and there is confirmed no `-draft.md` residue (commands listed in Phase 3 step 1), the **main agent MUST** proceed to Phase 3 gate; **silent waiting or letting the flow stop naturally is FORBIDDEN**.

### Phase 3: Implementation Gate (final confirmation)

Entry condition: Phase 2 ended (no `-draft.md` residue).

1. Confirm there is no `-draft.md` residue under `docs/sys/`. Pick the command for your environment:
    - POSIX (bash / zsh): `find <docs/sys path> -name "*-draft.md"`
    - Windows PowerShell: `Get-ChildItem -Path <docs/sys path> -Filter "*-draft.md" -Recurse`
    - Cross-platform: `python -c "import pathlib; [print(p) for p in pathlib.Path('<docs/sys path>').rglob('*-draft.md')]"`
2. Pause for final review: **MUST** pause and wait for the user to verify the overall plan structure and content.
3. Ask what's next: **MUST** proactively ask for the next action (enter implementation, more planning, end this task); **MUST NOT** enter implementation without user approval.

## Required Elements

- Implementation boundary: list involved package / module / file paths.
- Interface definitions: function / type / interface signatures to add or modify.
- System requirements mapping: for every "system requirement" item in the corresponding `design.md`, list the implementation technique used (e.g. database unique index for idempotency, scheduler for scheduling, distributed lock for race protection). The design says "what is needed"; the plan says "how".
- SBE specs: each behavior in "Input → Output" form; examples MUST be concrete and executable.
- External dependencies: required packages, external services, prerequisite plans.

## Document Template

Use this skeleton when creating or modifying a `plan.md`. Section titles and order **MUST NOT** be changed, to keep all plan files consistent:

````markdown
# <DIRS>[-DC.SUBNAME] plan[-SUBNAME[.SEQUENCE]]

> Corresponds to design: [<DIRS>[-DC.SUBNAME]-design.md](<relative path>)

## Implementation Boundary

- package / module: <path>
- Files involved: <file path list>

## Interface Definitions

<List function / type / interface signatures to add or modify.>

## System Requirements Mapping

- <design system-requirement category>: <implementation technique used here>
- <design system-requirement category>: <implementation technique used here>

## SBE Specs

### 1. <behavior description>

- Input: <concrete executable value>
- Output: <concrete return value and side-effects>

### 2. <behavior description>

- Input: ...
- Output: ...

## External Dependencies

- <dependent package / external service / prerequisite plan>
````

## Forbidden Content (belongs to `design.md`)

- Repeating "why this feature exists" — link to the `design.md` instead.
- Abstract user stories — they are already in the corresponding `design.md`.

## SBE Authoring Points

Every SBE group **MUST** satisfy:

1. Concrete input: provide values that can be pasted and executed (e.g. `userID = "u-12345"`); do not write abstract descriptions (e.g. `a valid userID`).
2. Concrete output: explicitly list return values and side-effects (e.g. `returns success; one record added in the target storage layer`).
3. Boundary coverage: besides the happy path, include at least one failure or boundary case.

## Split Decision

When `check.py` reports `WARN-LINES`, splitting is recommended (not mandatory; depends on whether the topic can be split cleanly). Splitting order:

1. First choice: split by `SUBNAME` topic — e.g. by function name (must be in snake_case), `<DIRS>-plan-<func_name>.md`. SUBNAME only allows `[a-z0-9_]`; camelCase / kebab-case are forbidden.
2. Second choice: under the same `SUBNAME`, further split by sequence — when a single `SUBNAME` still has too many SBE test cases, split into `.01`, `.02`, etc. (SEQUENCE uses `.NN`, NOT `-NN`).

## Completion Checklist (applies to each plan completed in Phase 2)

- [ ] Corresponding `design.md` exists.
- [ ] Every behavior has concrete input / output examples.
- [ ] Every "system requirement" in the design has a corresponding implementation technique listed.
- [ ] No abstract "why this feature exists" content.
- [ ] `-draft` suffix has been removed by rename.
- [ ] `check.py` reports `PASS-NAME` + `PASS-LINES`, or `WARN-LINES` but split sensibly.
- [ ] If the `design.md` needs synced adjustment, the sync is done.
