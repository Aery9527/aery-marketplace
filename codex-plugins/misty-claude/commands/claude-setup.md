# /claude-setup

Check whether Claude Code is ready to be driven from Codex, and record whether
this workspace wants a Claude review before a turn ends.

Codex command files carry no frontmatter, so the argument list and the
tool constraints live here as instructions rather than as declared metadata.

## Arguments

- `--enable-review-gate` — record that this workspace wants a Claude review
  before a turn ends. This writes the preference; enforcing it is the review
  gate hook's job, and this command neither installs nor runs one.
- `--disable-review-gate` — clear that preference again.
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
  bridge's own configuration, and only when a review-preference flag is passed.
- If the report says Claude Code is missing or too old, tell the user to install
  or update Claude Code. Do not attempt the install without being asked.
- If the report says Claude Code is not signed in, tell the user to run
  `claude auth login` in their own terminal. Never run a login command on their
  behalf, and never ask for credentials.
- Recording the preference changes nothing on its own: no command in this plugin
  reads it to require or run a review. MUST NOT tell the user that a review will
  now be required, or that turns will be blocked.
