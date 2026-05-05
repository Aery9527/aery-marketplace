---
name: arch-rules
description: Quick reference for software design and architecture principles — covering SOLID, CUPID, code-level rules, architectural HA / fault-tolerance patterns, Observability, and engineering philosophy. Load this skill for system design, code review, refactoring, technology selection, module decomposition, API design, microservice splitting, technical-debt evaluation, and any discussion of maintainability, scalability, or high availability. Also load when the task involves design judgment such as "how should this be written", "how to split the architecture", or "why write it this way" — even if the user does not explicitly mention "design principles".
---

# Arch Rules

Language-agnostic software design rules. Intended for experienced engineers — bullet items and decision rules only; no basic concept explanations, no extended examples.

---

## 0. Core Mindset (above all else)

- Principles are tools, not dogma. Assess context first (scale, team, lifecycle, risk), then decide how strictly to apply.
- Premature abstraction is worse than duplication. Complexity is driven by requirements, not by "might be needed later".
- Any decision that violates a principle must be an **explicit choice**, not an oversight.
- Code is read far more often than it is written. All design optimizes for readability and changeability.

---

## 1. Agent Application Rules

- Default to the simplest, most readable, and most verifiable solution; do not add structure to demonstrate design skill.
- Follow the project's existing patterns, naming, error handling, and test style; improve locally only when the existing approach clearly blocks the requirement.
- Do not introduce speculative abstraction, interfaces, frameworks, background jobs, caches, or event systems for unproven future needs. However, use small, stable interfaces at clear architectural boundaries, external side-effect boundaries, test-double needs, or known multiple-implementation scenarios.
- Behavioral changes must be testable or verifiable; never change an implementation without confirming the observable behavior.
- Error handling must not use silent fallback, broad catch, swallowed errors, or fake success; propagate, log, or report errors according to project conventions.
- External input, I/O, network, database, time, and randomness are all boundaries; boundaries require validation, timeouts, and observability.
- When correctness, simplicity, maintainability, performance, and extensibility conflict, priority order is: **correctness → simplicity → maintainability → performance → extensibility**.
- Refactor only areas strongly related to the current task; do not let "while I'm here" cleanup expand into unbounded rewrites.

---

## 2. Code-Level Principles

### SOLID

- **SRP** — A class should have only one reason to change.
- **OCP** — Open for extension, closed for modification.
- **LSP** — Subtypes must be substitutable for their base types; violation signals a wrong inheritance relationship.
- **ISP** — Keep interfaces small and focused; do not force clients to depend on methods they don't use.
- **DIP** — Both high-level and low-level modules depend on abstractions; inject implementations via DI.

### General Rules

- **DRY** — The duplication to eliminate is duplicated *knowledge*, not duplicated *shape*.
- **KISS / YAGNI** — Prefer simplicity; don't write speculative requirements.
- **SoC** — Separate different concerns.
- **High Cohesion, Low Coupling** — The fundamental metric of all design.
- **Law of Demeter** — Talk only to your immediate friends.
- **Composition over Inheritance**.
- **Tell, Don't Ask** — Command objects to act; don't query state and make decisions outside the object.
- **Fail Fast** — Surface errors as early as possible; never swallow them silently.
- **Principle of Least Astonishment** — Behavior should not violate the reader's intuition.
- **Encapsulate What Varies** — Isolate the parts that change.
- **Prefer Pure Functions** — Concentrate side effects; keep boundaries explicit.

### Alternative Frameworks

- **CUPID** (Dan North) — Composable / Unix philosophy / Predictable / Idiomatic / Domain-based. Shifts from rule-oriented to property-oriented thinking.
- **GRASP** (Larman) — Information Expert, Creator, Controller, Low Coupling, High Cohesion, Polymorphism, Pure Fabrication, Indirection, Protected Variations.

---

## 3. Architecture Level

### Structural Principles

- **12-Factor App** — Deployment / configuration / state discipline for cloud-native services.
- **Stateless Services** — Externalize state to enable horizontal scaling and fault tolerance.
- **DDD** — Bounded Context, Aggregate, Ubiquitous Language.
- **Hexagonal / Clean / Onion Architecture** — Decouple domain from infrastructure.
- **Event-Driven / CQRS / Event Sourcing** — Suited for high throughput, auditing, and complex state evolution.
- **API Discipline** — Versioning, backward compatibility, explicit error semantics, contract testing.
- **Schema-First** — Define interface contracts before implementation.

### Distributed Systems Awareness

- **CAP** — When a partition occurs you must choose between C and A; this choice must be intentional.
- **PACELC** — When no partition exists you still trade off Latency vs. Consistency.
- **Idempotency** — A prerequisite for any retriable operation.
- **Exactly-once is an illusion** — Design for at-least-once + idempotent consumers.
- **Backpressure** — Upstream must be able to sense downstream congestion.
- **Clock Skew / Ordering** — Do not assume multi-node clocks are in sync; use logical clocks where ordering matters.

