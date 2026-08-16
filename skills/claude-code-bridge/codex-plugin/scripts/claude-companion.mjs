#!/usr/bin/env node
// Single entry point for every bridge command. The Codex-side command and agent files
// are thin: they decide which subcommand to run and print its stdout unchanged.

import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { parseArgs, splitRawArgumentString } from "./lib/args.mjs";
import { runClaudeOnce } from "./lib/claude-cli.mjs";
import {
  createStreamProgressListener,
  getClaudeAuthStatus,
  getClaudeAvailability,
  MINIMUM_CLAUDE_VERSION,
  normalizeReasoningEffort
} from "./lib/claude.mjs";
import { readJsonFile } from "./lib/fs.mjs";
import {
  collectReviewContext,
  describeReviewScope,
  ensureGitRepository,
  resolveReviewTarget
} from "./lib/git.mjs";
import {
  buildSingleJobSnapshot,
  buildStatusSnapshot,
  readStoredJob,
  resolveCancelableJob,
  resolveResultJob
} from "./lib/job-control.mjs";
import { terminateProcessTree } from "./lib/process.mjs";
import { interpolateTemplate, loadPromptTemplate } from "./lib/prompts.mjs";
import {
  renderCancelReport,
  renderJobStatusReport,
  renderLateCancelReport,
  renderNativeReviewResult,
  renderQueuedJobLaunch,
  renderRescueResult,
  renderReviewResult,
  renderSetupReport,
  renderStatusReport,
  renderStoredJobResult
} from "./lib/render.mjs";
import {
  generateJobId,
  getConfig,
  isActiveJobStatus,
  resolveJobFile,
  setConfig,
  writeJobFile
} from "./lib/state.mjs";
import {
  appendLogLine,
  createJobLogFile,
  createJobProgressUpdater,
  createJobRecord,
  createProgressReporter,
  nowIso,
  runTrackedJob,
  upsertOrIgnore
} from "./lib/tracked-jobs.mjs";
import { resolveWorkspaceRoot } from "./lib/workspace.mjs";

const COMPANION_PATH = fileURLToPath(import.meta.url);
const ROOT_DIR = path.resolve(COMPANION_PATH, "..", "..");
const REVIEW_SCHEMA_PATH = path.join(ROOT_DIR, "schemas", "review-output.schema.json");

const DEFAULT_STATUS_WAIT_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_STATUS_POLL_INTERVAL_MS = 2000;

// The adversarial review needs no command and writes nothing, so it runs with the
// smallest tool set that still lets it read surrounding code. `--tools` filters
// built-ins only, which is why MCP servers are shut out separately.
const READ_ONLY_SESSION = Object.freeze({
  tools: ["Read", "Glob", "Grep"],
  permissionMode: "dontAsk",
  strictMcpConfig: true
});

// The built-in reviewer inspects git state itself, so Bash has to stay. Upstream runs
// its reviewer in a read-only sandbox; the Claude CLI offers no such sandbox, so this
// only removes the direct edit tools. See UPSTREAM-PARITY.md.
const NATIVE_REVIEW_SESSION = Object.freeze({
  permissionMode: "dontAsk",
  strictMcpConfig: true,
  disallowedTools: ["Edit", "Write", "NotebookEdit"]
});

// The runtime is itself a Node process, so its version is known without spawning one.
const MINIMUM_NODE_MAJOR = 18;

function nodeStatus() {
  const major = Number.parseInt(process.versions.node.split(".")[0], 10);
  const available = Number.isFinite(major) && major >= MINIMUM_NODE_MAJOR;
  return {
    available,
    detail: available
      ? process.version
      : `${process.version}; requires Node ${MINIMUM_NODE_MAJOR}.18 or later`
  };
}

const USAGE = [
  "Usage:",
  "  node scripts/claude-companion.mjs setup [--json] [--enable-review-gate|--disable-review-gate] [--cwd <path>]",
  "  node scripts/claude-companion.mjs review [--json] [--wait|--background] [--base <ref>] [--scope auto|working-tree|branch] [--model <model>] [--cwd <path>]",
  "  node scripts/claude-companion.mjs adversarial-review [--json] [--wait|--background] [--base <ref>] [--scope auto|working-tree|branch] [--model <model>] [--cwd <path>] [focus text]",
  "  node scripts/claude-companion.mjs rescue [--json] [--wait|--background] [--resume|--resume-session <id>|--fresh] [--read-only] [--model <model>] [--effort <level>] [--cwd <path>] [what Claude should do]",
  "  node scripts/claude-companion.mjs rescue-resume-candidate [--json] [--cwd <path>]",
  "  node scripts/claude-companion.mjs status [job-id] [--json] [--all] [--wait] [--timeout-ms <ms>] [--poll-interval-ms <ms>] [--cwd <path>]",
  "  node scripts/claude-companion.mjs result [job-id] [--json] [--cwd <path>]",
  "  node scripts/claude-companion.mjs cancel [job-id] [--json] [--cwd <path>]",
  "  node scripts/claude-companion.mjs run-job --job-id <id> [--cwd <path>]",
  ""
].join("\n");

