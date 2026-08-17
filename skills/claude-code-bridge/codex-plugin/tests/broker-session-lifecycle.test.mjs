// code-mereology-leaf: skills/claude-code-bridge/codex-plugin/sd-broker-session-lifecycle.md

import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import test from "node:test";

import { startClaudeBroker } from "../scripts/claude-broker.mjs";
import {
  closeBrokerControl,
  interruptBrokeredJob,
  openBrokerControl,
  requestBrokerInterrupt
} from "../scripts/lib/broker-lifecycle.mjs";
import { createBrokerEndpoint, parseBrokerEndpoint } from "../scripts/lib/broker-endpoint.mjs";
import { buildStatusSnapshot } from "../scripts/lib/job-control.mjs";
import { loadState, readJobFile, resolveJobFile, saveState, writeJobFile } from "../scripts/lib/state.mjs";
import { createJobRecord, updateBrokerEndpointIfActive } from "../scripts/lib/tracked-jobs.mjs";
import { handleSessionLifecycleEvent } from "../scripts/session-lifecycle-hook.mjs";
import { makeTempDir } from "./helpers.mjs";

function job(id, sessionId, overrides = {}) {
  return {
    id,
    title: id,
    kind: "review",
    status: "running",
    phase: "running",
    pid: 4100,
    sessionId,
    logFile: null,
    ...overrides
  };
}

function endpointTarget(endpoint) {
  return parseBrokerEndpoint(endpoint).path;
}

function exchange(endpoint, message, timeoutMs = 1000) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ path: endpointTarget(endpoint) });
    let buffer = "";
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error("Timed out waiting for the broker response."));
    }, timeoutMs);

    socket.setEncoding("utf8");
    socket.on("connect", () => {
      socket.write(`${typeof message === "string" ? message : JSON.stringify(message)}\n`);
    });
    socket.on("data", (chunk) => {
      buffer += chunk;
      const newline = buffer.indexOf("\n");
      if (newline === -1) {
        return;
      }
      clearTimeout(timeout);
      socket.end();
      resolve(JSON.parse(buffer.slice(0, newline)));
    });
    socket.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function withBroker(run) {
  const sessionDir = makeTempDir("claude-broker-server-");
  const endpoint = createBrokerEndpoint(sessionDir, process.platform);
  const calls = { interrupt: 0, close: 0 };
  const session = {
    async interrupt() {
      calls.interrupt += 1;
      return { interrupted: true, reason: null };
    },
    async close() {
      calls.close += 1;
    }
  };
  const broker = await startClaudeBroker({ endpoint, ownerId: "job-a", session });
  try {
    await run({ broker, calls, endpoint });
  } finally {
    await broker.close();
  }
}

test("a Unix broker endpoint stays inside its session directory", () => {
  assert.equal(createBrokerEndpoint("/tmp/claude job", "linux"), "unix:/tmp/claude job/broker.sock");
});

test("a Windows broker endpoint is a sanitized named pipe", () => {
  assert.equal(
    createBrokerEndpoint("C:\\Temp\\claude job", "win32"),
    "pipe:\\\\.\\pipe\\claude-job-claude-session"
  );
});

test("the endpoint parser accepts an absolute Unix socket", () => {
  assert.deepEqual(parseBrokerEndpoint("unix:/tmp/bridge/broker.sock"), {
    kind: "unix",
    path: "/tmp/bridge/broker.sock"
  });
});

test("the endpoint parser accepts a Windows named pipe", () => {
  assert.deepEqual(parseBrokerEndpoint("pipe:\\\\.\\pipe\\bridge-job"), {
    kind: "pipe",
    path: "\\\\.\\pipe\\bridge-job"
  });
});

test("the endpoint parser refuses a relative Unix socket", () => {
  assert.throws(() => parseBrokerEndpoint("unix:relative/broker.sock"), /absolute/i);
});

test("the endpoint parser refuses unsupported transports", () => {
  assert.throws(() => parseBrokerEndpoint("tcp:127.0.0.1:9000"), /unsupported/i);
});

test("the endpoint parser refuses an empty endpoint", () => {
  assert.throws(() => parseBrokerEndpoint(""), /missing/i);
});

