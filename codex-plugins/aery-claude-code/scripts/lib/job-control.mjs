// Reading side of the job store. Every function here answers a question a *different*
// process asks about a run it does not own — what is happening, what came out, what can
// still be stopped — so nothing here creates or modifies a job.

import fs from "node:fs";
import process from "node:process";

import { getConfig, isActiveJobStatus, listJobs, readJobFile, resolveJobFile } from "./state.mjs";
import { SESSION_ID_ENV } from "./tracked-jobs.mjs";
import { resolveWorkspaceRoot } from "./workspace.mjs";

export const DEFAULT_MAX_STATUS_JOBS = 8;
export const DEFAULT_MAX_PROGRESS_LINES = 4;

export function sortJobsNewestFirst(jobs) {
  return [...jobs].sort((left, right) => String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? "")));
}

// An explicit environment replaces the ambient one rather than merely adding to it, so a
// caller asking about a specific session cannot be answered about a different one.
function getCurrentSessionId(options = {}) {
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

function stripLogPrefix(line) {
  return line.replace(/^\[[^\]]+\]\s*/, "").trim();
}

// Only the timestamped lines are progress. A block — its heading as much as its body —
// is written without that prefix precisely so it cannot be mistaken for one.
export function readJobProgressPreview(logFile, maxLines = DEFAULT_MAX_PROGRESS_LINES) {
  if (!logFile || !fs.existsSync(logFile)) {
    return [];
  }

  const lines = fs
    .readFileSync(logFile, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.startsWith("["))
    .map(stripLogPrefix)
    .filter(Boolean);

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

export function enrichJob(job, options = {}) {
  const maxProgressLines = options.maxProgressLines ?? DEFAULT_MAX_PROGRESS_LINES;
  const active = isActiveJobStatus(job.status);
  return {
    ...job,
    progressPreview: active || job.status === "failed" ? readJobProgressPreview(job.logFile, maxProgressLines) : [],
    elapsed: formatElapsedDuration(job.startedAt ?? job.createdAt, job.completedAt ?? null),
    duration: active ? null : formatElapsedDuration(job.startedAt ?? job.createdAt, job.completedAt ?? job.updatedAt),
    workerMissing: isWorkerMissing(job, options)
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
  const jobs = sortJobsNewestFirst(filterJobsForCurrentSession(listJobs(workspaceRoot), options));
  const maxJobs = options.maxJobs ?? DEFAULT_MAX_STATUS_JOBS;
  const maxProgressLines = options.maxProgressLines ?? DEFAULT_MAX_PROGRESS_LINES;
  const enrich = (job) => enrichJob(job, { maxProgressLines, killImpl: options.killImpl });

  // Only the rows the listing calls active can be stale in a way that matters — a finished
  // row is where its own file already put it — so those are the ones re-read from their
  // files, and the listing agrees with the single-job report without repairing anything.
  const resolved = jobs.map((job) => (isActiveJobStatus(job.status) ? readAuthoritativeJob(workspaceRoot, job) : job));
  const finished = resolved.filter((job) => !isActiveJobStatus(job.status));

  return {
    workspaceRoot,
    config: getConfig(workspaceRoot),
    active: resolved.filter((job) => isActiveJobStatus(job.status)).map(enrich),
    finished: (options.all ? finished : finished.slice(0, maxJobs)).map(enrich)
  };
}

// The listing is a projection and can lose a write; a job's own file has one writer at a
// time. So every command that judges one named job — is it finished, can it be cancelled,
// what did it record — lets that file decide its outcome, or the three would answer the
// same question differently from the same stale listing.
//
// The pid is the exception, because it is not an outcome: the process that queues a job
// writes it to the listing and the worker writes it to the file, at different moments.
// While a job is active either may hold the only copy, so whichever exists wins; once it
// has finished, the file has deliberately cleared it and that clearing is the answer.
function readAuthoritativeJob(workspaceRoot, indexJob) {
  const stored = readStoredJob(workspaceRoot, indexJob.id);
  if (!stored) {
    return indexJob;
  }

  const status = stored.status ?? indexJob.status;
  return {
    ...indexJob,
    status,
    phase: stored.phase ?? indexJob.phase,
    pid: isActiveJobStatus(status) ? stored.pid ?? indexJob.pid : stored.pid ?? null,
    startedAt: stored.startedAt ?? indexJob.startedAt,
    completedAt: stored.completedAt ?? indexJob.completedAt,
    errorMessage: stored.errorMessage ?? indexJob.errorMessage
  };
}

export function buildSingleJobSnapshot(cwd, reference, options = {}) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const selected = matchJobReference(sortJobsNewestFirst(listJobs(workspaceRoot)), reference);
  if (!selected) {
    throw new Error(`No job found for "${reference}". Run /claude-status to inspect known jobs.`);
  }

  return {
    workspaceRoot,
    job: enrichJob(readAuthoritativeJob(workspaceRoot, selected), {
      maxProgressLines: options.maxProgressLines,
      killImpl: options.killImpl
    })
  };
}

// Telling someone to wait is only useful while something is still running, so the two
// reasons a job has no result are kept apart rather than both reading as "not yet".
function describeUnfinishedJob(job, options = {}) {
  return isWorkerMissing(job, options)
    ? `Job ${job.id} is recorded as ${job.status}, but no process is running under its recorded pid ${job.pid}, so no result will arrive. Clear it with /claude-cancel ${job.id}, then rerun it.`
    : `Job ${job.id} is still ${job.status}. Check /claude-status and try again once it finishes.`;
}

// A named job is looked up among all of them and only then judged, so a job that exists
// but is in the wrong state is reported as that, never as an unknown id. Without a name
// the caller means "mine", which is narrower than the workspace only when a session id is
// available.
export function resolveResultJob(cwd, reference, options = {}) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const allJobs = sortJobsNewestFirst(listJobs(workspaceRoot));

  if (reference) {
    const job = readAuthoritativeJob(workspaceRoot, matchJobReference(allJobs, reference));
    if (isActiveJobStatus(job.status)) {
      throw new Error(describeUnfinishedJob(job, options));
    }
    return { workspaceRoot, job };
  }

  const jobs = filterJobsForCurrentSession(allJobs, options);
  const finished = jobs.find((job) => !isActiveJobStatus(job.status));
  if (finished) {
    return { workspaceRoot, job: finished };
  }

  const active = jobs.find((job) => isActiveJobStatus(job.status));
  if (active) {
    throw new Error(describeUnfinishedJob(active, options));
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
  const allJobs = sortJobsNewestFirst(listJobs(workspaceRoot));

  if (reference) {
    return {
      workspaceRoot,
      job: ensureCancelable(readAuthoritativeJob(workspaceRoot, matchJobReference(allJobs, reference)))
    };
  }

  const activeJobs = filterJobsForCurrentSession(allJobs, options).filter((job) => isActiveJobStatus(job.status));
  if (activeJobs.length === 1) {
    return { workspaceRoot, job: ensureCancelable(readAuthoritativeJob(workspaceRoot, activeJobs[0])) };
  }
  if (activeJobs.length > 1) {
    throw new Error("More than one Claude job is active. Pass a job id to /claude-cancel.");
  }

  throw new Error("No active Claude jobs to cancel.");
}
