import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolveWorkspaceRoot } from "./workspace.mjs";

const STATE_VERSION = 1;
const PLUGIN_DATA_ENV_VARS = ["PLUGIN_DATA", "CLAUDE_PLUGIN_DATA"];
const FALLBACK_STATE_ROOT_DIR = path.join(os.tmpdir(), "claude-companion");
const STATE_FILE_NAME = "state.json";
const JOBS_DIR_NAME = "jobs";
const MAX_JOBS = 50;

// What counts as "still going" is decided once, here, because both the reading side and
// the pruning rule depend on it meaning the same thing.
const ACTIVE_JOB_STATUSES = new Set(["queued", "running"]);

export function isActiveJobStatus(status) {
  return ACTIVE_JOB_STATUSES.has(status);
}

function nowIso() {
  return new Date().toISOString();
}

// Bumped by every write. A writer that started from an older revision knows another
// process changed the file while it was working, and can start over instead of writing
// its stale copy over the change.
const MAX_STATE_WRITE_ATTEMPTS = 5;

function defaultState() {
  return {
    version: STATE_VERSION,
    revision: 0,
    config: {
      stopReviewGate: false
    },
    jobs: []
  };
}

export function resolveStateDir(cwd) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  let canonicalWorkspaceRoot = workspaceRoot;
  try {
    canonicalWorkspaceRoot = fs.realpathSync.native(workspaceRoot);
  } catch {
    canonicalWorkspaceRoot = workspaceRoot;
  }

  const slugSource = path.basename(workspaceRoot) || "workspace";
  const slug = slugSource.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "workspace";
  const hash = createHash("sha256").update(canonicalWorkspaceRoot).digest("hex").slice(0, 16);
  const pluginDataDir = PLUGIN_DATA_ENV_VARS.map((name) => process.env[name]).find(Boolean);
  const stateRoot = pluginDataDir ? path.join(pluginDataDir, "state") : FALLBACK_STATE_ROOT_DIR;
  return path.join(stateRoot, `${slug}-${hash}`);
}

export function resolveStateFile(cwd) {
  return path.join(resolveStateDir(cwd), STATE_FILE_NAME);
}

export function resolveJobsDir(cwd) {
  return path.join(resolveStateDir(cwd), JOBS_DIR_NAME);
}

export function ensureStateDir(cwd) {
  fs.mkdirSync(resolveJobsDir(cwd), { recursive: true });
}

export function loadState(cwd) {
  const stateFile = resolveStateFile(cwd);
  if (!fs.existsSync(stateFile)) {
    return defaultState();
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    return {
      ...defaultState(),
      ...parsed,
      revision: Number.isInteger(parsed.revision) ? parsed.revision : 0,
      config: {
        ...defaultState().config,
        ...(parsed.config ?? {})
      },
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs : []
    };
  } catch {
    return defaultState();
  }
}

// The cap bounds history, and a job that has not finished is not history yet. Dropping an
// active one would also delete the files of a run still writing to them, so only finished
// jobs are ever counted against the cap.
function pruneJobs(jobs) {
  const newestFirst = [...jobs].sort((left, right) =>
    String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? ""))
  );
  const active = newestFirst.filter((job) => ACTIVE_JOB_STATUSES.has(job.status));
  const finished = newestFirst.filter((job) => !ACTIVE_JOB_STATUSES.has(job.status));
  return [...active, ...finished.slice(0, MAX_JOBS)].sort((left, right) =>
    String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? ""))
  );
}