test("the broker forwards an interrupt only for its recorded owner", async () => {
  await withBroker(async ({ calls, endpoint }) => {
    const response = await exchange(endpoint, {
      id: "request-1",
      method: "session/interrupt",
      params: { ownerId: "job-a" }
    });
    assert.deepEqual(response, {
      id: "request-1",
      result: { interrupted: true, reason: null }
    });
    assert.equal(calls.interrupt, 1);
  });
});

test("the broker rejects an interrupt for another owner", async () => {
  await withBroker(async ({ calls, endpoint }) => {
    const response = await exchange(endpoint, {
      id: "request-2",
      method: "session/interrupt",
      params: { ownerId: "job-b" }
    });
    assert.equal(response.id, "request-2");
    assert.equal(response.error.code, "owner-mismatch");
    assert.equal(calls.interrupt, 0);
  });
});

test("the broker rejects methods outside its control surface", async () => {
  await withBroker(async ({ endpoint }) => {
    const response = await exchange(endpoint, {
      id: "request-3",
      method: "session/run",
      params: { ownerId: "job-a" }
    });
    assert.equal(response.error.code, "unsupported-method");
  });
});

test("malformed JSON does not stop the broker from serving the next request", async () => {
  await withBroker(async ({ endpoint }) => {
    const malformed = await exchange(endpoint, "{");
    assert.equal(malformed.error.code, "invalid-json");
    const valid = await exchange(endpoint, {
      id: "request-4",
      method: "session/interrupt",
      params: { ownerId: "job-a" }
    });
    assert.equal(valid.result.interrupted, true);
  });
});

test("broker shutdown closes the owned Claude session", async () => {
  await withBroker(async ({ calls, endpoint }) => {
    const response = await exchange(endpoint, {
      id: "request-5",
      method: "broker/shutdown",
      params: { ownerId: "job-a" }
    });
    assert.deepEqual(response, { id: "request-5", result: {} });
    assert.equal(calls.close, 1);
  });
});

test("broker shutdown retries a Claude session close that previously failed", async () => {
  const sessionDir = makeTempDir("claude-broker-close-retry-");
  const endpoint = createBrokerEndpoint(sessionDir, process.platform);
  let closeAttempts = 0;
  const broker = await startClaudeBroker({
    endpoint,
    ownerId: "job-a",
    session: {
      async interrupt() {},
      async close() {
        closeAttempts += 1;
        if (closeAttempts === 1) {
          throw new Error("close failed once");
        }
      }
    }
  });

  try {
    const failed = await exchange(endpoint, {
      id: "request-close-1",
      method: "broker/shutdown",
      params: { ownerId: "job-a" }
    });
    assert.equal(failed.error.code, "shutdown-failed");

    const retried = await exchange(endpoint, {
      id: "request-close-2",
      method: "broker/shutdown",
      params: { ownerId: "job-a" }
    });
    assert.deepEqual(retried, { id: "request-close-2", result: {} });
    assert.equal(closeAttempts, 2);
  } finally {
    await broker.close();
  }
});

test("opening broker control reports only an endpoint that is already reachable", async () => {
  let published = false;
  const session = { interrupt: async () => ({ interrupted: true, reason: null }), close: async () => {} };
  const control = await openBrokerControl({
    jobId: "job-ready",
    session,
    onReady: async ({ endpoint }) => {
      const response = await requestBrokerInterrupt({ endpoint, ownerId: "job-ready", timeoutMs: 500 });
      assert.equal(response.acknowledged, true);
      published = true;
    }
  });
  try {
    assert.equal(published, true);
    assert.equal(control.available, true);
  } finally {
    await closeBrokerControl(control);
  }
});

test("an unreachable endpoint produces an observable interrupt failure", async () => {
  const sessionDir = makeTempDir("claude-broker-unreachable-");
  const endpoint = createBrokerEndpoint(sessionDir, process.platform);
  const result = await requestBrokerInterrupt({ endpoint, ownerId: "job-a", timeoutMs: 50 });
  assert.deepEqual(result, {
    acknowledged: false,
    interrupted: false,
    reason: "unreachable"
  });
});

test("closing broker control twice leaves no endpoint artifacts", async () => {
  const session = { interrupt: async () => ({ interrupted: true, reason: null }), close: async () => {} };
  const control = await openBrokerControl({ jobId: "job-close", session });
  await closeBrokerControl(control);
  await closeBrokerControl(control);
  assert.equal(fs.existsSync(control.sessionDir), false);
});

