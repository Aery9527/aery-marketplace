# /claude-status

Report the Claude jobs recorded for this repository: what is running now, what
has finished, and how to reach each one.

Every review is recorded as a job, whether it ran in the foreground or in the
background, so a finished run can usually be inspected again without rerunning
it. A run whose outcome could not be written — a full disk, a removed state
directory — usually leaves its findings in the job log, whose path this report
names when it is asked about that one job. Neither is a guarantee: a log write
that fails is swallowed rather than retried, so the log holds what reached it.

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
  recent ones. The listing keeps every active job plus the 50 newest finished
  ones and drops the rest; a job whose listing entry was lost stays readable from
  its own file, and is not counted against that cap.
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
- A `Progress:` list is read back out of the job log and stops where the run's
  final output begins. It is the last few steps before that point, not a
  transcript of everything the run did.
- A job's `Status` is the only statement about how it ended. MUST NOT describe a
  `failed` or `cancelled` job as completed, and MUST NOT infer success from the
  presence of a stored result.
- When the report says no process is running under a job's recorded pid, that
  job will never finish on its own. MUST pass that on rather than presenting it
  as still in progress, and MUST NOT claim the run crashed — what was checked is
  whether the pid still resolves, and then whether the job's own file was still
  active once it had stopped resolving, which is what separates a lost run from
  one that simply finished while it was being checked.
- `--wait` returns as soon as the job leaves the active state, when the wait
  times out, or when the job's worker is found to be gone. A report that says the
  wait timed out means the job had not reached an outcome by then; it does not
  say a run is under way, because a job whose worker never started looks the
  same from here.
- MUST NOT start, rerun or cancel anything from this command. It only reports.
