import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { buildEnv, installFakeClaude } from "./fake-claude-fixture.mjs";
import { initGitRepo, makeTempDir, run } from "./helpers.mjs";

const COMPANION = path.resolve(
  fileURLToPath(new URL("../scripts/claude-companion.mjs", import.meta.url))
);

function runCompanion(args, options = {}) {
  return run(process.execPath, [COMPANION, ...args], {
    cwd: options.cwd,
    env: options.env
  });
}

function makeWorkspace() {
  const cwd = makeTempDir();
  initGitRepo(cwd);
  fs.writeFileSync(path.join(cwd, "README.md"), "# fixture\n", "utf8");
  run("git", ["add", "."], { cwd });
  run("git", ["commit", "-m", "initial"], { cwd });
  return cwd;
}

// Every command writes state under the plugin data directory, so each test gets its
// own to stay independent of the host's real state.
function isolatedEnv(binDir) {
  return buildEnv(binDir, { PLUGIN_DATA: makeTempDir(), CLAUDE_PLUGIN_DATA: "" });
}

test("setup reports ready when Claude Code is installed and signed in", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");
  const cwd = makeWorkspace();

  const result = runCompanion(["setup", "--json"], { cwd, env: isolatedEnv(binDir) });

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ready, true);
  assert.equal(report.claude.available, true);
  assert.equal(report.auth.loggedIn, true);
  assert.equal(report.auth.authMethod, "claude.ai");
  assert.equal(report.stopReviewRequested, false);
});

test("setup reports not ready and names the next step when signed out", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "logged-out");
  const cwd = makeWorkspace();

  const result = runCompanion(["setup", "--json"], { cwd, env: isolatedEnv(binDir) });

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ready, false);
  assert.equal(report.auth.loggedIn, false);
  assert.ok(report.nextSteps.some((step) => step.includes("claude auth login")));
});

// The version is advisory: the runtime feature-detects per session, so an older
// install is usable but is told what it will be missing.
test("setup warns about an older Claude Code without refusing it", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "old-version");
  const cwd = makeWorkspace();

  const result = runCompanion(["setup", "--json"], { cwd, env: isolatedEnv(binDir) });

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.claude.available, true);
  assert.equal(report.claude.meetsMinimum, false);
  assert.equal(report.claude.version, "2.1.100");
  assert.ok(report.nextSteps.some((step) => step.includes("2.1.205 or later")));
});

test("setup refuses a binary whose version output is not Claude Code's", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "garbage-version");
  const cwd = makeWorkspace();

  const result = runCompanion(["setup", "--json"], { cwd, env: isolatedEnv(binDir) });

  const report = JSON.parse(result.stdout);
  assert.equal(report.claude.available, false);
  assert.equal(report.ready, false);
  assert.match(report.claude.detail, /unrecognisable/);
});

test("setup treats a non-boolean loggedIn as signed out", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "auth-string-false");
  const cwd = makeWorkspace();

  const report = JSON.parse(
    runCompanion(["setup", "--json"], { cwd, env: isolatedEnv(binDir) }).stdout
  );

  assert.equal(report.auth.loggedIn, false);
  assert.equal(report.ready, false);
});

test("setup treats a null auth payload as signed out", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "auth-null");
  const cwd = makeWorkspace();

  const report = JSON.parse(
    runCompanion(["setup", "--json"], { cwd, env: isolatedEnv(binDir) }).stdout
  );

  assert.equal(report.auth.loggedIn, false);
  assert.match(report.auth.detail, /not an object/);
});

test("setup reports a failing auth command instead of guessing", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "auth-fails");
  const cwd = makeWorkspace();

  const report = JSON.parse(
    runCompanion(["setup", "--json"], { cwd, env: isolatedEnv(binDir) }).stdout
  );

  assert.equal(report.auth.loggedIn, false);
  assert.match(report.auth.detail, /not authenticated/);
});

test("setup surfaces an unreadable auth payload instead of claiming success", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "auth-garbage");
  const cwd = makeWorkspace();

  const result = runCompanion(["setup", "--json"], { cwd, env: isolatedEnv(binDir) });

  const report = JSON.parse(result.stdout);
  assert.equal(report.auth.loggedIn, false);
  assert.match(report.auth.detail, /unreadable JSON/);
});

test("setup renders Markdown when --json is absent", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");
  const cwd = makeWorkspace();

  const result = runCompanion(["setup"], { cwd, env: isolatedEnv(binDir) });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^# Claude Code Setup/);
  assert.match(result.stdout, /Status: ready/);
});

test("setup records the stop-time review preference and persists it per workspace", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");
  const cwd = makeWorkspace();
  const env = isolatedEnv(binDir);

  const enabled = runCompanion(["setup", "--json", "--enable-review-gate"], { cwd, env });
  assert.equal(JSON.parse(enabled.stdout).stopReviewRequested, true);

  const persisted = runCompanion(["setup", "--json"], { cwd, env });
  assert.equal(JSON.parse(persisted.stdout).stopReviewRequested, true);

  const disabled = runCompanion(["setup", "--json", "--disable-review-gate"], { cwd, env });
  assert.equal(JSON.parse(disabled.stdout).stopReviewRequested, false);
});

test("setup refuses to record and clear the stop-time review preference at once", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");
  const cwd = makeWorkspace();

  const result = runCompanion(
    ["setup", "--enable-review-gate", "--disable-review-gate"],
    { cwd, env: isolatedEnv(binDir) }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Choose either/);
});

