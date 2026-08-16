// Reading side of the job store. Every function here answers a question a *different*
// process asks about a run it does not own — what is happening, what came out, what can
// still be stopped — so nothing here creates or modifies a job.

import fs from "node:fs";
import process from "node:process";

import { getConfig, isActiveJobStatus, listJobIds, listJobs, readJobFile, resolveJobFile } from "./state.mjs";
import { SESSION_ID_ENV } from "./tracked-jobs.mjs";
import { resolveWorkspaceRoot } from "./workspace.mjs";

export const DEFAULT_MAX_STATUS_JOBS = 8;
export const DEFAULT_MAX_PROGRESS_LINES = 4;

// An explicit environment replaces the ambient one rather than merely adding to it, so a
// caller asking about a specific session cannot be answered about a different one.
// `allSessions` is for the one question that is not about "my" jobs: whether a Claude session
// is already being driven. A run started from another Codex session holds it just as firmly.
function getCurrentSessionId(options = {}) {
  if (options.allSessions) {
    return null;
  }
  return (options.env ?? process.env)[SESSION_ID_ENV] ?? null;
}

// Without a session identifier every job in the workspace is in scope. That is the same
// fallback upstream takes when its hook has not exported one.
function filterJobsForCurrentSession(jobs, options = {}) {
  const sessionId = getCurrentSessionId(options);
  if (!sessionId) {
    return jobs;
  }
  return jobs.filter((job) => job.sessionId === sessionId);
}

// The prefix is matched as a timestamp, not as a leading bracket. A report can quote a
// line of its own such as `[error] permission denied`, and logs written before block
// bodies were indented still hold such lines.
const PROGRESS_LINE = /^\[\d{4}-\d{2}-\d{2}T[0-9:.]+Z\]\s+(.*)$/;

// A block heading ends the progress: the runtime writes one only for the final output, so
// nothing after it is progress, and a body written before bodies were indented cannot be
// mistaken for one. A future progress event that emits a block would need this to track the
// block's extent instead of stopping at it.
const BLOCK_HEADING = /^=== .* \(.*\) ===$/;

export function readJobProgressPreview(logFile, maxLines = DEFAULT_MAX_PROGRESS_LINES) {
  if (!logFile || !fs.existsSync(logFile)) {
    return [];
  }

  const lines = [];
  for (const raw of fs.readFileSync(logFile, "utf8").split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (BLOCK_HEADING.test(line)) {
      break;
    }
    const progress = PROGRESS_LINE.exec(line)?.[1]?.trim();
    if (progress) {
      lines.push(progress);
    }
  }

  return lines.slice(-maxLines);
}

