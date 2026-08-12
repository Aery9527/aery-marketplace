// Every command returns Markdown the host prints verbatim, so rendering is the only
// place that decides what a user sees.

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