// A Codex command forwards its arguments as one raw string.
test("setup accepts its flags as a single forwarded argument string", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");
  const cwd = makeWorkspace();

  const result = runCompanion(["setup", "--json --enable-review-gate"], {
    cwd,
    env: isolatedEnv(binDir)
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).stopReviewRequested, true);
});

test("an unknown subcommand fails with usage instead of doing nothing", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");
  const cwd = makeWorkspace();

  const result = runCompanion(["nope"], { cwd, env: isolatedEnv(binDir) });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown subcommand "nope"/);
});

function makeDirtyWorkspace() {
  const cwd = makeWorkspace();
  fs.writeFileSync(path.join(cwd, "README.md"), "# fixture\n\nchanged\n", "utf8");
  return cwd;
}

test("review runs the built-in reviewer and returns its report", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");
  const cwd = makeDirtyWorkspace();

  const result = runCompanion(["review"], { cwd, env: isolatedEnv(binDir) });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^# Claude Review/);
  assert.match(result.stdout, /Built-in reviewer report for \/code-review/);
  assert.match(result.stdout, /Scope: uncommitted work, selected automatically/);
});

// `--base` drops every uncommitted change from the context this bridge builds, so a
// review that used it has to say so rather than letting the reader assume otherwise.
test("a base-branch review states the base it was given", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");
  const cwd = makeWorkspace();
  run("git", ["checkout", "-b", "feature"], { cwd });
  fs.writeFileSync(path.join(cwd, "README.md"), "# fixture\n\ncommitted change\n", "utf8");
  run("git", ["commit", "-am", "change"], { cwd });
  fs.writeFileSync(path.join(cwd, "pending.txt"), "uncommitted\n", "utf8");

  const result = runCompanion(["review", "--base", "main"], { cwd, env: isolatedEnv(binDir) });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Scope: commits between main and HEAD, requested/);
  assert.match(result.stdout, /\/code-review main/);
});

test("review refuses focus text and names the command that takes it", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");
  const cwd = makeDirtyWorkspace();

  const result = runCompanion(["review", "check the error handling"], { cwd, env: isolatedEnv(binDir) });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /\/claude-adversarial-review check the error handling/);
});

test("adversarial review renders the structured findings Claude returned", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");
  const cwd = makeDirtyWorkspace();

  const result = runCompanion(["adversarial-review", "focus on the error paths"], {
    cwd,
    env: isolatedEnv(binDir)
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^# Claude Adversarial Review/);
  assert.match(result.stdout, /Verdict: needs-attention/);
  assert.match(result.stdout, /\[high\] Fixture finding \(README\.md:1\)/);
  assert.match(result.stdout, /Evidence: the tracked diff was supplied in full/);
});

// The review session must not be able to touch the repository it is reviewing, and
// `--tools` alone does not achieve that because it filters built-ins only.
test("the adversarial review session is started read-only and without MCP servers", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");
  const cwd = makeDirtyWorkspace();
  const argvFile = path.join(makeTempDir(), "argv.json");

  const result = runCompanion(["adversarial-review"], {
    cwd,
    env: { ...isolatedEnv(binDir), FAKE_CLAUDE_ARGV_FILE: argvFile }
  });

  assert.equal(result.status, 0, result.stderr);
  const argv = JSON.parse(fs.readFileSync(argvFile, "utf8"));
  assert.deepEqual(argv.slice(argv.indexOf("--tools"), argv.indexOf("--tools") + 2), ["--tools", "Read,Glob,Grep"]);
  assert.ok(argv.includes("--strict-mcp-config"), argv.join(" "));
  assert.deepEqual(
    argv.slice(argv.indexOf("--permission-mode"), argv.indexOf("--permission-mode") + 2),
    ["--permission-mode", "dontAsk"]
  );
});

// The schema is what makes the output renderable, and the CLI parses the flag value as
// JSON, so it has to survive the command line intact.
test("the review schema reaches the CLI intact and without its $schema key", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");
  const cwd = makeDirtyWorkspace();
  const argvFile = path.join(makeTempDir(), "argv.json");

  runCompanion(["adversarial-review"], { cwd, env: { ...isolatedEnv(binDir), FAKE_CLAUDE_ARGV_FILE: argvFile } });

  const argv = JSON.parse(fs.readFileSync(argvFile, "utf8"));
  const schema = JSON.parse(argv[argv.indexOf("--json-schema") + 1]);
  assert.equal(schema.$schema, undefined);
  assert.deepEqual(schema.required, ["verdict", "summary", "findings", "next_steps"]);
  assert.equal(schema.properties.findings.items.properties.severity.enum[0], "critical");
});

test("an adversarial review that returns no JSON is reported as a failure", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "unstructured-review");
  const cwd = makeDirtyWorkspace();

  const result = runCompanion(["adversarial-review"], { cwd, env: isolatedEnv(binDir) });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /did not return valid structured JSON/);
  assert.match(result.stdout, /I could not produce JSON\./);
  assert.ok(!result.stdout.includes("Verdict:"), result.stdout);
});

// The result event carries the review as text as well as as an object, but only the
// object has been through the CLI's schema check. Parsing the text would let output the
// schema rejected reach the user as a verdict.
test("JSON in the result text is not accepted when the schema produced no object", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "text-json-only");
  const cwd = makeDirtyWorkspace();

  const result = runCompanion(["adversarial-review"], { cwd, env: isolatedEnv(binDir) });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /without schema-validated structured output/);
  assert.ok(!result.stdout.includes("Verdict: approve"), result.stdout);
});