function formatElapsedDuration(startValue, endValue = null) {
  const start = Date.parse(startValue ?? "");
  if (!Number.isFinite(start)) {
    return null;
  }

  const end = endValue ? Date.parse(endValue) : Date.now();
  if (!Number.isFinite(end) || end < start) {
    return null;
  }

  const totalSeconds = Math.max(0, Math.round((end - start) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

// An outcome is recorded by the job's own worker, by `cancel` on its behalf, or by the
// process that queued the job when it could not start a worker at all. A worker that died
// without any of those leaves the record wherever it stood. Signal 0 delivers
// nothing and only reports whether the pid resolves: `ESRCH` is the one answer that means
// gone, while `EPERM` means a process is there and simply out of reach. Nothing is
// concluded from a pid that still resolves, because the operating system may have handed
// the number to something unrelated — and nothing is concluded from a job that has no pid
// recorded yet, because not having started is not the same as having died.
export function isWorkerMissing(job, options = {}) {
  if (!isActiveJobStatus(job.status)) {
    return false;
  }
  const pid = Number(job.pid);
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  const killImpl = options.killImpl ?? process.kill.bind(process);
  try {
    killImpl(pid, 0);
    return false;
  } catch (error) {
    return error?.code === "ESRCH";
  }
}

// The record and the probe cannot be read at one instant, so their order decides what a
// disagreement between them means. The record comes first — it is where the pid comes
// from — which lets it say `running` about a worker that has since written its outcome and
// exited, and that pair reads as a job nobody will finish when nothing was lost at all.
// Reading the record again after the probe settles it: a pid that has stopped resolving
// made every write it will ever make before the probe, so a record still active in that
// later read is one no worker is coming back to.
function workerIsGone(workspaceRoot, job, options) {
  if (!isWorkerMissing(job, options)) {
    return false;
  }
  const settled = readStoredJob(workspaceRoot, job.id);
  return !settled || isActiveJobStatus(settled.status);
}

// Only the verdict is settled, never the job: callers group jobs by status before they get
// here, and handing back a record that finished mid-check would file it under the group it
// no longer belongs to. A stale `running` costs one more poll; the wrong group is printed.
export function enrichJob(workspaceRoot, job, options = {}) {
  const maxProgressLines = options.maxProgressLines ?? DEFAULT_MAX_PROGRESS_LINES;
  const active = isActiveJobStatus(job.status);
  return {
    ...job,
    progressPreview: active || job.status === "failed" ? readJobProgressPreview(job.logFile, maxProgressLines) : [],
    elapsed: formatElapsedDuration(job.startedAt ?? job.createdAt, job.completedAt ?? null),
    duration: active ? null : formatElapsedDuration(job.startedAt ?? job.createdAt, job.completedAt ?? job.updatedAt),
    workerMissing: workerIsGone(workspaceRoot, job, options)
  };
}

export function readStoredJob(workspaceRoot, jobId) {
  const jobFile = resolveJobFile(workspaceRoot, jobId);
  if (!fs.existsSync(jobFile)) {
    return null;
  }
  return readJobFile(jobFile);
}

function matchJobReference(jobs, reference) {
  if (!reference) {
    return jobs[0] ?? null;
  }

  const exact = jobs.find((job) => job.id === reference);
  if (exact) {
    return exact;
  }

  const prefixMatches = jobs.filter((job) => job.id.startsWith(reference));
  if (prefixMatches.length === 1) {
    return prefixMatches[0];
  }
  if (prefixMatches.length > 1) {
    throw new Error(`Job reference "${reference}" is ambiguous. Use a longer job id.`);
  }

  throw new Error(`No job found for "${reference}". Run /claude-status to list known jobs.`);
}

export function buildStatusSnapshot(cwd, options = {}) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const jobs = filterJobsForCurrentSession(loadAuthoritativeJobs(workspaceRoot), options);
  const maxJobs = options.maxJobs ?? DEFAULT_MAX_STATUS_JOBS;
  const maxProgressLines = options.maxProgressLines ?? DEFAULT_MAX_PROGRESS_LINES;
  const enrich = (job) => enrichJob(workspaceRoot, job, { maxProgressLines, killImpl: options.killImpl });
  const finished = jobs.filter((job) => !isActiveJobStatus(job.status));

  return {
    workspaceRoot,
    config: getConfig(workspaceRoot),
    active: jobs.filter((job) => isActiveJobStatus(job.status)).map(enrich),
    finished: (options.all ? finished : finished.slice(0, maxJobs)).map(enrich)
  };
}

// Every command starts from this list, so none of them can reach a different conclusion
// about the same job. Which jobs exist comes from the listing and the jobs directory
// together, so a listing write lost to a concurrent one cannot put a job's result beyond
// reach. Ordering comes from the files too: a job the listing has stale would otherwise
// sort by the moment that stale row was written rather than by when it finished, and "the
// most recent finished job" would name the wrong one.
function jobSortKey(job) {
  return String(job.completedAt ?? job.updatedAt ?? job.startedAt ?? job.createdAt ?? "");
}

function loadAuthoritativeJobs(workspaceRoot) {
  const listed = new Map(listJobs(workspaceRoot).map((job) => [job.id, job]));
  return listJobIds(workspaceRoot)
    .map((id) => readAuthoritativeJob(workspaceRoot, listed.get(id) ?? { id }))
    .sort((left, right) => jobSortKey(right).localeCompare(jobSortKey(left)));
}

// The listing is a projection and can lose a write, while a job's own file is written by
// the run itself — and, once that run has been terminated, by `cancel` on its behalf. So
// the file decides a job's outcome, or two commands could answer the same question
// differently from the same stale listing.
//
// The pid is the exception, because it is not an outcome: the process that queues a job
// writes it to the listing and the worker writes it to the file, at different moments.
// While a job is active either may hold the only copy, so whichever exists wins; once it
// has finished, the file has deliberately cleared it and that clearing is the answer.
function readAuthoritativeJob(workspaceRoot, indexJob) {
  return mergeAuthoritativeJob(indexJob, readStoredJob(workspaceRoot, indexJob.id));
}

// Presence, not truthiness, decides each field: a record that ended without an error says
// so by writing `errorMessage: null`, and treating that as "no value" would resurrect the
// error a cancellation had left in the listing and print it over a finished run.
function takeStored(stored, indexJob, field) {
  return Object.hasOwn(stored, field) ? stored[field] : indexJob[field];
}

function mergeAuthoritativeJob(indexJob, stored) {
  if (!stored) {
    return indexJob;
  }

  // The file is the base and the listing overlays it, so a job whose listing entry was lost
  // still arrives with everything the file knows — its log path above all, which is where a
  // run's findings are when writing the record itself failed. The request and the report
  // stay out: a snapshot describes a job, it does not carry its payload.
  const { request, result, rendered, ...storedFields } = stored;
  const status = takeStored(stored, indexJob, "status");
  return {
    ...storedFields,
    ...indexJob,
    status,
    // Phase is the listing's while a run is active: progress updates write only there, so
    // that a job file write can never put a stale phase back over a decided outcome.
    phase: isActiveJobStatus(status) ? indexJob.phase ?? stored.phase : takeStored(stored, indexJob, "phase"),
    // The pid is the one field where the listing can be ahead: it is written there first,
    // before the worker has recorded its own. That only holds while a job is active.
    pid: isActiveJobStatus(status) ? stored.pid ?? indexJob.pid : stored.pid ?? null,
    startedAt: takeStored(stored, indexJob, "startedAt"),
    completedAt: takeStored(stored, indexJob, "completedAt"),
    // A finished record is the whole account of how it ended, so an absent error means
    // there was none — including in files written before that was recorded explicitly.
    errorMessage: isActiveJobStatus(status) ? takeStored(stored, indexJob, "errorMessage") : stored.errorMessage ?? null
  };
}

export function buildSingleJobSnapshot(cwd, reference, options = {}) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const selected = matchJobReference(loadAuthoritativeJobs(workspaceRoot), reference);
  if (!selected) {
    throw new Error(`No job found for "${reference}". Run /claude-status to inspect known jobs.`);
  }

  return {
    workspaceRoot,
    job: enrichJob(workspaceRoot, selected, {
      maxProgressLines: options.maxProgressLines,
      killImpl: options.killImpl
    })
  };
}

// One read decides both halves of what `/claude-result` prints. Reading again for the
// stored payload would let the header come from one moment and the report from another,
// which is how a record could be headed `cancelled` above a finished review's findings.
function decideResult(workspaceRoot, indexJob, options) {
  const storedJob = readStoredJob(workspaceRoot, indexJob.id);
  const job = mergeAuthoritativeJob(indexJob, storedJob);
  if (isActiveJobStatus(job.status)) {
    throw new Error(describeUnfinishedJob(job, workerIsGone(workspaceRoot, job, options)));
  }
  return { workspaceRoot, job, storedJob };
}

// Telling someone to wait is only useful while something is still running, so the two
// reasons a job has no result are kept apart rather than both reading as "not yet".
function describeUnfinishedJob(job, workerMissing) {
  return workerMissing
    ? `Job ${job.id} is recorded as ${job.status}, but no process is running under its recorded pid ${job.pid}, so no result will arrive. Clear it with /claude-cancel ${job.id}, then rerun it.`
    : `Job ${job.id} is still ${job.status}. Check /claude-status and try again once it finishes.`;
}

// A named job is looked up among all of them and only then judged, so a job that exists
// but is in the wrong state is reported as that, never as an unknown id. Without a name
// the caller means "mine", which is narrower than the workspace only when a session id is
// available.
export function resolveResultJob(cwd, reference, options = {}) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const allJobs = loadAuthoritativeJobs(workspaceRoot);

  if (reference) {
    return decideResult(workspaceRoot, matchJobReference(allJobs, reference), options);
  }

  // "The most recent finished job" has to be decided from the files too, or a job the
  // listing still calls active would be skipped over while `/claude-status` shows it
  // finished, and an older job would be printed as the latest instead.
  const jobs = filterJobsForCurrentSession(allJobs, options);
  const finished = jobs.find((job) => !isActiveJobStatus(job.status));
  if (finished) {
    return decideResult(workspaceRoot, finished, options);
  }

  const active = jobs.find((job) => isActiveJobStatus(job.status));
  if (active) {
    throw new Error(describeUnfinishedJob(active, workerIsGone(workspaceRoot, active, options)));
  }

  throw new Error("No finished Claude jobs found for this repository yet.");
}

