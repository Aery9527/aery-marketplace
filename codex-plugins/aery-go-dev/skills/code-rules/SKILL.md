---
name: code-rules
description: >-
  Concrete implementation rules for maintainable code. Load when writing,
  modifying, refactoring, or reviewing code, especially for names, functions,
  interfaces, types, errors, logging, I/O boundaries, resource ownership,
  concurrency, and tests. Follow established project and language conventions;
  use `arch-rules` for higher-level design trade-offs.
---

# Code Rules

Write code whose behavior, dependencies, failures, and ownership are explicit.
Project and language conventions take precedence unless they are unsafe or
contradict the required behavior. Apply only rules relevant to the change.

## Change Boundary

- Read callers, tests, and neighboring code before changing behavior.
- State what must change, what must remain compatible, and how both are verified.
- Make the smallest coherent change; do not mix unrelated cleanup with behavior changes.
- Preserve public behavior during refactoring. Treat exported contracts and stored data as migration boundaries.
- Add abstractions for demonstrated variation, a stable boundary, or a required test seam—not for speculation.

## Names and Structure

- Name by domain meaning and responsibility, not mechanism or vague roles such as `Manager`, `Helper`, or `Utils`.
- Keep one function focused on one observable outcome; extract only when the new unit has a clear name and contract.
- Keep related state and behavior together; keep unrelated reasons to change apart.
- Prefer early returns over deep nesting. Make the main path easy to scan.
- Replace boolean mode flags with separate operations or an explicit option type when they select different behavior.
- Group parameters only when they form one concept; do not create parameter objects merely to reduce a count.
- Comments explain intent, constraints, or trade-offs. Do not restate the code.

## Interfaces and Types

- Define an interface at the consumer or architectural boundary that needs substitution, not beside every implementation.
- Keep interfaces role-based and narrow. Name capabilities such as `Reader`, `Validator`, or `Publisher`.
- Do not create an interface for one implementation unless it protects a real boundary or test seam.
- Depend on the smallest contract the caller uses; return the most precise useful type.
- Prefer composition. Use inheritance only when substitutability is stable and enforced.
- Model domain concepts with domain types instead of repeatedly passing primitive strings or numbers.
- Make optionality explicit. Avoid sentinel values whose meaning is known only by convention.
- Make invalid states unrepresentable when practical; otherwise validate once at construction or the trust boundary.
- Make zero, null, and default behavior safe and unsurprising, or require construction explicitly.
- Keep public types and interfaces minimal. Evolve published contracts through additive changes, deprecation, and migration.

Example—the consumer needs reading, not an entire service:

```text
Bad:  UserService { create, update, delete, find, list, export, ... }
Good: UserReader  { find(userId) -> User }
```

## Errors and Control Flow

- Never swallow an error, return fake success, or silently fall back unless fallback is part of the contract.
- Add actionable context while preserving the original cause and machine-readable identity.
- Distinguish invalid input, missing data, conflicts, transient dependency failure, and internal defects when callers act differently.
- Handle an error only where the code can recover, translate it to a boundary contract, or decide the final outcome.
- Do not both log and propagate the same failure at every layer. Enrich below; log at the owning boundary.
- Catch narrowly. Cleanup belongs in `defer`, `finally`, RAII, or the language-equivalent lifetime mechanism.
- Propagate cancellation and deadlines; do not turn cancellation into a generic failure or continue abandoned work.
- Exhaustive branches must fail visibly when a new case is unhandled.

## Logging

- Log events that help explain state transitions, external interactions, degraded behavior, or final failures.
- Prefer structured events with stable names and typed fields over interpolated prose.
- If the project has no level policy: `DEBUG` diagnoses, `INFO` records meaningful lifecycle events, `WARN` records recoverable degradation, and `ERROR` records failed outcomes requiring attention.
- Normally log a failure once, at the boundary that owns the response, retry, job result, or process termination.
- Include relevant identifiers such as operation, entity ID, dependency, outcome, duration, and trace or correlation ID.
- Keep messages and field names stable; put variable data in fields.
- Never log credentials, tokens, secrets, raw authorization headers, or unnecessary personal data. Redact before logging.
- Bound payload size and field cardinality. Do not dump whole requests, responses, or objects by default.
- Preserve error cause or stack according to the runtime convention, without duplicating it in multiple fields.
- Logging is not error handling: the caller must still receive the correct result.

Example—stable event plus safe context:

```text
Bad:  "payment failed: " + request + error
Good: payment_capture_failed { payment_id, provider, error_code, trace_id }
```

## Boundaries, State, and Resources

- Validate untrusted input at entry boundaries; keep internal code operating on validated types.
- Encode output for its destination context. Parameterize database queries and external commands.
- Make side-effect boundaries explicit: network, storage, filesystem, clock, randomness, and process execution.
- Give remote and blocking work a timeout, cancellation path, and bounded retry policy where retry is safe.
- Make ownership and lifetime explicit. The creator either releases a resource or transfers ownership deliberately.
- Bound queues, concurrency, memory, recursion, batching, and fan-out; reject or shed excess work deliberately.
- Protect shared mutable state with one clear synchronization strategy; avoid mixing locks, atomics, and ad hoc flags.
- Make partial success visible. Define transaction, rollback, idempotency, and retry behavior before multi-step writes.

## Tests and Completion

- Test observable behavior and contracts, not private implementation structure.
- Cover the success path, boundary values, expected failures, and regression being changed.
- Use real collaborators at meaningful integration boundaries; use test doubles only at genuine seams.
- Control time, randomness, concurrency, and external I/O so tests remain deterministic.
- A change is complete when old guarantees still pass, new behavior is verified, failures are observable, and no resource or secret leaks remain.
