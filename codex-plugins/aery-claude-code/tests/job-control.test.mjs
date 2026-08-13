import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { makeTempDir } from "./helpers.mjs";
import {
  buildSingleJobSnapshot,
  buildStatusSnapshot,
  isWorkerMissing,
  readJobProgressPreview,
  resolveCancelableJob,
  resolveResultJob
} from "../scripts/lib/job-control.mjs";
import { saveState, writeJobFile } from "../scripts/lib/state.mjs";
import { appendLogBlock, appendLogLine, SESSION_ID_ENV } from "../scripts/lib/tracked-jobs.mjs";

// Every case here needs its own state root, or a job written by one test would be visible
// to the next.
function makeWorkspaceWithJobs(jobs) {
  const workspace = makeTempDir();
  process.env.PLUGIN_DATA = makeTempDir();
  saveState(workspace, { jobs });
  return workspace;
}

function job(overrides) {
  return {
    id: "review-1",
    kind: "review",
    title: "Review",
    status: "completed",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

const previousPluginData = process.env.PLUGIN_DATA;
const previousSessionId = process.env[SESSION_ID_ENV];
test.after(() => {
  process.env.PLUGIN_DATA = previousPluginData ?? "";
  if (previousSessionId === undefined) {
    delete process.env[SESSION_ID_ENV];
  } else {
    process.env[SESSION_ID_ENV] = previousSessionId;
  }
});

// The timestamp prefix is written in one file and stripped in another, so a change to
// either format has to keep this round trip working.
test("the progress preview reads back the lines the job log writes", () => {
  const logFile = path.join(makeTempDir(), "job.log");
  fs.writeFileSync(logFile, "", "utf8");
  appendLogLine(logFile, "Claude session ready.");
  appendLogLine(logFile, "Using Read: AGENTS.md");
  appendLogBlock(logFile, "Final output", "# Claude Review\n\nVerdict: approve");

  assert.deepEqual(readJobProgressPreview(logFile), ["Claude session ready.", "Using Read: AGENTS.md"]);
});

test("the progress preview keeps only the last lines", () => {
  const logFile = path.join(makeTempDir(), "job.log");
  fs.writeFileSync(logFile, "", "utf8");
  for (const step of ["one", "two", "three", "four", "five"]) {
    appendLogLine(logFile, step);
  }

  assert.deepEqual(readJobProgressPreview(logFile, 2), ["four", "five"]);
});

test("a missing log file yields no progress rather than failing", () => {
  assert.deepEqual(readJobProgressPreview(path.join(makeTempDir(), "absent.log")), []);
});

// `ESRCH` is the only answer that means the process is gone. `EPERM` says one exists and
// is simply out of reach, and treating that as gone would report a live run as dead.
test("a worker is only reported missing when the pid does not resolve", () => {
  const running = job({ status: "running", pid: 4242 });

  assert.equal(isWorkerMissing(running, { killImpl: () => undefined }), false);
  assert.equal(
    isWorkerMissing(running, {
      killImpl: () => {
        throw Object.assign(new Error("permission denied"), { code: "EPERM" });
      }
    }),
    false
  );
  assert.equal(
    isWorkerMissing(running, {
      killImpl: () => {
        throw Object.assign(new Error("no such process"), { code: "ESRCH" });
      }
    }),
    true
  );
});

test("a finished job is never reported as a missing worker", () => {
  assert.equal(
    isWorkerMissing(job({ status: "completed", pid: 4242 }), {
      killImpl: () => {
        throw Object.assign(new Error("no such process"), { code: "ESRCH" });
      }
    }),
    false
  );
});

test("a job id can be abbreviated to an unambiguous prefix", () => {
  const workspace = makeWorkspaceWithJobs([job({ id: "review-abc123" })]);

  const snapshot = buildSingleJobSnapshot(workspace, "review-abc");

  assert.equal(snapshot.job.id, "review-abc123");
});

test("an ambiguous job prefix is refused rather than guessed", () => {
  const workspace = makeWorkspaceWithJobs([job({ id: "review-abc" }), job({ id: "review-abd" })]);

  assert.throws(() => buildSingleJobSnapshot(workspace, "review-ab"), /ambiguous/);
});

test("an unknown job id names the command that lists them", () => {
  const workspace = makeWorkspaceWithJobs([job({ id: "review-abc" })]);

  assert.throws(() => buildSingleJobSnapshot(workspace, "nope"), /No job found for "nope"\.[\s\S]*\/claude-status/);
});

// A job that exists but is in the wrong state must not be reported as an unknown id.
test("asking for the result of a running job says it is still running", () => {
  const workspace = makeWorkspaceWithJobs([job({ id: "review-run", status: "running", pid: process.pid })]);

  assert.throws(() => resolveResultJob(workspace, "review-run"), /is still running/);
});

// Telling the user to wait would be a promise the job cannot keep once its worker is gone.
test("asking for the result of a job whose worker vanished does not tell the user to wait", () => {
  const workspace = makeWorkspaceWithJobs([job({ id: "review-run", status: "running", pid: 424242 })]);

  assert.throws(
    () =>
      resolveResultJob(workspace, "review-run", {
        killImpl: () => {
          throw Object.assign(new Error("no such process"), { code: "ESRCH" });
        }
      }),
    /no result will arrive/
  );
});

test("cancelling a finished job reports it as finished rather than unknown", () => {
  const workspace = makeWorkspaceWithJobs([job({ id: "review-done", status: "completed" })]);

  assert.throws(() => resolveCancelableJob(workspace, "review-done"), /already finished as completed/);
});

test("cancelling without a job id refuses to choose between two active jobs", () => {
  const workspace = makeWorkspaceWithJobs([
    job({ id: "review-a", status: "running", pid: process.pid }),
    job({ id: "review-b", status: "running", pid: process.pid })
  ]);

  assert.throws(() => resolveCancelableJob(workspace, ""), /More than one Claude job is active/);
});

test("cancelling with nothing active says so", () => {
  const workspace = makeWorkspaceWithJobs([job({ id: "review-done", status: "completed" })]);

  assert.throws(() => resolveCancelableJob(workspace, ""), /No active Claude jobs to cancel/);
});

test("the status snapshot separates active jobs from finished ones", () => {
  const workspace = makeWorkspaceWithJobs([
    job({ id: "review-old", status: "completed", updatedAt: "2026-01-01T00:00:00.000Z" }),
    job({ id: "review-new", status: "running", pid: process.pid, updatedAt: "2026-01-02T00:00:00.000Z" })
  ]);

  const snapshot = buildStatusSnapshot(workspace);

  assert.deepEqual(snapshot.active.map((entry) => entry.id), ["review-new"]);
  assert.deepEqual(snapshot.finished.map((entry) => entry.id), ["review-old"]);
});

// Without a session identifier every job in the workspace is in scope, which is what the
// bridge falls back to while no hook exports one.
test("jobs are scoped to the caller's session only when one is known", () => {
  const workspace = makeWorkspaceWithJobs([
    job({ id: "review-mine", sessionId: "session-a" }),
    job({ id: "review-theirs", sessionId: "session-b" })
  ]);

  const unscoped = buildStatusSnapshot(workspace, { env: {} });
  assert.deepEqual(unscoped.finished.map((entry) => entry.id).sort(), ["review-mine", "review-theirs"]);

  const scoped = buildStatusSnapshot(workspace, { env: { [SESSION_ID_ENV]: "session-a" } });
  assert.deepEqual(scoped.finished.map((entry) => entry.id), ["review-mine"]);
});

// A job whose pid has not been recorded yet has not started, which is not the same as
// having died. Reporting it as a vanished worker would tell the user to clear a job that
// is about to run.
test("a queued job with no pid yet is not reported as a vanished worker", () => {
  assert.equal(isWorkerMissing(job({ status: "queued", pid: null })), false);
  assert.equal(isWorkerMissing(job({ status: "queued" })), false);
});

// A job with no worker on record is still cancellable: refusing would leave a record no
// command could clear. What cancelling it must not do is claim to have stopped something,
// which is the renderer's half of the contract.
test("a job whose worker is not recorded yet can still be cancelled", () => {
  const workspace = makeWorkspaceWithJobs([job({ id: "review-new", status: "queued", pid: null })]);

  assert.equal(resolveCancelableJob(workspace, "review-new").job.id, "review-new");
  assert.equal(resolveCancelableJob(workspace, "").job.id, "review-new");
});

// The listing is a projection and can lose a write; a job's own file has one writer at a
// time. A report about one job must not call it unfinished because the listing is stale.
test("a single job report takes its state from the job file, not the listing", () => {
  const workspace = makeWorkspaceWithJobs([job({ id: "review-x", status: "running", pid: 424242 })]);
  writeJobFile(workspace, "review-x", {
    id: "review-x",
    status: "completed",
    phase: "done",
    pid: null,
    completedAt: "2026-01-01T00:01:00.000Z",
    rendered: "# Claude Review\n"
  });

  const snapshot = buildSingleJobSnapshot(workspace, "review-x");

  assert.equal(snapshot.job.status, "completed");
  assert.equal(snapshot.job.phase, "done");
  assert.equal(snapshot.job.workerMissing, false);
});

// The three commands that judge one named job must not answer the same question
// differently, so each of them reads the job's own file rather than the listing.
test("result and cancel agree with status about a job the listing has stale", () => {
  const workspace = makeWorkspaceWithJobs([job({ id: "review-y", status: "running", pid: 424242 })]);
  writeJobFile(workspace, "review-y", {
    id: "review-y",
    status: "completed",
    phase: "done",
    pid: null,
    completedAt: "2026-01-01T00:01:00.000Z",
    rendered: "# Claude Review\n"
  });

  assert.equal(buildSingleJobSnapshot(workspace, "review-y").job.status, "completed");
  assert.equal(resolveResultJob(workspace, "review-y").job.status, "completed");
  assert.throws(() => resolveCancelableJob(workspace, "review-y"), /already finished as completed/);
});

// The job file clears the pid when a run ends. Falling back to the listing's copy there
// would put a live-looking pid on a finished job, which is what `cancel` terminates by.
test("a finished job does not carry the pid the listing still remembers", () => {
  const workspace = makeWorkspaceWithJobs([job({ id: "review-z", status: "running", pid: 424242 })]);
  writeJobFile(workspace, "review-z", { id: "review-z", status: "completed", phase: "done", pid: null });

  assert.equal(buildSingleJobSnapshot(workspace, "review-z").job.pid, null);
});

// While a job is active the two writers record the pid at different moments, so the one
// that has it must win: the queued file carries none until the worker writes its own.
test("an active job takes the pid from whichever writer recorded one", () => {
  const workspace = makeWorkspaceWithJobs([job({ id: "review-w", status: "queued", pid: 4242 })]);
  writeJobFile(workspace, "review-w", { id: "review-w", status: "queued", phase: "queued", pid: null });

  assert.equal(buildSingleJobSnapshot(workspace, "review-w").job.pid, 4242);
});
