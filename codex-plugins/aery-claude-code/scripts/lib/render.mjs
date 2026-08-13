// Every command returns Markdown the host prints verbatim, so rendering is the only
// place that decides what a user sees.

import { isActiveJobStatus } from "./state.mjs";

function severityRank(severity) {
  switch (severity) {
    case "critical":
      return 0;
    case "high":
      return 1;
    case "medium":
      return 2;
    default:
      return 3;
  }
}

function formatLineRange(finding) {
  if (!finding.line_start) {
    return "";
  }
  if (!finding.line_end || finding.line_end === finding.line_start) {
    return `:${finding.line_start}`;
  }
  return `:${finding.line_start}-${finding.line_end}`;
}

const REVIEW_VERDICTS = new Set(["approve", "needs-attention"]);
const FINDING_SEVERITIES = new Set(["critical", "high", "medium", "low"]);

// The schema is enforced by the CLI, but a rejected or partial turn can still hand back
// something else, so the shape is re-checked before it is presented as a review. The
// verdict and each finding's severity are checked against their enumerations rather than
// merely for being strings, because an unrecognised value would otherwise be printed as
// though the reviewer had ruled on the change.
function validateReviewResultShape(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return "Expected a top-level JSON object.";
  }
  if (typeof data.verdict !== "string" || !REVIEW_VERDICTS.has(data.verdict.trim())) {
    return `\`verdict\` must be one of ${[...REVIEW_VERDICTS].join(", ")}.`;
  }
  if (typeof data.summary !== "string" || !data.summary.trim()) {
    return "Missing string `summary`.";
  }
  if (!Array.isArray(data.findings)) {
    return "Missing array `findings`.";
  }
  if (!Array.isArray(data.next_steps)) {
    return "Missing array `next_steps`.";
  }

  for (const [index, finding] of data.findings.entries()) {
    if (!finding || typeof finding !== "object" || Array.isArray(finding)) {
      return `Finding ${index + 1} is not an object.`;
    }
    if (typeof finding.severity !== "string" || !FINDING_SEVERITIES.has(finding.severity.trim())) {
      return `Finding ${index + 1} has severity ${JSON.stringify(finding.severity)}, which is not one of ${[...FINDING_SEVERITIES].join(", ")}.`;
    }
    for (const field of ["title", "body", "file"]) {
      if (typeof finding[field] !== "string" || !finding[field].trim()) {
        return `Finding ${index + 1} is missing string \`${field}\`.`;
      }
    }
    if (typeof finding.recommendation !== "string") {
      return `Finding ${index + 1} is missing string \`recommendation\`.`;
    }
    for (const field of ["line_start", "line_end"]) {
      if (!Number.isInteger(finding[field]) || finding[field] < 1) {
        return `Finding ${index + 1} is missing a positive integer \`${field}\`.`;
      }
    }
    if (typeof finding.confidence !== "number" || !(finding.confidence >= 0 && finding.confidence <= 1)) {
      return `Finding ${index + 1} is missing a \`confidence\` between 0 and 1.`;
    }
  }

  for (const [index, step] of data.next_steps.entries()) {
    if (typeof step !== "string" || !step.trim()) {
      return `Next step ${index + 1} is not a non-empty string.`;
    }
  }

  return null;
}

function normalizeReviewFinding(finding, index) {
  const source = finding && typeof finding === "object" && !Array.isArray(finding) ? finding : {};
  const lineStart = Number.isInteger(source.line_start) && source.line_start > 0 ? source.line_start : null;
  const lineEnd =
    Number.isInteger(source.line_end) && source.line_end > 0 && (!lineStart || source.line_end >= lineStart)
      ? source.line_end
      : lineStart;

  return {
    severity: typeof source.severity === "string" && source.severity.trim() ? source.severity.trim() : "low",
    title: typeof source.title === "string" && source.title.trim() ? source.title.trim() : `Finding ${index + 1}`,
    body: typeof source.body === "string" && source.body.trim() ? source.body.trim() : "No details provided.",
    file: typeof source.file === "string" && source.file.trim() ? source.file.trim() : "unknown",
    line_start: lineStart,
    line_end: lineEnd,
    recommendation: typeof source.recommendation === "string" ? source.recommendation.trim() : ""
  };
}

