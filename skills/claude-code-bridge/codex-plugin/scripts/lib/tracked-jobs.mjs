// A job is what makes a run observable from outside the process that owns it. Upstream
// can ask its app server what a thread is doing; here the process holding the Claude
// session is the only one that can see the stream, so it writes what it sees to the job
// record and its log. Every other command reads those, and `cancel` writes the record too,
// once it has gone after the process holding it.

import fs from "node:fs";
import process from "node:process";

import {
  ensureStateDir,
  isActiveJobStatus,
  readJobFile,
  resolveJobFile,
  resolveJobLogFile,
  upsertJob,
  writeJobFile
} from "./state.mjs";

// Which session a job belongs to, so status and cancel can scope to the caller's own
// work. The bridge-specific value wins when a host hook supplies one; current Codex
// versions otherwise expose CODEX_THREAD_ID directly to the spawned command.
export const SESSION_ID_ENV = "CLAUDE_COMPANION_SESSION_ID";

export function nowIso() {
  return new Date().toISOString();
}

function normalizeProgressEvent(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return {
      message: String(value.message ?? "").trim(),
      phase: typeof value.phase === "string" && value.phase.trim() ? value.phase.trim() : null,
      sessionId: typeof value.sessionId === "string" && value.sessionId.trim() ? value.sessionId.trim() : null,
      logTitle: typeof value.logTitle === "string" && value.logTitle.trim() ? value.logTitle.trim() : null,
      logBody: value.logBody == null ? null : String(value.logBody).trimEnd()
    };
  }

  return {
    message: String(value ?? "").trim(),
    phase: null,
    sessionId: null,
    logTitle: null,
    logBody: null
  };
}

// A log holds two kinds of entry and only one of them is progress. The `[timestamp]`
// prefix is what tells them apart, and it is the contract with the progress reader in
// `job-control.mjs`, which strips it back off. A block carries multi-line output, so its
// heading is written without that prefix and its body is indented out of the way.
// Writing to the log never decides anything, so a log that cannot be written must not stop
// a caller from recording an outcome. Both writers here swallow their failures for that
// reason; creating the log in the first place does not, because that is setup.
function appendOrIgnore(logFile, text) {
  try {
    fs.appendFileSync(logFile, text, "utf8");
  } catch {
    // A locked or unwritable log costs a progress line, not a result.
  }
}

// The listing is a projection of the job files, and every command already reads the files
// to decide anything that matters. A run must therefore never end because its row could not
// be written — a job whose worker dies mid-update leaves no outcome anywhere, which is a
// worse answer than a listing that has fallen behind.
export function upsertOrIgnore(workspaceRoot, patch) {
  try {
    upsertJob(workspaceRoot, patch);
  } catch {
    // The job file still carries this, and that is the record every command trusts.
  }
}

// A broker endpoint describes only a live worker. Re-read that worker inside the guarded
// replacement so an already-observed cancellation or completion refuses the stale update.
// The guard narrows the cross-process window; it is not a filesystem compare-and-swap.
export function updateBrokerEndpointIfActive(workspaceRoot, jobId, expectedEndpoint, nextEndpoint) {
  const stored = readStoredJobOrNull(workspaceRoot, jobId);
  if (
    !stored ||
    !isActiveJobStatus(stored.status) ||
    stored.brokerEndpoint !== expectedEndpoint
  ) {
    return false;
  }

  const written = writeJobFile(
    workspaceRoot,
    jobId,
    { ...stored, brokerEndpoint: nextEndpoint },
    {
      guard: () => {
        const current = readStoredJobOrNull(workspaceRoot, jobId);
        return (
          Boolean(current) &&
          isActiveJobStatus(current.status) &&
          current.brokerEndpoint === expectedEndpoint
        );
      }
    }
  );
  if (!written) {
    return false;
  }
  upsertOrIgnore(workspaceRoot, { id: jobId, brokerEndpoint: nextEndpoint });
  return true;
}

export function appendLogLine(logFile, message) {
  const normalized = String(message ?? "").trim();
  if (!logFile || !normalized) {
    return;
  }
  appendOrIgnore(logFile, `[${nowIso()}] ${normalized}\n`);
}

export function appendLogBlock(logFile, title, body) {
  if (!logFile || !body) {
    return;
  }
  // Every body line is indented, because a block carries whatever the run produced and a
  // review can quote a line of its own that starts with `[`. Indenting is what keeps the
  // reader from taking one of those for a progress entry.
  const indented = String(body)
    .trimEnd()
    .split(/\r?\n/)
    .map((line) => `  ${line}`)
    .join("\n");
  appendOrIgnore(logFile, `\n=== ${title} (${nowIso()}) ===\n${indented}\n`);
}

export function createJobLogFile(workspaceRoot, jobId, title) {
  ensureStateDir(workspaceRoot);
  const logFile = resolveJobLogFile(workspaceRoot, jobId);
  fs.writeFileSync(logFile, "", "utf8");
  if (title) {
    appendLogLine(logFile, `Starting ${title}.`);
  }
  return logFile;
}

