# Phase 1 — Modular Design

Concept definitions for the `bd-*.md` and `sd-*.md` layers live in
[Document Model](../SKILL.md).

## Purpose

Turn a feature request into design documents that carve the feature into modules
with high cohesion and clear boundaries. Success means every branch of the
document tree ends in a leaf the user has confirmed and Phase 2 can consume.

## SD Role Determination

This section governs a design document only; a `bd-*.md` carries no role, and a `-perf` record is not this phase's business at all. MUST decide the role before writing a single line.

- If the document describes how sub-modules assemble into a larger concept and its substance is links to other design documents, its role is overview.
- If the document describes one module's own behavior and links to the target code, its role is leaf.
- Linking to another design document does not decide the role on its own — what the link means does. Links to the sub-modules that make this one up point to an overview; links to modules it merely relies on leave it a leaf.
- If it both carries its own concrete behavior and is made up of sub-modules, the role is overview and that behavior MUST be pushed down into child leaf documents.

## Location Decision

This section plans the graph — which nodes exist and which edges join them. Nothing is written here; Recursion And Gates does the writing, one confirmed node at a time.

1. Identify the folder that holds — or will hold — the corresponding code.
2. Place `sd-<feature-name>.md` in that folder. MUST NOT collect design documents under `docs/`.
3. Work out which scope owns each module: the submodule holding its code, or the repository itself in a single-repo project. A feature spanning submodules owns modules in several scopes at once. Every `sd-*.md` still lives with the code it describes — MUST NOT create a root `sd-*.md` just because a feature spans submodules.
4. Each scope keeps its assembly documents in the `docs/` at its own root. A single-repo project has exactly one such directory, at the repository root; a monorepo has one at the repository root plus one at each submodule root. `docs/` MUST NOT exist at any level in between. Note which scopes still need one; the directory itself appears when that scope's first `bd-*.md` is written.
5. In every scope that owns one of these modules, name the `bd-*.md` whose topic the module takes part in — an existing one, or a new `bd-<topic-name>.md` named after what the assembled whole delivers rather than after the module itself. Each of them gets an edge to that module's `sd-*.md`. A module taking part in several topics is reached from each of them — a component serves more than one assembly.
6. If the feature spans submodules, the repository-root `bd-*.md` for the topic gets an edge to each submodule `bd-*.md` taking part, and never past them into their modules. An edge points at a document, not a directory — Phase 3 walks these in reverse, and a directory is not a node it can follow.
7. List the dependency edges too: for each leaf, the leaves whose capability it relies on. A dependency edge runs between leaves only — an overview describes composition, and the dependencies belong to the leaves under it.
8. If a dependency points at a leaf that does not exist yet, that leaf MUST be planned into the composition tree of whichever scope owns it, so a confirmation path reaches it. A dependency edge alone never brings a node into being.
9. Follow the dependency edges for cycles. A cycle MUST be shown to the user before anything is written — it usually means a shared contract wants extracting or a responsibility sits on the wrong side of a boundary. Keeping one is the user's explicit call, never the agent's default.
10. A dependency edge MAY cross a submodule boundary; a composition edge MUST NOT. A root `bd-*.md` still reaches submodule modules only through their own `bd-*.md`.
11. The result is a list of nodes to write and edges to add. Carry it into Recursion And Gates.

## Writing Rules — Assembly Document

- MUST organize the document in this order: what the assembly delivers, the relationship and data-flow diagram, then the nodes one level below with a line each on the part it plays. A section that does not apply MAY be omitted; the order MUST NOT change.
- MUST take the assembled whole as its subject: what a business requirement delivers, how an architecture holds together, where an end-to-end data flow runs. The reader arrives wanting the outcome, not the parts list.
- MUST show the relationships in Mermaid, and MUST link the nodes one level below it: a repository-root `bd-*.md` in a monorepo links to each submodule `bd-*.md` taking part and MUST NOT reach past them into their modules; every other `bd-*.md` links to each `sd-*.md` in its own scope that takes part.
- MUST NOT sink into how any single module behaves internally — that belongs to the `sd-*.md` it links to. A `bd-*.md` explaining one module's rules has become a design document in the wrong place.
- Carries no line limit; the 300-line rule binds design documents only, and never a `-perf` record.

## Writing Rules — Leaf

- MUST organize the document in this order: responsibility and boundary, the diagram, interfaces and data views, then caveats. A section that does not apply MAY be omitted; the order MUST NOT change.
- MUST state what the module does, what it owns, and what it deliberately does not own.
- MUST state the caveats: idempotency, concurrency, ordering, failure behavior, and limits.
- MUST use Mermaid whenever the document describes a relationship among two or more components, a multi-step data flow, or a state transition. MUST NOT add a diagram when there is no relationship to show.
- MUST express every interface and data view as a Markdown link to the target code. See Interface Links below for code that does not exist yet.
- If the module relies on a capability another module provides, MUST link to that leaf's design document and draw the dependency in the diagram. A dependency MUST NOT be written as composition — the module depended on is not owned by this one.
- MUST NOT contain code blocks other than Mermaid.
- MUST NOT duplicate algorithms, control flow, or field-level structure. MAY name one current implementation or implementation constraint when that choice materially defines the module boundary, the observable behavior, or a compatibility contract — and MUST link to it rather than restate it.

