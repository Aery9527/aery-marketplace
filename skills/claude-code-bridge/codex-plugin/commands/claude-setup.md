# /claude-setup

Check whether Claude Code is ready to be driven from Codex, and manage the
optional stop-time review gate.

Codex command files carry no frontmatter, so the argument list and the
tool constraints live here as instructions rather than as declared metadata.

## Arguments

- `--enable-review-gate` — require a fresh Claude review before a turn ends.
- `--disable-review-gate` — stop requiring it.
- `--json` — return the raw report instead of rendered Markdown.
- `--cwd <path>` — check a directory other than the current one.

Passing both `--enable-review-gate` and `--disable-review-gate` is an error.

## Workflow

1. Run the companion, forwarding the user's arguments unchanged:

   ```bash
   node "${PLUGIN_ROOT}/scripts/claude-companion.mjs" setup <arguments>
   ```

2. Present the command's stdout to the user exactly as returned. Do not
   summarise it, and do not drop the `Next steps` section.
3. Do not run any other command in the same turn.

## Rules

- This command is read-only with respect to the repository. It writes only the
  bridge's own configuration, and only when a review-gate flag is passed.
- If the report says Claude Code is missing or too old, tell the user to install
  or update Claude Code. Do not attempt the install without being asked.
- If the report says Claude Code is not signed in, tell the user to run
  `claude auth login` in their own terminal. Never run a login command on their
  behalf, and never ask for credentials.
- The review gate can create a long-running Codex/Claude loop and consume usage
  quickly. When enabling it, say so.
