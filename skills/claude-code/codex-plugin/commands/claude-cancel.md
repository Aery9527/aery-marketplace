# /claude-cancel

Stop an active Claude job and record it as cancelled.

Where a worker is on record, cancelling goes after the processes holding its pid.
On Windows the process tree is ended outright where `taskkill` is available;
without it, only that one process is ended and what it started is not reached.
Elsewhere SIGTERM is sent to that pid's process group where one answers, and to
the pid alone where none does — and only the group reaches what the run started.
Where no pid is on record, the command waits briefly for one to appear, and if
none does it records the job as cancelled without stopping anything.

Codex command files carry no frontmatter, so the argument list and the tool
constraints live here as instructions rather than as declared metadata.

## Arguments

- `[job-id]` — which job to cancel. A unique id prefix is enough. Without one,
  the single active job is cancelled; if more than one is active, the command
  refuses and asks for an id.
- `--json` — return the raw payload instead of rendered Markdown.
- `--cwd <path>` — cancel in a repository other than the current directory.

## Workflow

1. Run the companion, forwarding the user's arguments unchanged:

   ```bash
   node "${PLUGIN_ROOT}/scripts/claude-companion.mjs" cancel <arguments>
   ```

2. Return the command's stdout verbatim. Do not paraphrase it, do not summarise
   it, and do not add commentary before or after it.

## Rules

- The output states two separate facts: what happened to the process, and what
  the job record now says. MUST repeat both rather than merging them into "the
  job was cancelled".
- Only the report that says a process tree was terminated says the run is over.
  There MUST NOT tell the user that partial results are available or that the run
  can be resumed; a new run is the only way to get output. Every other outcome —
  a signal sent, one process ended, or nothing stopped — leaves the run possibly
  under way, and MUST be passed on as the report words it rather than as a
  finished cancellation.
- A job seen to have finished while the command was working on it is reported as
  finished, in whatever state it reached — which may be a failure. MUST report
  that as what happened rather than as a cancellation, and MUST NOT promise a
  result before `/claude-result` has shown one. The check travels with the write,
  so a run that reaches an outcome first keeps it and the cancellation is reported
  as late; only one that finishes inside the swap itself is overwritten.
- If the command fails because the process could not be terminated, the job is
  still running and its record is unchanged. MUST report that as a failed
  cancellation, and MUST NOT describe the job as cancelled.
- Cancelling a job that already finished is refused, and the command names the
  state it finished in. MUST pass that on rather than reporting a cancellation.
- Nothing is terminated until the arguments under that pid are read as the
  bridge's own worker for this job's id, which is checked immediately beforehand
  rather than held, and reads arguments rather than establishing which process it
  is. On a system where those arguments cannot be recovered — anything without
  `/proc` that is not Windows — nothing is signalled at all. The report says which
  of the three happened: not this job, unreadable, or terminated. The job is recorded as cancelled either way, and
  the second case asks the user to end that pid themselves. MUST pass on which of
  the two happened rather than reporting a stopped run.
- A job with no worker on record is cancelled, but the report says that nothing
  was stopped and that a worker starting up at that moment may still run. MUST
  pass both halves on, MUST NOT present it as a run that was stopped, and MUST
  relay the instruction to check `/claude-status` and cancel again.
