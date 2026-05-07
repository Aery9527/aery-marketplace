---
name: write-md
description: >-
  Use when writing or editing any Markdown file — README, user guide, feature
  doc, architecture overview, API reference, design proposal, SKILL.md,
  agent instructions, or workflow rule. Before producing output, MUST determine
  whether the document targets a human reader or an AI agent; if unclear, MUST
  ask. By default, MUST load only the matching reference. If the task
  explicitly requires maintaining both document types in one task, MAY load
  both reference paths as needed, but MUST keep their rules separated.
---

# Write MD

Write and edit Markdown documents. This master file holds only universal rules
and the reader-routing decision; load the appropriate reference only after
the target audience is determined.

## Audience Routing

1. Determine first whether the Markdown targets a **human reader** or an **AI agent**. AI-agent documents are any file loaded into an agent's context window to govern its behavior — for example `SKILL.md`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `CODEX.md`, system prompts, and workflow rules. Human-reader documents are anything written for people to read — READMEs, guides, design proposals, API references.
2. Once determined, **MUST start with the matching reference**. If the task explicitly requires maintaining both human-reader and AI-agent documents in one task, MAY load the second reference later as needed, but MUST keep the two rule sets separated and apply each only to its corresponding output.
3. If the target audience cannot be inferred from the user request, file location, filename, or content purpose, MUST ask the user and MUST NOT guess.
4. After loading the reference, MUST generate or modify the Markdown according to its rules.

## Normative Wording

- In the final output of English documents, strict requirements MUST use `MUST` and strict prohibitions MUST use `MUST NOT`.
- In the final output of Traditional Chinese documents, strict requirements MUST use `必須` and strict prohibitions MUST use `嚴禁`.

## Reference Selection

For human-reader documents (README, user guide, feature doc, architecture overview, API reference, design proposal, team technical doc), load [references/human-reader-docs.md](references/human-reader-docs.md).

For AI-agent documents (`SKILL.md`, agent instructions, system prompt, workflow rule, coding rule, eval spec, tool usage guideline), load [references/ai-agent-docs.md](references/ai-agent-docs.md).

For human-reader documents that need Mermaid syntax details or diagram-type examples, additionally load [references/diagram-examples.md](references/diagram-examples.md). MUST NOT load the Mermaid examples for AI-agent documents to avoid unnecessary context.

## Universal Rules

These rules apply regardless of target audience.

- Any reference to a file, directory, heading anchor, or external resource MUST use a Markdown link. MUST NOT use a bare path or URL; the link text MUST name the target clearly so the reader can tell where it leads without following it.

## Language Rules

- Document body, headings, table captions, and general prose default to English.
- Keep proper nouns as-is: product names, service names, library names, API names, command names, CLI flags, environment variables, filenames, paths, and programming-language keywords.

## Content Selection Rules

- MUST write down stable information that helps the target reader complete a task: usage, prerequisites, inputs, outputs, side effects, limits, and failure behavior.
- MUST NOT write down one-off correction context, author reminders, or patch notes that only exist to prevent the specific mistake made in the current edit.
- Before adding a sentence, MUST check whether it describes the system or workflow itself, or merely explains why the writer made this edit. If it only explains the current edit, MUST NOT include it in the document.
- If removing a sentence would not cause the target reader to lose any actionable understanding, it usually does not belong in the final document.

## YAML Frontmatter

- If a Markdown file has YAML frontmatter and a field value contains `: ` (colon followed by space), MUST NOT use an unquoted plain scalar.
- Keys fixed by the spec (e.g. `name`, `description`, `title`) MUST be written exactly as the spec requires.
- For long-sentence fields such as `description`, `summary`, or `title`, default to `>-` block scalar; very short values may use single or double quotes instead.
- This rule especially applies to the `description` field in `SKILL.md`, which often contains trigger words, example sentences, and colon-containing phrases.

Safe example:

```yaml
name: skills-governance
description: >-
  Use when creating or modifying project-custom skills under `.agents/skills/`,
  or when editing `aery-marketplace/aery-dev/` and the repo's directory-boundary,
  doc-sync, and Conventional Commit rules must be applied.
```
