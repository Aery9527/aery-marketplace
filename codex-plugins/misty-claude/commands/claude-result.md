# /claude-result

Print what a finished Claude job produced, unchanged, under a short header
naming the job and how it ended.

Nothing is re-run. This reads what was recorded when the job finished, so a
background review can be collected long after it completed.

Codex command files carry no frontmatter, so the argument list and the tool
constraints live here as instructions rather than as declared metadata.

## Arguments

- `[job-id]` — which job to print. A unique id prefix is enough. Without one,
  the most recent finished job is used.
- `--json` — return the raw payload instead of rendered Markdown.
- `--cwd <path>` — read a repository other than the current directory.

## Workflow

1. Run the companion, forwarding the user's arguments unchanged:

   ```bash
   node "${PLUGIN_ROOT}/scripts/claude-companion.mjs" result <arguments>
   ```

2. Return the command's stdout verbatim. Do not paraphrase it, do not summarise
   it, and do not add commentary before or after it.

## Rules

- Below the header is whatever the job recorded. For a review that finished, that
  is the report as it was already rendered once, `Scope` and `Evidence` lines
  included: MUST reproduce it whole, and MUST NOT restate its result as covering
  anything those lines do not claim. A run that failed may have recorded a report
  of that failure instead, which is not a review and MUST NOT be presented as one.
  A job that was cancelled, that failed before its run began, or whose run broke
  off before producing anything recorded no report at all; the command then prints
  the error it did record, or says nothing was stored.
- This command is read-only in the same sense the review was: MUST NOT fix
  anything the stored review reports, and MUST NOT offer to start making changes
  in the same turn.
- A record that says cancelled stored no output, and the command says so. MUST
  NOT present that as an empty or clean review.
- If the job is still running the command fails and says so. MUST NOT retry in a
  loop; use `/claude-status <id> --wait` to wait for it.
