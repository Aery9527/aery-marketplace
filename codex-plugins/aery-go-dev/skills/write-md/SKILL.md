---
name: write-md
description: >-
  Use when writing or editing any Markdown file — README, user guide, feature
  doc, architecture overview, API reference, design proposal, SKILL.md,
  agent instructions, or workflow rule. Before producing output, determine
  whether the document targets a human reader or an AI agent; if unclear, ask.
  Load only the matching reference; never load both path sets simultaneously.
---

# Write MD

Write and edit Markdown documents. This master file holds only universal rules
and the reader-routing decision; load the appropriate reference only after
the target audience is determined.

## Audience Routing

1. Determine first whether the Markdown targets a **human reader** or an **AI agent**.
2. Once determined, **load only the matching reference**; do not load both document strategies at once.
3. If the target audience cannot be inferred from the user request, file location, filename, or content purpose, ask the user — do not guess.
4. After loading the reference, generate or modify the Markdown according to its rules.

## Reference Selection

| Target audience | Typical files / contexts | Required reference |
|-----------------|--------------------------|-------------------|
| Human reader | README, user guide, feature doc, architecture overview, API reference, design proposal, team technical doc | `references/human-reader-docs.md` |
| AI agent | `SKILL.md`, agent instructions, system prompt, workflow rule, coding rule, eval spec, tool usage guideline | `references/ai-agent-docs.md` |

For human-reader documents that need Mermaid syntax details or diagram-type examples, additionally load `references/diagram-examples.md`. Do not load the Mermaid examples for AI-agent documents to avoid unnecessary context.

## Language Rules

- Document body, headings, table captions, and general prose default to English.
- Keep proper nouns as-is: product names, service names, library names, API names, command names, CLI flags, environment variables, filenames, paths, and programming-language keywords.
- When referencing files, directories, or other docs: prefer Markdown links in human-reader docs; prefer the most precise, context-efficient representation in AI-agent docs.

## YAML Frontmatter

- If a Markdown file has YAML frontmatter and a field value contains `: ` (colon followed by space), never use an unquoted plain scalar.
- Keys fixed by the spec (e.g. `name`, `description`, `title`) are written exactly as the spec requires.
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