## Writing Rules — Overview

- MUST organize the document in this order: the concept, the composition diagram, then the child documents with a line each. A section that does not apply MAY be omitted; the order MUST NOT change.
- MUST describe the abstract concept and how the child modules compose into it.
- MUST use Mermaid for composition, dependency, and data flow.
- MUST link every child design document.
- MUST NOT restate the behavior a child document already owns.

## Interface Links

- If the target code already exists, the link MUST point at the actual file or symbol.
- If the target code does not exist yet, the link is a planned path. A planned path is a temporary location marker, not an interface definition — it MUST NOT be treated as one.
- For planned paths, this phase MUST confine itself to behavior boundaries, input and output semantics, and ownership. The exact interface is created by Phase 2 as part of the minimum skeleton, and Phase 2 resolves the link before its confirmation gate.
- Every planned link MUST carry `(planned)` immediately after it: a link written as `[OrderValidator](internal/order/validator.go)`, then the marker, with a single space between them at most. A later reader can then tell a promise from a fact. Phase 2 drops the marker when it resolves the link.
- Run [list_planned.py](../scripts/list_planned.py) — the same `<skill-root>/scripts/` directory as the counter below — to list the open promises in a document. It reports only a marker that follows a Markdown link, so the word appearing in ordinary prose is never mistaken for one.

## Line Counting

- Counted lines = total file lines minus every line inside a `mermaid` fenced block, fence lines included. Blank lines, headings, frontmatter, and link-only lines all count.
- Mermaid blocks MUST use exactly three backticks and the lower-case `mermaid` info string, and MUST start in column one. Four-backtick fences, tilde fences, and diagrams indented inside a list item or blockquote MUST NOT be used — the counter reads anything else as ordinary text, which inflates the count rather than hiding lines from it, and a large diagram reads poorly inside a container anyway.
- Run [count_lines.py](../scripts/count_lines.py) from this skill, passing one or more document paths. It prints `<count>` and the path per file, and exits non-zero on a Mermaid block that is never closed.
- The script lives at `<skill-root>/scripts/count_lines.py`, where `<skill-root>` is the directory holding this skill's `SKILL.md` — the parent of the `references/` directory this file sits in. MUST resolve that path from where this file was loaded from, and MUST NOT hard-code an installation path: the skill is distributed as a plugin and lands wherever the host installs it.

```bash
python <skill-root>/scripts/count_lines.py path/to/sd-feature.md
```

- MUST count after every write and every revision.

## Split Procedure

Triggered when a document exceeds 300 counted lines.

1. MUST NOT lower the count by deleting caveats, compressing prose, or moving text into Mermaid. Splitting the module is the only permitted response.
2. Find the seams by responsibility and by data-flow boundary — group content that changes for the same reason.
3. Promote the document to overview role: keep the abstract composition and the links, and move each group into a child `sd-*.md` placed in that group's own code folder.
4. Recurse into this phase for every child document.

## Promotion Lifecycle

If a promoted document already passed Phase 2 and Phase 3, its existing tests and
code stay valid and MUST be re-anchored to whichever child leaf now owns them.
Promotion alone MUST NOT trigger a rewrite of any test or implementation.

## Recursion And Gates

Walk the planned graph downward, one node at a time. All writing happens here, and never ahead of a confirmation.

1. At a `bd-*.md` node, write or update it, including its edges to the planned children. An edge whose target document does not exist yet MUST carry the same `(planned)` marker.
2. Present that document and obtain confirmation. The user is the one who knows whether the outcome and the assembly are right, so MUST NOT write any child node before that confirmation. A module taking part in several topics means several `bd-*.md` to confirm, each on its own.
3. Descend to each child `bd-*.md` and repeat from step 1, until the nodes below are modules rather than topics.
4. At a `sd-*.md` node, write it and count its lines; if it exceeds the limit, MUST run the split procedure.
5. Present that document and obtain confirmation. MUST NOT write any child before that confirmation.
6. Descend to each child `sd-*.md` and repeat from step 4.
7. Stop descending when a node is at or under 300 counted lines and describes concrete module behavior rather than composition. That node is a leaf.
8. As each node is written, update its Mermaid, and drop the `(planned)` marker from every edge whose target now exists.

## Exit Artifacts

- One or more `sd-*.md`, each confirmed by the user at its own level.
- Every `bd-*.md` on the path updated with the new links and Mermaid, and confirmed by the user one node at a time.
- No `(planned)` marker left on any edge along the path — every planned node now exists. Verify with [list_planned.py](../scripts/list_planned.py): entries pointing at a `.md` document MUST be gone, while entries pointing at code stay until Phase 2 builds the interface.
- Every branch terminated in a leaf, so Phase 2 has a valid input.
