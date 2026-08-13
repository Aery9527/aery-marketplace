# /claude-cancel

Stop an active Claude job and record it as cancelled.

Where a worker is running, cancelling terminates it and the Claude session it
owns, ending the run rather than pausing it; the run then stores no result.
Where no worker is on record, the command waits briefly for one to appear, and
if none does it records the job as cancelled without stopping anything.

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
- Where a worker was terminated, the review leaves no partial findings. MUST NOT
  tell the user that partial results are available or that the run can be
  resumed; a new run is the only way to get output. Where the report says nothing
  was stopped, MUST NOT make that promise at all — a worker that was starting up
  can still finish and replace the cancellation with its own outcome.
- A job that finished while the command was working on it is reported as
  finished and left alone, in whatever state it reached — which may be a failure.
  MUST report that as what happened rather than as a cancellation, and MUST NOT
  promise a result before `/claude-result` has shown one.
- If the command fails because the process could not be terminated, the job is
  still running and its record is unchanged. MUST report that as a failed
  cancellation, and MUST NOT describe the job as cancelled.
- Cancelling a job that already finished is refused, and the command names the
  state it finished in. MUST pass that on rather than reporting a cancellation.
- A job with no worker on record is cancelled, but the report says that nothing
  was stopped and that a worker starting up at that moment may still run. MUST
  pass both halves on, MUST NOT present it as a run that was stopped, and MUST
  relay the instruction to check `/claude-status` and cancel again.
