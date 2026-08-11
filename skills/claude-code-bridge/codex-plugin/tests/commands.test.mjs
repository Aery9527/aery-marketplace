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
  assert.equal(report.reviewGateEnabled, false);
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

test("setup toggles the review gate and persists it per workspace", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");
  const cwd = makeWorkspace();
  const env = isolatedEnv(binDir);

  const enabled = runCompanion(["setup", "--json", "--enable-review-gate"], { cwd, env });
  assert.equal(JSON.parse(enabled.stdout).reviewGateEnabled, true);

  const persisted = runCompanion(["setup", "--json"], { cwd, env });
  assert.equal(JSON.parse(persisted.stdout).reviewGateEnabled, true);

  const disabled = runCompanion(["setup", "--json", "--disable-review-gate"], { cwd, env });
  assert.equal(JSON.parse(disabled.stdout).reviewGateEnabled, false);
});

test("setup refuses to enable and disable the review gate at once", () => {
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
  assert.equal(JSON.parse(result.stdout).reviewGateEnabled, true);
});

test("an unknown subcommand fails with usage instead of doing nothing", () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");
  const cwd = makeWorkspace();

  const result = runCompanion(["nope"], { cwd, env: isolatedEnv(binDir) });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown subcommand "nope"/);
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
