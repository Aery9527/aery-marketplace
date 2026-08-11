# Upstream Parity Record

This skill is a reverse port. `openai/codex-plugin-cc` lets Claude Code call
Codex; this package lets Codex call Claude Code. Because the source of the
behaviour lives in another repository, this file is the join between the two:
it pins the upstream revision the port was written against, maps every upstream
file to its counterpart here, and records what the reverse direction cannot
reproduce.

Read this file before changing anything under `codex-plugin/`, and update it in
the same change. It records **present state and current contract only** — why a
row changed belongs in the commit message, not here.

## Upstream Pin

| Field | Value |
|-------|-------|
| Repository | `https://github.com/openai/codex-plugin-cc` |
| Commit | `db52e28f4d9ded852ab3942cea316258ae4ef346` |
| Commit date | 2026-07-07 |
| Commit subject | Remove shell expansion for git commands (#447) |
| Upstream plugin version | `1.0.6` (`plugins/codex/.claude-plugin/plugin.json`) |
| Upstream licence | Apache-2.0 |

## How To Read This File

Two independent facts are tracked per file, in separate columns, because they
drift for different reasons.

**Plan** — the intended relationship to upstream. It changes only when upstream
changes or when a host limitation is discovered.

| Plan | Meaning |
|------|---------|
| `port` | reproduce the behaviour directly |
| `adapt` | reproduce the behaviour through a different host mechanism, see [Adaptations](#adaptations) |
| `partial` | reproduce with a documented loss, see [Gaps](#gaps) |
| `open` | reproducibility not yet decided; a named probe must settle it, see [Open Verification](#open-verification) |
| `drop` | deliberately no counterpart, see [Gaps](#gaps) |
| `new` | this package needs the file; upstream has no counterpart |
| `n/a` | upstream infrastructure this repository already solves its own way |
| `removed` | upstream deleted the file; the row is kept so its counterpart stays under review |

**State** — delivery status of the counterpart file.

| State | Meaning |
|-------|---------|
| `todo` | a counterpart is expected and does not exist yet |
| `wip` | the counterpart exists but does not yet meet its Plan |
| `done` | the counterpart exists, meets its Plan, and its area's verification passes |
| `n/a` | no counterpart is expected, because the Plan is `drop`, `n/a` or `removed` |

`done` is never a declaration of intent. It requires the verification named for
that area in [Verification Matrix](#verification-matrix) to pass.

Sections after the File Map — [Adaptations](#adaptations), [Gaps](#gaps) —
describe the **contract** each counterpart must satisfy. Whether a given
counterpart satisfies it yet is the File Map's State column, never these
sections.

## Following Upstream

The tracked upstream surface is every path that appears in the
[File Map](#file-map). Diff all of it:

```sh
git clone https://github.com/openai/codex-plugin-cc
cd codex-plugin-cc
git diff --stat db52e28f4d9ded852ab3942cea316258ae4ef346..origin/main \
  -- plugins/codex/ tests/ scripts/bump-version.mjs .github/workflows/ \
     .claude-plugin/marketplace.json package.json package-lock.json \
     tsconfig.app-server.json .gitignore README.md LICENSE NOTICE
```

Then:

1. Every changed path appears in the File Map. Revisit only those rows, and
   reset their State to `wip` until the port catches up.
2. A path that is new upstream and absent from the File Map means the map is
   stale — add the row, choose its Plan, set State to `todo`, then port.
3. A path upstream deleted keeps its row with Plan `removed` and State `n/a`.
   Deleting the row instead would silently drop its counterpart from review.
4. A path upstream renamed is one row, not two: rewrite the upstream path and
   leave the counterpart alone.
5. After porting, move the pin in [Upstream Pin](#upstream-pin) to the new
   commit and version.

Matching the diff against the File Map is a **manual step today**. The File Map
is keyed by upstream path so that it *can* be automated: the port's own test
suite must grow a parity test that walks upstream's tracked inventory, asserts
every path has exactly one File Map row, and fails on an addition, deletion or
rename. Until that test exists, steps 1–4 depend on the person doing the
upgrade.

## Verification Matrix

What must pass before a row in that area may be marked `done`.

| Area | Verification |
|------|--------------|
| runtime libraries | `node --test codex-plugin/tests/` |
| companion subcommands | `codex-plugin/tests/commands.test.mjs` against the fake `claude` fixture |
| git target resolution | `codex-plugin/tests/git.test.mjs` |
| job state | `codex-plugin/tests/state.test.mjs` |
| rendering | `codex-plugin/tests/render.test.mjs` |
| the Claude session client | `codex-plugin/tests/claude-cli.test.mjs`, `codex-plugin/tests/stream-protocol.test.mjs` |
| static assets (prompts, schemas, licence, manifest) | `scripts/sync-codex-plugins.ps1` completes and `scripts/verify_codex_plugins.py` passes |
| commands, agents, skills (prose) | reviewed against the upstream file they map to; no automated gate |
| hooks | the TUI probe in [Open Verification](#open-verification) |

There is no CI in this repository, so these are run locally before a release.

## Layout Mapping

Upstream ships one Claude Code plugin at `plugins/codex/`. This repository is a
skills marketplace, so the same package is assembled from two source shapes:

| Upstream location | Source of truth here | Packaged to |
|-------------------|----------------------|-------------|
| `plugins/codex/skills/*` | `skills/claude-*/` (ordinary skill directories) | `codex-plugins/aery-claude-code/skills/*` |
| everything else under `plugins/codex/` | `skills/claude-code-bridge/codex-plugin/` (overlay) | `codex-plugins/aery-claude-code/` (plugin root) |

The overlay exists because a Codex plugin keeps `scripts/`, `commands/`,
`agents/` and `hooks.json` at the *plugin root*, not inside a skill, while this
repository requires every source file to live under `skills/`.
`scripts/sync-codex-plugins.ps1` copies the overlay's contents onto the plugin
root and excludes the overlay from the skill copy, the same way it excludes
`*_zhTW.md`.

## File Map

Paths in the Counterpart column are relative to `skills/claude-code-bridge/`
unless they start with a repository-root segment.

### Repository root

| Upstream path | Counterpart | Plan | State |
|---------------|-------------|------|-------|
| `LICENSE` | `codex-plugin/LICENSE` (Apache-2.0 full text, unmodified) | port | done |
| `NOTICE` | `codex-plugin/NOTICE` (attribution, extended with this port) | adapt | done |
| `README.md` | `skills/claude-code-bridge/SKILL.md` | adapt | wip |
| `package.json` | none — dependency-free ESM, tests run with `node --test` | n/a | n/a |
| `package-lock.json` | none — no dependencies to lock | n/a | n/a |
| `tsconfig.app-server.json` | `codex-plugin/scripts/lib/stream-protocol.mjs` (runtime validation replaces build-time types) | adapt | done |
| `.gitignore` | repository-root `.gitignore` | n/a | n/a |
| `.claude-plugin/marketplace.json` | repository-root `.claude-plugin/marketplace.json` | n/a | n/a |
| `scripts/bump-version.mjs` | `release` skill (repository-wide) | n/a | n/a |
| `.github/workflows/pull-request-ci.yml` | none | drop | n/a |

Upstream needs these three for its Node toolchain and to type-check the
app-server protocol. The stream-protocol probe showed the reverse runtime needs
no dependencies, so the toolchain files have no counterpart and the protocol
contract moved to a runtime validator instead of a build step.

### Manifest and packaging

| Upstream path | Counterpart | Plan | State |
|---------------|-------------|------|-------|
| `plugins/codex/.claude-plugin/plugin.json` | `codex-plugins/aery-claude-code/.codex-plugin/plugin.json` | adapt | wip |
| `plugins/codex/CHANGELOG.md` | `release-note/vX.Y.Z.md` (repository-wide) | n/a | n/a |
| `plugins/codex/LICENSE` | `codex-plugin/LICENSE` | port | done |
| `plugins/codex/NOTICE` | `codex-plugin/NOTICE` | adapt | done |

### Entry points

| Upstream path | Counterpart | Plan | State |
|---------------|-------------|------|-------|
| `plugins/codex/commands/review.md` | `codex-plugin/commands/claude-review.md` | adapt | todo |
| `plugins/codex/commands/adversarial-review.md` | `codex-plugin/commands/claude-adversarial-review.md` | adapt | todo |
| `plugins/codex/commands/rescue.md` | `codex-plugin/commands/claude-rescue.md` | adapt | todo |
| `plugins/codex/commands/transfer.md` | `codex-plugin/commands/claude-transfer.md` | adapt | todo |
| `plugins/codex/commands/status.md` | `codex-plugin/commands/claude-status.md` | partial | todo |
| `plugins/codex/commands/result.md` | `codex-plugin/commands/claude-result.md` | partial | todo |
| `plugins/codex/commands/cancel.md` | `codex-plugin/commands/claude-cancel.md` | partial | todo |
| `plugins/codex/commands/setup.md` | `codex-plugin/commands/claude-setup.md` | adapt | done |
| `plugins/codex/agents/codex-rescue.md` | `codex-plugin/agents/claude-rescue.md` | partial | todo |
| — | `codex-plugin/agents/openai.yaml` | new | todo |

### Runtime

| Upstream path | Counterpart | Plan | State |
|---------------|-------------|------|-------|
| `plugins/codex/scripts/codex-companion.mjs` | `codex-plugin/scripts/claude-companion.mjs` | adapt | wip |
| `plugins/codex/scripts/lib/codex.mjs` | `codex-plugin/scripts/lib/claude.mjs` | adapt | wip |
| `plugins/codex/scripts/lib/app-server.mjs` | `codex-plugin/scripts/lib/claude-cli.mjs` | adapt | done |
| `plugins/codex/scripts/lib/app-server-protocol.d.ts` | `codex-plugin/scripts/lib/stream-protocol.mjs` (runtime validation, not types) | adapt | done |
| `plugins/codex/scripts/app-server-broker.mjs` | `codex-plugin/scripts/claude-broker.mjs` | adapt | todo |
| `plugins/codex/scripts/lib/broker-endpoint.mjs` | `codex-plugin/scripts/lib/broker-endpoint.mjs` | adapt | todo |
| `plugins/codex/scripts/lib/broker-lifecycle.mjs` | `codex-plugin/scripts/lib/broker-lifecycle.mjs` | adapt | todo |
| `plugins/codex/scripts/lib/claude-session-transfer.mjs` | `codex-plugin/scripts/lib/codex-session-transfer.mjs` | partial | todo |
| `plugins/codex/scripts/lib/args.mjs` | `codex-plugin/scripts/lib/args.mjs` | port | done |
| `plugins/codex/scripts/lib/fs.mjs` | `codex-plugin/scripts/lib/fs.mjs` | port | done |
| `plugins/codex/scripts/lib/git.mjs` | `codex-plugin/scripts/lib/git.mjs` | port | done |
| `plugins/codex/scripts/lib/process.mjs` | `codex-plugin/scripts/lib/process.mjs` | adapt | done |
| `plugins/codex/scripts/lib/prompts.mjs` | `codex-plugin/scripts/lib/prompts.mjs` | port | todo |
| `plugins/codex/scripts/lib/workspace.mjs` | `codex-plugin/scripts/lib/workspace.mjs` | port | done |
| `plugins/codex/scripts/lib/state.mjs` | `codex-plugin/scripts/lib/state.mjs` | adapt | done |
| `plugins/codex/scripts/lib/render.mjs` | `codex-plugin/scripts/lib/render.mjs` | adapt | wip |
| `plugins/codex/scripts/lib/job-control.mjs` | `codex-plugin/scripts/lib/job-control.mjs` | adapt | todo |
| `plugins/codex/scripts/lib/tracked-jobs.mjs` | `codex-plugin/scripts/lib/tracked-jobs.mjs` | adapt | todo |

The four `adapt` rows at the end carry host semantics rather than pure logic:
`state.mjs` resolves state under `CLAUDE_PLUGIN_DATA`, `job-control.mjs` and
`tracked-jobs.mjs` model app-server progress events, and `render.mjs` emits
`codex resume` follow-up commands. Each needs its host-specific half rewritten.

### Hooks and prompts

| Upstream path | Counterpart | Plan | State |
|---------------|-------------|------|-------|
| `plugins/codex/hooks/hooks.json` | `codex-plugin/hooks.json` | adapt | todo |
| `plugins/codex/scripts/session-lifecycle-hook.mjs` | `codex-plugin/scripts/session-lifecycle-hook.mjs` | adapt | todo |
| `plugins/codex/scripts/stop-review-gate-hook.mjs` | `codex-plugin/scripts/stop-review-gate-hook.mjs` | adapt | todo |
| `plugins/codex/prompts/adversarial-review.md` | `codex-plugin/prompts/adversarial-review.md` | port | todo |
| `plugins/codex/prompts/stop-review-gate.md` | `codex-plugin/prompts/stop-review-gate.md` | port | todo |
| `plugins/codex/schemas/review-output.schema.json` | `codex-plugin/schemas/review-output.schema.json` | port | todo |

Both hook scripts are `adapt`, not `port`, for different reasons.
`session-lifecycle-hook.mjs` exports state into `CLAUDE_ENV_FILE` on
`SessionStart` and tears the broker down on `SessionEnd`; the Codex hook payload
and environment contract both differ, and what it tears down depends on the
broker decision. `stop-review-gate-hook.mjs` reads `last_assistant_message` and
spawns `codex-companion task --json`; it needs the Codex `Stop` payload shape
and the reverse companion's task contract.

### Skills

| Upstream path | Counterpart | Plan | State |
|---------------|-------------|------|-------|
| `plugins/codex/skills/codex-cli-runtime/SKILL.md` | `skills/claude-cli-runtime/SKILL.md` | adapt | todo |
| `plugins/codex/skills/codex-result-handling/SKILL.md` | `skills/claude-result-handling/SKILL.md` | adapt | todo |
| `plugins/codex/skills/gpt-5-4-prompting/SKILL.md` | `skills/claude-code-prompting/SKILL.md` | adapt | todo |
| `plugins/codex/skills/gpt-5-4-prompting/references/prompt-blocks.md` | `skills/claude-code-prompting/references/prompt-blocks.md` | adapt | todo |
| `plugins/codex/skills/gpt-5-4-prompting/references/codex-prompt-recipes.md` | `skills/claude-code-prompting/references/claude-prompt-recipes.md` | adapt | todo |
| `plugins/codex/skills/gpt-5-4-prompting/references/codex-prompt-antipatterns.md` | `skills/claude-code-prompting/references/claude-prompt-antipatterns.md` | adapt | todo |
| — | `skills/claude-code-bridge/SKILL.md` | new | wip |
| — | `skills/claude-code-bridge/UPSTREAM-PARITY.md` | new | wip |

All three upstream skills are `adapt`. Their bodies instruct an agent to call
`codex-companion`, the Codex CLI and Codex sessions by name; every such
instruction must be rewritten against the Claude CLI contract.

### Tests

| Upstream path | Counterpart | Plan | State |
|---------------|-------------|------|-------|
| `tests/helpers.mjs` | `codex-plugin/tests/helpers.mjs` | port | done |
| `tests/git.test.mjs` | `codex-plugin/tests/git.test.mjs` | adapt | done |
| `tests/process.test.mjs` | `codex-plugin/tests/process.test.mjs` | port | done |
| `tests/state.test.mjs` | `codex-plugin/tests/state.test.mjs` | adapt | done |
| `tests/render.test.mjs` | `codex-plugin/tests/render.test.mjs` | adapt | todo |
| `tests/commands.test.mjs` | `codex-plugin/tests/commands.test.mjs` | adapt | wip |
| `tests/runtime.test.mjs` | `codex-plugin/tests/runtime.test.mjs` | adapt | todo |
| `tests/fake-codex-fixture.mjs` | `codex-plugin/tests/fake-claude-fixture.mjs` | adapt | done |
| `tests/broker-endpoint.test.mjs` | `codex-plugin/tests/broker-endpoint.test.mjs` | adapt | todo |
| `tests/bump-version.test.mjs` | none | n/a | n/a |
| — | `codex-plugin/tests/stream-protocol.test.mjs` | new | done |
| — | `codex-plugin/tests/claude-cli.test.mjs` | new | done |

`runtime.test.mjs` is `adapt`: it drives a fake Codex app server and exercises
native import and broker interrupt, none of which survive unchanged.

## Host Capability Comparison

The two hosts are not mirror images. Each claim below carries the evidence it
rests on. `help` means the local `--help` output, `probe` means a throwaway
plugin or process run locally, `docs` means vendor documentation, and
`unverified` means the claim still needs a probe before anything depends on it.

### What the delegated CLI offers

Upstream drives Codex through the Codex **app server**, a long-lived JSON-RPC
process. The reverse port drives the `claude` CLI. Verified against `claude`
2.1.227.

| Upstream app-server capability | Claude Code CLI counterpart | Evidence |
|--------------------------------|-----------------------------|----------|
| structured output (`schemas/review-output.schema.json`) | `--json-schema`; documented with `--output-format json`, where the result lands in `structured_output` | docs |
| turn streaming and progress events | `--output-format stream-json --verbose`; the turn ends on a `result` event. Token-level deltas additionally need `--include-partial-messages`, which the runtime does not pass yet | docs, probe |
| model selection | `--model <alias\|full-name>` | help |
| thread persistence and resume | `--session-id <uuid>`, `--resume <id>`, `--continue`, `--fork-session`; `--resume` finds a session in any project from v2.1.223 | docs, help |
| thread naming (`buildPersistentTaskThreadName`) | `--name <name>` | help |
| read-only versus write-capable runs | `--permission-mode` (`dontAsk` for locked-down runs), `--tools`, `--allowed-tools` | docs |
| native `/review` (`runAppServerReview`) | `claude -p "/code-review"` — user-invoked skills expand inside the `-p` prompt string | docs |
| long-lived process serving successive turns | `-p --input-format stream-json --output-format stream-json`; one process served two turns under one `session_id` and exited 0 on stdin close | probe |
| turn interruption (`interruptAppServerTurn`) | `control_request` with `{subtype: "interrupt"}`; answered by `control_response`, ends the turn as `result`/`error_during_execution`, and the session stays usable | probe |
| session metadata after a run | `system/init` event, or `session_id` in `--output-format json` | docs |
| detached background execution | **no counterpart** — `-p` rejects `--bg`; the bridge must manage its own detached child | docs |
| reasoning effort selection | `--effort <low\|medium\|high\|xhigh\|max>` | help — see [Gaps](#gaps) |
| clean shutdown semantics | SIGTERM aborts the turn, kills the Bash process tree, runs `SessionEnd` hooks, exits 143 | docs |

### What the host plugin system offers

Verified against `codex-cli` 0.147.0 and the plugins it ships (`figma`,
`replayio`).

| Claude Code plugin capability | Codex plugin equivalent | Evidence |
|-------------------------------|-------------------------|----------|
| `skills/*/SKILL.md` with `name` / `description` frontmatter | same, plus `disable-model-invocation` | probe, shipped plugin |
| `commands/*.md` slash commands | `commands/*.md`; no frontmatter observed in any shipped plugin | shipped plugin |
| `agents/*.md` subagents | `agents/*.md` plus `agents/openai.yaml`; no frontmatter observed | shipped plugin |
| `hooks/hooks.json` | `hooks` entry in `plugin.json`, or the default `hooks/hooks.json` | docs, binary strings |
| `${CLAUDE_PLUGIN_ROOT}` | `${PLUGIN_ROOT}`, `${PLUGIN_DATA}`; `${CLAUDE_PLUGIN_ROOT}` still accepted | docs, binary strings |
| hook `command` accepts any shell string | must be a bare executable name or a `./` path contained in the plugin root | docs, binary strings |
| `SessionStart`, `SessionEnd`, `Stop` hook events | same names, plus `PreToolUse`, `PostToolUse`, `PermissionRequest`, `PreCompact`, `PostCompact`, `UserPromptSubmit`, `SubagentStart`, `SubagentStop` | docs |
| `Stop` hook blocks with `decision: "block"` | same | docs |
| plugin hooks actually fire | not observed under `codex exec` | probe — see [Open Verification](#open-verification) |

## Adaptations

Contracts where behaviour is preserved but the mechanism differs. Nothing here
is a loss of function.

- **Command naming** — Codex plugin commands are not namespaced by plugin, so
  `/codex:review` becomes `/claude-review`, not `/claude:review`. Every command
  file carries the `claude-` prefix instead.
- **Structured output** — upstream asks the app server for output matching
  `schemas/review-output.schema.json`. The counterpart passes the same schema to
  `claude --json-schema`, so the schema file itself ports unchanged. The session
  always runs `--output-format stream-json`, because one process has to serve
  successive turns, and reads `structured_output` off the final `result` event.
  Whether a stream-json `result` carries `structured_output` is listed under
  [Open Verification](#open-verification).
- **Background execution** — upstream detaches by launching the companion as a
  background task and tracking it in workspace state. `-p` rejects `--bg`, so
  the counterpart must spawn and supervise its own detached child; `claude
  agents` manages Claude Code's own background sessions and is not a substitute.
- **`hooks.json` location** — upstream keeps it at `hooks/hooks.json`. The
  counterpart keeps it at the plugin root and declares `"hooks": "./hooks.json"`
  in `plugin.json`, matching how Codex's own bundled plugins ship hooks.
- **Protocol contract** — upstream type-checks the app-server protocol with
  `app-server-protocol.d.ts` at build time. The counterpart has no build step,
  so the equivalent contract is enforced at runtime by `stream-protocol.mjs`.
  Every frame must be a JSON object with a string `type`. The frames the bridge
  acts on — `system`, `result` and `control_response` — are additionally checked
  field by field: a required field must be present and correctly typed, and an
  optional field may be absent or `null` but fails loudly when it carries any
  other wrong type.
  A frame whose `type` the bridge does not recognise is passed through
  untouched, because the CLI adds event types over time. Feature detection reads
  the `capabilities` array on `system/init` rather than comparing version
  strings; the version is advisory and never blocks a run.
- **Prompt skill** — `gpt-5-4-prompting` teaches prompting for GPT-5.4. Its
  counterpart teaches prompting for Claude Code, so the file maps across but the
  content is written fresh rather than translated.

## Gaps

Behaviour the reverse direction cannot fully reproduce. Each entry names the
upstream file that implements it, so a future upstream change to that file lands
on a known limitation.

### Dropped

- **CI workflow** — `.github/workflows/pull-request-ci.yml`. This is a project
  choice, not a host limitation: this repository has no CI. The equivalent gate
  is [Verification Matrix](#verification-matrix), run locally before a release.

### Degraded

- **Reasoning effort range** — `VALID_REASONING_EFFORTS` in
  `scripts/codex-companion.mjs` accepts `none|minimal|low|medium|high|xhigh`.
  The `claude` CLI accepts `low|medium|high|xhigh|max`. `none` and `minimal`
  have no counterpart and must be rejected rather than silently remapped; `max`
  is available here and has no upstream counterpart.
- **Deterministic command bodies** — `commands/status.md`, `commands/result.md`,
  `commands/cancel.md`. Upstream executes the companion script directly from the
  command body with `` !`...` `` substitution, so the script always runs. No
  Codex command file observed uses substitution, so the counterpart instructs
  the model to run the script instead. The model can in principle paraphrase or
  skip the call.
- **Command metadata** — every file under `commands/`. Upstream declares
  `description`, `argument-hint`, `allowed-tools` and `disable-model-invocation`
  in frontmatter. No shipped Codex command file carries frontmatter, so argument
  hints live in prose and tool access is not constrained per command.
- **Subagent declaration** — `agents/codex-rescue.md`. Upstream declares
  `model`, `tools` and `skills` in frontmatter, pinning the rescue forwarder to
  one model with `Bash` only. No shipped Codex agent file carries frontmatter,
  so the same constraints are stated as instructions the agent is asked to
  follow.
- **Session transfer** — `commands/transfer.md`,
  `scripts/lib/claude-session-transfer.mjs`. Upstream uses Codex's documented
  external-agent session importer to turn a Claude Code transcript into a real
  Codex thread, producing visible, continuable turns. Claude Code exposes no
  session importer — `claude import` imports *configuration* from Codex, not
  conversations. The counterpart therefore creates a bridge-owned Claude session
  from a handoff prompt carrying the converted Codex transcript and its
  provenance, and returns a `claude --resume <session-id>` command. It promises
  continuable work, **not** natively visible imported history. Synthesising
  session files directly under `~/.claude/projects/` is deliberately rejected:
  that format is undocumented and private, and writing it would risk corrupting
  real user sessions.

## Open Verification

Claims that could not be settled locally. Each names the probe that settles it
and the rows that depend on the answer. Nothing may move from `open` to a
concrete Plan without running its probe.

- **Structured output over stream-json.** `--json-schema` is documented with
  `--output-format json`, but the bridge's session is always stream-json. Probe:
  run a schema-constrained turn through the session and confirm the final
  `result` event carries `structured_output`. If it does not, the review family
  needs a separate one-shot `--output-format json` invocation. Decides the
  review path in the next milestone.
- **Untracked file collection follows symlinks.** `collectReviewContext` in
  `scripts/lib/git.mjs` reads untracked files with `statSync`/`readFileSync`, so a
  symlink in the working tree can pull a file from outside the repository into the
  review context. The behaviour is inherited from upstream. Probe: confirm with a
  symlink pointing outside the repo, then switch to `lstat` and skip symlinks,
  reporting what was skipped. Decides how the review family builds its context.
- **Read-only enforcement.** Upstream runs Codex under `sandbox: read-only` for
  reviews. Probe: confirm that `--permission-mode dontAsk` plus a tool
  allow-list actually blocks edits, Bash writes, and writes reached indirectly
  through a permitted tool. Decides whether the review family is genuinely
  read-only.
- **Handoff transfer.** Probe: create a bridge-owned session, resume it in a
  second process, confirm the provenance text is present in the resumed
  context, and confirm nothing was written under `~/.claude/projects/` by the
  bridge itself. Decides the `transfer` contract.
- **Plugin `Stop` hook execution.** A probe plugin declaring
  `"hooks": "./hooks.json"` with a `Stop` handler produced no execution under
  `codex exec`, across five command forms (bare `.mjs`, `node ./path`, a `.cmd`
  shim, a nested `./skills/...` path, and `${PLUGIN_ROOT}`). A repository-level
  `.codex/hooks.json` also produced no execution. This is consistent with
  `codex exec` not running hooks at all, but that was not proven. Probe: repeat
  in the Codex TUI. Decides whether the review gate is reproducible at all.
- **Hook working directory.** Documentation states hook commands run from the
  session working directory while `./` paths resolve inside the plugin root. The
  counterpart relies on `${PLUGIN_ROOT}` rather than on relative resolution; the
  TUI probe above should confirm which holds.