function removeFileIfExists(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

// The file is replaced rather than rewritten in place, so a reader always sees one whole
// state: a partial read would parse as corrupt and be answered with an empty job list.
function replaceStateFile(stateFile, state) {
  const tempFile = `${stateFile}.${process.pid}.tmp`;
  fs.writeFileSync(tempFile, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  fs.renameSync(tempFile, stateFile);
}

// `expectedRevision` makes this a conditional write: the caller states which version of
// the file it built its state from, and the write is abandoned — returning null — if the
// file has moved on since. The check covers the caller's whole read-modify-write, but not
// what follows it here: the artifact cleanup and the replace still run unguarded.
export function saveState(cwd, state, options = {}) {
  ensureStateDir(cwd);
  const requestedJobs = state.jobs ?? [];
  const nextJobs = pruneJobs(requestedJobs);
  const previous = loadState(cwd);
  if (options.expectedRevision != null && previous.revision !== options.expectedRevision) {
    return null;
  }

  const nextState = {
    version: STATE_VERSION,
    // Counted from what is on disk, never from the caller's copy: a caller that built its
    // state by hand would otherwise reset the counter and hide a concurrent write.
    revision: previous.revision + 1,
    config: {
      ...defaultState().config,
      ...(state.config ?? {})
    },
    jobs: nextJobs
  };

  // Only jobs this writer itself dropped are cleaned up. Deleting on the strength of what
  // is on disk instead would let a writer working from a stale list delete the files of a
  // job another process had just added — a result, not merely a listing entry.
  const retainedIds = new Set(nextJobs.map((job) => job.id));
  for (const job of requestedJobs) {
    if (retainedIds.has(job.id)) {
      continue;
    }
    removeJobFile(resolveJobFile(cwd, job.id));
    removeFileIfExists(job.logFile);
  }

  replaceStateFile(resolveStateFile(cwd), nextState);
  return nextState;
}

// A background worker updates its job while the user runs other commands, so two processes
// do read-modify-write on this file. A write that would land on top of another one is
// abandoned and the whole cycle restarts, which turns the losing writer into a retry
// rather than a silent overwrite. This is not a lock: a write that arrives after the check
// but before the replace is still lost. What can be lost is a listing entry — a job's own
// file and log are never removed on the strength of another writer's list.
export function updateState(cwd, mutate) {
  for (let attempt = 1; attempt <= MAX_STATE_WRITE_ATTEMPTS; attempt += 1) {
    const state = loadState(cwd);
    mutate(state);
    const saved = saveState(cwd, state, { expectedRevision: state.revision });
    if (saved) {
      return saved;
    }
  }

  throw new Error(
    `Another process kept changing the job state while this command was updating it (${MAX_STATE_WRITE_ATTEMPTS} attempts). Nothing was written.`
  );
}

export function generateJobId(prefix = "job") {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

export function upsertJob(cwd, jobPatch) {
  return updateState(cwd, (state) => {
    const timestamp = nowIso();
    const existingIndex = state.jobs.findIndex((job) => job.id === jobPatch.id);
    if (existingIndex === -1) {
      state.jobs.unshift({
        createdAt: timestamp,
        updatedAt: timestamp,
        ...jobPatch
      });
      return;
    }
    state.jobs[existingIndex] = {
      ...state.jobs[existingIndex],
      ...jobPatch,
      updatedAt: timestamp
    };
  });
}

export function listJobs(cwd) {
  return loadState(cwd).jobs;
}

export function setConfig(cwd, key, value) {
  return updateState(cwd, (state) => {
    state.config = {
      ...state.config,
      [key]: value
    };
  });
}

export function getConfig(cwd) {
  return loadState(cwd).config;
}

export function writeJobFile(cwd, jobId, payload) {
  ensureStateDir(cwd);
  const jobFile = resolveJobFile(cwd, jobId);
  fs.writeFileSync(jobFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return jobFile;
}

export function readJobFile(jobFile) {
  return JSON.parse(fs.readFileSync(jobFile, "utf8"));
}

function removeJobFile(jobFile) {
  if (fs.existsSync(jobFile)) {
    fs.unlinkSync(jobFile);
  }
}

// Resolving a path creates nothing. Every reader of a job goes through these, and a read
// that leaves directories behind would make "this command only reports" untrue.
export function resolveJobLogFile(cwd, jobId) {
  return path.join(resolveJobsDir(cwd), `${jobId}.log`);
}

export function resolveJobFile(cwd, jobId) {
  return path.join(resolveJobsDir(cwd), `${jobId}.json`);
}
