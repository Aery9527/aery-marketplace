---
name: sys-design
description: >-
  Use for feature development that starts from design — creating or revising a
  design document, splitting a feature into modules, clarifying module
  boundaries, defining SBE, driving code through TDD, or measuring the
  performance of a finished feature. Use when the task is: building a new
  feature or module, changing a feature, reworking a module, designing the
  flow, TDD, SBE, load testing, benchmarking. The only specification document
  this skill produces is a design document; it MUST NOT produce
  implementation-plan or standalone SBE documents. Phase 4 additionally records
  performance measurements, and the later phases produce tests and
  implementation code.
---

# Sys Design

Design documents define module boundaries and behavior; implementation detail
lives in code alone. A confirmed design document becomes concrete SBE examples,
those examples are written as failing tests, and those tests drive the code.
The tests are the only home of the specification — it MUST NOT be duplicated
into a document.

## Phase Routing

- If the task creates or revises a design document, or splits a feature into modules, load [Phase 1 — Modular Design](references/phase1-design.md).
- If a confirmed leaf design document exists and the task defines concrete input/output examples, hunts edge cases, or renders them as failing tests, load [Phase 2 — SBE As Failing Tests](references/phase2-sbe.md).
- If a confirmed set of failing tests exists and the task implements against it, load [Phase 3 — Implementation](references/phase3-tdd.md).
- If a feature is already implemented and the task measures throughput, latency, or resource cost, load [Phase 4 — Performance Verification](references/phase4-benchmark.md).
- Each of the four phases is independently loadable. MUST load only the phase the current task needs, and MUST NOT load a phase reference it does not.
- The four bullets above are the only load decision. Every reference states the artifacts it produces, and the phases that depend on earlier output also state the state they must verify before starting, so any single phase is executable from a cold load.

## Document Model

Documentation descends through two layers: a topic layer describing the assembled whole, and a module layer describing the components it is assembled from.

- `bd-<topic-name>.md` — the assembly document, living in the `docs/` at a scope root — the repository root, or a submodule root in a monorepo. Its subject is what the assembled whole does: a business requirement, an architectural account, an end-to-end data flow. MUST express those relationships in Mermaid and MUST link to the nodes one level below it in the graph. It carries no line limit, and MUST NOT sink into behavior a design document below it already owns.
- `sd-<feature-name>.md` — the design document. Its subject is one module — a component the assembly is built from. MUST live in the folder that holds the corresponding code, and MUST NOT be collected under `docs/`. `<feature-name>` MUST NOT end in `-perf`, which is what separates a design document from the performance record beside it.
- `sd-<feature-name>-perf.md` — the performance record Phase 4 writes beside the code it measured. It records what was measured once, not how the system is put together, so it is not part of the graph below and no phase walks into it. It carries no line limit because it accumulates one measurement after another.
- The two layers answer different questions: `bd-*.md` answers what the system delivers and how the pieces combine to deliver it; `sd-*.md` answers what one piece does and where its boundary lies. A reader enters through a topic and descends into components.

Inside the module layer, `sd-*.md` may itself form a tree, and each node carries one of two roles:

- Overview role — describes an abstract concept and links to its sub-modules' design documents. MUST NOT be the input of Phase 2.
- Leaf role — describes one module's own behavior and links to the target code. Only a leaf is a valid input of Phase 2.

The two layers form one structural graph carrying two kinds of edge.

A composition edge points downward and says what a node is made of. There are four:

- a root `bd-*.md` links to each submodule `bd-*.md` taking part in its topic
- a `bd-*.md` links to every `sd-*.md` in its own scope that takes part
- an overview `sd-*.md` links to its child `sd-*.md`
- a leaf `sd-*.md` links to the target code

A dependency edge runs sideways and says what a module needs from elsewhere:

- any `sd-*.md` links to each `sd-*.md` whose capability it relies on

Depending on a module is not composing with it. A module that links to what it depends on does not own that module and does not become an overview because of it.

Phase 3 walks this graph in reverse from the leaf it implemented, so every structural edge MUST be a real Markdown link rather than an implied relationship.

A navigation link pointing back up — such as a submodule document offering a way back to the root topic — is not a structural edge. MUST NOT treat one as a parent relationship; doing so turns the reverse walk into a cycle.

A monorepo MUST nest the same model: the root `docs/` holds the `bd-*.md` describing how submodules assemble — one abstraction level higher — while each submodule's `bd-*.md` describes its own internals. A submodule document MUST NOT restate root-level assembly ownership as its own, but MAY carry a navigation link back to the root topic.

## Cross-Phase Rules

- A design document MUST NOT contain code. Interfaces and data views MUST be expressed as Markdown links to the target code, because duplicated detail drifts away from the code it describes.
- A design document MUST describe behavior and caveats. It MUST NOT duplicate algorithms, control flow, or field-level structure, and MAY name one current implementation only when that choice materially defines the module boundary, the observable behavior, or a compatibility contract.
- Wherever a document can show a relationship, a data flow, or a state transition as a diagram, it MUST use Mermaid.
- Mermaid blocks MUST use exactly three backticks and the lower-case `mermaid` info string, with no extra fence attributes, and MUST start in column one. Four-backtick fences, tilde fences, and diagrams indented inside a list item or blockquote MUST NOT be used, because the line count depends on that canonical form.
- One design document MUST NOT exceed 300 counted lines; a `-perf` record is exempt. Counted lines = total file lines minus every line inside a `mermaid` fenced block, fence lines included.
- Exceeding 300 counted lines means the module carries too much cognitive load. Splitting into sub-modules is the only permitted response. Deleting caveats, compressing prose, or moving text into Mermaid to lower the count MUST NOT be done.
- A link whose target does not exist yet MUST carry the marker `(planned)` immediately after it, and MUST lose that marker once the target exists. It MUST be a single-line inline link whose destination holds no space or parenthesis, and MUST NOT be a reference-style link, an image, or anything inside inline code — the tooling reads only this form, and a promise it cannot see reads as a promise already kept. The marker is what lets a reader tell a promise from a fact, and what lets the phase responsible for clearing it find every one by search.
- The user confirms each `bd-*.md` before the agent descends into its modules, confirms each `sd-*.md` level before descending to its children, and confirms the failing tests carrying the frozen SBE before any implementation is written. MUST NOT skip a gate.
- Phase 2 and Phase 3 run once per leaf, not once per tree. When Phase 1 leaves several leaves open, the user chooses which one to take next.
- Heading wording is the project's to choose, but MUST stay consistent across its documents: reuse the headings an existing document of the same kind already uses.
- Every design document this skill produces is written for a human reader. Present as much of it as possible visually in Mermaid, so the reader carries less load.
