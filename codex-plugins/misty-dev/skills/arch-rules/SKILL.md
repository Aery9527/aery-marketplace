---
name: arch-rules
description: >-
  Software design and development keyword cues. Load when reading, writing,
  debugging, refactoring, reviewing, designing, or evolving software. Use the
  named principles, patterns, and practices to recall their conventional meaning
  and trade-offs; apply only those relevant to the context.
---

# Arch Rules

Treat each keyword as a thinking cue: recall its established meaning,
assumptions, and trade-offs. Apply relevant ideas; do not force the full list.
When cues conflict, choose by scope, risk, and evidence; treat alternatives as
choices, not cumulative rules. For concrete implementation rules, use `code-rules`.

## Engineering Mindset

- **First Principles** — Reason from facts.
- **KISS** — Remove accidental complexity.
- **YAGNI** — Build for proven needs.
- **DRY** — Keep one source per piece of knowledge.
- **Principle of Least Astonishment** — Make behavior unsurprising.
- **Reversibility** — Preserve cheap ways back.
- **Measure, Don't Guess** — Use evidence before optimization.
- **Technical Debt** — Make future cost visible.
- **Boy Scout Rule** — Leave touched code cleaner.

## Requirements and Decisions

- **Specification by Example (SBE)** — Define behavior with examples.
- **Acceptance Criteria / Definition of Done** — Make done observable.
- **Design by Contract / Invariants** — State what must remain true.
- **Ubiquitous Language** — Use domain terms consistently.
- **ADR / RFC** — Record consequential decisions.
- **Traceability** — Link needs, changes, and evidence.
- **Risk-Based Engineering** — Spend rigor where failure costs.

## Code and Object Design

- **SOLID** — Design for change without dogma.
- **SRP** — One coherent reason to change.
- **OCP** — Extend without destabilizing proven behavior.
- **LSP** — Preserve substitutability.
- **ISP** — Keep contracts narrow for consumers.
- **DIP** — Point dependencies toward policy.
- **CUPID** — Prefer composable, idiomatic, predictable code.
- **GRASP** — Assign responsibilities deliberately.
- **Separation of Concerns** — Separate independent reasons to change.
- **High Cohesion / Low Coupling** — Group related behavior; limit dependencies.
- **Composition over Inheritance** — Assemble behavior explicitly.
- **Law of Demeter** — Limit knowledge of collaborators.
- **Tell, Don't Ask** — Keep behavior with its data.
- **Encapsulate What Varies** — Isolate volatility.
- **Pure Functions / Immutability** — Minimize hidden state.
- **Make Invalid States Unrepresentable** — Encode invariants.
- **Fail Fast** — Surface errors near their cause.
- **Explicit Dependencies** — Make requirements visible.
- **Resource Ownership / RAII** — Make cleanup deterministic.

## Architecture and APIs

- **DDD / Bounded Context / Aggregate** — Align boundaries with the domain.
- **Hexagonal / Clean / Onion / Ports and Adapters** — Isolate policy from infrastructure.
- **Modular Monolith** — Earn distribution.
- **Microservices** — Distribute only for clear autonomy.
- **API-First / Contract-First / Schema-First** — Agree boundaries before implementation.
- **Backward Compatibility / Deprecation / Semantic Versioning** — Evolve without surprises.
- **Hyrum's Law** — Every observable behavior can become a dependency.
- **Conway's Law** — Structure mirrors communication.
- **Evolutionary Architecture / Fitness Functions** — Keep architecture testable.
- **Strangler Fig Pattern** — Replace systems incrementally.
- **12-Factor App / Stateless Services** — Externalize deploy-time concerns and state.

## Data and Distributed Systems

- **ACID / BASE** — Choose transaction semantics explicitly.
- **CAP / PACELC** — Name consistency, availability, and latency trade-offs.
- **Idempotency** — Make retries safe.
- **At-Most-Once / At-Least-Once / Exactly-Once Semantics** — Define loss and duplication behavior.
- **Event-Driven / CQRS / Event Sourcing** — Separate time, intent, and state when useful.
- **Saga / Outbox** — Coordinate distributed state deliberately.
- **Schema Evolution / Expand-Contract** — Migrate compatibly.
- **Data Ownership / Source of Truth** — Make authority explicit.
- **Cache Invalidation / TTL** — Define staleness.
- **Backpressure / Load Shedding / Rate Limiting** — Bound overload.
- **Clock Skew / Ordering / Logical Clocks** — Never assume shared time.