// A failed turn can still carry schema-valid JSON. Rendering it as a verdict would let a
// crashed review read as a completed assessment. The exit status reports the same fact as
// the job record, so a caller that only reads one of the two is not misled by it.
test("a review that ended in an error never renders as a verdict", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "errored-review");
  const cwd = makeDirtyWorkspace();

  const result = runCompanion(["adversarial-review"], { cwd, env: isolatedEnv(binDir) });

  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /ended the review with error_during_execution/);
  assert.ok(!result.stdout.includes("Verdict:"), result.stdout);
  assert.ok(!result.stdout.includes("[high] Fixture finding"), result.stdout);
});

// A turn that comes back an error is reviewable output and gets a report. A session that
// ends before answering produces none, and saying so is what keeps the two apart: there is
// nothing to render, and rendering an empty verdict would be worse than the bare reason.
test("a review whose Claude session ends before it answers fails with the reason and no report", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "exit-after-init");
  const cwd = makeDirtyWorkspace();

  const result = runCompanion(["adversarial-review"], { cwd, env: isolatedEnv(binDir) });

  assert.equal(result.status, 1);
  assert.equal(result.stdout.trim(), "");
  assert.match(result.stderr, /Claude exited before the turn completed/);
});

// The inline-diff threshold measures the tracked diff alone, so an untracked file that
// was dropped from the context must not be hidden behind "the tracked diff in full".
test("untracked content left out of the context is named in the evidence line", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");
  const cwd = makeWorkspace();
  fs.writeFileSync(path.join(cwd, "big.txt"), "x".repeat(30 * 1024), "utf8");

  const result = runCompanion(["adversarial-review"], { cwd, env: isolatedEnv(binDir) });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /1 untracked entry was left out: big\.txt \(30720 bytes exceeds/);
  // Nothing reached the reviewer here, so the line must not credit the diff with the
  // untracked file nor claim any untracked content was supplied.
  assert.match(result.stdout, /the tracked diff was supplied in full \(0 file\(s\), 0 bytes\)/);
  assert.doesNotMatch(result.stdout, /untracked file\(s\) were included/);
});

// The file-count and byte thresholds trip independently. Three tiny untracked files
// cross the count while the diff is empty, so blaming size would be a false explanation.
test("the evidence line names the threshold that actually withheld the diff", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");
  const cwd = makeWorkspace();
  for (const name of ["one.txt", "two.txt", "three.txt"]) {
    fs.writeFileSync(path.join(cwd, name), "tiny\n", "utf8");
  }

  const result = runCompanion(["adversarial-review"], { cwd, env: isolatedEnv(binDir) });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /not supplied inline because 3 changed file\(s\) exceeds the inline limit of 2/);
  assert.doesNotMatch(result.stdout, /too large/);
  assert.doesNotMatch(result.stdout, /exceeds the inline limit of \d+ bytes/);
  assert.match(result.stdout, /3 untracked file\(s\) were included with their contents/);
});

// An untracked file contributes no diff, so counting it against the diff would credit
// the reviewer with evidence the diff never carried.
test("untracked content is counted apart from the tracked diff", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");
  const cwd = makeWorkspace();
  fs.writeFileSync(path.join(cwd, "note.txt"), "a small untracked note\n", "utf8");

  const result = runCompanion(["adversarial-review"], { cwd, env: isolatedEnv(binDir) });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /the tracked diff was supplied in full \(0 file\(s\), 0 bytes\)/);
  assert.match(result.stdout, /1 untracked file\(s\) were included with their contents/);
  assert.doesNotMatch(result.stdout, /left out/);
});

// The bridge hands the built-in reviewer a target, not a context, and the reviewer was
// observed reviewing staged work on top of a requested branch diff.
test("the built-in review does not claim authority over its own scope", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");
  const cwd = makeWorkspace();
  run("git", ["checkout", "-b", "feature"], { cwd });
  fs.writeFileSync(path.join(cwd, "README.md"), "# fixture\n\ncommitted\n", "utf8");
  run("git", ["commit", "-am", "change"], { cwd });
  fs.writeFileSync(path.join(cwd, "pending.txt"), "uncommitted\n", "utf8");

  const native = runCompanion(["review", "--base", "main"], { cwd, env: isolatedEnv(binDir) });
  assert.match(native.stdout, /sets its own final scope and may cover more than this/);
  assert.ok(!native.stdout.includes("are excluded from this review"), native.stdout);

  // The adversarial path builds the context itself, so there the exclusion is a fact.
  const adversarial = runCompanion(["adversarial-review", "--base", "main"], { cwd, env: isolatedEnv(binDir) });
  assert.match(adversarial.stdout, /1 uncommitted file\(s\) are excluded from this review/);
  assert.ok(!adversarial.stdout.includes("sets its own final scope"), adversarial.stdout);
});

test("a review outside a Git repository fails instead of reviewing nothing", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");

  const result = runCompanion(["review"], { cwd: makeTempDir(), env: isolatedEnv(binDir) });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /must run inside a Git repository/);
});

test("a review refuses to start when Claude Code is not installed", () => {
  const cwd = makeDirtyWorkspace();
  const env = { ...isolatedEnv(makeTempDir()), PATH: makeTempDir() };

  const result = runCompanion(["review"], { cwd, env });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Claude Code is not installed/);
});

