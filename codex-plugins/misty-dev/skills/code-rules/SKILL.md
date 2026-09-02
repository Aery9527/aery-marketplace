---
name: code-rules
description: >-
  Concrete implementation rules for maintainable code. Load when writing,
  modifying, refactoring, or reviewing code, covering change boundaries, error
  handling, comments, logging, and tool usage. Follow established project and
  language conventions; use `arch-rules` for higher-level design trade-offs.
---

# Code Rules

Code MUST follow these rules regardless of language, framework, or project. If the project has explicit conventions, they MUST take precedence. Use `arch-rules` for design-level trade-offs.

Code examples below use Go; map them to the language at hand.

## Change Rules

- Before changing behavior, MUST read direct callers, tests covering the affected behavior, and the containing module to confirm the existing contract.
- Before writing code, MUST state what behavior changes, what must remain compatible, and how each is verified.
- One change does one thing. MUST NOT mix unrelated cleanup into a behavior change; put cleanup in a separate commit.
- Before adding a function argument, MUST check whether the function has too many. Excluding call-chain parameters such as `ctx`, the receiver, and return values, the default limit is 3. When exceeded:
    - If the args belong to one scope and are always handled together, wrap them in a struct or object and pass that.
    - If the args feed separable operations, split the function at those operation boundaries by project conventions.
    - Otherwise keep the arguments as they are. MUST NOT wrap arguments only to reduce their count.
- For a chain of `if-else` or `switch` branches, dispatch through a map or an interface only when an explicit requirement or an existing extension point shows that cases will keep being added, for example `switch kind { case A: ...; case B: ... }` becomes `handlers[kind].Handle(ctx, req)`; otherwise keep the branches as they are. MUST NOT abstract early just to remove branches.

## Error Rules

- MUST NOT swallow an error, return fake success, or silently degrade when the contract does not define a fallback.
- Handle an error only where the code can recover, translate it to a boundary contract, or decide the final outcome; elsewhere, add context and propagate.
- Log a failure once, at the layer that decides the final outcome. MUST NOT log and propagate at every layer.

## Comment Rules

- Describe high-level intent, implicit meaning, constraints, and trade-offs, never details the code itself already reveals.
- When a comment records two or more independent points, MUST format them as a bullet list, not prose.
- MUST NOT write the historical reason for a change. It no longer represents the current intent of the code and is noise; history belongs only in the commit message.

## Logging Rules

- Every piece of information MUST have traceable value for later tracking, statistics, analysis, or debugging. Information that helps none of these MUST NOT be logged.
- Every log line MUST be traceable to one code location, either because the message is unique or because the logger attaches the source location automatically.
- Record information in a compact structure, not prose. If the project has a structured-field logging convention, MUST follow it; otherwise use a fixed-order positional format such as `Enter 23 Rion "HI~"` (`Enter {AGE} {NAME} "{MSG}"`). Field meaning comes from the code location and does not need to be described in the log.
- Statistical information MUST be collected first, then logged on a timer or a count. MUST NOT derive statistics afterwards from repeated logs. For example, to measure request rate, MUST NOT count repeated lines such as `Rion Enter` and `Aery Enter`; instead accumulate the request count and every 5s write `Request ALL 123`, `Request Rion 23`, `Request Aery 100`, at the cost of losing up to 5s of data. Exception: if the statistic cannot tolerate losing an interval's data, log each event.
- If the project has no level policy: `DEBUG` diagnoses, `INFO` records meaningful lifecycle events, `WARN` records recoverable degradation, and `ERROR` records failed outcomes that need human attention.
- MUST NOT dump whole requests, responses, or objects. Payload size and field count follow project limits; if none exist, log selected fields only.

## Execution Awareness

- When handling code or HTML, if the host provides an `LSP` tool that supports the language, MUST prefer it so lookup and edits follow real program symbols; otherwise use text-based tools.
- Colors in web pages and CSS MUST be defined in `OKLCH`. For other visual output such as ppt, pick colors in OKLCH, then convert to a color space the target format supports.
