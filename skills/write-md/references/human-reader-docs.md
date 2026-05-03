# Human Reader Markdown Rules

Load this file only when the Markdown target audience is human. Human-facing
documents focus on scannability, navigability, and ease of building a mental model.

## Applicable Contexts

- README, user guide, feature doc, architecture overview, API reference, design proposal, technical docs shared with a team.
- Content goal: help readers quickly understand background, architecture, flow, decisions, or usage.
- Documents live in repos, Wikis, PRs, Notion, or other shared knowledge bases.

## Required Output Spec

- MUST include `## Quick Navigation` or `## Table of Contents`.
- Quick Navigation MUST use Markdown links pointing to major sections within the document.
- Default to listing all major `##` sections; for long or complex documents, extend to important `###` sections.
- Each major section MUST end with a back-to-top link; default to `[Back to top](#quick-navigation)`.
- If the document uses `## Table of Contents` instead of `## Quick Navigation`, use `[Back to top](#table-of-contents)`.
- When renaming headings or reordering sections, update Quick Navigation and back-to-top links to avoid dead links or name mismatches.

## Mermaid Rules

- Human-reader documents MUST use Mermaid to visualize core relationships, flows, states, or data flows.
- Even for simple content, include at least one brief Mermaid diagram to organize the main structure, flow, or decision relationship.
- Mermaid diagrams MUST complement prose; they must not merely restate paragraph content.
- Do not draw decorative diagrams unrelated to the document.
- When Mermaid syntax details or diagram-type examples are needed, additionally load `references/diagram-examples.md`.

## Mermaid Selection Guide

| Context | Diagram type | When to use |
|---------|-------------|-------------|
| Module dependencies, call hierarchy | `flowchart TD` | When the dependency chain between packages/modules is non-obvious |
| Cross-service request/response flow | `sequenceDiagram` | Temporal interactions among 3+ components |
| Interface/struct type relationships | `classDiagram` | Type hierarchy, interface implementations, struct composition |
| Lifecycle, state transitions | `stateDiagram-v2` | Entity flows between states with branching |
| Database schema, entity relationships | `erDiagram` | Data models with multiple foreign-key relationships |
| Processing pipeline | `flowchart LR` | Linear processing flows where direction and labels both matter |
| Decision logic, branching flow | `flowchart TD` | Conditional branches that are hard to express in prose |

If a feature spans multiple aspects, combine diagram types only when each type provides independent insight; avoid stacking diagrams just for completeness.

## Typical Structure

```markdown
# {Feature / Module Name}

## Quick Navigation

- [Overview](#overview)
- [Architecture](#architecture)
- [Flow](#flow)
- [Core Components](#core-components)
- [Notes](#notes)

## Overview

Purpose, scope, key design decisions.

[Back to top](#quick-navigation)

## Architecture

[Mermaid: one diagram showing core component relationships; even simple relationships deserve a minimal structural diagram.]

[Back to top](#quick-navigation)

## Flow

[Mermaid: one diagram showing main flow, data flow, or decision path.]

[Back to top](#quick-navigation)

## Core Components

Description of each component.

[Back to top](#quick-navigation)

## Notes

Edge cases, design constraints, unresolved issues.

[Back to top](#quick-navigation)
```

Omit inapplicable sections; add domain-specific sections as needed.

## Mermaid Best Practices

- Each diagram focuses on one concept; split complex systems into multiple diagrams.
- Node labels use English; identifiers stay ASCII.
- Add meaningful labels to flowchart edges to clarify relationship types.
- Keep diagram depth to 3-4 levels for readability.
- Use `subgraph` to group when there are 6+ nodes.
- Use `activate` / `deactivate` and `note` in sequence diagrams to mark key behaviors.
- Use `-->` solid lines for direct dependencies; `-.->` dashed lines for optional/indirect relationships.
- If the document contains multiple diagrams, Quick Navigation should allow readers to jump directly to each diagram's section.
- Sections containing diagrams must still include a back-to-top link; do not omit it just because a Mermaid diagram is present.

## Mermaid Syntax Safety

- Diamond nodes `{}` must not contain bare parentheses: `()` is parsed as a rounded-rectangle token. Wrap the entire label in double quotes, e.g. `T1{"Is FormatStack implemented?"}`, or replace parentheses with `&#40;&#41;` HTML entities.
- Quotes inside brackets `[]`: if text contains double quotes, use `&quot;` instead of `\"` to avoid truncating the node definition.
- Braces inside brackets `[]`: if text contains `{}`, use `#123;` / `#125;` to avoid being interpreted as a subgraph or diamond.

## Mermaid Color and Readability

- When using `style` to add a background color to a node, MUST also specify `color` (text color) to ensure readability in both light and dark mode.
- Color principle: pair background and text colors within the same hue family (light background + dark text of the same hue).

| Semantic | fill (background) | stroke (border) | color (text) |
|----------|------------------|-----------------|--------------| 
| Success / recommended | `#d4edda` | `#28a745` | `#155724` |
| Warning / caution | `#fff3cd` | `#ffc107` | `#856404` |
| Error / degraded | `#f8d7da` | `#dc3545` | `#721c24` |
| Info (blue) | `#e3f2fd` | `#1976d2` | `#0d47a1` |
| Info (purple) | `#f3e5f5` | `#7b1fa2` | `#4a148c` |
| Info (orange) | `#fff8e1` | `#f9a825` | `#e65100` |

Example: `style NodeId fill:#d4edda,stroke:#28a745,color:#155724`