// The availability check and the run must reach the same install, or the bridge could
// verify one Claude Code and then drive a different one.
test("runClaudePrompt checks availability with the same env it runs under", async () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");

  const { runClaudePrompt } = await import("../scripts/lib/claude.mjs");
  const result = await runClaudePrompt(makeTempDir(), "hello", {
    envOverrides: { PATH: buildEnv(binDir).PATH }
  });

  assert.equal(result.text, "turn1:hello");
});

test("runClaudePrompt refuses an effort value Claude Code does not accept", async () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");

  const { runClaudePrompt } = await import("../scripts/lib/claude.mjs");
  await assert.rejects(
    () =>
      runClaudePrompt(makeTempDir(), "hello", {
        effort: "minimal",
        envOverrides: { PATH: buildEnv(binDir).PATH }
      }),
    /Unsupported reasoning effort "minimal"/
  );
});

// Every run is recorded, foreground included, so a result can be read again without
// spending another turn on it.
test("a foreground review stores the same output the command printed", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");
  const cwd = makeDirtyWorkspace();
  const env = isolatedEnv(binDir);

  const review = runCompanion(["adversarial-review"], { cwd, env });
  assert.equal(review.status, 0, review.stderr);

  const stored = JSON.parse(runCompanion(["result", "--json"], { cwd, env }).stdout);
  assert.equal(stored.job.status, "completed");
  assert.equal(stored.storedJob.rendered, review.stdout);
});

// The queued record carries the target the user's command resolved. A worker that
// resolved `auto` again could review a tree that has moved on since.
test("a queued review carries the target that was resolved when it was queued", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "slow-turn");
  const cwd = makeDirtyWorkspace();
  const env = isolatedEnv(binDir);

  const queued = JSON.parse(runCompanion(["adversarial-review", "--background", "--json", "SLOW"], { cwd, env }).stdout);
  const stored = JSON.parse(fs.readFileSync(queued.jobFile, "utf8"));

  assert.equal(stored.request.target.mode, "working-tree");
  assert.equal(stored.request.kind, "adversarial-review");
  // The request lives in the job file alone. Copying it into the index would put the same
  // thing in two places and rewrite all of it on every progress update.
  const snapshot = JSON.parse(runCompanion(["status", queued.jobId, "--json"], { cwd, env }).stdout);
  assert.equal(snapshot.job.request, undefined);
  runCompanion(["cancel", queued.jobId], { cwd, env });
});

// The worker is started only once its record exists, so it can never lose the race to
// read the request it was spawned for.
test("a queued job is fully recorded before its worker is started", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "slow-turn");
  const cwd = makeDirtyWorkspace();
  const env = isolatedEnv(binDir);

  const queued = JSON.parse(runCompanion(["adversarial-review", "--background", "--json", "SLOW"], { cwd, env }).stdout);
  const stored = JSON.parse(fs.readFileSync(queued.jobFile, "utf8"));

  // The worker may already have taken the job over by now; what it must never have done
  // is fail because the record it was spawned for was not there yet.
  assert.ok(["queued", "running"].includes(stored.status), `unexpected status ${stored.status}`);
  assert.ok(stored.request, "the queued record must carry the request the worker reads");

  // The pid reaches the listing, not the job file: once the worker owns that file, the
  // process that queued the job must not write to it again.
  const snapshot = JSON.parse(runCompanion(["status", queued.jobId, "--json"], { cwd, env }).stdout);
  assert.ok(Number.isInteger(snapshot.job.pid), `expected a recorded pid, got ${snapshot.job.pid}`);
  runCompanion(["cancel", queued.jobId], { cwd, env });
});

// A detached worker writes nothing to a terminal, so a failure before the run begins has
// to reach the user through the job record or not at all.
test("a worker that cannot start records why in the job", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");
  const cwd = makeDirtyWorkspace();
  const env = isolatedEnv(binDir);

  const queued = JSON.parse(runCompanion(["adversarial-review", "--background", "--json", "SLOW"], { cwd, env }).stdout);
  // The real worker is stopped first, then the record is put back the way a worker finds
  // it — still queued, but with nothing to run.
  runCompanion(["cancel", queued.jobId], { cwd, env });
  const stored = JSON.parse(fs.readFileSync(queued.jobFile, "utf8"));
  delete stored.request;
  fs.writeFileSync(queued.jobFile, JSON.stringify({ ...stored, status: "queued" }), "utf8");

  const worker = runCompanion(["run-job", "--job-id", queued.jobId], { cwd, env });
  assert.equal(worker.status, 1);

  const snapshot = JSON.parse(runCompanion(["status", queued.jobId, "--json"], { cwd, env }).stdout);
  assert.equal(snapshot.job.status, "failed");
  assert.match(snapshot.job.errorMessage, /carries no request to run/);
});

