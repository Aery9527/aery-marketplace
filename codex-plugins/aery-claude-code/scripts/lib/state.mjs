import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolveWorkspaceRoot } from "./workspace.mjs";

const STATE_VERSION = 1;
const PLUGIN_DATA_ENV_VARS = ["PLUGIN_DATA", "CLAUDE_PLUGIN_DATA"];
const FALLBACK_STATE_ROOT_DIR = path.join(os.tmpdir(), "claude-companion");
const STATE_FILE_NAME = "state.json";
const CONFIG_FILE_NAME = "config.json";
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
    jobs: []
  };
}

function defaultConfig() {
  return {
    stopReviewGate: false
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
      // Carried under its own name so nothing here can mistake it for a live setting: it is
      // only ever read from and written back, never updated. Presence is what is preserved,
      // so a value that is merely falsy is still carried. See `getConfig`.
      ...(Object.hasOwn(parsed, "config") ? { legacyConfig: parsed.config } : {}),
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

// Windows refuses to replace a file another process has open, and every command here reads
// these files while runs write them, so the collision is ordinary rather than exceptional.
// It is also brief — it lasts as long as one read — so the replace is retried instead of
// being reported as a write that failed. Sleeping is synchronous because these writes are.
const RENAME_ATTEMPTS = 10;
const RENAME_RETRY_MS = 20;
const RETRYABLE_RENAME_CODES = new Set(["EPERM", "EACCES", "EBUSY"]);

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function replaceFileAtomically(targetFile, contents, options = {}) {
  const renameImpl = options.renameImpl ?? fs.renameSync;
  const attempts = options.attempts ?? RENAME_ATTEMPTS;
  const tempFile = `${targetFile}.${process.pid}.tmp`;
  let swapped = false;

  // Every way out of here that is not the swap itself leaves half a replacement on disk —
  // a refused condition, a condition that threw, a write that failed part-way, a rename that
  // never succeeded. One exit path removes it for all of them.
  try {
    fs.writeFileSync(tempFile, contents, "utf8");

    for (let attempt = 1; ; attempt += 1) {
      // A caller writing over a record another process may be finishing states the condition
      // here rather than checking it before calling. Checked from inside, the condition and
      // the swap are one syscall apart instead of a read, a build and a write apart. That is
      // a narrower window, not no window: nothing across processes is held between the two,
      // so a record that settles inside it is still written over.
      if (options.guard && !options.guard()) {
        return false;
      }
      try {
        renameImpl(tempFile, targetFile);
        swapped = true;
        return true;
      } catch (error) {
        if (attempt >= attempts || !RETRYABLE_RENAME_CODES.has(error?.code)) {
          throw error;
        }
        sleepSync(options.retryMs ?? RENAME_RETRY_MS);
      }
    }
  } finally {
    if (!swapped) {
      fs.rmSync(tempFile, { force: true });
    }
  }
}

// The file is replaced rather than rewritten in place, so a reader always sees one whole
// state: a partial read would parse as corrupt and be answered with an empty job list.
function replaceStateFile(stateFile, state) {
  replaceFileAtomically(stateFile, `${JSON.stringify(state, null, 2)}\n`);
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
    // Preferences are no longer part of this file. One left here by an older version is
    // copied straight back from what is on disk — never from the caller — so a job write
    // neither carries a setting of its own nor drops one it found.
    ...(Object.hasOwn(previous, "legacyConfig") ? { config: previous.legacyConfig } : {}),
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
// but before the replace is still lost. What that loses is a listing entry; a job's own
// file is removed only when the writer's own list dropped it, which the cap does to
// finished jobs. The exception is a job the listing calls finished while its run is not —
// see the cancel race in UPSTREAM-PARITY.md — where retention can take a report the run
// wrote afterwards, and the listing holds no copy of one to fall back on.
export function updateState(cwd, mutate, options = {}) {
  for (let attempt = 1; attempt <= MAX_STATE_WRITE_ATTEMPTS; attempt += 1) {
    const state = loadState(cwd);
    mutate(state);
    const saved = saveState(cwd, state, { ...options, expectedRevision: state.revision });
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

// The listing is a convenience, not the register of what exists: a lost write there would
// otherwise put a job's own file out of reach of every command, results included. So the
// jobs directory is enumerated as well, and an id found in either place counts.
export function listJobIds(cwd) {
  const ids = new Set(listJobs(cwd).map((job) => job.id));
  const jobsDir = resolveJobsDir(cwd);
  if (fs.existsSync(jobsDir)) {
    for (const entry of fs.readdirSync(jobsDir)) {
      if (entry.endsWith(".json")) {
        ids.add(entry.slice(0, -".json".length));
      }
    }
  }
  return [...ids];
}

// Preferences live in their own file. Sharing one with the job list meant every job write
// carried the settings it had read along with it, and a write built before a preference was
// recorded put the old value back — narrowing that window never closed it, because the read
// and the replace cannot be made one step. Separate files cannot collide at all, and this
// one is the only place a preference is ever read from or written to.
function resolveConfigFile(cwd) {
  return path.join(resolveStateDir(cwd), CONFIG_FILE_NAME);
}

// Preferences were kept in the job listing before they had a file, and that version was
// published on this repository's branch, so a workspace configured against it holds its
// setting there. That value is still read, and `saveState` carries it forward untouched, so
// a job write cannot drop a preference the user never withdrew. Nothing writes it any more:
// the next `/claude-setup` records the preference in its own file, which then answers first.
function readLegacyConfig(cwd) {
  const legacy = loadState(cwd).legacyConfig;
  return legacy && typeof legacy === "object" ? legacy : null;
}

export function getConfig(cwd) {
  const configFile = resolveConfigFile(cwd);
  if (!fs.existsSync(configFile)) {
    return { ...defaultConfig(), ...(readLegacyConfig(cwd) ?? {}) };
  }
  try {
    return { ...defaultConfig(), ...JSON.parse(fs.readFileSync(configFile, "utf8")) };
  } catch {
    // The preference was recorded here and this file is now unreadable. Falling back to the
    // value it replaced would answer with a setting the user already changed.
    return defaultConfig();
  }
}

export function setConfig(cwd, key, value) {
  ensureStateDir(cwd);
  const next = { ...getConfig(cwd), [key]: value };
  replaceFileAtomically(resolveConfigFile(cwd), `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

// Replaced rather than rewritten, for the same reason the state file is: this is the file
// a run's result lands in, and the process writing it can be terminated by `cancel` at any
// moment — including between the truncate and the write, which would leave every reader
// parsing half a job.
export function writeJobFile(cwd, jobId, payload, options = {}) {
  ensureStateDir(cwd);
  const jobFile = resolveJobFile(cwd, jobId);
  return replaceFileAtomically(jobFile, `${JSON.stringify(payload, null, 2)}\n`, options) ? jobFile : null;
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
