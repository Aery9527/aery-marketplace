import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { makeTempDir } from "./helpers.mjs";
import { ensureStateDir, getConfig, replaceFileAtomically, listJobs, loadState, setConfig, updateState, writeJobFile, resolveJobFile, resolveJobLogFile, resolveStateDir, resolveStateFile, saveState } from "../scripts/lib/state.mjs";

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

// A job file is where a result lands, and `cancel` can kill the process writing it at any
// moment. Replacing rather than rewriting means such a kill can never leave half a job
// behind for the next reader to parse.
test("a job file is replaced whole rather than rewritten in place", () => withoutPluginData(() => {
  const workspace = makeTempDir();
  writeJobFile(workspace, "job-1", { id: "job-1", status: "running" });
  writeJobFile(workspace, "job-1", { id: "job-1", status: "completed", rendered: "# Claude Review\n" });

  const jobsDir = path.dirname(resolveJobFile(workspace, "job-1"));
  assert.deepEqual(fs.readdirSync(jobsDir).filter((entry) => entry.endsWith(".tmp")), []);
  assert.equal(JSON.parse(fs.readFileSync(resolveJobFile(workspace, "job-1"), "utf8")).status, "completed");
}));

// Preferences live in their own file, so no job write can carry an older copy of them back
// — not even one built before the preference was recorded and written afterwards.
test("a job write cannot roll back a preference, whenever it was built", () => withoutPluginData(() => {
  const workspace = makeTempDir();
  saveState(workspace, { jobs: [] });

  const stale = loadState(workspace);
  setConfig(workspace, "stopReviewGate", true);
  saveState(workspace, { ...stale, jobs: [{ id: "job-1", status: "running", updatedAt: "2026-01-01T00:00:00.000Z" }] });
  assert.equal(getConfig(workspace).stopReviewGate, true);

  // The job list still round-trips beside it.
  assert.deepEqual(listJobs(workspace).map((job) => job.id), ["job-1"]);
}));

// Windows refuses to replace a file another process has open, and every command here reads
// these files while runs write them. The collision lasts as long as one read, so it must
// not surface as a write that failed.
test("replacing a file waits out a target that is briefly held open", () => {
  const target = path.join(makeTempDir(), "state.json");
  let attempts = 0;

  replaceFileAtomically(target, "{}\n", {
    retryMs: 1,
    renameImpl: (from, to) => {
      attempts += 1;
      if (attempts < 3) {
        throw Object.assign(new Error("locked"), { code: "EPERM" });
      }
      fs.renameSync(from, to);
    }
  });

  assert.equal(attempts, 3);
  assert.equal(fs.readFileSync(target, "utf8"), "{}\n");
});

// Cancel writes over a record its own run may be finishing at that moment. The condition
// travels with the write so the loser leaves the winner's file alone — and leaves nothing
// of its own behind either.
test("a guarded replace leaves the file alone when the record settles first", () => {
  const target = path.join(makeTempDir(), "job.json");
  fs.writeFileSync(target, "completed\n", "utf8");

  assert.equal(replaceFileAtomically(target, "cancelled\n", { guard: () => false }), false);
  assert.equal(fs.readFileSync(target, "utf8"), "completed\n");
  assert.deepEqual(
    fs.readdirSync(path.dirname(target)).filter((entry) => entry.endsWith(".tmp")),
    []
  );
});

// Half a replacement is left on disk by every exit that is not the swap, and a condition
// that throws is one of them.
test("a replace that ends in an error leaves no half of itself behind", () => {
  const target = path.join(makeTempDir(), "job.json");
  fs.writeFileSync(target, "old\n", "utf8");

  assert.throws(
    () =>
      replaceFileAtomically(target, "new\n", {
        guard: () => {
          throw new Error("boom");
        }
      }),
    /boom/
  );
  assert.equal(fs.readFileSync(target, "utf8"), "old\n");
  assert.deepEqual(
    fs.readdirSync(path.dirname(target)).filter((entry) => entry.endsWith(".tmp")),
    []
  );
});