// Cancelling a job that finished in the meantime would otherwise stamp `cancelled` over a
// stored result. The job's own file decides, so a listing that still calls it active does
// not turn a finished run into a cancelled one.
test("a job that finished before the cancel landed is reported as finished", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");
  const cwd = makeDirtyWorkspace();
  const env = isolatedEnv(binDir);

  runCompanion(["adversarial-review"], { cwd, env });
  const finished = JSON.parse(runCompanion(["status", "--json"], { cwd, env }).stdout).finished ?? [];
  const jobId = finished[0]?.id;
  assert.ok(jobId, "expected the foreground review to be recorded");

  // Only the index is rewound: the stored job keeps the result the run produced, which is
  // exactly the state a worker that finished mid-cancel leaves behind.
  const stateFile = path.join(path.dirname(path.dirname(finished[0].logFile)), "state.json");
  const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  state.jobs = state.jobs.map((job) => (job.id === jobId ? { ...job, status: "running", pid: 999999 } : job));
  fs.writeFileSync(stateFile, JSON.stringify(state), "utf8");

  const cancelled = runCompanion(["cancel", jobId, "--json"], { cwd, env });

  assert.equal(cancelled.status, 1);
  assert.match(cancelled.stderr, /already finished as completed/);

  // The listing said active, but every command that judges this job reads its file, so the
  // result survives and the status report agrees.
  assert.match(runCompanion(["result", jobId], { cwd, env }).stdout, /\[high\] Fixture finding/);
  assert.match(runCompanion(["status", jobId], { cwd, env }).stdout, /Status: completed/);
  assert.match(runCompanion(["status"], { cwd, env }).stdout, /No active jobs\./);
});

test("a background review is finished by its detached worker", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");
  const cwd = makeDirtyWorkspace();
  const env = isolatedEnv(binDir);

  const queued = JSON.parse(runCompanion(["adversarial-review", "--background", "--json"], { cwd, env }).stdout);
  assert.equal(queued.status, "queued");

  const finished = JSON.parse(
    runCompanion(["status", queued.jobId, "--wait", "--timeout-ms", "60000", "--poll-interval-ms", "200", "--json"], {
      cwd,
      env
    }).stdout
  );
  assert.equal(finished.job.status, "completed");
  assert.equal(finished.waitTimedOut, false);

  const stored = runCompanion(["result", queued.jobId], { cwd, env });
  assert.match(stored.stdout, /\[high\] Fixture finding/);
});

test("a review cannot be asked to run in the background and in the foreground at once", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");
  const cwd = makeDirtyWorkspace();

  const result = runCompanion(["adversarial-review", "--background", "--wait"], { cwd, env: isolatedEnv(binDir) });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Choose either --background or --wait/);
});

// Cancelling has to end the run itself, not merely relabel the record. This runs on
// Windows, where `taskkill /T /F` ends the tree and the worker cannot write over the
// cancelled state afterwards; the platforms that signal instead keep the weaker promise
// the renderer tests pin.
test("cancel stops a running background review and records it as cancelled", async () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "slow-turn");
  const cwd = makeDirtyWorkspace();
  const env = isolatedEnv(binDir);

  const queued = JSON.parse(runCompanion(["adversarial-review", "--background", "--json", "SLOW"], { cwd, env }).stdout);
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const cancelled = JSON.parse(runCompanion(["cancel", queued.jobId, "--json"], { cwd, env }).stdout);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.terminationDelivered, true);

  await new Promise((resolve) => setTimeout(resolve, 500));
  const snapshot = JSON.parse(runCompanion(["status", queued.jobId, "--json"], { cwd, env }).stdout);
  assert.equal(snapshot.job.status, "cancelled");

  const stored = runCompanion(["result", queued.jobId], { cwd, env });
  assert.match(stored.stdout, /The job did not produce output: Cancelled by user\./);
});

test("status without any job reports an empty queue rather than failing", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");
  const cwd = makeWorkspace();

  const result = runCompanion(["status"], { cwd, env: isolatedEnv(binDir) });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /No active jobs\./);
  assert.match(result.stdout, /No finished jobs recorded yet\./);
});

test("result with no finished job says so instead of printing an empty report", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");
  const cwd = makeWorkspace();

  const result = runCompanion(["result"], { cwd, env: isolatedEnv(binDir) });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /No finished Claude jobs found/);
});

// Cancelling and starting can be decided by two processes at once, so the worker checks
// the record it was queued for before it runs. Otherwise a job cancelled while its worker
// was starting would be carried out after being called off.
test("a worker refuses to run a job that is no longer queued", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");
  const cwd = makeDirtyWorkspace();
  const env = isolatedEnv(binDir);

  const queued = JSON.parse(runCompanion(["adversarial-review", "--background", "--json", "SLOW"], { cwd, env }).stdout);
  runCompanion(["cancel", queued.jobId], { cwd, env });

  const stored = JSON.parse(fs.readFileSync(queued.jobFile, "utf8"));
  assert.equal(stored.status, "cancelled");

  const worker = runCompanion(["run-job", "--job-id", queued.jobId], { cwd, env });
  assert.equal(worker.status, 0, worker.stderr);

  const snapshot = JSON.parse(runCompanion(["status", queued.jobId, "--json"], { cwd, env }).stdout);
  assert.equal(snapshot.job.status, "cancelled");
});

