# Phase 3 — Implementation

Concept definitions for the `bd-*.md` and `sd-*.md` layers live in
[Document Model](../SKILL.md).

## Purpose

Turn the confirmed failing tests green, one at a time. Success means every test
in the frozen set passes, nothing that was already green broke, and the touched
design documents still describe what was built.

## Before Starting

- A confirmed set of failing tests MUST exist for the target leaf, produced by Phase 2. If it does not, MUST NOT start implementing — return to Phase 2.

## Cold Load Procedure

Loaded without any prior context, MUST establish these three things before writing a line:

1. The failing tests. They carry the complete behavioral specification — what to build is never inferred from conversation history.
2. The owning leaf `sd-*.md`. A `sys-design-leaf:` header comment in the test file names it outright and always wins. Otherwise walk from the code folder the tests exercise up to the first folder containing any `sd-*.md`; that folder MUST hold exactly one, which is the owner. If the walk yields none or several and no header names one, MUST stop and ask the user rather than guess.
3. The upstream documents. Walk the structural graph in reverse from the leaf: a document is an immediate parent only when it reaches this node through one of the four structural edges. A navigation link back to a higher topic, a cross-reference, or an external link is not a parent. A leaf may still have several parents — an overview plus more than one topic — because a component serves more than one assembly. Keep a set of documents already visited and MUST NOT process one twice.

The behavioral specification comes from the tests. The document topology comes
from these lookups. MUST NOT assume the tests alone convey the topology.

## Workflow

1. Pick one failing test.
2. Write the minimum implementation that turns it green.
3. Refactor while the whole set stays green.
4. Repeat from step 1 until every test in the frozen set passes.
5. Run the project's existing related tests as well. Everything green before this phase MUST still be green.
6. Verify the leaf document's interface links still resolve to real symbols, and correct any that moved during refactoring.
7. Verify each immediate parent still describes the real relationships and data flow, and update its Mermaid where the implementation changed them. If updating a parent changes what that parent itself claims, repeat this step for that parent's own parents. Each changed parent is followed independently: a branch stops where its parent needs no change, and that never stops another branch. A leaf whose internals changed without altering its boundary usually stops at the first level.

## Rules

- MUST NOT modify a test to make it pass. A test that looks wrong is a Phase 2 decision, not a Phase 3 edit.
- MUST NOT skip, disable, or delete a test to reach green.
- MUST implement only what the frozen tests and the confirmed design boundaries require. MUST NOT add an independently observable feature neither of them asks for. Generalizing an implementation beyond the literal example values is expected — adding a feature is not.
- MUST NOT reach green by breaking a behavior that was already working.
- If implementation reveals the design document is wrong, MUST stop and return to Phase 1. Letting the code diverge from the document silently is the failure this skill exists to prevent.
- MUST NOT copy implementation detail back into the design document. The code is the only place that detail belongs.

## Exit Artifacts

- An implementation that turns every test in the frozen set green, with none skipped or disabled.
- The project's previously passing tests still passing.
- Every link in the touched design documents resolving to an existing target.
- Every upstream document the walk had to touch consistent with what was actually built.
- Then ask the user whether to run Phase 4. The answer MAY be no, and MAY be deferred to any later time.