// A Codex command forwards its arguments as one raw string, so a single positional
// that still contains flags is re-split before parsing.
function parseCommandInput(argv, config = {}) {
  const tokens =
    argv.length === 1 && typeof argv[0] === "string" && /[\s"']/.test(argv[0])
      ? splitRawArgumentString(argv[0])
      : argv;
  return parseArgs(tokens, config);
}

function resolveCommandCwd(options) {
  return options.cwd ? String(options.cwd) : process.cwd();
}

function resolveCommandWorkspace(options) {
  return resolveWorkspaceRoot(resolveCommandCwd(options));
}

function outputResult(payload, asJson) {
  process.stdout.write(asJson ? `${JSON.stringify(payload, null, 2)}\n` : String(payload));
}

function buildSetupReport(cwd, actionsTaken = []) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const node = nodeStatus();
  const claudeStatus = getClaudeAvailability(cwd);
  const authStatus = getClaudeAuthStatus(cwd);
  const config = getConfig(workspaceRoot);

  const nextSteps = [];
  if (!claudeStatus.available) {
    nextSteps.push("Install or update Claude Code, then rerun `/claude-setup`.");
  }
  if (claudeStatus.available && !claudeStatus.meetsMinimum) {
    nextSteps.push(
      `Update Claude Code to ${MINIMUM_CLAUDE_VERSION} or later. Older releases do not announce stream capabilities, so interrupting a running job may be unavailable.`
    );
  }
  if (claudeStatus.available && !authStatus.loggedIn) {
    nextSteps.push("Run `claude auth login` in a terminal, then rerun `/claude-setup`.");
  }
  if (!config.stopReviewGate) {
    nextSteps.push(
      "Optional: run `/claude-setup --enable-review-gate` to record that this workspace wants a Claude review before a turn ends."
    );
  }

  return {
    ready: node.available && claudeStatus.available && authStatus.loggedIn,
    node,
    claude: claudeStatus,
    auth: authStatus,
    workspaceRoot,
    stopReviewRequested: Boolean(config.stopReviewGate),
    actionsTaken,
    nextSteps
  };
}

function handleSetup(argv) {
  const { options } = parseCommandInput(argv, {
    valueOptions: ["cwd"],
    booleanOptions: ["json", "enable-review-gate", "disable-review-gate"]
  });

  if (options["enable-review-gate"] && options["disable-review-gate"]) {
    throw new Error("Choose either --enable-review-gate or --disable-review-gate.");
  }

  const cwd = resolveCommandCwd(options);
  const workspaceRoot = resolveCommandWorkspace(options);
  const actionsTaken = [];

  if (options["enable-review-gate"]) {
    setConfig(workspaceRoot, "stopReviewGate", true);
    actionsTaken.push(`Recorded that ${workspaceRoot} wants a Claude review before a turn ends.`);
  } else if (options["disable-review-gate"]) {
    setConfig(workspaceRoot, "stopReviewGate", false);
    actionsTaken.push(`Recorded that ${workspaceRoot} does not want a Claude review before a turn ends.`);
  }

  const report = buildSetupReport(cwd, actionsTaken);
  outputResult(options.json ? report : renderSetupReport(report), Boolean(options.json));
}

// The rescue command promises to send an unauthenticated user to `/claude-setup`. Without
// this the promise is kept by nothing: an unauthenticated CLI still starts, and the failure
// arrives as whatever text the turn produced.
function ensureClaudeAuthenticated(cwd) {
  const auth = getClaudeAuthStatus(cwd);
  if (!auth.loggedIn) {
    throw new Error(`Claude Code is not authenticated (${auth.detail}). Run \`/claude-setup\` for what to do next.`);
  }
}

function ensureClaudeAvailable(cwd) {
  const availability = getClaudeAvailability(cwd);
  if (!availability.available) {
    throw new Error(
      "Claude Code is not installed or is not runnable. Install it with `npm install -g @anthropic-ai/claude-code`, then rerun `/claude-setup`."
    );
  }
}

function buildAdversarialReviewPrompt(context, focusText) {
  return interpolateTemplate(loadPromptTemplate(ROOT_DIR, "adversarial-review"), {
    REVIEW_KIND: "Adversarial Review",
    TARGET_LABEL: context.target.label,
    USER_FOCUS: focusText || "No extra focus provided.",
    REVIEW_COLLECTION_GUIDANCE: context.collectionGuidance,
    REVIEW_INPUT: context.content
  });
}

