# /claude-rescue

Hand an investigation, a fix, or the continuation of earlier Claude work to
Claude Code, and return what it reports unchanged.

This is the write-capable entry point. The review commands take tools away on
purpose; this one takes nothing away by default, because changing the repository
is what it is for. `--read-only` is how a user asks for diagnosis without edits, and it
removes the direct edit tools and the workspace's MCP servers — every write route
that can be closed from here. The CLI offers no sandbox, so a session that can
still run commands can still write through them.

Upstream routes the same request through a subagent it declares in
`agents/codex-rescue.md`. A Codex plugin cannot declare a subagent — Codex's own
subagents are TOML files under `.codex/agents/`, and a plugin's `agents/`
directory holds interface metadata — so this command forwards to the runtime
itself and carries the forwarding rules here.

Codex command files carry no frontmatter, so the argument list and the tool
constraints live here as instructions rather than as declared metadata.

## Arguments

- `--background` — queue the run in a detached process and return at once with
  its job id. Without it the run happens in the foreground.
- `--wait` — state the foreground explicitly. It is the default, so this only
  makes the choice visible; it cannot be combined with `--background`.
- `--resume` — continue the most recent Claude session a finished rescue recorded
  instead of starting one. When this Codex session carries an id, only its own
  runs are considered; otherwise every run in the repository is.
- `--resume-session <id>` — continue a named session. `--resume` takes no value,
  because a flag that consumed the next word would consume the first word of the
  request.
- `--fresh` — start a new session. It is the default, and it cannot be combined
  with either resume flag.
- `--read-only` — ask for review, diagnosis or research without edits. It removes
  the direct edit tools and the workspace's MCP servers.
- `--model <model>` — run on a specific model. `spark` names a Codex model and is
  refused rather than forwarded.
- `--effort <level>` — run at a specific reasoning effort.
- `--json` — return the raw payload instead of rendered Markdown.
- `--cwd <path>` — work in a repository other than the current directory.
- Everything else is the user's request. The runtime splits the forwarded string
  on whitespace, treats a quote as grouping until its matching quote, takes a
  backslash and an apostrophe as ordinary characters, and refuses a double quote
  that never closes, then rejoins the remainder with single spaces. So the words of the request and their order survive; runs of whitespace
  between them, and the quotes that grouped them, do not.

## Workflow

1. If the user supplied no request at all, ask what Claude should investigate,
   fix, or continue before running anything. MUST NOT invent one, and MUST ask
   even when the user asked to continue — the runtime refuses an empty request
   whatever else was passed with it.
   If the user asked for diagnosis, review or research without edits, add
   `--read-only`.
2. If the user named none of `--resume`, `--resume-session` or `--fresh`, check
   whether there is something to continue — always, not only when the request
   reads like a continuation:

   ```bash
   node "${PLUGIN_ROOT}/scripts/claude-companion.mjs" rescue-resume-candidate --json
   ```

   Ask the user once, and only when that reports `available: true`, whether to
   continue that session or start a new one. Offer exactly two choices, in this
   order when the request reads as a continuation — "continue", "keep going",
   "resume", "apply the top fix", "dig deeper" — and in the opposite order
   otherwise:

   - `Continue the recorded Claude session`
   - `Start a new Claude session`

   Add `--resume` or `--fresh` to the forwarded arguments according to the
   answer. When it reports `available: false`, do not ask and do not add either
   flag.
3. Run the companion, forwarding the user's arguments unchanged:

   ```bash
   node "${PLUGIN_ROOT}/scripts/claude-companion.mjs" rescue <arguments>
   ```

4. Return the command's stdout verbatim. Do not paraphrase it, do not summarise
   it, and do not add commentary before or after it.
5. Do not run any other command in the same turn.

## Rules

- MUST pass the user's request through as they wrote it, apart from the flags
  listed above. MUST NOT rewrite it into a better prompt, expand it, or narrow
  it. What reaches Claude is the words of the request in their order, rejoined
  with single spaces; the double quotes that grouped them and any run of
  whitespace between them do not survive. Only the double quote groups, and
  nothing escapes it, so this grammar cannot carry a literal double quote at all —
  an apostrophe and a backslash pass through untouched. MUST NOT promise the text
  arrives byte for byte, and MUST NOT tell the user another quote will protect
  one.
- MUST NOT do the work itself. Once this command is invoked the work is handed
  over, however small it turns out to be; deciding it was small enough to answer
  here is what this command exists to prevent. Whether a request should reach
  this command at all is a routing question, and `SKILL.md` answers it.
- MUST NOT investigate the repository, read files, or plan a fix in order to
  decide what to forward.
- This run can change the repository, so MUST NOT describe it as read-only or
  sandboxed, and MUST NOT promise that anything was left untouched.
- Without `--background` the run happens in the foreground and the command
  returns when it is finished. MUST NOT claim such a run is happening in the
  background.
- With `--background` the command returns a queued report: a job id and no
  result, because nothing has run yet. MUST print that report as it is and MUST
  NOT invent an outcome, wait for one, or poll in the same turn. The report names
  the commands that collect it later.
- A foreground run whose Claude turn came back an error still prints what the
  turn produced, marked as partial, and the command exits non-zero. MUST pass
  that on as a failure rather than as finished work. A run that never reached a
  turn — Claude missing, or the session ending before it answered — fails with
  the reason on stderr and prints nothing.
- The report names the Claude session the run used. MUST pass that on rather than
  inventing a way to continue it; `--resume` is what continues it.
- `--resume` with nothing recorded for this repository is refused rather than
  quietly started fresh, and a session named with `--resume-session` while its own
  run is still going is refused too. MUST report either refusal as it is.
- MUST tell the user to run `/claude-setup` when the runtime reports that Claude
  Code is missing or unauthenticated.
