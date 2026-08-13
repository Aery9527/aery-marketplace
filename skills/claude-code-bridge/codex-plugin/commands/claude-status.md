# /claude-status

Report the Claude jobs recorded for this repository: what is running now, what
has finished, and how to reach each one.

Every review is recorded as a job, whether it ran in the foreground or in the
background, so a finished run can be inspected again without rerunning it.

Codex command files carry no frontmatter, so the argument list and the tool
constraints live here as instructions rather than as declared metadata.

## Arguments

- `[job-id]` — report on a single job instead of the whole queue. A unique id
  prefix is enough; an ambiguous one is refused rather than guessed.
- `--wait` — with a job id, keep polling until the job leaves the active state,
  the timeout expires, or no process is found under the job's recorded pid.
  Without a job id this is an error.
- `--timeout-ms <ms>` — how long `--wait` may poll. Default 900000.
- `--poll-interval-ms <ms>` — how often `--wait` re-reads the job. Default 2000.
- `--all` — list every finished job the store still holds instead of the most
  recent ones. The store keeps every active job plus the 50 newest finished ones,
  and drops the rest.
- `--json` — return the raw payload instead of rendered Markdown.
- `--cwd <path>` — report on a repository other than the current directory.

## Workflow

1. Run the companion, forwarding the user's arguments unchanged:

   ```bash
   node "${PLUGIN_ROOT}/scripts/claude-companion.mjs" status <arguments>
   ```

2. Return the command's stdout verbatim. Do not paraphrase it, do not summarise
   it, and do not add commentary before or after it.

## Rules

- The output is already a finished report, including its tables. MUST NOT
  rebuild it, reorder it, or drop columns from it.
- A job's `Status` is the only statement about how it ended. MUST NOT describe a
  `failed` or `cancelled` job as completed, and MUST NOT infer success from the
  presence of a stored result.
- When the report says no process is running under a job's recorded pid, that
  job will never finish on its own. MUST pass that on rather than presenting it
  as still in progress, and MUST NOT claim the run crashed — what was checked is
  only whether the pid still resolves.
- `--wait` returns as soon as the job leaves the active state, when the wait
  times out, or when the job's worker is found to be gone. A report that says
  the wait timed out means the run is still going, not that it was stopped.
- MUST NOT start, rerun or cancel anything from this command. It only reports.
