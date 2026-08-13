import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { makeTempDir } from "./helpers.mjs";
import { ensureStateDir, updateState, resolveJobFile, resolveJobLogFile, resolveStateDir, resolveStateFile, saveState } from "../scripts/lib/state.mjs";

// Codex sets PLUGIN_DATA and still accepts CLAUDE_PLUGIN_DATA, and a host running
// these tests may already export either one, so the fallback case clears both.
function withoutPluginData(run) {
  const previous = { PLUGIN_DATA: process.env.PLUGIN_DATA, CLAUDE_PLUGIN_DATA: process.env.CLAUDE_PLUGIN_DATA };
  delete process.env.PLUGIN_DATA;
  delete process.env.CLAUDE_PLUGIN_DATA;
  try {
    return run();
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
}

test("resolveStateDir uses a temp-backed per-workspace directory", () => {
  const workspace = makeTempDir();
  const stateDir = withoutPluginData(() => resolveStateDir(workspace));

  assert.equal(stateDir.startsWith(os.tmpdir()), true);
  assert.match(path.basename(stateDir), /.+-[a-f0-9]{16}$/);
  assert.match(stateDir, new RegExp(`^${os.tmpdir().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
});

test("resolveStateDir uses PLUGIN_DATA when it is provided", () => {
  const workspace = makeTempDir();
  const pluginDataDir = makeTempDir();
  const previousPluginDataDir = process.env.PLUGIN_DATA;
  process.env.PLUGIN_DATA = pluginDataDir;

  try {
    const stateDir = resolveStateDir(workspace);

    assert.equal(stateDir.startsWith(path.join(pluginDataDir, "state")), true);
    assert.match(path.basename(stateDir), /.+-[a-f0-9]{16}$/);
    assert.match(
      stateDir,
      new RegExp(`^${path.join(pluginDataDir, "state").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)
    );
  } finally {
    if (previousPluginDataDir == null) {
      delete process.env.PLUGIN_DATA;
    } else {
      process.env.PLUGIN_DATA = previousPluginDataDir;
    }
  }
});

test("saveState prunes dropped job artifacts when indexed jobs exceed the cap", () => withoutPluginData(() => {
  const workspace = makeTempDir();
  const stateFile = resolveStateFile(workspace);
  // Resolving a job path creates nothing, so the writer makes the directory.
  ensureStateDir(workspace);

  const jobs = Array.from({ length: 51 }, (_, index) => {
    const jobId = `job-${index}`;
    const updatedAt = new Date(Date.UTC(2026, 0, 1, 0, index, 0)).toISOString();
    const logFile = resolveJobLogFile(workspace, jobId);
    const jobFile = resolveJobFile(workspace, jobId);
    fs.writeFileSync(logFile, `log ${jobId}\n`, "utf8");
    fs.writeFileSync(jobFile, JSON.stringify({ id: jobId, status: "completed" }, null, 2), "utf8");
    return {
      id: jobId,
      status: "completed",
      logFile,
      updatedAt,
      createdAt: updatedAt
    };
  });

  fs.writeFileSync(
    stateFile,
    `${JSON.stringify(
      {
        version: 1,
        config: { stopReviewGate: false },
        jobs
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  saveState(workspace, {
    version: 1,
    config: { stopReviewGate: false },
    jobs
  });

  const prunedJobFile = resolveJobFile(workspace, "job-0");
  const prunedLogFile = resolveJobLogFile(workspace, "job-0");
  const retainedJobFile = resolveJobFile(workspace, "job-50");
  const retainedLogFile = resolveJobLogFile(workspace, "job-50");
  const jobsDir = path.dirname(prunedJobFile);

  assert.equal(fs.existsSync(retainedJobFile), true);
  assert.equal(fs.existsSync(retainedLogFile), true);

  const savedState = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  assert.equal(savedState.jobs.length, 50);
  assert.deepEqual(
    savedState.jobs.map((job) => job.id),
    Array.from({ length: 50 }, (_, index) => `job-${50 - index}`)
  );
  assert.deepEqual(
    fs.readdirSync(jobsDir).sort(),
    Array.from({ length: 50 }, (_, index) => `job-${index + 1}`)
      .flatMap((jobId) => [`${jobId}.json`, `${jobId}.log`])
      .sort()
  );
}));

// A background worker records progress while the user runs other commands, so two
// processes do read-modify-write on this file. The loser of that race must retry rather
// than write its stale copy over the winner's change.
test("updateState retries when another writer got there first", () => withoutPluginData(() => {
  const workspace = makeTempDir();
  saveState(workspace, { jobs: [] });

  let attempts = 0;
  const result = updateState(workspace, (state) => {
    attempts += 1;
    if (attempts === 1) {
      // Stands in for the other process: it lands between this load and this write.
      saveState(workspace, { jobs: [{ id: "other", status: "running", updatedAt: "2026-01-01T00:00:00.000Z" }] });
    }
    state.jobs.push({ id: `mine-${attempts}`, status: "running", updatedAt: "2026-01-02T00:00:00.000Z" });
  });

  assert.equal(attempts, 2);
  assert.deepEqual(result.jobs.map((job) => job.id).sort(), ["mine-2", "other"]);
}));

test("updateState gives up rather than writing over a file that never settles", () => withoutPluginData(() => {
  const workspace = makeTempDir();
  saveState(workspace, { jobs: [] });

  assert.throws(
    () =>
      updateState(workspace, (state) => {
        saveState(workspace, { jobs: [{ id: "other", status: "running" }] });
        state.jobs.push({ id: "mine", status: "running" });
      }),
    /kept changing the job state/
  );
}));

// A partially written file would parse as corrupt and be answered with an empty job list,
// so the file is only ever swapped in whole.
test("saving state leaves no partial file behind", () => withoutPluginData(() => {
  const workspace = makeTempDir();
  saveState(workspace, { jobs: [{ id: "job-1", status: "completed", updatedAt: "2026-01-01T00:00:00.000Z" }] });

  const stateDir = resolveStateDir(workspace);
  assert.deepEqual(
    fs.readdirSync(stateDir).filter((entry) => entry.endsWith(".tmp")),
    []
  );
  assert.equal(JSON.parse(fs.readFileSync(resolveStateFile(workspace), "utf8")).jobs.length, 1);
}));

// Cleaning up after a prune must not reach beyond the list the writer had. A writer
// holding a stale list would otherwise delete the artifacts of a job another process
// added while it was working — a result, not merely a listing entry.
test("saving state never deletes the artifacts of a job it was not given", () => withoutPluginData(() => {
  const workspace = makeTempDir();
  ensureStateDir(workspace);
  const strangerJobFile = resolveJobFile(workspace, "job-stranger");
  const strangerLogFile = resolveJobLogFile(workspace, "job-stranger");
  fs.writeFileSync(strangerJobFile, JSON.stringify({ id: "job-stranger", status: "completed" }), "utf8");
  fs.writeFileSync(strangerLogFile, "log\n", "utf8");
  saveState(workspace, { jobs: [{ id: "job-stranger", status: "completed", logFile: strangerLogFile }] });

  saveState(workspace, { jobs: [{ id: "job-mine", status: "running" }] });

  assert.equal(fs.existsSync(strangerJobFile), true);
  assert.equal(fs.existsSync(strangerLogFile), true);
}));

// The cap bounds finished history. Counting a running job against it would drop a job
// that is still writing to the very files the prune then deletes.
test("the job cap never drops a job that is still active", () => withoutPluginData(() => {
  const workspace = makeTempDir();
  ensureStateDir(workspace);
  const runningJobFile = resolveJobFile(workspace, "job-running");
  fs.writeFileSync(runningJobFile, JSON.stringify({ id: "job-running", status: "running" }), "utf8");

  const jobs = [
    { id: "job-running", status: "running", updatedAt: "2020-01-01T00:00:00.000Z" },
    ...Array.from({ length: 60 }, (_, index) => ({
      id: `job-${index}`,
      status: "completed",
      updatedAt: new Date(Date.UTC(2026, 0, 1, 0, index, 0)).toISOString()
    }))
  ];

  const saved = saveState(workspace, { jobs });

  // Oldest of all by timestamp, and still kept.
  assert.ok(saved.jobs.some((entry) => entry.id === "job-running"));
  assert.equal(saved.jobs.filter((entry) => entry.status === "completed").length, 50);
  assert.equal(fs.existsSync(runningJobFile), true);
}));
