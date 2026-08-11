import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import assert from "node:assert/strict";

import { buildSpawnPlan, ClaudeCliSession, runClaudeOnce } from "../scripts/lib/claude-cli.mjs";
import { StreamProtocolError } from "../scripts/lib/stream-protocol.mjs";
import { buildEnv, installFakeClaude } from "./fake-claude-fixture.mjs";
import { makeTempDir } from "./helpers.mjs";

function startSession(behavior = "ready", options = {}) {
  const binDir = makeTempDir();
  installFakeClaude(binDir, behavior);
  return ClaudeCliSession.start(makeTempDir(), { env: buildEnv(binDir), ...options });
}

test("a session serves successive turns from one process", async () => {
  const session = startSession();
  try {
    const first = await session.sendTurn("ONE");
    const second = await session.sendTurn("TWO");

    assert.equal(first.text, "turn1:ONE");
    assert.equal(second.text, "turn2:TWO");
    assert.equal(first.sessionId, second.sessionId);
    assert.equal(first.isError, false);
  } finally {
    await session.close();
  }
});

test("a session reports the capabilities the init event advertised", async () => {
  const session = startSession();
  try {
    await session.sendTurn("hello");
    assert.equal(session.supportsInterrupt(), true);
    assert.ok(session.capabilities.includes("interrupt_receipt_v1"));
  } finally {
    await session.close();
  }
});

test("a session refuses a second concurrent turn instead of interleaving", async () => {
  const session = startSession();
  try {
    const inFlight = session.sendTurn("ONE");
    await assert.rejects(() => session.sendTurn("TWO"), /busy with another turn/);
    await inFlight;
  } finally {
    await session.close();
  }
});

test("interrupting ends the turn as an error but keeps the session usable", async () => {
  const session = startSession("slow-turn");
  try {
    await session.sendTurn("warm up");

    const interrupted = session.sendTurn("SLOW long running");
    const outcome = await session.interrupt();
    const result = await interrupted;

    assert.equal(outcome.interrupted, true);
    assert.equal(result.isError, true);
    assert.equal(result.subtype, "error_during_execution");

    const afterwards = await session.sendTurn("ALIVE");
    assert.equal(afterwards.isError, false);
    assert.match(afterwards.text, /ALIVE$/);
  } finally {
    await session.close();
  }
});

test("interrupt is refused when the install does not advertise the capability", async () => {
  const session = startSession("no-interrupt");
  try {
    await session.sendTurn("warm up");
    const outcome = await session.interrupt();

    assert.equal(outcome.interrupted, false);
    assert.equal(outcome.reason, "capability-missing");
  } finally {
    await session.close();
  }
});

test("a malformed stream frame fails the turn instead of hanging", async () => {
  const session = startSession("malformed-stream");
  try {
    await assert.rejects(() => session.sendTurn("anything"), StreamProtocolError);
  } finally {
    await session.kill();
  }
});

test("a closed session refuses further turns", async () => {
  const session = startSession();
  await session.sendTurn("ONE");
  await session.close();

  await assert.rejects(() => session.sendTurn("TWO"), /already closed/);
});

test("runClaudeOnce returns the result and closes the process", async () => {
  const binDir = makeTempDir();
  installFakeClaude(binDir, "ready");

  const result = await runClaudeOnce(makeTempDir(), "hello", { env: buildEnv(binDir) });

  assert.equal(result.text, "turn1:hello");
  assert.equal(result.isError, false);
  assert.ok(result.capabilities.includes("interrupt_receipt_v1"));
});

test("a poisoned session refuses further turns instead of mismatching results", async () => {
  const session = startSession("malformed-stream");
  try {
    await assert.rejects(() => session.sendTurn("anything"), StreamProtocolError);

    assert.equal(session.isUsable(), false);
    await assert.rejects(() => session.sendTurn("again"), /no longer usable/);
  } finally {
    await session.kill();
  }
});

test("a timed-out turn poisons the session rather than leaving it idle", async () => {
  const session = startSession("slow-turn");
  try {
    await assert.rejects(
      () => session.sendTurn("SLOW forever", { timeoutMs: 150 }),
      /timed out/
    );

    assert.equal(session.isUsable(), false);
    await assert.rejects(() => session.sendTurn("next"), /already closed|no longer usable/);
  } finally {
    await session.kill();
  }
});

test("interrupt gives up instead of hanging when no control response arrives", async () => {
  const session = startSession("no-control-response");
  try {
    await session.sendTurn("warm up");
    const outcome = await session.interrupt({ timeoutMs: 200 });

    assert.equal(outcome.interrupted, false);
    assert.match(outcome.reason, /did not answer the interrupt/);
  } finally {
    await session.kill();
  }
});

test("a control response carrying another request id does not resolve this interrupt", async () => {
  const session = startSession("wrong-control-id");
  try {
    await session.sendTurn("warm up");
    const outcome = await session.interrupt({ timeoutMs: 250 });

    assert.equal(outcome.interrupted, false);
    assert.match(outcome.reason, /did not answer the interrupt/);
  } finally {
    await session.kill();
  }
});

