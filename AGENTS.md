# Agent Instructions

## Project Overview

This repository is an AI Agent Skills marketplace for organizing, maintaining,
and publishing reusable agent skills. The core content lives under `skills/`.
Each skill defines `name` and `description` in the YAML frontmatter of its own
`SKILL.md`, and the body describes triggers, workflow, rules, and references.
`SKILL.md` is the English primary entrypoint. When a Traditional Chinese
version exists, read the matching `*_zhTW.md` in the same directory.

`.claude-plugin/marketplace.json` defines the Plugin Bundle layout and is the
source of truth for bundle and skill grouping. `.agents/plugins/marketplace.json`
and `codex-plugins/` are synchronized artifacts for Codex. Within
`codex-plugins/*/skills/`, the packaged copy is English-only and must not
contain any `*_zhTW.md`. `README.md` is a project-level guide for humans; it is
not the source of truth for the skill list.

## Markdown Language Policy

- For bilingual Markdown in this repository, keep the English file as the
  primary file and use the same basename with `*_zhTW.md` for the Traditional
  Chinese version.
- This rule applies to `SKILL.md`, Markdown under `references/`, and
  repository-level instruction docs such as `AGENTS.md`.
- When modifying a bilingual Markdown file, update both the English primary
  file and the corresponding `*_zhTW.md` in the same change. Do not let the two
  versions drift.

## Skill Maintenance

- When adding, deleting, or modifying any skill content under `skills/`,
  re-check and update `README.md` if the project-level guidance or exploration
  instructions need to change.
- When adding, deleting, or modifying any skill content under `skills/`,
  re-check `.claude-plugin/marketplace.json` so bundle and skill grouping remain
  correct. If a skill's ownership, naming, or packaging list changes, update
  `.claude-plugin/marketplace.json` first.
- `.agents/plugins/marketplace.json` must stay synchronized with
  `.claude-plugin/marketplace.json`. Do not maintain both manually. Run
  `scripts/sync-codex-plugins.ps1` or `scripts/sync-codex-plugins.sh` to rewrite
  `.agents/plugins/marketplace.json` and re-sync `codex-plugins/*/skills`.
- Do not edit the skill copies under `codex-plugins/*/skills` manually. The
  correct flow is to modify the `skills/` source and rerun the sync script. The
  synchronized Codex package keeps only the English primary files, and no
  `*_zhTW.md` files should remain in that tree.
- `README.md` should stay short and project-level. Do not manually enumerate
  the current skill list there.
- To discover the current skills, read the YAML frontmatter from
  `skills/*/SKILL.md` and use `name` and `description` to determine skill
  identity, purpose, and trigger timing.
- The actual skill inventory and descriptions are defined by each
  `SKILL.md` frontmatter. Do not duplicate that inventory inside `README.md`,
  because duplicated lists drift.
- When creating a new skill under `skills/`, create `SKILL.md` and every
  Markdown file under `references/` in English first, then add a Traditional
  Chinese `*_zhTW.md` version with the same basename.
- When skill content exists in both English and Traditional Chinese, keep
  `SKILL.md` or the original filename as the English primary file, and use the
  same basename plus `*_zhTW.md` for the Traditional Chinese version. Apply the
  same rule to Markdown files under `references/`.
- Any later modification must update both the English primary file and the
  corresponding `*_zhTW.md`. Never update only one language and leave them
  diverged.