// Between the spawn and the pid being recorded, a job looks the same as one whose worker
// never existed. Cancel must not decide from that glance: it waits, and a worker that
// records its own pid in that window is terminated rather than left running under a record
// that says cancelled.
test("cancel waits for a worker that has not recorded its pid yet", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "slow-turn");
  const cwd = makeDirtyWorkspace();
  const env = isolatedEnv(binDir);

  const queued = JSON.parse(runCompanion(["adversarial-review", "--background", "--json", "SLOW"], { cwd, env }).stdout);

  // Rewind the listing to the state it holds between the spawn and the pid write.
  const stateFile = path.join(path.dirname(path.dirname(queued.logFile)), "state.json");
  const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  state.jobs = state.jobs.map((job) => (job.id === queued.jobId ? { ...job, pid: null, status: "queued" } : job));
  fs.writeFileSync(stateFile, JSON.stringify(state), "utf8");

  const cancelled = runCompanion(["cancel", queued.jobId], { cwd, env });

  assert.equal(cancelled.status, 0, cancelled.stderr);
  assert.match(cancelled.stdout, /pid \d+/, cancelled.stdout);
  assert.doesNotMatch(cancelled.stdout, /No worker was recorded/, cancelled.stdout);
});

// A cancelled record must never carry a report: the run that produced one would otherwise
// be described as cancelled with no result by `/claude-status` and printed in full by
// `/claude-result`.
test("cancelling clears any report the job file had picked up", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "slow-turn");
  const cwd = makeDirtyWorkspace();
  const env = isolatedEnv(binDir);

  const queued = JSON.parse(runCompanion(["adversarial-review", "--background", "--json", "SLOW"], { cwd, env }).stdout);
  // A report is planted on the record by hand. The runtime writes one only together with a
  // terminal status, so this is not that race — it pins the narrower rule cancel must obey:
  // whatever report the record carries when the cancellation is written is cleared.
  const stored = JSON.parse(fs.readFileSync(queued.jobFile, "utf8"));
  fs.writeFileSync(
    queued.jobFile,
    JSON.stringify({ ...stored, rendered: "# Claude Adversarial Review\n\nVerdict: approve\n", result: { verdict: "approve" } }),
    "utf8"
  );

  runCompanion(["cancel", queued.jobId], { cwd, env });

  const after = JSON.parse(fs.readFileSync(queued.jobFile, "utf8"));
  assert.equal(after.status, "cancelled");
  assert.equal(after.rendered, null);
  assert.equal(after.result, null);
  assert.doesNotMatch(runCompanion(["result", queued.jobId], { cwd, env }).stdout, /Verdict: approve/);
});

// Rescue exists to change the repository, so the run it starts registers no tool
// restrictions. Asserting the flags is what keeps a later edit from quietly handing the
// write-capable entry point the review sessions' constraints.
test("a rescue runs write-capable and passes the request through as written", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");
  const cwd = makeWorkspace();
  const argvFile = path.join(makeTempDir(), "argv.json");
  const env = { ...isolatedEnv(binDir), FAKE_CLAUDE_ARGV_FILE: argvFile };

  const result = runCompanion(["rescue", "fix", "the", "flaky", "test"], { cwd, env });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /# Claude Rescue/);
  assert.match(result.stdout, /fix the flaky test/);
  const argv = JSON.parse(fs.readFileSync(argvFile, "utf8"));
  assert.ok(!argv.includes("--tools"), argv.join(" "));
  assert.ok(!argv.includes("--disallowed-tools"), argv.join(" "));
  // A workspace's own MCP servers are part of what its Claude Code can reach, so taking
  // them away would be taking something away.
  assert.ok(!argv.includes("--strict-mcp-config"), argv.join(" "));
});

// The effort flag reaches the CLI through the one place that knows which values it accepts.
// Passing an unsupported one straight through would let the CLI decide, and the CLI's answer
// is not the one this package documents.
test("a rescue refuses a reasoning effort the CLI does not take", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");
  const cwd = makeWorkspace();
  const env = isolatedEnv(binDir);

  const refused = runCompanion(["rescue", "--effort", "minimal", "look at the parser"], { cwd, env });
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /Unsupported reasoning effort "minimal"/);

  const argvFile = path.join(makeTempDir(), "argv.json");
  const accepted = runCompanion(["rescue", "--effort", "max", "look at the parser"], {
    cwd,
    env: { ...env, FAKE_CLAUDE_ARGV_FILE: argvFile }
  });
  assert.equal(accepted.status, 0, accepted.stderr);
  const argv = JSON.parse(fs.readFileSync(argvFile, "utf8"));
  assert.deepEqual(argv.slice(argv.indexOf("--effort"), argv.indexOf("--effort") + 2), ["--effort", "max"]);
});

// The command promises an unauthenticated user is sent to `/claude-setup`. Nothing else on
// this path keeps that promise: an unauthenticated CLI still starts.
test("a rescue on an unauthenticated install names the setup command", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "logged-out");

  const result = runCompanion(["rescue", "fix the loader"], { cwd: makeWorkspace(), env: isolatedEnv(binDir) });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /not authenticated/);
  assert.match(result.stderr, /\/claude-setup/);
});

// A session id is recorded as soon as Claude announces it, so a run still going has one.
// Continuing it would put a second turn into a session another process is driving.
test("a session still being driven by a running job is not offered for resuming", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "slow-turn");
  const cwd = makeWorkspace();
  const env = isolatedEnv(binDir);

  const queued = JSON.parse(runCompanion(["rescue", "--background", "--json", "SLOW rewrite"], { cwd, env }).stdout);
  assert.equal(queued.status, "queued");

  const candidate = JSON.parse(runCompanion(["rescue-resume-candidate", "--json"], { cwd, env }).stdout);
  assert.equal(candidate.available, false);

  runCompanion(["cancel", queued.jobId, "--json"], { cwd, env });
});