test("a second interrupt is refused while the first is still in flight", async () => {
  const session = startSession("no-control-response");
  try {
    await session.sendTurn("warm up");

    const first = session.interrupt({ timeoutMs: 400 });
    const second = await session.interrupt({ timeoutMs: 400 });

    assert.equal(second.interrupted, false);
    assert.equal(second.reason, "interrupt-in-flight");

    const firstOutcome = await first;
    assert.equal(firstOutcome.interrupted, false);
  } finally {
    await session.kill();
  }
});

test("a session that cannot start reports an error instead of crashing the process", async () => {
  const session = ClaudeCliSession.start(makeTempDir(), {
    env: { ...process.env, PATH: makeTempDir(), PATHEXT: ".EXE" }
  });

  await assert.rejects(() => session.sendTurn("hello"), /Failed to start Claude|exited before/);
  assert.equal(session.isUsable(), false);
});

// Reproduces a real defect: cmd.exe truncated an unquoted wrapper path at the space.
test("a Windows batch wrapper installed under a path with spaces still starts", async (t) => {
  if (process.platform !== "win32") {
    t.skip("cmd.exe wrapper resolution only applies on Windows");
    return;
  }

  const binDir = path.join(makeTempDir(), "dir with spaces");
  fs.mkdirSync(binDir, { recursive: true });
  installFakeClaude(binDir, "ready");

  const session = ClaudeCliSession.start(makeTempDir(), { env: buildEnv(binDir) });
  try {
    const result = await session.sendTurn("hello");
    assert.equal(result.text, "turn1:hello");
  } finally {
    await session.close();
  }
});

test("a further interrupt stays refused while an earlier one is unanswered", async () => {
  const session = startSession("no-control-response");
  try {
    await session.sendTurn("warm up");

    const first = await session.interrupt({ timeoutMs: 150 });
    assert.equal(first.interrupted, false);

    const second = await session.interrupt({ timeoutMs: 150 });
    assert.equal(second.interrupted, false);
    assert.equal(second.reason, "interrupt-unanswered");
  } finally {
    await session.kill();
  }
});

test("buildSpawnPlan leaves arguments intact through the cmd wrapper", (t) => {
  if (process.platform !== "win32") {
    t.skip("the cmd wrapper only exists on Windows");
    return;
  }

  const binDir = path.join(makeTempDir(), "with space");
  fs.mkdirSync(binDir, { recursive: true });
  installFakeClaude(binDir, "ready");

  const plan = buildSpawnPlan(["--name", 'a "quoted" name', "--tools", ""], buildEnv(binDir));

  const line = plan.args[3];
  assert.equal(plan.options.windowsVerbatimArguments, true);
  // cmd /s strips exactly the outer pair, so the whole line must carry one.
  assert.match(line, /^".*"$/);
  // The wrapper path keeps its own quotes despite the space.
  assert.ok(line.includes('with space'), line);
  assert.match(line, /claude\.CMD"/i);
  // An embedded quote is doubled, and an empty argument survives as "".
  assert.ok(line.includes('""quoted""'), line);
  assert.ok(line.includes('--tools ""'), line);
});

test("buildSpawnPlan passes arguments through untouched off Windows", (t) => {
  if (process.platform === "win32") {
    t.skip("this is the non-Windows path");
    return;
  }

  const plan = buildSpawnPlan(["--name", "x"], { PATH: "" });
  assert.deepEqual(plan.args, ["--name", "x"]);
  assert.deepEqual(plan.options, {});
});

test("a late control response releases the guard so interrupt can be retried", async () => {
  const session = startSession("slow-control-response");
  try {
    await session.sendTurn("warm up");

    const timedOut = await session.interrupt({ timeoutMs: 100 });
    assert.equal(timedOut.interrupted, false);

    // Wait past the fixture's delayed control_response, which clears the guard.
    await new Promise((resolve) => setTimeout(resolve, 400));

    const retried = await session.interrupt({ timeoutMs: 1500 });
    assert.equal(retried.reason, null);
    assert.equal(retried.interrupted, true);
  } finally {
    await session.kill();
  }
});

// stdin is the only channel to the session, so losing it is unrecoverable regardless of
// whether a control request was still pending when the write failed.
test("an interrupt write failure poisons the session", async () => {
  const session = startSession("no-control-response");
  try {
    await session.sendTurn("warm up");

    // Destroying stdin makes the next write fail the way a broken pipe would.
    session.child.stdin.destroy();
    const outcome = await session.interrupt({ timeoutMs: 2000 });

    assert.equal(outcome.interrupted, false);
    assert.match(outcome.reason, /Failed to send the interrupt/);
    assert.equal(session.isUsable(), false);
  } finally {
    await session.kill();
  }
});