test("an acknowledged broker interrupt does not force-kill the worker", async () => {
  let fallbackCalls = 0;
  const result = await interruptBrokeredJob(
    { id: "job-a", brokerEndpoint: "pipe:test", pid: 4100 },
    {
      requestInterrupt: async () => ({ acknowledged: true, interrupted: true, reason: null }),
      terminateFallback: () => {
        fallbackCalls += 1;
        return { attempted: true, delivered: true, method: "taskkill" };
      }
    }
  );
  assert.deepEqual(result, { attempted: true, delivered: true, method: "broker", reason: null });
  assert.equal(fallbackCalls, 0);
});

test("a broker that cannot establish interruption falls back to verified termination", async () => {
  const result = await interruptBrokeredJob(
    { id: "job-a", brokerEndpoint: "pipe:test", pid: 4100 },
    {
      requestInterrupt: async () => ({ acknowledged: true, interrupted: false, reason: "capability-missing" }),
      terminateFallback: () => ({ attempted: true, delivered: true, method: "taskkill" })
    }
  );
  assert.deepEqual(result, {
    attempted: true,
    delivered: true,
    method: "taskkill",
    brokerReason: "capability-missing"
  });
});

test("a job without a broker endpoint uses the existing termination path", async () => {
  let interruptCalls = 0;
  const result = await interruptBrokeredJob(
    { id: "job-a", pid: 4100 },
    {
      requestInterrupt: async () => {
        interruptCalls += 1;
        return { acknowledged: true, interrupted: true, reason: null };
      },
      terminateFallback: () => ({ attempted: true, delivered: true, method: "taskkill" })
    }
  );
  assert.deepEqual(result, { attempted: true, delivered: true, method: "taskkill" });
  assert.equal(interruptCalls, 0);
});

test("a new job records the Codex thread that owns it", () => {
  const record = createJobRecord(
    { id: "job-thread", status: "queued" },
    { env: { CODEX_THREAD_ID: "codex-thread-a" } }
  );
  assert.equal(record.sessionId, "codex-thread-a");
});

test("job control scopes to the Codex thread when no bridge-specific id is present", () => {
  const workspace = makeTempDir("claude-codex-thread-scope-");
  const jobs = [
    job("job-mine", "codex-thread-a"),
    job("job-theirs", "codex-thread-b")
  ];
  saveState(workspace, { jobs });
  for (const entry of jobs) {
    writeJobFile(workspace, entry.id, entry);
  }

  const snapshot = buildStatusSnapshot(workspace, {
    env: { CODEX_THREAD_ID: "codex-thread-a" }
  });

  assert.deepEqual(snapshot.active.map((entry) => entry.id), ["job-mine"]);
});

test("a broker endpoint update refuses a terminal job it observes", () => {
  const workspace = makeTempDir("claude-broker-endpoint-race-");
  const current = job("job-race", "session-a");
  saveState(workspace, { jobs: [current] });
  writeJobFile(workspace, current.id, current);

  assert.equal(updateBrokerEndpointIfActive(workspace, current.id, undefined, "pipe:ready"), true);
  const cancelled = { ...readJobFile(resolveJobFile(workspace, current.id)), status: "cancelled", phase: "done" };
  writeJobFile(workspace, current.id, cancelled);

  assert.equal(updateBrokerEndpointIfActive(workspace, current.id, "pipe:ready", null), false);
  assert.equal(readJobFile(resolveJobFile(workspace, current.id)).status, "cancelled");
});

