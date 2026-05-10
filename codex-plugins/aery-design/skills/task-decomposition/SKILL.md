---
name: task-decomposition
description: >-
  This skill MUST be loaded — and MUST NOT be skipped — for any phase of "planning / designing / decomposing / writing" a system feature or behavior. This includes defining a new feature scope, deciding whether to split into multiple sub-modules or files, deciding the design / plan structure, writing / modifying / extending design or plan, or accessing any document under `docs/sys/`.
  This skill MUST be engaged at the very start of planning, NOT only when "you are about to write the document". Whether the scope is too large, whether to split, and which `docs/sys` to put it in — these decisions MUST be judged by this skill before any writing begins.
  Includes strict path / filename rules, the three-phase design / plan workflow, and the `check.py` one-stop validation script.
---

# task-decomposition

When performing any **planning** / **design** / **plan** task, you MUST strictly follow the rules in [Path & Filename Rules](references/name-rules.md). The path and filename are simultaneously the scope-decomposition criteria and the functional structure of the system; you MUST use this skill's rules to decide *how* to split before writing anything, not after the fact.

By enforcing a consistent functional structure and decomposition criteria, anyone can quickly understand the repo's feature landscape from *directory layout* and *file listing* alone — establishing a system overview with minimal resources rather than loading all content first and filtering afterwards.

## Core Concepts

- The terms `DIRS`, `DC`, `SUBNAME`, `SEQUENCE`, `draft` referenced below are defined in [name-rules.md](references/name-rules.md); load it on demand when you actually need the definitions.
- `<task-decomposition-skill-root>` means the installed skill directory containing this `SKILL.md`; when a rule asks you to run [scripts/check.py](scripts/check.py), resolve the path from that skill root instead of assuming a fixed marketplace location.
- All documents live under some `docs/sys/`. A directory name represents the meaning of a feature; its content is the detail of that feature. The content may be another directory (further subdivided into independent / oversized sub-features), or actual `design.md` / `plan.md` files.
- `design.md` filename format: `<DIRS>[-DC.SUBNAME]-design[-draft].md`
    - Audience is humans; this is an SA document. Content is an abstract feature description, with `user story` as the main body, and includes system-level requirements (idempotency, concurrency control, scheduling, caveats, etc.).
    - Content MUST NOT touch any programming language or system implementation detail; it only describes "what" and "why", never "how".
    - One `design.md` MUST NOT exceed 300 lines. Exceeding the limit means the scope is too large; you **MUST** split using one of the two ways below:
        - Split with `DC` — multiple `-DC.SUBNAME-design.md` files in the same directory, meaning this directory's feature is composed of these `-DC.SUBNAME-design.md` files.
        - Split into one or more sub-directories, deferring detail to a deeper abstraction layer.
    - This file plays one of two roles:
        - `god-view`: a high-abstraction narrative integrating multiple sub-features. Content links to sub-directories or other `design.md` files. **MUST NOT** have any corresponding `plan.md`.
        - `leaf`: a small, directly implementable feature. **MUST** have one or more corresponding `plan.md`.
- `plan.md` filename format: `<DIRS>[-DC.SUBNAME]-plan[-SUBNAME[.SEQUENCE]][-draft].md`
    - Audience is AI agents; this is an SD document. Content is a concrete implementation plan and **MUST** be expressed as `SBE` (Specification by Example); each input/output example is simultaneously the implementation target and acceptance criterion.
    - Content covers concrete implementation: programming language, module breakdown, function signatures, data structures, etc. — describing "how"; do NOT repeat "what" / "why" already covered in the `design.md`.
    - One `plan.md` MUST NOT exceed 500 lines. Beyond that, the implementation burden is too large; you **MUST** split by `SUBNAME` (topic). If a single `SUBNAME` still has too many SBE test cases, further split by 2-digit sequence `.01`, `.02`, ...
- `draft` is the file suffix marking a "planned but not yet started" item. Its purpose is to record what has been planned but not yet authored, eliminating the need for an extra list registry.
- `docs/sys/list.md` registry: when a project already has multiple independent sub-modules (e.g. monorepo submodule, microservice, subsystem, subproject, etc.), this registers the `docs/sys/` paths of each sub-module so documents can be naturally distributed at the project structure level — achieving good decoupling and modularity, while the root `list.md` still gives the full feature picture at a glance.

## Further Reading by Task

- For any task that **adds / modifies / extends** a `design.md`, load [design-instruction.md](references/design-instruction.md).
- For any task that **adds / modifies / extends** a `plan.md`, load [plan-instruction.md](references/plan-instruction.md).
- To see an end-to-end "directory + filename + content" demonstration, load [example.md](references/example.md) (uses an `order` system as scenario, covering god-view, leaf, `-draft`, `DC.SUBNAME` same-layer split, `.metadata.md` / `list.md`, and `check.py` output).
