# Phase 2 — SBE As Failing Tests

Concept definitions for the `bd-*.md` and `sd-*.md` layers live in
[Document Model](../SKILL.md).

## Purpose

Turn a confirmed leaf design document into a set of failing tests. Those tests
are the only place the SBE lives. Success means every in-scope behavior is
pinned by a test that fails for the reason it is meant to fail.

## Before Starting

Verify both, and go back where they say rather than proceeding anyway:

- The target `sd-*.md` MUST be a leaf. If it is an overview, MUST NOT define SBE for it — return to Phase 1 and recurse until the branch ends in leaves.
- The user MUST have already confirmed that document. If they have not, get that confirmation in Phase 1 first.

## Why Tests Are The Medium

The tests and the unimplemented skeleton this phase writes are the
specification, not the implementation. Writing the SBE into a document would
restate what the tests already state and then drift from them. The gate closing
this phase is the gate before development starts.

## Workflow

1. Read the leaf design document and list every behavior that needs an example.
2. Record the current test baseline: run the project's existing tests and note which already pass. A behavior that already works is not a new red.
3. Ask the user for a concrete input/output example per behavior. An abstract description with no example is undefined scope, not a specification.
4. Derive edge case candidates. Sources: the document's caveats, the module boundary, and boundary values — nil, zero, upper limit, empty collection, duplicate invocation, concurrent invocation, ordering, and every failure path.
5. Present the candidates as a list and have the user mark each one in-scope or out-of-scope. Scope MUST be settled on the list before any test is written, because a scope decision is cheap on a list and expensive inside test code. MUST NOT decide scope unilaterally.
6. Render the marked set as tests — one test per example — placed wherever the project keeps its tests for the code the leaf owns.
7. Create the minimum skeleton those tests need in order to compile: types and function signatures with unimplemented bodies. If the target code already exists, MUST NOT recreate it — extend only what the new behaviors require.
8. Resolve the leaf document's interface links onto the symbols this phase just created, replacing the planned paths from Phase 1 and dropping their `(planned)` markers.
9. Run the set and confirm each new or changed behavior fails, and that the failure is attributable to the unit under test.
10. Present the failing tests and the resolved leaf document to the user. Their confirmation freezes the SBE.

## Rules

- Deriving edge cases the user did not raise is an obligation of this phase, not an optional extra. MUST NOT accept a behavior list the user supplies as complete without running step 4 against it.
- MUST NOT write any behavior logic. Every function body the skeleton introduces MUST stay unimplemented; the first line of real logic belongs to Phase 3.
- MUST NOT write the SBE into a document.
- The candidate list and the out-of-scope marks are transient interaction artifacts. MUST NOT write them into any Markdown or design document, and MUST NOT let Phase 3 depend on them — after the gate, the failing tests are the only durable specification.
- The stopping rule for edge case hunting is the fully marked candidate list. Once the tests are confirmed, MUST NOT add further cases inside this phase; a genuinely new case reopens the phase as an explicit user decision.
- If clarifying examples reveals the design document is wrong or incomplete, MUST return to Phase 1 rather than patch the gap inside the tests.
- Resolving a planned link onto the symbol just created does not reopen Phase 1 — it records a confirmed contract at its real address. But if building the skeleton reveals that the confirmed behavior or module boundary itself must change, MUST stop and return to Phase 1.
- One Phase 2 test set MUST belong to exactly one leaf. If the examples span two leaves, MUST split them into separate Phase 2 runs rather than one mixed set.
- The owning leaf document MUST be discoverable from the tests alone, by this rule: walk from the code folder the tests exercise up to the first folder containing any `sd-*.md`; if that folder holds exactly one, it is the owner. In every other case — several design documents in that folder, none found, or a test layout that breaks adjacency — each test file MUST carry a header comment `sys-design-leaf: <repository-relative-path>`, which always wins over adjacency. Without a single unambiguous owner, Phase 3 cannot be loaded cold.

## Existing Code

- If the leaf already has an implementation, this phase covers only the behaviors being added or changed. Behaviors that already work MUST stay green throughout.
- A test that passes on first run is a defect only when it covers a new or changed behavior. MUST NOT weaken a test to force it red.

## List Format

While settling scope in steps 3 to 5, keep each candidate in this shape:

- Behavior — one sentence naming what is being specified.
- Input — each field and its concrete value.
- Output — each field and its concrete value, or the error returned.
- Edge cases — one line per case, in `condition -> result` form.

## Exit Check

- Every test covering a new or changed behavior MUST fail, and the failure MUST be attributable to the behavior missing from the unit under test. An assertion mismatch is the preferred form; an unimplemented sentinel the language forces on an empty body — a panic, a `todo`, a not-implemented error — is equally valid.
- A failure outside the unit under test is never a valid red: a compile error, a missing dependency, or a shared setup fault MUST be fixed before the gate. Several tests failing together on the same missing unit is fine; several failing together on something the unit does not own is not.
- Every test that was green in the step 2 baseline MUST still be green.
- Every interface link in the leaf document MUST resolve to a symbol that now exists. Running `list_planned.py` on that document MUST report nothing — every promise Phase 1 made about this leaf is now kept.

## Exit Artifacts

- A set of failing tests covering every in-scope behavior of the leaf — the only durable home of the frozen SBE.
- A minimum skeleton whose bodies are all unimplemented — required only where the tests reference symbols that did not exist before. Changing the behavior of code that already exists produces no skeleton, and that is a complete Phase 2.
- A leaf design document whose interface links point at real symbols, so Phase 3 can find its way from either direction: test to document, or document to code.
- User confirmation of the failing tests. Only then may Phase 3 begin.