// A turn that ended in an error can still carry well-formed JSON — an interrupted or
// truncated review, for instance. Rendering that as a verdict would present a failed run
// as a trustworthy assessment, so the error decides the outcome before the shape does.
function parseReviewOutput(result) {
  const rawOutput = typeof result.text === "string" ? result.text : "";

  if (result.isError) {
    return {
      parsed: null,
      parseError: `Claude ended the review with ${result.subtype}, so its output is not a usable review.`,
      rawOutput
    };
  }

  if (result.structuredOutput && typeof result.structuredOutput === "object" && !Array.isArray(result.structuredOutput)) {
    return { parsed: result.structuredOutput, parseError: null, rawOutput };
  }

  // Only `structured_output` is accepted. The same event also carries the review as
  // text, but that copy has not been through the CLI's schema check, so parsing it would
  // let output the schema rejected reach the user as a verdict.
  return {
    parsed: null,
    parseError: rawOutput.trim()
      ? "Claude answered without schema-validated structured output, so its reply is not a usable review."
      : "Claude returned no final message.",
    rawOutput
  };
}

function buildNativeReviewPrompt(target) {
  return target.mode === "branch" ? `/code-review ${target.baseRef}` : "/code-review";
}

// The target is resolved once, by the process the user typed the command into. `auto`
// reads the working tree to choose between a dirty-tree and a branch review, so a
// background run that resolved it again could review something else entirely.
function buildReviewRequest(kind, options, positionals) {
  const cwd = resolveCommandCwd(options);
  ensureClaudeAvailable(cwd);
  ensureGitRepository(cwd);

  const focusText = positionals.join(" ").trim();
  if (kind === "review" && focusText) {
    throw new Error(
      `\`/claude-review\` runs the built-in reviewer and takes no focus text. Retry with \`/claude-adversarial-review ${focusText}\`.`
    );
  }

  return {
    kind,
    cwd,
    target: resolveReviewTarget(cwd, { base: options.base, scope: options.scope }),
    focusText,
    model: options.model ? String(options.model) : undefined
  };
}

function firstMeaningfulLine(text, fallback) {
  const line = String(text ?? "")
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry && !entry.startsWith("#"));
  return line ?? fallback;
}

async function runNativeReview(request, onProgress) {
  // Read before the run, not after: the scope describes the tree the reviewer was pointed
  // at, and a review takes long enough for that tree to have moved on by the time it ends.
  const scopeNote = describeReviewScope(request.cwd, request.target, { authoritative: false });
  const result = await runClaudeOnce(request.cwd, buildNativeReviewPrompt(request.target), {
    ...NATIVE_REVIEW_SESSION,
    model: request.model,
    onEvent: createStreamProgressListener(onProgress)
  });

  const meta = {
    reviewLabel: "Review",
    targetLabel: request.target.label,
    scopeNote,
    evidenceNote: "the built-in reviewer collected its own evidence; this bridge supplied no diff"
  };

  return {
    failed: result.isError,
    sessionId: result.sessionId,
    // The summary is what a status listing shows for this job, so a failed turn must not
    // be summarised by whatever text it happened to leave behind.
    summary: result.isError
      ? `Review ended with ${result.subtype}.`
      : firstMeaningfulLine(result.text, "Review finished."),
    payload: {
      review: "Review",
      target: request.target,
      scopeNote,
      sessionId: result.sessionId,
      claude: { subtype: result.subtype, isError: result.isError, stdout: result.text, stderr: result.stderr }
    },
    rendered: renderNativeReviewResult(result, meta)
  };
}

// What the reviewer was actually given, stated so a reader can weigh the findings. The
// inline-diff threshold measures the tracked diff alone, so an untracked file left out of
// the context has to be named here or "the full diff" would be a false claim.
function describeReviewEvidence(context) {
  const skipped = context.skippedUntracked ?? [];
  const parts = [
    context.inputMode === "inline-diff"
      ? `the tracked diff was supplied in full (${context.trackedFileCount} file(s), ${context.diffBytes} bytes)`
      : `the tracked diff was not supplied inline because ${context.inlineRefusalReason}; Claude received a summary and a file list for ${context.trackedFileCount} tracked file(s), not the diff, and was told to read those files itself, so whether it read any given one is not tracked here, and either way it could not see what the change removed`
  ];

  if (context.untrackedIncludedCount > 0) {
    parts.push(`${context.untrackedIncludedCount} untracked file(s) were included with their contents`);
  }
  if (skipped.length > 0) {
    parts.push(
      `${skipped.length} untracked entr${skipped.length === 1 ? "y was" : "ies were"} left out: ${skipped.join("; ")}`
    );
  }

  return parts.join(". ");
}

async function runAdversarialReview(request, onProgress) {
  // The scope line is built from the same reading the collection started with, so the two
  // lines agree about where the review began. Collection is a sequence of git reads, though,
  // and a tree edited while they run cannot be described as one moment by either line.
  const context = collectReviewContext(request.cwd, request.target);
  const scopeNote = describeReviewScope(request.cwd, request.target, { state: context.workingTreeState });
  const result = await runClaudeOnce(context.repoRoot, buildAdversarialReviewPrompt(context, request.focusText), {
    ...READ_ONLY_SESSION,
    model: request.model,
    jsonSchema: readJsonFile(REVIEW_SCHEMA_PATH),
    onEvent: createStreamProgressListener(onProgress)
  });
  const parsed = parseReviewOutput(result);

  const meta = {
    reviewLabel: "Adversarial Review",
    targetLabel: request.target.label,
    scopeNote,
    evidenceNote: describeReviewEvidence(context)
  };

  return {
    failed: result.isError,
    sessionId: result.sessionId,
    summary: parsed.parsed?.summary ?? parsed.parseError ?? "Adversarial review finished.",
    payload: {
      review: "Adversarial Review",
      target: request.target,
      scopeNote,
      sessionId: result.sessionId,
      context: {
        repoRoot: context.repoRoot,
        branch: context.branch,
        summary: context.summary,
        inputMode: context.inputMode,
        fileCount: context.fileCount,
        diffBytes: context.diffBytes
      },
      claude: { subtype: result.subtype, isError: result.isError, stdout: result.text, stderr: result.stderr },
      result: parsed.parsed,
      parseError: parsed.parseError
    },
    rendered: renderReviewResult(parsed, meta)
  };
}