// Waiting is only right for the collision it was written for. Anything else is reported at
// once, because retrying it would only delay the same answer.
test("replacing a file gives up on a target that never frees up, and never retries the rest", () => {
  const target = path.join(makeTempDir(), "state.json");
  let attempts = 0;
  const failWith = (code) => () => {
    attempts += 1;
    throw Object.assign(new Error(code), { code });
  };

  assert.throws(() => replaceFileAtomically(target, "{}\n", { attempts: 3, retryMs: 1, renameImpl: failWith("EPERM") }), /EPERM/);
  assert.equal(attempts, 3);
  // A replacement that never happened must leave no half of itself behind.
  assert.deepEqual(
    fs.readdirSync(path.dirname(target)).filter((entry) => entry.endsWith(".tmp")),
    []
  );

  attempts = 0;
  assert.throws(() => replaceFileAtomically(target, "{}\n", { attempts: 3, retryMs: 1, renameImpl: failWith("ENOSPC") }), /ENOSPC/);
  assert.equal(attempts, 1);
});

// The state file is not a place a preference can be read from, so a job write cannot carry
// one and cannot erase one. Reading it as a fallback is what would make that untrue: the
// value would be readable only until the next job write dropped it.
test("a preference recorded before preferences had a file survives a job write", () => withoutPluginData(() => {
  const workspace = makeTempDir();
  ensureStateDir(workspace);
  fs.writeFileSync(
    resolveStateFile(workspace),
    JSON.stringify({ version: 1, revision: 1, config: { stopReviewGate: true }, jobs: [] }),
    "utf8"
  );

  assert.equal(getConfig(workspace).stopReviewGate, true);

  // The write that would drop it: a job list rewritten by a run that knows nothing about it.
  saveState(workspace, { jobs: [{ id: "job-1", status: "running", updatedAt: "2026-01-01T00:00:00.000Z" }] });
  assert.equal(getConfig(workspace).stopReviewGate, true);

  // Recording a preference moves it into its own file, and that file then answers first.
  setConfig(workspace, "stopReviewGate", false);
  assert.equal(getConfig(workspace).stopReviewGate, false);
  assert.equal(JSON.parse(fs.readFileSync(resolveStateFile(workspace), "utf8")).config.stopReviewGate, true);
}));

// A preference that has its own file is answered from it even when that file cannot be read.
// Falling back to the value it replaced would hand back a setting the user already changed.
test("an unreadable preference file does not revive the value it replaced", () => withoutPluginData(() => {
  const workspace = makeTempDir();
  ensureStateDir(workspace);
  fs.writeFileSync(
    resolveStateFile(workspace),
    JSON.stringify({ version: 1, revision: 1, config: { stopReviewGate: true }, jobs: [] }),
    "utf8"
  );
  setConfig(workspace, "stopReviewGate", false);
  fs.writeFileSync(path.join(resolveStateDir(workspace), "config.json"), "{ not json", "utf8");

  assert.equal(getConfig(workspace).stopReviewGate, false);
}));

// Carrying a value forward is presence, not truthiness: a preference deliberately recorded as
// off is exactly the one a truthiness test would drop.
test("a falsy preference left by an older version is carried forward as it stands", () => withoutPluginData(() => {
  for (const value of [null, false, 0, ""]) {
    const workspace = makeTempDir();
    ensureStateDir(workspace);
    fs.writeFileSync(
      resolveStateFile(workspace),
      JSON.stringify({ version: 1, revision: 1, config: value, jobs: [] }),
      "utf8"
    );

    saveState(workspace, { jobs: [{ id: "job-1", status: "running", updatedAt: "2026-01-01T00:00:00.000Z" }] });

    assert.deepEqual(JSON.parse(fs.readFileSync(resolveStateFile(workspace), "utf8")).config, value);
  }
}));