// A job with no worker on record is still cancellable, because refusing would leave a
// record no command can clear. What it cannot do is stop anything, and the report says so
// rather than claiming a kill: `cancel` first waits for a pid to appear, and a worker that
// records one after that wait has already been let through.
function ensureCancelable(job) {
  if (!isActiveJobStatus(job.status)) {
    throw new Error(`Job ${job.id} already finished as ${job.status}, so there is nothing to cancel.`);
  }
  return job;
}

export function resolveCancelableJob(cwd, reference, options = {}) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const allJobs = loadAuthoritativeJobs(workspaceRoot);

  if (reference) {
    return {
      workspaceRoot,
      job: ensureCancelable(matchJobReference(allJobs, reference))
    };
  }

  // How many are active is itself a question the files answer, or "more than one is active"
  // could be said about a set the listing has stale — including one `/claude-status` has
  // already stopped showing as active.
  const activeJobs = filterJobsForCurrentSession(allJobs, options).filter((job) => isActiveJobStatus(job.status));
  if (activeJobs.length === 1) {
    return { workspaceRoot, job: ensureCancelable(activeJobs[0]) };
  }
  if (activeJobs.length > 1) {
    throw new Error("More than one Claude job is active. Pass a job id to /claude-cancel.");
  }

  throw new Error("No active Claude jobs to cancel.");
}