export function createJobRecord(base, options = {}) {
  const env = options.env ?? process.env;
  const sessionId = options.sessionIdEnv
    ? env[options.sessionIdEnv]
    : env[SESSION_ID_ENV] ?? env.CODEX_THREAD_ID;
  return {
    ...base,
    createdAt: nowIso(),
    ...(sessionId ? { sessionId } : {})
  };
}

// Only a change is written back. A review makes tool calls by the dozen and every one of
// them would otherwise rewrite the whole state file.
export function createJobProgressUpdater(workspaceRoot, jobId) {
  let lastPhase = null;
  let lastSessionId = null;

  return (event) => {
    const normalized = normalizeProgressEvent(event);
    const patch = { id: jobId };
    let changed = false;

    if (normalized.phase && normalized.phase !== lastPhase) {
      lastPhase = normalized.phase;
      patch.phase = normalized.phase;
      changed = true;
    }

    if (normalized.sessionId && normalized.sessionId !== lastSessionId) {
      lastSessionId = normalized.sessionId;
      patch.claudeSessionId = normalized.sessionId;
      changed = true;
    }

    if (!changed) {
      return;
    }

    // Only the listing is written. A job file write here would have to read first and
    // could put a stale record back over an outcome another process had just decided;
    // while a job is active its phase is read from the listing instead.
    upsertOrIgnore(workspaceRoot, patch);
  };
}

export function createProgressReporter({ logFile = null, onEvent = null } = {}) {
  if (!logFile && !onEvent) {
    return null;
  }

  return (eventOrMessage) => {
    const event = normalizeProgressEvent(eventOrMessage);
    appendLogLine(logFile, event.message);
    appendLogBlock(logFile, event.logTitle, event.logBody);
    onEvent?.(event);
  };
}

function readStoredJobOrNull(workspaceRoot, jobId) {
  const jobFile = resolveJobFile(workspaceRoot, jobId);
  if (!fs.existsSync(jobFile)) {
    return null;
  }
  return readJobFile(jobFile);
}

function jobOutcomeIsOpen(workspaceRoot, jobId) {
  const status = readStoredJobOrNull(workspaceRoot, jobId)?.status;
  return !status || isActiveJobStatus(status);
}

// The pid recorded here is what `cancel` terminates, so it must be the process that owns
// the Claude child rather than whichever process created the record.
export async function runTrackedJob(job, runner, options = {}) {
  const logFile = options.logFile ?? job.logFile ?? null;
  const runningRecord = {
    ...job,
    status: "running",
    startedAt: nowIso(),
    phase: "starting",
    pid: process.pid,
    logFile
  };
  // The request belongs to the job file alone. The index is rewritten on every progress
  // update, so carrying a second copy of the request through it would rewrite all of it
  // each time and leave two versions of the same fact.
  const { request, ...indexRecord } = runningRecord;
  writeJobFile(job.workspaceRoot, job.id, runningRecord);
  upsertOrIgnore(job.workspaceRoot, indexRecord);

  // Only the run itself is guarded here. Recording the outcome happens after, because a
  // failure to write it says nothing about how the run went — and marking a finished review
  // `failed` while keeping its findings would describe it as both at once.
  let execution;
  try {
    execution = await runner();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const existing = readStoredJobOrNull(job.workspaceRoot, job.id) ?? runningRecord;
    if (!jobOutcomeIsOpen(job.workspaceRoot, job.id)) {
      throw error;
    }
    const completedAt = nowIso();
    appendLogLine(logFile, `Failed: ${errorMessage}`);
    const written = writeJobFile(
      job.workspaceRoot,
      job.id,
      {
        ...existing,
        status: "failed",
        phase: "failed",
        errorMessage,
        pid: null,
        completedAt,
        logFile: logFile ?? existing.logFile ?? null
      },
      { guard: () => jobOutcomeIsOpen(job.workspaceRoot, job.id) }
    );
    if (!written) {
      throw error;
    }
    upsertOrIgnore(job.workspaceRoot, {
      id: job.id,
      status: "failed",
      phase: "failed",
      pid: null,
      errorMessage,
      completedAt
    });
    throw error;
  }

  const completionStatus = execution.failed ? "failed" : "completed";
  // The outcome says everything about how the run ended, `errorMessage` included. A run
  // that outlived a cancellation would otherwise finish carrying "Cancelled by user." from
  // the record that tried to stop it.
  const outcome = {
    status: completionStatus,
    claudeSessionId: execution.sessionId ?? null,
    phase: completionStatus === "completed" ? "done" : "failed",
    pid: null,
    completedAt: nowIso(),
    errorMessage: null
  };
  // The log is written first, and its writers swallow failure. It is a separate file and an
  // append rather than a replace, so a job file that cannot be written still leaves the
  // findings somewhere the status report points at.
  appendLogBlock(logFile, "Final output", execution.rendered);
  const written = writeJobFile(
    job.workspaceRoot,
    job.id,
    {
      ...runningRecord,
      ...outcome,
      result: execution.payload,
      rendered: execution.rendered
    },
    { guard: () => jobOutcomeIsOpen(job.workspaceRoot, job.id) }
  );
  if (!written) {
    return execution;
  }
  upsertOrIgnore(job.workspaceRoot, { id: job.id, ...outcome, summary: execution.summary });
  return execution;
}