function normalizeReviewResultData(data) {
  return {
    verdict: data.verdict.trim(),
    summary: data.summary.trim(),
    findings: data.findings.map((finding, index) => normalizeReviewFinding(finding, index)),
    next_steps: data.next_steps.filter((step) => typeof step === "string" && step.trim()).map((step) => step.trim())
  };
}

// A review reports what it looked at, because `auto` targeting picks the working tree
// or a branch diff on its own and the two cover different work.
function appendScopeSection(lines, meta) {
  lines.push(`Target: ${meta.targetLabel}`);
  if (meta.scopeNote) {
    lines.push(`Scope: ${meta.scopeNote}`);
  }
  if (meta.evidenceNote) {
    lines.push(`Evidence: ${meta.evidenceNote}`);
  }
}

export function renderReviewResult(parsedResult, meta) {
  if (!parsedResult.parsed) {
    const lines = [`# Claude ${meta.reviewLabel}`, ""];
    appendScopeSection(lines, meta);
    lines.push("", "Claude did not return valid structured JSON.", "", `- Parse error: ${parsedResult.parseError}`);

    if (parsedResult.rawOutput) {
      lines.push("", "Raw final message:", "", "```text", parsedResult.rawOutput, "```");
    }

    return `${lines.join("\n").trimEnd()}\n`;
  }

  const validationError = validateReviewResultShape(parsedResult.parsed);
  if (validationError) {
    const lines = [`# Claude ${meta.reviewLabel}`, ""];
    appendScopeSection(lines, meta);
    lines.push("", "Claude returned JSON with an unexpected review shape.", "", `- Validation error: ${validationError}`);

    if (parsedResult.rawOutput) {
      lines.push("", "Raw final message:", "", "```text", parsedResult.rawOutput, "```");
    }

    return `${lines.join("\n").trimEnd()}\n`;
  }

  const data = normalizeReviewResultData(parsedResult.parsed);
  const findings = [...data.findings].sort((left, right) => severityRank(left.severity) - severityRank(right.severity));
  const lines = [`# Claude ${meta.reviewLabel}`, ""];
  appendScopeSection(lines, meta);
  lines.push(`Verdict: ${data.verdict}`, "", data.summary, "");

  if (findings.length === 0) {
    lines.push("No material findings.");
  } else {
    lines.push("Findings:");
    for (const finding of findings) {
      lines.push(`- [${finding.severity}] ${finding.title} (${finding.file}${formatLineRange(finding)})`);
      lines.push(`  ${finding.body}`);
      if (finding.recommendation) {
        lines.push(`  Recommendation: ${finding.recommendation}`);
      }
    }
  }

  if (data.next_steps.length > 0) {
    lines.push("", "Next steps:");
    for (const step of data.next_steps) {
      lines.push(`- ${step}`);
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

// The built-in reviewer writes its own prose, so the only job here is to frame it with
// the scope it actually covered and to surface a failure rather than an empty section.
export function renderNativeReviewResult(result, meta) {
  const text = String(result.text ?? "").trim();
  const stderr = String(result.stderr ?? "").trim();
  const lines = [`# Claude ${meta.reviewLabel}`, ""];
  appendScopeSection(lines, meta);
  lines.push("");

  if (text) {
    lines.push(text);
  } else if (!result.isError) {
    lines.push("Claude review completed without returning any text.");
  } else {
    lines.push("Claude review failed.");
  }

  if (stderr) {
    lines.push("", "stderr:", "", "```text", stderr, "```");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function escapeMarkdownCell(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ")
    .trim();
}

function appendJobTable(lines, jobs, columns) {
  lines.push(`| ${columns.map((column) => column.header).join(" | ")} |`);
  lines.push(`| ${columns.map(() => "---").join(" | ")} |`);
  for (const job of jobs) {
    lines.push(`| ${columns.map((column) => escapeMarkdownCell(column.value(job))).join(" | ")} |`);
  }
}

function formatJobActions(job) {
  const actions = [`/claude-status ${job.id}`];
  actions.push(isActiveJobStatus(job.status) ? `/claude-cancel ${job.id}` : `/claude-result ${job.id}`);
  return actions.map((action) => `\`${action}\``).join("<br>");
}

const ACTIVE_JOB_COLUMNS = [
  { header: "Job", value: (job) => job.id },
  { header: "Kind", value: (job) => job.kind ?? "" },
  { header: "Status", value: (job) => job.status ?? "unknown" },
  { header: "Phase", value: (job) => job.phase ?? "" },
  { header: "Elapsed", value: (job) => job.elapsed ?? "" },
  { header: "Summary", value: (job) => job.summary ?? "" },
  { header: "Actions", value: formatJobActions }
];

const FINISHED_JOB_COLUMNS = [
  { header: "Job", value: (job) => job.id },
  { header: "Kind", value: (job) => job.kind ?? "" },
  { header: "Status", value: (job) => job.status ?? "unknown" },
  { header: "Duration", value: (job) => job.duration ?? "" },
  { header: "Summary", value: (job) => job.summary ?? job.errorMessage ?? "" },
  { header: "Actions", value: formatJobActions }
];

// The pid is reported alongside the observation because that is all that was checked: no
// process answers to it. Whether the worker crashed, was killed, or finished without
// writing its outcome is not knowable from here.
function describeMissingWorker(job) {
  return `No process is running under the recorded pid ${job.pid}, and this job never recorded an outcome. Clear it with \`/claude-cancel ${job.id}\`, then rerun it.`;
}

function appendProgressLines(lines, job) {
  if (job.progressPreview?.length) {
    lines.push("", "Progress:");
    for (const line of job.progressPreview) {
      lines.push(`- ${line}`);
    }
  }
}

export function renderStatusReport(report) {
  const lines = [
    "# Claude Jobs",
    "",
    `Workspace: ${report.workspaceRoot}`,
    `Review gate: ${report.config.stopReviewGate ? "enabled" : "disabled"}`,
    "",
    "Active:"
  ];

  if (report.active.length === 0) {
    lines.push("", "No active jobs.");
  } else {
    lines.push("");
    appendJobTable(lines, report.active, ACTIVE_JOB_COLUMNS);
    for (const job of report.active.filter((entry) => entry.workerMissing)) {
      lines.push("", `${job.id}: ${describeMissingWorker(job)}`);
    }
  }

  lines.push("", "Finished:");
  if (report.finished.length === 0) {
    lines.push("", "No finished jobs recorded yet.");
  } else {
    lines.push("");
    appendJobTable(lines, report.finished, FINISHED_JOB_COLUMNS);
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderJobStatusReport(job, options = {}) {
  const active = isActiveJobStatus(job.status);
  const lines = [`# Claude Job ${job.id}`, ""];

  if (job.title) {
    lines.push(`Title: ${job.title}`);
  }
  lines.push(`Kind: ${job.kind ?? "job"}`, `Status: ${job.status ?? "unknown"}`);
  if (job.phase) {
    lines.push(`Phase: ${job.phase}`);
  }
  if (active && job.elapsed) {
    lines.push(`Elapsed: ${job.elapsed}`);
  }
  if (!active && job.duration) {
    lines.push(`Duration: ${job.duration}`);
  }
  if (job.summary) {
    lines.push(`Summary: ${job.summary}`);
  }
  if (job.claudeSessionId) {
    lines.push(`Claude session ID: ${job.claudeSessionId}`);
  }
  if (job.logFile) {
    lines.push(`Log: ${job.logFile}`);
  }
  if (job.errorMessage) {
    lines.push(`Error: ${job.errorMessage}`);
  }

  appendProgressLines(lines, job);

  if (options.waitTimedOut) {
    lines.push("", `Still ${job.status} after waiting ${Math.round((options.timeoutMs ?? 0) / 1000)}s. The run was not stopped.`);
  }

  if (job.workerMissing) {
    lines.push("", describeMissingWorker(job));
  } else if (active) {
    lines.push("", `Cancel with \`/claude-cancel ${job.id}\`.`);
  } else if (job.status === "cancelled") {
    // Keyed on what the record says now: a worker that outlived its cancellation would have
    // replaced this status with its own.
    lines.push("", "This record was cancelled and stored no result. Rerun it to get one.");
  } else {
    lines.push("", `Read the stored output with \`/claude-result ${job.id}\`.`);
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

// The stored rendering is what the run itself produced, so it is reprinted unchanged and
// the job's own identity is appended rather than woven into it.
export function renderStoredJobResult(job, storedJob) {
  const stored = typeof storedJob?.rendered === "string" ? storedJob.rendered.trimEnd() : "";
  const lines = [`# Claude Job ${job.id}`, "", `Status: ${job.status ?? "unknown"}`];
  if (job.title) {
    lines.push(`Title: ${job.title}`);
  }
  if (storedJob?.claudeSessionId ?? job.claudeSessionId) {
    lines.push(`Claude session ID: ${storedJob?.claudeSessionId ?? job.claudeSessionId}`);
  }

  if (stored) {
    lines.push("", stored);
  } else if (job.errorMessage ?? storedJob?.errorMessage) {
    lines.push("", `The job did not produce output: ${job.errorMessage ?? storedJob?.errorMessage}`);
  } else {
    lines.push("", "No output was stored for this job.");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

// Everything here is known at queue time. What the run covered and what it found belong
// to the result, and claiming either now would be describing work that has not happened.
export function renderQueuedJobLaunch(payload) {
  return [
    `# Claude ${payload.title}`,
    "",
    `Queued as ${payload.jobId}: ${payload.summary}.`,
    "It runs in a detached process, so this command returns now and its outcome is stored when it ends.",
    "",
    `- Progress: \`/claude-status ${payload.jobId}\``,
    `- Result: \`/claude-result ${payload.jobId}\``,
    `- Stop it: \`/claude-cancel ${payload.jobId}\``,
    ""
  ].join("\n");
}

// Losing the race is a different outcome from cancelling, and reporting it as a
// cancellation would hide a result the user can still read.
export function renderLateCancelReport(job, status) {
  return [
    "# Claude Cancel",
    "",
    `Job ${job.id} finished as ${status} before it could be cancelled, so it was left alone.`,
    "",
    `See what it recorded with \`/claude-result ${job.id}\`.`,
    ""
  ].join("\n");
}

// Cancelling ends with two independent facts — what happened to the process, and what the
// job record now says — and neither may be stated as the other.
export function renderCancelReport(job, termination) {
  const lines = [`# Claude Cancel`, "", `Job ${job.id} is now recorded as cancelled.`];
  if (job.title) {
    lines.push(`Title: ${job.title}`);
  }

  // What follows the cancellation depends on whether a run was actually stopped, so the two
  // are decided together rather than closing with one sentence that fits only one of them.
  if (termination?.delivered) {
    lines.push(
      "",
      `Terminated the worker process tree under pid ${job.pid} with ${termination.method}.`,
      "",
      "The run ended there and stored no result. Rerun it to get one."
    );
  } else if (termination?.attempted) {
    // Only the outcome is stated. Every route to this branch ends in the same observation —
    // nothing under that pid to signal — and whether the process stopped on its own or the
    // termination raced it is not distinguishable afterwards.
    lines.push(
      "",
      `${termination.method} found no process to terminate under pid ${job.pid}.`,
      "",
      "The job stored no result. Rerun it to get one."
    );
  } else {
    // No promise is made about a worker that may be starting: the record is what changed,
    // and whether anything was running is exactly what could not be established.
    lines.push(
      "",
      "No worker was recorded for this job, so nothing was stopped. If one was starting up, it may still run and replace this cancellation with its own outcome — check `/claude-status` before rerunning."
    );
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderSetupReport(report) {
  const lines = [
    "# Claude Code Setup",
    "",
    `Status: ${report.ready ? "ready" : "needs attention"}`,
    "",
    "Checks:",
    `- node: ${report.node.detail}`,
    `- claude: ${report.claude.detail}${report.claude.available && !report.claude.meetsMinimum ? " (older than the recommended release)" : ""}`,
    `- auth: ${report.auth.detail}`,
    `- review gate: ${report.reviewGateEnabled ? "enabled" : "disabled"}`,
    `- workspace: ${report.workspaceRoot}`,
    ""
  ];

  if (report.actionsTaken.length > 0) {
    lines.push("Actions taken:");
    for (const action of report.actionsTaken) {
      lines.push(`- ${action}`);
    }
    lines.push("");
  }

  if (report.nextSteps.length > 0) {
    lines.push("Next steps:");
    for (const step of report.nextSteps) {
      lines.push(`- ${step}`);
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
