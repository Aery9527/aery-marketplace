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
2. The owning leaf design document, named by the `code-mereology-leaf:` header comment in the test files. Once normalized, every file MUST name the identical path, and it MUST resolve inside the repository to a document that exists, carries the leaf role, and is neither a `-perf` record nor a `-plan` file. If the comment is missing, the paths disagree, or any of those checks fails, MUST stop and return to Phase 2 rather than infer an owner from whatever document happens to sit near the code.
3. The documents pointing at this leaf. Walk the structural graph in reverse and take everything that reaches this node through a structural edge, in two groups: those reaching it through a composition edge are its parents, those reaching it through a dependency edge are its dependents. A navigation link back to a higher topic, a cross-reference, or an external link is neither. A leaf may have several of each — an overview plus more than one topic, and any number of modules relying on it. Keep a set of documents already visited and MUST NOT process one twice.

The behavioral specification comes from the tests. The document topology comes
from these lookups. MUST NOT assume the tests alone convey the topology.

## Workflow

1. Pick one failing test.
2. Write the minimum implementation that turns it green.
3. Refactor while the whole set stays green.
4. Repeat from step 1 until every test in the frozen set passes.
5. Run the project's existing related tests as well. Everything green before this phase MUST still be green.
6. Verify the leaf document's interface links still resolve to real symbols, and correct any that moved during refactoring.
7. Check each parent and each dependent. For a parent, whether the relationships and data flow it draws still match what was actually built; update its Mermaid where they do not. For a dependent, whether the contract it relies on still holds: if it does, change nothing; if only a symbol moved, correct the link. If the contract itself no longer holds, MUST NOT edit the dependent to match — a document rewritten to fit a broken contract hides the breakage. Restore compatibility, or stop and let the user decide whether that dependent needs its own pass through Phase 1. Run the dependents' own tests before treating this step as done. If that update changes the relationships a document describes to the outside, its own parents and dependents may now be stale — repeat this step for that document. Each path is followed on its own, and one stopping does not stop the others. When the implementation only touched the leaf's internals and left its outward boundary alone, the first level of checking is where this ends.

## Rules

- MUST NOT modify a test to make it pass. A test that looks wrong is a Phase 2 decision, not a Phase 3 edit.
- MUST NOT skip, disable, or delete a test to reach green.
- The implementation MUST stay within what the frozen tests and the design document ask for. Writing the logic as a general rule is expected — a test giving `add(1, 1) == 2` calls for adding two numbers, not for hard-coding the answer. But MUST NOT slip in new behavior a caller can notice that neither of them asked for: nothing pins it down, and it never passed the Phase 2 gate.
- MUST NOT reach green by breaking a behavior that was already working.
- If implementation reveals the design document is wrong, MUST stop and return to Phase 1. Letting the code diverge from the document silently is the failure this skill exists to prevent.
- A partial leaf the implementation depends on — one carrying the `code-mereology-partial` marker — is the exception. Where implementing against it reveals it states a contract the existing code does not honor, that is a factual error in a record of what already runs, and MUST be corrected against the code without returning to Phase 1. Step 7's rule against rewriting a dependent to fit a broken contract does not reach it, because it is the document depended on rather than a dependent. MUST NOT widen the correction into describing behavior the marker still excludes.
- Then check what that correction invalidates. The leaf being implemented was designed, and its tests were frozen, against the contract as the partial leaf stated it. Where the corrected contract breaks either one, MUST stop and give the user the choice: the design back to Phase 1, or the frozen tests back to Phase 2. MUST NOT absorb the difference into the implementation, which would leave the document and the tests describing a contract that was never there.
- MUST NOT copy implementation detail back into the design document. The code is the only place that detail belongs.

## Exit Artifacts

- An implementation that turns every test in the frozen set green, with none skipped or disabled.
- The project's previously passing tests still passing.
- Every link in the touched design documents resolving to an existing target.
- Every parent and dependent the walk had to touch consistent with what was actually built, with no dependent left describing a contract the code no longer honors.
- Then ask the user whether to run Phase 4. The answer MAY be no, and MAY be deferred to any later time.