// Rescue is the one entry point that exists to change the repository, so it takes nothing
// away: no tool filter, and no `--strict-mcp-config` either, because a workspace's MCP
// servers are part of what its own Claude Code can reach. The review sessions above remove
// both deliberately; removing either here would take away the thing the user asked for.
const RESCUE_SESSION = Object.freeze({
  permissionMode: "dontAsk"
});

// Upstream's forwarder leaves write access on unless the user asked for review, diagnosis or
// research without edits. The same choice is a flag here, because a Codex command has no
// forwarder to make it. What it removes is the direct edit tools and the workspace's MCP
// servers, which is every write route that can be closed from here. The CLI offers no
// sandbox, so a session that can still run commands can still write through them.
const RESCUE_READ_ONLY_SESSION = Object.freeze({
  permissionMode: "dontAsk",
  strictMcpConfig: true,
  disallowedTools: ["Edit", "Write", "NotebookEdit"]
});

// A rescue has no structured output to parse: what Claude was asked to do is what it
// reports, so the turn's own text is the answer and the render only frames it.
async function runRescue(request, onProgress) {
  const result = await runClaudeOnce(request.cwd, request.prompt, {
    ...(request.readOnly ? RESCUE_READ_ONLY_SESSION : RESCUE_SESSION),
    model: request.model,
    effort: request.effort,
    resume: request.resume,
    onEvent: createStreamProgressListener(onProgress)
  });

  return {
    failed: result.isError,
    sessionId: result.sessionId,
    summary: result.isError ? "The Claude turn ended in an error." : "Rescue finished.",
    payload: {
      kind: "rescue",
      failed: result.isError,
      sessionId: result.sessionId ?? null,
      text: String(result.text ?? "").trim(),
      stderr: result.stderr ?? ""
    },
    rendered: renderRescueResult(result, {
      resume: request.resume ?? null,
      resumedByName: Boolean(request.resumedByName)
    })
  };
}

const JOB_TITLES = Object.freeze({
  review: "Review",
  "adversarial-review": "Adversarial Review",
  rescue: "Rescue"
});

function executeJob(request, onProgress) {
  if (request.kind === "rescue") {
    return runRescue(request, onProgress);
  }
  return request.kind === "adversarial-review"
    ? runAdversarialReview(request, onProgress)
    : runNativeReview(request, onProgress);
}

// Progress is written where another process can read it: the job's log, and the phase on
// the job record. Nothing is written to stdout, because a detached worker has none.
function createTrackedProgress(job, options = {}) {
  const logFile = options.logFile ?? createJobLogFile(job.workspaceRoot, job.id, job.title);
  return {
    logFile,
    progress: createProgressReporter({
      logFile,
      onEvent: createJobProgressUpdater(job.workspaceRoot, job.id)
    })
  };
}

const JOB_ID_PREFIXES = Object.freeze({ review: "review", "adversarial-review": "adv", rescue: "rescue" });

// A job's summary is the one line `/claude-status` shows for it, so it has to say which run
// this was. A review names the target it was pointed at; a rescue has no target, so it names
// the request itself, shortened to fit a listing.
function summariseJob(title, request) {
  if (request.kind !== "rescue") {
    return `${title} of ${request.target.label}`;
  }
  const prompt = request.prompt.replace(/\s+/g, " ").trim();
  return prompt.length > 80 ? `${title}: ${prompt.slice(0, 77)}...` : `${title}: ${prompt}`;
}

function createReviewJob(workspaceRoot, request) {
  const title = JOB_TITLES[request.kind];
  return createJobRecord({
    id: generateJobId(JOB_ID_PREFIXES[request.kind]),
    kind: request.kind,
    title,
    workspaceRoot,
    summary: summariseJob(title, request)
  });
}

