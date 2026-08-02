# Phase 4 — Performance Verification

## Purpose

Establish whether a finished feature meets a performance target, and record a
baseline any later optimization can be judged against. Success means a measured
number sitting next to an agreed target.

## Before Starting

- The feature MUST be implemented with its tests passing. If it is not, finish Phase 3 first — a baseline taken from unfinished code measures nothing.
- This phase is optional and MAY be entered at any later time, including long after Phase 3 closed. MUST NOT treat it as a mandatory step of every feature.

## Workflow

1. Ask the user whether this feature needs a benchmark or a load test. If the answer is no, end the phase here.
2. Agree on the performance target before measuring: throughput, latency percentile, and resource ceiling. A measurement with no target cannot be judged.
3. Write the benchmark or load test next to the code it measures.
4. Record the result in `sd-<feature-name>-perf.md`, beside the code it measures and next to that module's design document. Each entry MUST carry the target, the date, the environment, and the numbers — a number without its environment cannot be reproduced. Append each new measurement; MUST NOT overwrite an earlier one, because without the previous numbers there is nothing to judge an optimization against.
5. Present the result against the target and let the user decide whether optimization follows.

## Rules

- MUST NOT optimize before a baseline exists.
- MUST NOT change observable behavior during optimization. The frozen SBE tests MUST stay green throughout.
- If the target cannot be met without changing behavior, MUST return to Phase 1 — that is a design decision, not a tuning task.

## Exit Artifacts

- A benchmark or load test living beside the code it measures.
- `sd-<feature-name>-perf.md` holding every measurement taken so far, each with its target, date, and environment.
- A user decision on whether optimization follows.