## Reliability and Operations

- **Timeout / Deadline / Cancellation** — Bound waiting and work.
- **Retry / Backoff / Jitter** — Retry selectively without synchronizing failure.
- **Circuit Breaker / Bulkhead** — Contain cascading failure.
- **Graceful Degradation / Fail-Safe** — Fail with bounded harm.
- **Liveness / Readiness / Health Checks** — Probe the right question.
- **Observability / Logs / Metrics / Traces / Profiles** — Make behavior explainable.
- **Structured Logging / Correlation IDs** — Connect events across boundaries.
- **SLI / SLO / Error Budget** — Quantify reliability.
- **Backup / Restore / RPO / RTO** — Prove recovery.
- **Runbook / Chaos Engineering** — Prepare for and test failure.

## Security, Privacy, and Safety

- **Threat Modeling** — Design against plausible abuse.
- **Least Privilege / Zero Trust** — Minimize assumed authority.
- **Defense in Depth / Secure by Default** — Make safety the default path.
- **Input Validation / Output Encoding** — Defend every trust boundary.
- **Secrets Management** — Keep credentials out of code and logs.
- **Supply Chain Security / SBOM** — Know and verify dependencies.
- **Privacy by Design / Data Minimization** — Collect and retain less.
- **Audit Trail / Non-Repudiation** — Make sensitive actions attributable and hard to deny.
- **Safety Engineering / Hazard Analysis** — Bound harm beyond bugs.

## Testing and Quality

- **Tests as Specification** — Test intent, not implementation.
- **TDD / BDD** — Drive design with feedback and examples.
- **Test Pyramid / Testing Trophy** — Balance speed and confidence.
- **Unit / Integration / Contract / E2E** — Test at the right boundary.
- **Property-Based / Fuzz / Mutation Testing** — Search beyond examples.
- **Regression / Golden Master / Snapshot Testing** — Lock intended behavior carefully.
- **Deterministic / Hermetic Tests** — Remove incidental variance.
- **Test Doubles / Mocks / Fakes** — Substitute only at real seams.
- **Shift Left / Shift Right** — Validate before and after release.

## Performance and Concurrency

- **Big O / Data Structures** — Match complexity to access patterns.
- **Profiling / Benchmarking** — Optimize measured bottlenecks.
- **Load / Stress / Soak Testing** — Test realistic limits.
- **Amdahl's Law / Little's Law** — Respect scaling and queue mathematics.
- **Bounded Resources** — Bound queues, tasks, memory, and fan-out.
- **Structured Concurrency / Cancellation** — Make lifetimes explicit.
- **Race Freedom / Atomicity / Isolation** — Make shared state safe.
- **N+1 / Batching / Streaming** — Control I/O amplification.

## Delivery and Collaboration

- **CI / CD** — Integrate and deliver continuously.
- **Trunk-Based Development / Short-Lived Branches** — Reduce merge delay.
- **Small Batches / Incremental Delivery** — Limit change risk.
- **Code Review / Pairing / Mob Programming** — Share context early.
- **Conventional Commits / Semantic Release** — Make change intent machine-readable.
- **IaC / Reproducible Builds / Immutable Deployment** — Make environments repeatable.
- **Blue-Green / Canary / Feature Flags** — Reduce blast radius.
- **Documentation as Code** — Evolve documentation with the system.
- **Blameless Postmortem / Continuous Improvement** — Turn failure into learning.

## Interaction

- **Human-Centered Design / Developer Experience** — Optimize for real users.
- **Accessibility / WCAG / Inclusive Design** — Design for diverse abilities.
- **i18n / l10n** — Separate language and locale.
- **Progressive Enhancement / Responsive Design** — Preserve the core experience.
- **Error UX / Graceful Recovery** — Make failure understandable and recoverable.
