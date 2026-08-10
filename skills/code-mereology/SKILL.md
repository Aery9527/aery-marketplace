---
name: code-mereology
description: >-
  Use for feature development that starts from design — creating or revising a
  design document, splitting a feature into modules, clarifying module
  boundaries, defining SBE, driving code through TDD, or measuring the
  performance of a finished feature. Also load it before modifying existing
  code in a repository already under development, so the change is checked
  against any design document that already covers what it touches. Use when the
  task is: building a new feature or module, changing a feature, reworking a
  module, modifying existing code, designing the flow, TDD, SBE, load testing,
  benchmarking, capturing work to defer in an sd-*-plan.md file, or reviewing
  deferred plans that remain. The only specification document this skill
  produces is a design document. A plan is temporary intent rather than a
  specification and is deleted after delivery. Phase 4 additionally records
  performance measurements, and the later phases produce tests and
  implementation code.
---

# Code Mereology

Design documents define module boundaries and behavior; implementation detail
lives in code alone. A confirmed design document becomes concrete SBE examples,
those examples are written as failing tests, and those tests drive the code.
The tests are the only home of the specification — it MUST NOT be duplicated
into a document. An `sd-*-plan.md` file is a disposable record of intended
future work, not another specification source.

## Phase Routing

- A request only to capture or review deferred plans does not enter a phase. Follow [Deferred Change Plans](#deferred-change-plans) and MUST NOT load a phase reference.
- When the user chooses to execute a deferred-change entry, treat only that entry as the feature request and match the phase rules below. The entry MUST NOT bypass a design or test confirmation gate.
- If the task creates or revises a design document, or splits a feature into modules, load [Phase 1 — Modular Design](references/phase1-design.md).
- If a confirmed leaf design document exists and the task defines concrete input/output examples, hunts edge cases, or renders them as failing tests, load [Phase 2 — SBE As Failing Tests](references/phase2-sbe.md).
- If a confirmed set of failing tests exists and the task implements against it, load [Phase 3 — Implementation](references/phase3-tdd.md).
- If a feature is already implemented and the task measures throughput, latency, or resource cost, load [Phase 4 — Performance Verification](references/phase4-benchmark.md).
- Otherwise the task is a feature or module change with no confirmed artifact yet to build on, so load [Phase 1 — Modular Design](references/phase1-design.md). Match the four bullets above first; this one only catches what none of them did.
- Each of the four phases is independently loadable. MUST load only the phase the current task needs, and MUST NOT load a phase reference it does not.
- The five phase bullets above are the only phase-reference load decision, and they MUST be matched in order. Every reference states the artifacts it produces, and the phases that depend on earlier output also state the state they must verify before starting, so any single phase is executable from a cold load.

## Document Model

Documentation descends through two layers: a topic layer describing the assembled whole, and a module layer describing the components it is assembled from.

- `bd-<topic-name>.md` — the assembly document, living in the `docs/` at a scope root — the repository root, or a submodule root in a monorepo. Its subject is what the assembled whole does: a business requirement, an architectural account, an end-to-end data flow. MUST express those relationships in Mermaid and MUST link to the nodes one level below it in the graph. It carries no line limit, and MUST NOT sink into behavior a design document below it already owns.
- `sd-<feature-name>.md` — the design document. Its subject is one module — a component the assembly is built from. MUST live in the folder that holds the corresponding code, and MUST NOT be collected under `docs/`. `<feature-name>` MUST NOT end in `-perf` or `-plan`, which separates a design document from the temporary records beside it.
- `sd-<feature-name>-plan.md` — a temporary deferred-change plan beside the existing `sd-<feature-name>.md`. It describes work expected to happen later, is not a specification or graph node, and MAY remain unlinked from every other document. Discovery comes from the plan search, not graph traversal. It carries no line limit, because that limit measures the cognitive load of a design and a plan is deferred intent, not a design.
- `sd-<feature-name>-perf.md` — the performance record Phase 4 writes beside the code it measured. It records what was measured once, not how the system is put together, so it is not part of the graph below and no phase walks into it. It carries no line limit, because that limit measures the cognitive load of a design and this is a record of what was measured.
- The two layers answer different questions: `bd-*.md` answers what the system delivers and how the pieces combine to deliver it; `sd-*.md` answers what one piece does and where its boundary lies. A reader enters through a topic and descends into components.

Inside the module layer, `sd-*.md` may itself form a tree, and each node carries one of two roles:

- Overview role — describes an abstract concept and links to its sub-modules' design documents. MUST NOT be the input of Phase 2.
- Leaf role — describes one module's own behavior and links to the target code. Only a leaf is a valid input of Phase 2.

A module that is already implemented and has no design document MAY be entered as a partial leaf when something new depends on it: it describes only the capability being depended on and leaves the rest of that module undescribed, so the dependency has a real document to link to without the whole module having to be documented first. Partial is a property of a leaf, not a third role. It MUST carry the `code-mereology-partial` marker listing what it covers, and MUST NOT be the input of Phase 2 for any behavior that marker still excludes. It grows one capability at a time, as each is depended on or changed, and the marker comes off once the last one is described.

The two layers form one structural graph carrying two kinds of edge.

A composition edge points downward and says what a node is made of. There are four:

- a root `bd-*.md` links to each submodule `bd-*.md` taking part in its topic
- a `bd-*.md` links to every `sd-*.md` in its own scope that takes part
- an overview `sd-*.md` links to its child `sd-*.md`
- a leaf `sd-*.md` links to the target code

A dependency edge runs sideways and says what a module needs from elsewhere:

- any `sd-*.md` links to each `sd-*.md` whose capability it relies on

Depending on a module is not composing with it. A module that links to what it depends on does not own that module and does not become an overview because of it.

Phase 3 walks this graph in reverse from the leaf it implemented, so every structural edge MUST be a real Markdown link rather than an implied relationship. A `-plan` file is outside this graph and MUST NOT be included in that walk.

A navigation link pointing back up — such as a submodule document offering a way back to the root topic — is not a structural edge. MUST NOT treat one as a parent relationship; doing so turns the reverse walk into a cycle.

A monorepo MUST nest the same model: the root `docs/` holds the `bd-*.md` describing how submodules assemble — one abstraction level higher — while each submodule's `bd-*.md` describes its own internals. A submodule document MUST NOT restate root-level assembly ownership as its own, but MAY carry a navigation link back to the root topic.

## Deferred Change Plans

- Create `sd-<feature-name>-plan.md` beside an existing `sd-<feature-name>.md` only when the user wants to record a module change for later execution. Removing the `-plan` suffix MUST yield that companion design document's basename.
- A `sd-<feature-name>-plan.md` file MAY hold more than one deferred-change entry. A delivered design document keeps attracting change requests over time, and each MAY be recorded before its turn to execute arrives. Separate entries with a blank line, a `---` line on its own, then another blank line — the surrounding blank lines MUST both be present, because a `---` line directly under a paragraph is read as a heading underline rather than a separator. The file MUST NOT open with a `---` line, which at the top of a file reads as a frontmatter delimiter instead. Entries MUST be appended in the order they were recorded, and each MUST be self-contained: nothing in it depends on reading another entry in the same file.
- Each entry MUST open with the reason it exists — the requirement or observation that made the change necessary — before the delta itself. That reason is what lets a later reader judge whether the entry is still worth executing once the situation that prompted it has faded from memory. Beyond the reason, an entry MUST contain only the intended future delta and the execution, migration, or verification notes needed to resume it. It MUST NOT present proposed behavior as current fact or as confirmed specification. Phase 1 MUST revalidate the proposed behavior, and Phase 2 MUST revalidate any concrete examples.
- A plan file MAY remain unlinked from every document. Assembly and design documents MUST NOT add a structural edge to it merely for discoverability; the plan file MAY link outward to the current design or code for context.
- A deferred-change entry MAY remain deferred for any length of time. To review outstanding plans, run [list_plans.py](scripts/list_plans.py) against the repository root, then read each reported file and summarize the work that remains in every entry it holds.
- Whenever a phase selects or walks an `sd-<feature-name>.md`, derive the sibling `sd-<feature-name>-plan.md` path and read it if it exists. This filename lookup preserves cold-load discovery without adding the plan file to the document graph.
- When the user chooses one entry to execute, treat only that entry as the feature request; the file's other entries stay deferred. Phase 1 MUST first update and confirm the companion design document. Keep the entry while Phase 2 freezes the SBE in failing tests and Phase 3 implements it. The entry carries intent across a pause but never replaces an artifact required by those phases.
- After one entry's work is delivered and the required tests are green, verify the companion `sd-<feature-name>.md` and every affected assembly, parent, or dependent document describe the delivered behavior. Delete that entry in the same change once verified, keeping exactly one blank-line/`---`/blank-line separator between each pair of entries that remain adjacent afterward. Delete the whole file only once no entry remains. MUST NOT delete an unfinished entry; an absent file means no deferred work remains for that design document.
- The `-plan.md` suffix and the `(planned)` link marker are unrelated. [list_plans.py](scripts/list_plans.py) discovers deferred-change files; [list_planned.py](scripts/list_planned.py) discovers unresolved targets promised inside design documents.

Two entries in one `sd-<feature-name>-plan.md` file look like this:

```markdown
Why: <the requirement or observation that made this entry necessary>

<the intended delta, plus any execution, migration, or verification notes>

---

Why: <the reason the next entry exists>

<its own delta and notes>
```

Run the search script from its installed skill root rather than assuming a fixed installation path:

```bash
python <skill-root>/scripts/list_plans.py <repository-root>
```

## Cross-Phase Rules

- A design document MUST NOT contain code. Interfaces and data views MUST be expressed as Markdown links to the target code, because duplicated detail drifts away from the code it describes.
- A design document MUST describe behavior and caveats. It MUST NOT duplicate algorithms, control flow, or field-level structure, and MAY name one current implementation only when that choice materially defines the module boundary, the observable behavior, or a compatibility contract.
- Wherever a document can show a relationship, a data flow, or a state transition as a diagram, it MUST use Mermaid.
- Mermaid blocks MUST use exactly three backticks and the lower-case `mermaid` info string, with no extra fence attributes, and MUST start in column one. Four-backtick fences, tilde fences, and diagrams indented inside a list item or blockquote MUST NOT be used, because the line count depends on that canonical form.
- One design document MUST NOT exceed 300 counted lines; a `-perf` record and a `-plan` file are exempt. Counted lines = total file lines minus every line inside a `mermaid` fenced block, fence lines included.
- Exceeding 300 counted lines means the module carries too much cognitive load. Splitting into sub-modules is the only permitted response. Deleting caveats, compressing prose, or moving text into Mermaid to lower the count MUST NOT be done.
- A link whose target does not exist yet MUST carry the marker `(planned)` immediately after it, and MUST lose that marker once the target exists. It MUST be a single-line inline link carrying no title, whose label holds no bracket and whose destination holds no space or parenthesis. Reference-style links and images MUST NOT be used for it. The planned-link shape MUST NOT appear anywhere it is not a genuine promise — not as an inline-code example, not inside a diagram — because the tooling reads shape alone, and a promise it cannot see reads as a promise already kept. The marker is what lets a reader tell a promise from a fact, and what lets the phase responsible for clearing it find every one by search.
- The user confirms each `bd-*.md` before the agent descends into its modules, confirms each `sd-*.md` level before descending to its children, and confirms the failing tests carrying the frozen SBE before any implementation is written. MUST NOT skip a gate.
- Phase 2 and Phase 3 run once per leaf, not once per tree. When Phase 1 leaves several leaves open, the user chooses which one to take next.
- Heading wording is the project's to choose, but MUST stay consistent across its documents: reuse the headings an existing document of the same kind already uses.
- Every design document this skill produces is written for a human reader. Present as much of it as possible visually in Mermaid, so the reader carries less load.

## Code Changed Outside A Phase

Not every code change arrives through a phase. When one does not, the documents
still MUST NOT be left describing something the code no longer does.

- Before changing existing code, look for an `sd-*.md` in its folder. Where the change reaches past that module, look at the documents linking to it as well.
- After the change, check each one found against what the code now does, and correct every statement that has stopped being true.
- Where the change moved the module boundary or altered behavior a caller can observe, correcting the prose is not enough — that is a design change, so return to Phase 1 rather than quietly reshaping the document to fit what was just written.
