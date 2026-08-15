# /claude-review

Run Claude Code's built-in reviewer against local git state and return its
report unchanged.

Codex command files carry no frontmatter, so the argument list and the tool
constraints live here as instructions rather than as declared metadata.

## Arguments

- `--base <ref>` — review the commits between `<ref>` and `HEAD`.
- `--scope auto|working-tree|branch` — choose the review target. `auto` is the
  default: it reviews the working tree when it is dirty, otherwise the branch.
- `--model <model>` — run the review on a specific model.
- `--background` — queue the review in a detached process and return at once
  with its job id. Without it the review runs in the foreground.
- `--wait` — state the foreground explicitly. It is the default, so this only
  makes the choice visible; it cannot be combined with `--background`.
- `--json` — return the raw payload instead of rendered Markdown.
- `--cwd <path>` — review a repository other than the current directory.

This command takes no focus text. Passing any is an error, and the error names
`/claude-adversarial-review` as the command that accepts it.

## Workflow

1. Run the companion, forwarding the user's arguments unchanged:

   ```bash
   node "${PLUGIN_ROOT}/scripts/claude-companion.mjs" review <arguments>
   ```

2. Return the command's stdout verbatim. Do not paraphrase it, do not summarise
   it, and do not add commentary before or after it.
3. Do not run any other command in the same turn.

## Rules

- This command is review-only. MUST NOT fix anything it reports, MUST NOT apply
  a patch, and MUST NOT offer to start making changes in the same turn.
- Without `--background` the review runs in the foreground and the command
  returns when it is finished. MUST NOT claim such a review is running in the
  background.
- With `--background` the command returns a queued report: a job id and the
  target that was resolved, with no findings and no `Scope` line, because
  nothing has been reviewed yet. MUST print that report as it is and MUST NOT
  invent a result, wait for one, or poll in the same turn. The report names the
  commands that collect it later.
- A foreground review whose Claude turn came back an error still prints a report
  explaining the failure, and the command exits non-zero. MUST print that report
  rather than reporting only that a command failed. A run that never reached a
  turn at all — Claude missing, or its session ending before it answered — has no
  report to print: it fails with the reason on stderr and prints nothing, and MUST
  be passed on as the reason it gives. A background review reports nothing about
  its outcome here: the queued report is printed and the command succeeds however
  the run later ends, so MUST NOT read that success as the review having passed.
- The `Scope` line states the scope that was **requested**, not a guarantee. The
  built-in reviewer chooses its own final scope and has been observed reviewing
  staged work on top of a requested branch diff. Its own report says what it
  read; MUST NOT contradict that report with the `Scope` line, and MUST NOT tell
  the user that anything was excluded.
- The reviewer inspects the repository itself and therefore runs with shell
  access. MUST NOT describe it to the user as sandboxed or read-only.
- If the user wants a challenge to the design rather than a defect pass, or
  wants to steer the review with focus text, direct them to
  `/claude-adversarial-review`.