test("session end removes only that session's jobs and closes its broker", async () => {
  const workspace = makeTempDir("claude-session-cleanup-");
  const logFile = path.join(workspace, "session-a.log");
  fs.writeFileSync(logFile, "running\n", "utf8");
  const jobs = [
    job("a-running", "session-a", { brokerEndpoint: "pipe:a", logFile }),
    job("a-done", "session-a", { status: "completed", phase: "done", pid: null }),
    job("b-running", "session-b", { pid: 4200 }),
    job("unscoped", null, { pid: 4300 })
  ];
  saveState(workspace, { jobs });
  for (const current of jobs) {
    writeJobFile(workspace, current.id, current);
  }
  const shutdowns = [];
  const terminations = [];
  const observedExits = [];
  const result = await handleSessionLifecycleEvent(
    { hook_event_name: "SessionEnd", cwd: workspace, session_id: "session-a" },
    {
      requestShutdown: async (request) => {
        shutdowns.push(request);
        return { acknowledged: true };
      },
      terminateProcessTree: (pid) => terminations.push(pid),
      waitForProcessExit: async (pid) => {
        observedExits.push(pid);
        return true;
      }
    }
  );

  assert.deepEqual(result.cleanedJobIds, ["a-running", "a-done"]);
  assert.deepEqual(loadState(workspace).jobs.map((current) => current.id).sort(), ["b-running", "unscoped"]);
  assert.equal(fs.existsSync(resolveJobFile(workspace, "a-running")), false);
  assert.equal(fs.existsSync(resolveJobFile(workspace, "a-done")), false);
  assert.equal(fs.existsSync(logFile), false);
  assert.deepEqual(shutdowns, [{ endpoint: "pipe:a", ownerId: "a-running" }]);
  assert.deepEqual(terminations, []);
  assert.deepEqual(observedExits, [4100]);
});

test("session end preserves brokered job evidence until worker exit is observed", async () => {
  const workspace = makeTempDir("claude-session-broker-still-alive-");
  const current = job("a-running", "session-a", { brokerEndpoint: "pipe:a", pid: 4350 });
  saveState(workspace, { jobs: [current] });
  writeJobFile(workspace, current.id, current);

  const result = await handleSessionLifecycleEvent(
    { hook_event_name: "SessionEnd", cwd: workspace, session_id: "session-a" },
    {
      requestShutdown: async () => ({ acknowledged: true }),
      terminateProcessTree: () => {
        throw new Error("an acknowledged broker shutdown must not use the fallback");
      },
      waitForProcessExit: async () => false
    }
  );

  assert.deepEqual(result.cleanedJobIds, []);
  assert.equal(readJobFile(resolveJobFile(workspace, current.id)).status, "running");
});

test("session end falls back to process termination when broker shutdown is not acknowledged", async () => {
  const workspace = makeTempDir("claude-session-fallback-");
  const current = job("a-running", "session-a", { brokerEndpoint: "pipe:a", pid: 4400 });
  saveState(workspace, { jobs: [current] });
  writeJobFile(workspace, current.id, current);
  const terminations = [];

  await handleSessionLifecycleEvent(
    { hook_event_name: "SessionEnd", cwd: workspace, session_id: "session-a" },
    {
      requestShutdown: async () => ({ acknowledged: false, reason: "unreachable" }),
      terminateProcessTree: (pid, identity) => {
        terminations.push({ pid, identity });
        return { attempted: true, delivered: true, method: "taskkill" };
      },
      waitForProcessExit: async () => true
    }
  );

  assert.equal(terminations.length, 1);
  assert.equal(terminations[0].pid, 4400);
  assert.equal(terminations[0].identity.identity, "a-running");
  assert.match(terminations[0].identity.companionPath, /claude-companion\.mjs$/);
  assert.equal(terminations[0].identity.runtimePath, process.execPath);
  assert.equal(terminations[0].identity.sameWorkspace(workspace), true);
  assert.deepEqual(loadState(workspace).jobs, []);
});

test("session end preserves a job when fallback process identity cannot be verified", async () => {
  const workspace = makeTempDir("claude-session-unverified-");
  const current = job("a-running", "session-a", { brokerEndpoint: "pipe:a", pid: 4401 });
  saveState(workspace, { jobs: [current] });
  writeJobFile(workspace, current.id, current);

  const result = await handleSessionLifecycleEvent(
    { hook_event_name: "SessionEnd", cwd: workspace, session_id: "session-a" },
    {
      requestShutdown: async () => ({ acknowledged: false, reason: "unreachable" }),
      terminateProcessTree: () => ({ attempted: false, delivered: false, method: null, identity: "mismatched" }),
      waitForProcessExit: async () => {
        throw new Error("an unverified process must not be polled as if it were terminated");
      }
    }
  );

  assert.deepEqual(result.cleanedJobIds, []);
  assert.deepEqual(loadState(workspace).jobs.map((candidate) => candidate.id), ["a-running"]);
  assert.equal(fs.existsSync(resolveJobFile(workspace, current.id)), true);
});