function spawnDetachedWorker(cwd, jobId) {
  const child = spawn(process.execPath, [COMPANION_PATH, "run-job", "--cwd", cwd, "--job-id", jobId], {
    cwd,
    env: process.env,
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  // A spawn that fails says so twice: no pid now, and an `error` event on the next tick.
  // The caller acts on the pid; this listener exists because an unhandled `error` event
  // would take the process down before it could report anything.
  child.on("error", () => {});
  child.unref();
  return child;
}

// The queued record carries the request, so the worker runs what the user asked for
// rather than re-deriving it from a repository that may have moved on. It is written
// before the worker exists, because a worker that wins the race to start would otherwise
// find no request and fail where nothing can report it.
//
// Once the worker exists it owns the job file, and this process never writes that file
// again. The pid goes to the index instead, as a patch carrying nothing but the pid, and
// the index write is abandoned and retried if another process changed the file first.
// Only the job file carries the request, so a progress update rewrites the small index
// rather than a copy of the whole request.
function enqueueBackgroundJob(job, request) {
  const logFile = createJobLogFile(job.workspaceRoot, job.id, job.title);
  appendLogLine(logFile, "Queued for background execution.");
  const queued = { ...job, status: "queued", phase: "queued", pid: null, logFile };
  writeJobFile(job.workspaceRoot, job.id, { ...queued, request });
  upsertOrIgnore(job.workspaceRoot, queued);

  // A spawn that fails reports it by handing back no pid, and the record is already on
  // disk by then. Left alone it would sit at `queued` for a worker that will never exist,
  // so the failure is written into the job before the command reports it.
  const child = spawnDetachedWorker(request.cwd, job.id);
  if (!child.pid) {
    const failure = new Error(`Could not start a background worker for ${job.id}.`);
    recordWorkerStartupFailure(job.workspaceRoot, job.id, failure);
    throw failure;
  }
  upsertOrIgnore(job.workspaceRoot, { id: job.id, pid: child.pid });

  return {
    jobId: job.id,
    status: "queued",
    title: job.title,
    summary: job.summary,
    logFile,
    jobFile: resolveJobFile(job.workspaceRoot, job.id)
  };
}

// A rescue is the user's own words. Nothing is added to them and no word is dropped, but the
// words are what survives: the flags this command consumes are taken out, the quotes that
// grouped the rest are spent doing that, and what is left is rejoined with single spaces. `--resume` continues the Claude session a previous
// rescue in this workspace left behind; `--fresh` states the opposite explicitly, because a
// caller that means "start over" should not have to rely on a default.
function buildRescueRequest(options, positionals) {
  // Even a continuation says what to continue with. Writing one here would be this runtime
  // deciding what the user wanted; the command asks them instead, which is where the user is.
  // It is asked before anything about the environment, so a user who said nothing hears that
  // rather than a setup error that is not what they need to fix first.
  const prompt = positionals.join(" ").trim();
  if (!prompt) {
    throw new Error("Say what Claude should investigate, fix, or continue.");
  }

  const cwd = resolveCommandCwd(options);
  ensureClaudeAvailable(cwd);
  ensureClaudeAuthenticated(cwd);

  const namesSession = Object.hasOwn(options, "resume-session");
  const resume = options.resume || namesSession ? resolveResumeTarget(cwd, options) : undefined;
  return {
    kind: "rescue",
    cwd,
    prompt,
    model: resolveRescueModel(options.model),
    readOnly: Boolean(options["read-only"]),
    effort: normalizeReasoningEffort(options.effort) ?? undefined,
    resume,
    resumedByName: namesSession
  };
}

// `--resume` continues the last Claude session this workspace recorded; naming one takes
// `--resume-session`, because a flag that swallowed the next word would eat the first word of
// the request instead. Either way the session has to belong to a run that has ended: a job
// publishes its session id as soon as Claude announces it, long before the run is over, so a
// session named while its own run is still going would take a second turn from another
// process. A workspace with nothing finished to continue is told so rather than being started
// fresh in silence.
// Upstream maps `spark` to a Codex model of its own. Nothing on this side answers to that
// name, and passing it through would ask the Claude CLI for a model that does not exist while
// looking like it had been understood.
function resolveRescueModel(model) {
  if (model === undefined) {
    return undefined;
  }
  const name = String(model).trim();
  if (name.toLowerCase() === "spark") {
    throw new Error("`spark` names a Codex model and has no Claude counterpart. Name a Claude model instead.");
  }
  return name;
}

function resolveResumeTarget(cwd, options) {
  if (Object.hasOwn(options, "resume-session")) {
    const sessionId = String(options["resume-session"]).trim();
    if (!sessionId) {
      throw new Error("--resume-session needs the session id to continue.");
    }
    const owner = findActiveJobForSession(cwd, sessionId);
    if (owner) {
      throw new Error(
        `Session ${sessionId} is still being run by job ${owner.id}. Wait for it to finish, or cancel it with /claude-cancel ${owner.id}.`
      );
    }
    return sessionId;
  }
  const candidate = findResumableSession(cwd);
  if (!candidate) {
    throw new Error(
      "No Claude session recorded for this repository yet, so there is nothing to resume. Run the rescue without --resume."
    );
  }
  return candidate.sessionId;
}

// Only finished runs are offered, ordered by when they finished, for the reason above.
// A session is claimed by the job that is going to drive it, not only by the one already
// driving it: a queued job records the session it was asked to resume before its worker
// exists. Both are searched, and across every Codex session, because a session driven from
// another one is just as busy as a session driven from this one.
function findActiveJobForSession(cwd, sessionId) {
  return (
    buildStatusSnapshot(cwd, { all: true, allSessions: true }).active.find(
      (job) => job.claudeSessionId === sessionId || job.resumeSessionId === sessionId
    ) ?? null
  );
}

function findResumableSession(cwd) {
  const job = buildStatusSnapshot(cwd, { all: true })
    .finished.filter((candidate) => candidate.kind === "rescue" && candidate.claudeSessionId)
    .sort((left, right) =>
      String(right.completedAt ?? right.updatedAt ?? "").localeCompare(String(left.completedAt ?? left.updatedAt ?? ""))
    )[0];
  return job ? { jobId: job.id, sessionId: job.claudeSessionId, title: job.title ?? null } : null;
}

// The command file asks once whether to continue, and only when there is something to
// continue. Answering that question is all this reports; it starts nothing.
function handleRescueResumeCandidate(argv) {
  const { options } = parseCommandInput(argv, { valueOptions: ["cwd"], booleanOptions: ["json"] });
  const candidate = findResumableSession(resolveCommandCwd(options));
  const payload = candidate ? { available: true, ...candidate } : { available: false };
  outputResult(options.json ? payload : `${payload.available ? "resumable" : "none"}
`, Boolean(options.json));
}

async function handleRescue(argv) {
  const { options, positionals } = parseCommandInput(argv, {
    valueOptions: ["cwd", "model", "effort", "resume-session"],
    booleanOptions: ["json", "background", "wait", "resume", "fresh", "read-only"]
  });

  if (options.background && options.wait) {
    throw new Error("Choose either --background or --wait.");
  }
  if ((options.resume || Object.hasOwn(options, "resume-session")) && options.fresh) {
    throw new Error("Choose either --resume/--resume-session or --fresh.");
  }

  const request = buildRescueRequest(options, positionals);
  // The record carries the session it means to resume, so the next caller asking whether that
  // session is free sees this run before it has started. The two are still a read and a write
  // apart: two callers that pass the check together both claim it. Narrowing that further
  // needs a lock whose holder `cancel` exists to terminate, which buys the gap back as a lock
  // nobody releases.
  const job = {
    ...createReviewJob(resolveWorkspaceRoot(request.cwd), request),
    resumeSessionId: request.resume ?? null
  };

  if (options.background) {
    const payload = enqueueBackgroundJob(job, request);
    outputResult(options.json ? payload : renderQueuedJobLaunch(payload), Boolean(options.json));
    return;
  }

  const { logFile, progress } = createTrackedProgress(job);
  const execution = await runTrackedJob({ ...job, logFile }, () => executeJob(request, progress), { logFile });
  outputResult(options.json ? execution.payload : execution.rendered, Boolean(options.json));
  if (execution.failed) {
    process.exitCode = 1;
  }
}

async function handleReviewCommand(kind, argv) {
  const { options, positionals } = parseCommandInput(argv, {
    valueOptions: ["cwd", "base", "scope", "model"],
    booleanOptions: ["json", "background", "wait"]
  });

  if (options.background && options.wait) {
    throw new Error("Choose either --background or --wait.");
  }

  const request = buildReviewRequest(kind, options, positionals);
  const job = createReviewJob(resolveWorkspaceRoot(request.cwd), request);

  if (options.background) {
    const payload = enqueueBackgroundJob(job, request);
    outputResult(options.json ? payload : renderQueuedJobLaunch(payload), Boolean(options.json));
    return;
  }

  const { logFile, progress } = createTrackedProgress(job);
  const execution = await runTrackedJob({ ...job, logFile }, () => executeJob(request, progress), { logFile });
  outputResult(options.json ? execution.payload : execution.rendered, Boolean(options.json));
  if (execution.failed) {
    process.exitCode = 1;
  }
}

// A queued job that never reaches its run would otherwise sit at `queued` with nothing to
// explain it — a detached worker has no stdout, and the process that queued it has already
// returned. `runTrackedJob` records what happens once the run is under way; this records
// what stopped it from getting there.
function recordWorkerStartupFailure(workspaceRoot, jobId, error) {
  const storedJob = readStoredJob(workspaceRoot, jobId);
  if (!storedJob) {
    return;
  }
  const failed = {
    status: "failed",
    phase: "failed",
    pid: null,
    completedAt: nowIso(),
    errorMessage: error instanceof Error ? error.message : String(error)
  };
  appendLogLine(storedJob.logFile, `Failed to start: ${failed.errorMessage}`);
  writeJobFile(workspaceRoot, jobId, { ...storedJob, ...failed });
  upsertOrIgnore(workspaceRoot, { id: jobId, ...failed });
}

async function handleRunJob(argv) {
  const { options } = parseCommandInput(argv, { valueOptions: ["cwd", "job-id"] });
  const jobId = options["job-id"];
  if (!jobId) {
    throw new Error("run-job requires --job-id.");
  }

  const workspaceRoot = resolveCommandWorkspace(options);
  let job;
  let logFile;
  let progress;
  try {
    const storedJob = readStoredJob(workspaceRoot, String(jobId));
    if (!storedJob) {
      throw new Error(`No stored job found for ${jobId}.`);
    }
    // A worker runs a job exactly once, and only the job it was queued for. Anything else
    // means someone already decided this job's outcome — a cancellation, most likely —
    // and starting the run now would carry it out after it was called off.
    if (storedJob.status !== "queued") {
      appendLogLine(storedJob.logFile, `Not started: the job is already ${storedJob.status}.`);
      return;
    }
    if (!storedJob.request || typeof storedJob.request !== "object") {
      throw new Error(`Stored job ${jobId} carries no request to run.`);
    }
    job = { ...storedJob, workspaceRoot };
    ({ logFile, progress } = createTrackedProgress(job, { logFile: storedJob.logFile ?? null }));
  } catch (error) {
    recordWorkerStartupFailure(workspaceRoot, String(jobId), error);
    throw error;
  }

  await runTrackedJob({ ...job, logFile }, () => executeJob(job.request, progress), { logFile });
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// Waiting stops for any answer, including the absence of a worker: a job whose process is
// gone will never leave `running` on its own, so polling it to the deadline is pointless.
// A value the user gave is used as given. Falling back on anything falsy would turn
// `--timeout-ms 0` — "tell me now" — into a quarter-hour wait the flag says it set.
function readMilliseconds(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

async function waitForJobSnapshot(cwd, reference, options = {}) {
  const timeoutMs = readMilliseconds(options.timeoutMs, DEFAULT_STATUS_WAIT_TIMEOUT_MS);
  const pollIntervalMs = Math.max(100, readMilliseconds(options.pollIntervalMs, DEFAULT_STATUS_POLL_INTERVAL_MS));
  const deadline = Date.now() + timeoutMs;
  let snapshot = buildSingleJobSnapshot(cwd, reference);

  while (isActiveJobStatus(snapshot.job.status) && !snapshot.job.workerMissing && Date.now() < deadline) {
    await sleep(Math.min(pollIntervalMs, Math.max(0, deadline - Date.now())));
    snapshot = buildSingleJobSnapshot(cwd, reference);
  }

  return { ...snapshot, waitTimedOut: isActiveJobStatus(snapshot.job.status) && !snapshot.job.workerMissing, timeoutMs };
}

async function handleStatus(argv) {
  const { options, positionals } = parseCommandInput(argv, {
    valueOptions: ["cwd", "timeout-ms", "poll-interval-ms"],
    booleanOptions: ["json", "all", "wait"]
  });

  const cwd = resolveCommandCwd(options);
  const reference = positionals[0] ?? "";

  if (!reference) {
    if (options.wait) {
      throw new Error("`status --wait` needs a job id to wait for.");
    }
    const report = buildStatusSnapshot(cwd, { all: Boolean(options.all) });
    outputResult(options.json ? report : renderStatusReport(report), Boolean(options.json));
    return;
  }

  const snapshot = options.wait
    ? await waitForJobSnapshot(cwd, reference, {
        timeoutMs: options["timeout-ms"],
        pollIntervalMs: options["poll-interval-ms"]
      })
    : buildSingleJobSnapshot(cwd, reference);

  outputResult(
    options.json ? snapshot : renderJobStatusReport(snapshot.job, { waitTimedOut: snapshot.waitTimedOut, timeoutMs: snapshot.timeoutMs }),
    Boolean(options.json)
  );
}

function handleResult(argv) {
  const { options, positionals } = parseCommandInput(argv, {
    valueOptions: ["cwd"],
    booleanOptions: ["json"]
  });

  // Both halves come from the one read `resolveResultJob` already made, so the header and
  // the report below it describe the same moment. Reading again could head a cancelled
  // record with a finished review's findings.
  const cwd = resolveCommandCwd(options);
  const { job, storedJob } = resolveResultJob(cwd, positionals[0] ?? "");
  outputResult(options.json ? { job, storedJob } : renderStoredJobResult(job, storedJob), Boolean(options.json));
}

// A job with no worker on record is either an enqueue that was abandoned or one whose
// worker is still starting, and the two look identical at a glance. Rather than guess, the
// pid is waited for: a worker records its own within a moment of starting. One slower than
// the wait is still possible, which is why the report that follows says nothing was
// stopped rather than that nothing was there.
const WORKER_PID_WAIT_MS = 3000;
const WORKER_PID_POLL_MS = 100;

async function awaitRecordedWorker(cwd, job) {
  const deadline = Date.now() + WORKER_PID_WAIT_MS;
  let current = job;
  while (!current.pid && isActiveJobStatus(current.status) && Date.now() < deadline) {
    await sleep(WORKER_PID_POLL_MS);
    current = buildSingleJobSnapshot(cwd, job.id).job;
  }
  return current;
}

function readCancellationBaseline(workspaceRoot, jobId) {
  return readStoredJob(workspaceRoot, jobId) ?? {};
}

// A record with no status of its own has not reached an outcome, so it is still the
// cancellation's to write.
function stillCancelable(workspaceRoot, jobId) {
  const status = readCancellationBaseline(workspaceRoot, jobId).status;
  return !status || isActiveJobStatus(status);
}

// The run reached its outcome before the cancellation could be written, so the listing is
// brought in line with the record that now holds it. Cancel is the writer here; a reporting
// command must not repair state it only reads.
function reportLateCancel(workspaceRoot, job, stored, termination, options) {
  upsertOrIgnore(workspaceRoot, {
    id: job.id,
    status: stored.status,
    phase: stored.phase ?? null,
    pid: null,
    completedAt: stored.completedAt ?? nowIso()
  });
  const payload = { jobId: job.id, status: stored.status, title: job.title, cancelled: false };
  outputResult(options.json ? payload : renderLateCancelReport(job, stored.status, termination), Boolean(options.json));
}

// Termination comes first so that a worker which takes it has stopped writing before the
// cancelled state is stored. It buys nothing where there is nothing to stop — no pid on
// record, or a pid nothing answers to — nor where the run declines the signal, and the
// report says which of those happened.
async function handleCancel(argv) {
  const { options, positionals } = parseCommandInput(argv, {
    valueOptions: ["cwd"],
    booleanOptions: ["json"]
  });

  const cwd = resolveCommandCwd(options);
  const { workspaceRoot, job: selected } = resolveCancelableJob(cwd, positionals[0] ?? "", { env: process.env });
  const job = selected.pid ? selected : await awaitRecordedWorker(cwd, selected);
  // The job id is what the worker was started with, so a process running the companion's
  // `run-job` for this id is what the pid has to be answering as before anything is sent to
  // it. That is a reading of its command line, not proof of which process it is.
  const termination = terminateProcessTree(job.pid ?? Number.NaN, {
    identity: job.id,
    companionPath: COMPANION_PATH,
    runtimePath: process.execPath,
    // A job id is unique within a workspace, not across them, so the workspace the worker
    // was started for is part of what identifies it.
    sameWorkspace: (cwd) => resolveWorkspaceRoot(cwd) === workspaceRoot
  });

  // The worker may have finished between being chosen and being terminated. Its record is
  // re-read afterwards, because overwriting a completed run with `cancelled` would leave a
  // stored result behind a status that says none exists.
  const stored = readCancellationBaseline(workspaceRoot, job.id);
  if (stored.status && !isActiveJobStatus(stored.status)) {
    return reportLateCancel(workspaceRoot, job, stored, termination, options);
  }

  // The record is read once more, as close to the write as it can be, and judged again on
  // that read: a run that finished since the first look must not have its findings replaced
  // by a cancellation. What is left is the gap between this read and the write below.
  const baseline = readCancellationBaseline(workspaceRoot, job.id);
  if (baseline.status && !isActiveJobStatus(baseline.status)) {
    return reportLateCancel(workspaceRoot, job, baseline, termination, options);
  }

  // A report is cleared rather than carried over: a run that recorded one and a record that
  // says cancelled cannot both be true, and `/claude-result` would print the findings.
  const cancelled = {
    status: "cancelled",
    phase: "cancelled",
    pid: null,
    completedAt: nowIso(),
    errorMessage: "Cancelled by user.",
    result: null,
    rendered: null
  };
  // The condition travels with the write: a run that reaches its outcome before the swap
  // keeps it, and the cancellation is reported as having arrived too late instead.
  const written = writeJobFile(
    workspaceRoot,
    job.id,
    { ...baseline, ...cancelled },
    { guard: () => stillCancelable(workspaceRoot, job.id) }
  );
  if (!written) {
    return reportLateCancel(workspaceRoot, job, readCancellationBaseline(workspaceRoot, job.id), termination, options);
  }

  appendLogLine(job.logFile, "Cancelled by user.");
  upsertOrIgnore(workspaceRoot, { id: job.id, ...cancelled });

  const payload = {
    jobId: job.id,
    status: "cancelled",
    title: job.title,
    terminationAttempted: termination.attempted,
    terminationDelivered: termination.delivered
  };
  outputResult(options.json ? payload : renderCancelReport(job, termination), Boolean(options.json));
}

async function main() {
  const [subcommand, ...argv] = process.argv.slice(2);

  switch (subcommand) {
    case "setup":
      handleSetup(argv);
      break;
    case "review":
      await handleReviewCommand("review", argv);
      break;
    case "adversarial-review":
      await handleReviewCommand("adversarial-review", argv);
      break;
    case "run-job":
      await handleRunJob(argv);
      break;
    case "rescue":
      await handleRescue(argv);
      break;
    case "rescue-resume-candidate":
      handleRescueResumeCandidate(argv);
      break;
    case "status":
      await handleStatus(argv);
      break;
    case "result":
      handleResult(argv);
      break;
    case "cancel":
      await handleCancel(argv);
      break;
    case undefined:
    case "--help":
    case "-h":
    case "help":
      process.stdout.write(USAGE);
      break;
    default:
      throw new Error(`Unknown subcommand "${subcommand}".\n\n${USAGE}`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