// A value option must not eat the flag after it: `--resume-session --fresh` would record
// `--fresh` as a session id and leave the check that refuses those two with nothing to see.
test("a flag is never taken as the value of another flag", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");

  const result = runCompanion(["rescue", "--resume-session", "--fresh", "repair the loader"], {
    cwd: makeWorkspace(),
    env: isolatedEnv(binDir)
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing value for --resume-session/);
});

// The session id is what a later `--resume` continues, so it has to reach the user.
test("a rescue reports the Claude session it used", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");
  const cwd = makeWorkspace();
  const env = isolatedEnv(binDir);

  const rescued = runCompanion(["rescue", "look into the parser"], { cwd, env });
  assert.match(rescued.stdout, /Claude session: `00000000-0000-4000-8000-000000000001`/);

  const candidate = JSON.parse(runCompanion(["rescue-resume-candidate", "--json"], { cwd, env }).stdout);
  assert.equal(candidate.available, true);
  assert.equal(candidate.sessionId, "00000000-0000-4000-8000-000000000001");
});

// Resuming what does not exist would start a fresh run under a flag that promised to
// continue one, which is a different piece of work than the user asked for.
test("resuming a repository with no recorded session is refused", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");
  const cwd = makeWorkspace();
  const env = isolatedEnv(binDir);

  assert.equal(JSON.parse(runCompanion(["rescue-resume-candidate", "--json"], { cwd, env }).stdout).available, false);

  const result = runCompanion(["rescue", "--resume", "keep going"], { cwd, env });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /nothing to resume/);
});

// A rescue with no request has nothing to forward, and inventing one would be doing the
// user's thinking for them.
test("a rescue with no request is refused rather than guessed at", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");

  const result = runCompanion(["rescue"], { cwd: makeWorkspace(), env: isolatedEnv(binDir) });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Say what Claude should investigate/);
});

// A rescue is a job like any other, so the queue, the listing and the stored result all
// have to hold it — that is what makes `--background` worth having.
test("a background rescue is tracked as a job and its result kept", async () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");
  const cwd = makeWorkspace();
  const env = isolatedEnv(binDir);

  const queued = JSON.parse(runCompanion(["rescue", "--background", "--json", "rewrite the loader"], { cwd, env }).stdout);
  assert.equal(queued.status, "queued");
  assert.match(queued.jobId, /^rescue-/);

  const finished = JSON.parse(
    runCompanion(["status", queued.jobId, "--wait", "--timeout-ms", "60000", "--poll-interval-ms", "200", "--json"], {
      cwd,
      env
    }).stdout
  );
  assert.equal(finished.job.status, "completed");
  assert.match(finished.job.summary, /Rescue: rewrite the loader/);
  assert.match(runCompanion(["result", queued.jobId], { cwd, env }).stdout, /# Claude Rescue/);
});

test("a rescue cannot be asked to resume and start fresh at once", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");

  const result = runCompanion(["rescue", "--resume", "--fresh", "go"], { cwd: makeWorkspace(), env: isolatedEnv(binDir) });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Choose either --resume\/--resume-session or --fresh/);
});

// Naming a session does not make it free to take: the run that owns it publishes its id at
// startup, so a named session can be one another process is still driving.
test("a named session whose run is still going is refused", async () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "slow-turn");
  const cwd = makeWorkspace();
  const env = isolatedEnv(binDir);

  const queued = JSON.parse(runCompanion(["rescue", "--background", "--json", "SLOW rewrite"], { cwd, env }).stdout);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const running = JSON.parse(runCompanion(["status", queued.jobId, "--json"], { cwd, env }).stdout).job;
  assert.equal(running.status, "running");
  assert.ok(running.claudeSessionId, "the running job should have announced a session");

  const refused = runCompanion(["rescue", "--resume-session", running.claudeSessionId, "keep going"], { cwd, env });
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /still being run by job/);

  runCompanion(["cancel", queued.jobId, "--json"], { cwd, env });
});

// A review's session is not a rescue's to continue: upstream offers only its own task
// threads, and continuing a review would resume a run that was never write-capable.
test("only a finished rescue is offered as the session to continue", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");
  const cwd = makeDirtyWorkspace();
  const env = isolatedEnv(binDir);

  runCompanion(["rescue", "fix the loader"], { cwd, env });
  runCompanion(["adversarial-review"], { cwd, env });

  const candidate = JSON.parse(runCompanion(["rescue-resume-candidate", "--json"], { cwd, env }).stdout);
  assert.equal(candidate.available, true);
  assert.match(candidate.jobId, /^rescue-/);
});

// A named session is not "the last one recorded", and saying so would describe a different
// run than the one that was continued.
test("a named resume is reported as the session it named", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");
  const cwd = makeWorkspace();
  const env = isolatedEnv(binDir);

  runCompanion(["rescue", "first pass"], { cwd, env });
  const named = runCompanion(
    ["rescue", "--resume-session", "00000000-0000-4000-8000-000000000001", "keep going"],
    { cwd, env }
  );

  assert.equal(named.status, 0, named.stderr);
  assert.match(named.stdout, /Continued the Claude session `00000000-0000-4000-8000-000000000001`\./);
  assert.ok(!named.stdout.includes("last recorded"), named.stdout);
});