test("session end preserves evidence when a signalled worker remains alive", async () => {
  const workspace = makeTempDir("claude-session-still-alive-");
  const current = job("a-running", "session-a", { pid: 4402 });
  saveState(workspace, { jobs: [current] });
  writeJobFile(workspace, current.id, current);

  const result = await handleSessionLifecycleEvent(
    { hook_event_name: "SessionEnd", cwd: workspace, session_id: "session-a" },
    {
      terminateProcessTree: () => ({ attempted: true, delivered: true, method: "process" }),
      waitForProcessExit: async () => false
    }
  );

  assert.deepEqual(result.cleanedJobIds, []);
  assert.equal(readJobFile(resolveJobFile(workspace, current.id)).status, "running");
});

test("session end discovers a session job from its authoritative file when the listing lost it", async () => {
  const workspace = makeTempDir("claude-session-authoritative-");
  const current = job("file-only", "session-a", { status: "completed", phase: "done", pid: null });
  saveState(workspace, { jobs: [] });
  writeJobFile(workspace, current.id, current);

  const result = await handleSessionLifecycleEvent(
    { hook_event_name: "SessionEnd", cwd: workspace, session_id: "session-a" }
  );

  assert.deepEqual(result.cleanedJobIds, ["file-only"]);
  assert.equal(fs.existsSync(resolveJobFile(workspace, current.id)), false);
});

test("session end without an identifier leaves every workspace job alone", async () => {
  const workspace = makeTempDir("claude-session-unscoped-");
  const jobs = [job("a-running", "session-a"), job("b-running", "session-b")];
  saveState(workspace, { jobs });
  for (const current of jobs) {
    writeJobFile(workspace, current.id, current);
  }

  const result = await handleSessionLifecycleEvent(
    { hook_event_name: "SessionEnd", cwd: workspace },
    {
      requestShutdown: async () => {
        throw new Error("no shutdown expected");
      },
      terminateProcessTree: () => {
        throw new Error("no termination expected");
      }
    }
  );

  assert.deepEqual(result, { handled: true, cleanedJobIds: [] });
  assert.deepEqual(loadState(workspace).jobs.map((current) => current.id).sort(), ["a-running", "b-running"]);
});

test("repeating session cleanup is harmless after the first call", async () => {
  const workspace = makeTempDir("claude-session-repeat-");
  const current = job("a-running", "session-a", { brokerEndpoint: "pipe:a" });
  saveState(workspace, { jobs: [current] });
  writeJobFile(workspace, current.id, current);
  let shutdowns = 0;
  const options = {
    requestShutdown: async () => {
      shutdowns += 1;
      return { acknowledged: true };
    },
    terminateProcessTree: () => ({ attempted: false, delivered: false, method: null }),
    waitForProcessExit: async () => true
  };

  await handleSessionLifecycleEvent(
    { hook_event_name: "SessionEnd", cwd: workspace, session_id: "session-a" },
    options
  );
  const repeated = await handleSessionLifecycleEvent(
    { hook_event_name: "SessionEnd", cwd: workspace, session_id: "session-a" },
    options
  );

  assert.deepEqual(repeated, { handled: true, cleanedJobIds: [] });
  assert.equal(shutdowns, 1);
});

test("a confirmed missing worker during session cleanup does not preserve the stale job", async () => {
  const workspace = makeTempDir("claude-session-missing-worker-");
  const current = job("a-running", "session-a", { pid: 4500 });
  saveState(workspace, { jobs: [current] });
  writeJobFile(workspace, current.id, current);

  const result = await handleSessionLifecycleEvent(
    { hook_event_name: "SessionEnd", cwd: workspace, session_id: "session-a" },
    {
      requestShutdown: async () => ({ acknowledged: false, reason: "missing-endpoint" }),
      terminateProcessTree: () => ({ attempted: true, delivered: false, method: "kill" }),
      waitForProcessExit: async () => true
    }
  );

  assert.deepEqual(result.cleanedJobIds, ["a-running"]);
  assert.deepEqual(loadState(workspace).jobs, []);
  assert.equal(fs.existsSync(resolveJobFile(workspace, "a-running")), false);
});
