# AI Agent Markdown Rules

Load this file only when the Markdown target audience is an AI agent. AI-agent
documents focus on context-efficiency, precision, and executability; avoid
loading human-reader navigation and Mermaid rules.

## Applicable Contexts

- `SKILL.md`, agent instructions, system prompt, workflow rule, coding rule, eval spec, tool usage guideline.
- Content goal: enable an AI agent to execute rules reliably, not to help humans browse and learn.
- Documents are loaded into a context window long-term; priority is compression, precision, and executability.

## Required Output Spec

- MUST NOT include `## Quick Navigation` or `## Table of Contents`.
- MUST NOT include `[Back to top]` links.
- MUST NOT use Mermaid.
- MUST NOT use Markdown tables; use bullet lists or numbered steps instead.
- MUST NOT load [references/diagram-examples.md](diagram-examples.md) unless the user explicitly requests Mermaid syntax in an AI-agent document.
- In the final output of an English AI-agent document, strict requirements MUST use `MUST` and strict prohibitions MUST use `MUST NOT`.
- In the final output of a Traditional Chinese AI-agent document, strict requirements MUST use `必須` and strict prohibitions MUST use `嚴禁`.
- Rules MUST be direct and executable. For English AI-agent documents, prefer MUST / SHOULD / MUST NOT / ordered-priority phrasing.
- Avoid lengthy examples; keep only necessary short examples, counterexamples, or decision sentences.

## Text Replacement Formats

When an AI-agent document needs to describe architecture, flow, state, or dependencies, use the following text formats instead of Mermaid or tables:

- Dependencies: bullet list each item as "Component — Dependency — Responsibility".
- Temporal interactions: numbered steps describing actor, action, and result.
- State transitions: `from -> event -> to` transition list.
- Data flow: pipeline bullet list with input, processing, and output per step.
- Decision logic: priority-ordered bullet list with `if X then Y; otherwise Z` phrasing.

## Typical Structure

```markdown
# {Skill / Rule / Workflow Name}

## Purpose

What this document makes the agent do, when to use it, and what success looks like.

## Trigger Conditions

- User mentions ...
- Task involves ...

## Rules

- MUST ...
- MUST NOT ...
- If ... then ...

## Workflow

1. First ...
2. Then ...
3. Finally ...

## Decision Logic

- If scenario A, do X.
- If scenario B, do Y; otherwise do Z.
```

Omit inapplicable sections; add domain-specific sections as needed.

## Writing Guidelines

- Separate "when to trigger" from "how to execute" to prevent the agent from applying rules in the wrong context.
- Rule order MUST match actual execution order; MUST NOT bury exceptions far from the main flow.
- For high-risk behaviors, MUST use prohibitive phrasing, e.g. "MUST NOT silently ignore errors."
- Use "If ... then ...; otherwise ..." format for conditional branches.
- Use a priority-ordered bullet list or `if X then Y; otherwise Z` prose for multi-option decisions; MUST NOT use a table.
- If information only helps humans understand background but does not affect agent behavior, MUST delete or compress it.