### Fault-Tolerance Patterns (Release It!)

- **Timeout** — Required on every remote call; must be shorter than the upstream's timeout.
- **Retry with Exponential Backoff + Jitter**.
- **Circuit Breaker** — Prevent cascading failures.
- **Bulkhead** — Isolate resources so a single failure cannot bring down the whole system.
- **Graceful Degradation** — Provide a degraded experience when a component fails.
- **Liveness vs. Readiness Probe** — Different semantics; do not conflate them.

### Data and Consistency

- **Single Source of Truth**.
- **Schema Evolution** — Consider both backward and forward compatibility.
- **Saga / Outbox Pattern** — The standard solution for cross-service transactions.
- **Cache Strategy** — Define explicit TTL, invalidation timing, and consistency semantics.
- **Read / Write Path Separation** — Standard practice for high-load systems.

---

## 4. Operability

- **Three Pillars of Observability** — Metrics, Logs, Traces; all three are required.
- **Structured Logging** — Machine-parseable output is more valuable than human-readable prose.
- **Correlation / Trace ID** — Mandatory for cross-service request tracing.
- **SLI / SLO / Error Budget** — Quantify reliability targets; don't rely on gut feeling.
- **Infrastructure as Code** — Environments must be reproducible.
- **Immutable Deployment** — Never manually change configuration in production.
- **Blue/Green, Canary, Feature Flag** — Standard tools for reducing deployment risk.
- **Runbook / Postmortem Culture** — Failures are a source of organizational knowledge.

---

## 5. Security and Resilience

- **Principle of Least Privilege**.
- **Defense in Depth** — Multiple layers of defense; do not rely on a single perimeter.
- **Secure by Default** — The default configuration must be the secure option.
- **Zero Trust** — Do not trust internal network traffic.
- **Secret Management** — Never hard-code secrets; never commit them to a repo.
- **Input Validation at Boundary** — Treat all external input as hostile.
- **Audit Trail** — Critical operations must be traceable.

---

## 6. Development Process Discipline

- **Boy Scout Rule** — Leave the code cleaner than you found it.
- **Code Review as Knowledge Transfer** — Not just bug-hunting.
- **Tests as Specification** — Tests describe intent, not implementation.
- **Test Pyramid** — Many unit tests, moderate integration tests, few E2E tests.
- **Reversibility-Aware Decision Making** — Irreversible decisions require more caution; reversible ones can be tried and corrected quickly.
- **Trunk-Based / Short-Lived Branches** — Reduce merge hell.
- **Conventional Commits / Explicit Change Semantics**.

---

## 7. Decision Framework

Before applying any principle, ask:

1. **Lifecycle** — One-off script vs. long-lived service?
2. **Rate of Change** — Stable vs. rapidly evolving?
3. **Team Size** — Solo vs. multi-person collaboration?
4. **Risk Level** — Internal tool vs. external payment / medical / safety-critical system?
5. **Reversibility** — Can you easily revert if the decision is wrong?

**Guidance:**

- Low lifecycle / low change rate / solo / low risk → apply loosely; avoid over-engineering.
- High lifecycle / high change rate / multi-person / high risk → apply strictly; accept the cost of abstraction.
- Irreversible decision → always take the most conservative path.

---

## 8. Review Checklist

Quick scan before finishing a review, refactor, or implementation:

- **Correctness** — Happy path, edge cases, error paths, concurrency / retry / idempotency are all handled correctly.
- **Boundary** — Input validation, permissions, timeouts, resource cleanup, and I/O failures are addressed.
- **Design Fit** — Respects existing architectural boundaries; no unnecessary abstraction or new coupling introduced.
- **Change Safety** — Behavioral changes have tests, a rollback plan, compatibility considerations, and migration coverage.
- **Operability** — Important failures are observable; logs / metrics / traces are sufficient to locate problems.
- **Performance** — No N+1 queries, unbounded loops / queries / goroutines / queue growth, excessive allocation, or uncontrolled caches introduced.

---

## 9. Anti-Pattern Warnings

Stop and reconsider when you see:

- An abstraction introduced to satisfy a principle has no second consumer.
- An interface has only one implementation and no test-double requirement.
- A class name contains vague words: `Manager`, `Helper`, `Utils`, `Processor`.
- A single file / function / class is too long, but splitting it makes it harder to understand.
- "We'll need it later" or "might expand in the future" used as a design justification.
- Unrelated logic merged for DRY because it looks similar.
- A design pattern forced in without addressing an actual problem.
- A silent fallback added to avoid breaking existing flow, pushing errors to a harder-to-trace location.
- Deferred decisions on schema, API, or error semantics justified as "keeping flexibility".

---

Final rule: **Design quality = making the most reasonable trade-offs given the current context.** Principles provide vocabulary and a framework; the final judgment remains the engineer's responsibility.
