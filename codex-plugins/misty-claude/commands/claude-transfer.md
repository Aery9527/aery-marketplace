# /claude-transfer

Turn one Codex transcript snapshot into a resumable Claude session handoff.

## Arguments

- `--source <jsonl>` — transfer a specific Codex transcript. Without it, the
  runtime resolves the transcript identified by `CODEX_THREAD_ID`.
- `--json` — return the machine-readable payload instead of rendered Markdown.
- `--cwd <path>` — seed the Claude session from another working directory.

## Workflow

1. Run the companion, forwarding the user's arguments unchanged:

   ```bash
   node "${PLUGIN_ROOT}/scripts/claude-companion.mjs" transfer <arguments>
   ```

2. Return stdout verbatim. MUST NOT paraphrase it or add commentary before or
   after it.
3. MUST NOT run any other command in the same turn.

## Rules

- MUST describe the result as a handoff. MUST NOT claim it is a native history
  import or that omitted content was transferred.
- The runtime reports success only after Claude returns a persisted session
  identifier. MUST NOT invent a resume command when the runtime fails.
- MUST NOT read, edit, or summarize the source transcript independently; source
  validation and conversion belong to the runtime.
