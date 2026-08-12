# /claude-adversarial-review

Run a Claude Code review that challenges the implementation approach and the
design choices behind it, and return its report unchanged.

This is not a stricter pass over implementation defects. It asks whether the
current approach is the right one, what assumptions it depends on, and where the
design fails under real-world conditions.

Codex command files carry no frontmatter, so the argument list and the tool
constraints live here as instructions rather than as declared metadata.

## Arguments

- `--base <ref>` — review the commits between `<ref>` and `HEAD`.
- `--scope auto|working-tree|branch` — choose the review target. `auto` is the
  default: it reviews the working tree when it is dirty, otherwise the branch.
- `--model <model>` — run the review on a specific model.
- `--json` — return the raw payload instead of rendered Markdown.
- `--cwd <path>` — review a repository other than the current directory.
- Any remaining text is the user's focus area and is passed through unchanged.

## Workflow

1. Run the companion, forwarding the user's arguments unchanged:

   ```bash
   node "${PLUGIN_ROOT}/scripts/claude-companion.mjs" adversarial-review <arguments>
   ```

2. Return the command's stdout verbatim. Do not paraphrase it, do not summarise
   it, and do not add commentary before or after it.
3. Do not run any other command in the same turn.

## Rules

- This command is review-only. MUST NOT fix anything it reports, MUST NOT apply
  a patch, and MUST NOT offer to start making changes in the same turn.
- MUST NOT soften the adversarial framing and MUST NOT rewrite the user's focus
  text. Pass it through as the user wrote it.
- The review runs in the foreground and returns when it is finished. There is no
  background mode. Do not claim a review is running in the background.
- The `Scope` line states what was reviewed, and the `Evidence` line states what
  Claude was actually given. Both are exact here, because this command builds the
  review context itself. MUST repeat them rather than restating the result as
  covering anything wider.
- When the `Evidence` line says the tracked diff was not supplied inline, it also
  names the threshold that withheld it — a file count or a diff size, and either
  can trip on its own. In that case a tracked change reached Claude as a summary
  and a file name and it was told to read those files itself, so whether it read
  any given one is not recorded; eligible
  untracked files arrived with their contents, and the ones the `Evidence` line
  names as left out did not arrive at all. Either way it could not see what the
  change removed. MUST NOT present such a review as a review of the diff. If the
  `Evidence` line names untracked entries that were left out, MUST pass that on
  rather than reporting full coverage.
- The review session registers only `Read`, `Glob` and `Grep`, with no shell and
  no MCP server, so it cannot modify the repository.
- If the review returns no valid structured output, return the failure as
  printed. MUST NOT invent findings to fill the gap.