// A session driven from another Codex session is just as busy as one driven from this one,
// so the check that refuses it must not be scoped to the caller's own jobs.
test("a session claimed by another Codex session is still refused", async () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "slow-turn");
  const cwd = makeWorkspace();
  const shared = isolatedEnv(binDir);

  const queued = JSON.parse(
    runCompanion(["rescue", "--background", "--json", "SLOW rewrite"], {
      cwd,
      env: { ...shared, CLAUDE_COMPANION_SESSION_ID: "codex-session-a" }
    }).stdout
  );
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const running = JSON.parse(
    runCompanion(["status", queued.jobId, "--json"], { cwd, env: { ...shared, CLAUDE_COMPANION_SESSION_ID: "codex-session-a" } })
      .stdout
  ).job;
  assert.ok(running.claudeSessionId, "the running job should have announced a session");

  const refused = runCompanion(["rescue", "--resume-session", running.claudeSessionId, "keep going"], {
    cwd,
    env: { ...shared, CLAUDE_COMPANION_SESSION_ID: "codex-session-b" }
  });

  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /still being run by job/);

  runCompanion(["cancel", queued.jobId, "--json"], {
    cwd,
    env: { ...shared, CLAUDE_COMPANION_SESSION_ID: "codex-session-a" }
  });
});

// Continuing still says what to continue with. Writing that sentence in the runtime would be
// the runtime deciding what the user meant.
test("a resume with no request is refused like any other empty request", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");
  const cwd = makeWorkspace();
  const env = isolatedEnv(binDir);

  runCompanion(["rescue", "first pass"], { cwd, env });

  for (const flags of [["--resume"], ["--resume-session", "00000000-0000-4000-8000-000000000001"]]) {
    const result = runCompanion(["rescue", ...flags], { cwd, env });
    assert.equal(result.status, 1, flags.join(" "));
    assert.match(result.stderr, /Say what Claude should investigate/);
  }
});

// Upstream leaves write access on unless the user asked for diagnosis without edits. The same
// choice is a flag here, and what it removes has to reach the CLI.
test("a read-only rescue removes the edit tools", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");
  const cwd = makeWorkspace();
  const argvFile = path.join(makeTempDir(), "argv.json");

  const result = runCompanion(["rescue", "--read-only", "diagnose the parser"], {
    cwd,
    env: { ...isolatedEnv(binDir), FAKE_CLAUDE_ARGV_FILE: argvFile }
  });

  assert.equal(result.status, 0, result.stderr);
  const argv = JSON.parse(fs.readFileSync(argvFile, "utf8"));
  const index = argv.indexOf("--disallowed-tools");
  assert.ok(index >= 0, argv.join(" "));
  assert.match(argv[index + 1], /Edit/);
});

// `spark` names a Codex model. Passing it on would ask the Claude CLI for a model that does
// not exist, while looking like the name had been understood.
test("a Codex-only model name is refused rather than forwarded", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");

  const result = runCompanion(["rescue", "--model", "spark", "fix the loader"], {
    cwd: makeWorkspace(),
    env: isolatedEnv(binDir)
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /no Claude counterpart/);
});

// An apostrophe is a character in a request, not the start of a quoted run. Every command
// shares this parser, so one of the others is exercised too — a claim about all of them is
// worth no more than what is tested.
test("an apostrophe in a request is not read as a quote", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");
  const cwd = makeWorkspace();

  const result = runCompanion(["rescue", "don't modify the API"], { cwd, env: isolatedEnv(binDir) });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /don't modify the API/);
});

// The same parser, reached through a different subcommand and a single forwarded string.
test("an apostrophe survives another command's forwarded argument string", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");
  const cwd = makeDirtyWorkspace();
  const argvFile = path.join(makeTempDir(), "argv.json");

  const promptFile = path.join(makeTempDir(), "prompt.txt");
  const result = runCompanion(["adversarial-review", "don't trust the cache"], {
    cwd,
    env: { ...isolatedEnv(binDir), FAKE_CLAUDE_ARGV_FILE: argvFile, FAKE_CLAUDE_PROMPT_FILE: promptFile }
  });

  assert.equal(result.status, 0, result.stderr);
  // The focus text reaches Claude inside the prompt, which is where an apostrophe eaten by
  // the parser would go missing.
  assert.match(fs.readFileSync(promptFile, "utf8"), /don't trust the cache/);
});

// A blank session id is a mistake, not a request for a fresh run: silently starting one
// would answer a different question than the flag asked.
test("an empty session id is refused rather than treated as a fresh run", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");

  const result = runCompanion(["rescue", "--resume-session=", "fix the parser"], {
    cwd: makeWorkspace(),
    env: isolatedEnv(binDir)
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /needs the session id/);
});

// What the user said is checked before anything about the machine: someone who said nothing
// needs to hear that, not a setup error they would fix first for no reason.
test("an empty request is refused before the environment is inspected", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "logged-out");

  const result = runCompanion(["rescue", "--resume"], { cwd: makeWorkspace(), env: isolatedEnv(binDir) });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Say what Claude should investigate/);
  assert.ok(!result.stderr.includes("not authenticated"), result.stderr);
});

// Read-only closes every write route that can be closed from here, and the MCP servers are
// one of them.
test("a read-only rescue also shuts out MCP servers", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");
  const argvFile = path.join(makeTempDir(), "argv.json");

  runCompanion(["rescue", "--read-only", "diagnose the parser"], {
    cwd: makeWorkspace(),
    env: { ...isolatedEnv(binDir), FAKE_CLAUDE_ARGV_FILE: argvFile }
  });

  assert.ok(JSON.parse(fs.readFileSync(argvFile, "utf8")).includes("--strict-mcp-config"));
});
