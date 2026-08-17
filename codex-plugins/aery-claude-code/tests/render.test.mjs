import test from "node:test";
import assert from "node:assert/strict";

import {
  renderCancelReport,
  renderJobStatusReport,
  renderLateCancelReport,
  renderNativeReviewResult,
  renderQueuedJobLaunch,
  renderReviewResult,
  renderSetupReport,
  renderStatusReport,
  renderStoredJobResult
} from "../scripts/lib/render.mjs";

const META = {
  reviewLabel: "Adversarial Review",
  targetLabel: "working tree diff",
  scopeNote: "uncommitted work, selected automatically — 1 staged, 0 unstaged, 0 untracked file(s).",
  evidenceNote: "the tracked diff was supplied in full (1 file(s), 40 bytes)"
};

function reviewPayload(overrides = {}) {
  return {
    verdict: "needs-attention",
    summary: "Do not ship yet.",
    findings: [],
    next_steps: [],
    ...overrides
  };
}

function finding(overrides = {}) {
  return {
    severity: "high",
    title: "T",
    body: "B",
    file: "a.js",
    line_start: 1,
    line_end: 1,
    confidence: 0.8,
    recommendation: "Fix it.",
    ...overrides
  };
}

test("a rendered review states the scope and evidence it actually had", () => {
  const output = renderReviewResult({ parsed: reviewPayload(), parseError: null, rawOutput: "" }, META);

  assert.match(output, /^# Claude Adversarial Review/);
  assert.match(output, /Target: working tree diff/);
  assert.match(output, /Scope: uncommitted work, selected/);
  assert.match(output, /Evidence: the tracked diff was supplied in full/);
  assert.match(output, /Verdict: needs-attention/);
  assert.match(output, /No material findings\./);
});

test("findings are ordered by severity rather than by the order Claude emitted them", () => {
  const parsed = reviewPayload({
    findings: [
      finding({ severity: "low", title: "Later", line_start: 9, line_end: 9, recommendation: "" }),
      finding({ severity: "critical", title: "First", line_start: 1, line_end: 4, recommendation: "Fix" })
    ]
  });

  const output = renderReviewResult({ parsed, parseError: null, rawOutput: "" }, META);

  assert.ok(output.indexOf("[critical] First") < output.indexOf("[low] Later"), output);
  assert.match(output, /\(a\.js:1-4\)/);
  assert.match(output, /\(a\.js:9\)/);
  assert.match(output, /Recommendation: Fix/);
});

test("a malformed review is reported as a failure with the raw text kept", () => {
  const output = renderReviewResult(
    { parsed: null, parseError: "Unexpected token I", rawOutput: "I could not produce JSON." },
    META
  );

  assert.match(output, /Claude did not return valid structured JSON\./);
  assert.match(output, /Parse error: Unexpected token I/);
  assert.match(output, /I could not produce JSON\./);
  // A failed review must never read as an approval.
  assert.ok(!output.includes("Verdict:"), output);
});

test("JSON of the wrong shape is rejected rather than rendered as an empty review", () => {
  const output = renderReviewResult({ parsed: { verdict: "approve" }, parseError: null, rawOutput: "{}" }, META);

  assert.match(output, /unexpected review shape/);
  assert.match(output, /Missing string `summary`/);
});

// A verdict outside the schema's enumeration would otherwise be printed verbatim, so a
// reviewer that answered "looks-fine" would read as a ruling it never made.
test("a verdict outside the schema's enumeration is rejected", () => {
  const output = renderReviewResult(
    { parsed: reviewPayload({ verdict: "looks-fine" }), parseError: null, rawOutput: "{}" },
    META
  );

  assert.match(output, /unexpected review shape/);
  assert.match(output, /`verdict` must be one of approve, needs-attention/);
  assert.ok(!output.includes("Verdict: looks-fine"), output);
});

// Every field the schema marks required is re-checked here, so an incomplete finding
// cannot be silently defaulted into a rendered verdict.
test("a finding missing any schema-required field is rejected rather than defaulted", () => {
  const cases = [
    [{ file: undefined }, /Finding 1 is missing string `file`/],
    [{ title: undefined }, /Finding 1 is missing string `title`/],
    [{ title: "   " }, /Finding 1 is missing string `title`/],
    [{ body: undefined }, /Finding 1 is missing string `body`/],
    [{ severity: undefined }, /Finding 1 has severity undefined/],
    [{ severity: "urgent" }, /Finding 1 has severity "urgent"/],
    [{ line_start: undefined }, /Finding 1 is missing a positive integer `line_start`/],
    [{ line_end: 0 }, /Finding 1 is missing a positive integer `line_end`/],
    [{ confidence: undefined }, /Finding 1 is missing a `confidence` between 0 and 1/],
    [{ confidence: 4 }, /Finding 1 is missing a `confidence` between 0 and 1/],
    [{ recommendation: undefined }, /Finding 1 is missing string `recommendation`/]
  ];

  for (const [override, expected] of cases) {
    const output = renderReviewResult(
      { parsed: reviewPayload({ findings: [finding(override)] }), parseError: null, rawOutput: "{}" },
      META
    );
    assert.match(output, expected);
    assert.ok(!output.includes("Verdict:"), output);
  }
});

// Reproduces the exact payload that previously rendered as an approval: an `approve`
// verdict whose one finding is missing every optional-looking but required field.
test("an approve verdict carrying an incomplete finding does not render as approval", () => {
  const output = renderReviewResult(
    {
      parsed: {
        verdict: "approve",
        summary: "Looks fine.",
        findings: [{ severity: "low", title: "T", body: "B", file: "a.js" }],
        next_steps: []
      },
      parseError: null,
      rawOutput: "{}"
    },
    META
  );

  assert.match(output, /unexpected review shape/);
  assert.ok(!output.includes("Verdict: approve"), output);
});

test("a next step that is not a non-empty string is rejected", () => {
  const output = renderReviewResult(
    { parsed: reviewPayload({ next_steps: ["fine", "  "] }), parseError: null, rawOutput: "{}" },
    META
  );

  assert.match(output, /Next step 2 is not a non-empty string/);
  assert.ok(!output.includes("Verdict:"), output);
});

test("a complete finding still renders", () => {
  const output = renderReviewResult(
    { parsed: reviewPayload({ findings: [finding()], next_steps: ["Do the thing."] }), parseError: null, rawOutput: "" },
    META
  );

  assert.match(output, /Verdict: needs-attention/);
  assert.match(output, /\[high\] T \(a\.js:1\)/);
  assert.match(output, /Recommendation: Fix it\./);
  assert.match(output, /- Do the thing\./);
});

test("the built-in reviewer's own text is passed through under the scope header", () => {
  const output = renderNativeReviewResult(
    { text: "Found one bug in calc.js.", stderr: "", isError: false },
    { ...META, reviewLabel: "Review", evidenceNote: "the built-in reviewer collected its own evidence" }
  );

  assert.match(output, /^# Claude Review/);
  assert.match(output, /Scope: uncommitted work, selected/);
  assert.match(output, /Found one bug in calc\.js\./);
});

test("a failed built-in review says so instead of rendering an empty report", () => {
  const output = renderNativeReviewResult(
    { text: "", stderr: "boom", isError: true },
    { ...META, reviewLabel: "Review" }
  );

  assert.match(output, /Claude review failed\./);
  assert.match(output, /boom/);
});

test("the setup report keeps its next steps", () => {
  const output = renderSetupReport({
    ready: false,
    node: { available: true, detail: "v22.0.0" },
    claude: { available: true, meetsMinimum: true, detail: "2.1.227" },
    auth: { loggedIn: false, detail: "signed out" },
    workspaceRoot: "/tmp/x",
    stopReviewRequested: false,
    actionsTaken: [],
    nextSteps: ["Run `claude auth login`."]
  });

  assert.match(output, /Status: needs attention/);
  assert.match(output, /Run `claude auth login`\./);
});

function jobFixture(overrides = {}) {
  return {
    id: "review-abc",
    kind: "review",
    title: "Review",
    status: "completed",
    phase: "done",
    summary: "Nothing to fix.",
    duration: "12s",
    progressPreview: [],
    ...overrides
  };
}

test("the status report says so when there is nothing to report", () => {
  const output = renderStatusReport({
    workspaceRoot: "/repo",
    config: { stopReviewGate: false },
    active: [],
    finished: []
  });

  assert.match(output, /No active jobs\./);
  assert.match(output, /No finished jobs recorded yet\./);
  assert.match(output, /Stop-time review: not requested/);
});

// The only fact available is that no process answers to the pid. Naming a cause would
// claim knowledge the check does not produce.
test("a vanished worker is reported as an observation, not a diagnosis", () => {
  const output = renderStatusReport({
    workspaceRoot: "/repo",
    config: { stopReviewGate: false },
    active: [jobFixture({ status: "running", phase: "working", pid: 4242, elapsed: "3s", workerMissing: true })],
    finished: []
  });

  assert.match(output, /No process is running under the recorded pid 4242/);
  assert.doesNotMatch(output, /crash/i);
  assert.doesNotMatch(output, /failed/i);
});

test("a summary containing a pipe cannot break the job table", () => {
  const output = renderStatusReport({
    workspaceRoot: "/repo",
    config: { stopReviewGate: false },
    active: [],
    finished: [jobFixture({ summary: "a | b\nsecond line" })]
  });

  const row = output.split("\n").find((line) => line.includes("review-abc"));
  // Only an unescaped pipe separates cells, so the row still holds exactly the six
  // columns the header declared, and the summary keeps its own pipe as text.
  assert.equal(row.split(/(?<!\\)\|/).length - 2, 6);
  assert.match(row, /a \\\| b second line/);
});

// A cancelled run stored nothing, so pointing at `/claude-result` would promise output
// that command cannot produce.
test("a cancelled job is not advertised as having a stored result", () => {
  const output = renderJobStatusReport(jobFixture({ status: "cancelled", phase: "cancelled" }));

  assert.match(output, /This record was cancelled and stored no result/);
  assert.doesNotMatch(output, /Read the stored output/);
});

test("waiting that timed out says the run was left alone", () => {
  const output = renderJobStatusReport(
    jobFixture({ status: "running", phase: "working", elapsed: "2m 0s", duration: null }),
    { waitTimedOut: true, timeoutMs: 120000 }
  );

  assert.match(output, /Still running after waiting 120s\. The run was not stopped\./);
});

test("a job status report lists the progress the log recorded", () => {
  const output = renderJobStatusReport(
    jobFixture({ status: "running", progressPreview: ["Claude session ready.", "Using Read: AGENTS.md"] })
  );

  assert.match(output, /Progress:\n- Claude session ready\.\n- Using Read: AGENTS\.md/);
});

test("the stored result reproduces what the run itself rendered", () => {
  const output = renderStoredJobResult(jobFixture(), { rendered: "# Claude Review\n\nVerdict: approve\n" });

  assert.match(output, /# Claude Review\n\nVerdict: approve/);
  assert.match(output, /Status: completed/);
});

test("a job with no stored output reports the reason rather than an empty section", () => {
  const output = renderStoredJobResult(jobFixture({ status: "cancelled", errorMessage: "Cancelled by user." }), {});

  assert.match(output, /The job did not produce output: Cancelled by user\./);
});

test("a job with neither output nor error says nothing was stored", () => {
  const output = renderStoredJobResult(jobFixture(), {});

  assert.match(output, /No output was stored for this job\./);
});

// Cancelling reports what happened to the process separately from what the record now
// says, because the two can disagree.
test("cancelling reports whether a process was actually terminated", () => {
  const terminated = renderCancelReport(jobFixture({ pid: 4242 }), { attempted: true, delivered: true, method: "taskkill" });
  assert.match(terminated, /Terminated the process tree under pid 4242 with taskkill\./);
  // Only the pid is known to have been terminated; calling it the worker would claim an
  // identity check the code does not make.
  assert.doesNotMatch(terminated, /worker process tree/);

  const alreadyGone = renderCancelReport(jobFixture({ pid: 4242 }), { attempted: true, delivered: false, method: "taskkill" });
  assert.match(alreadyGone, /taskkill did not stop anything under pid 4242; no process answered to it\./);

  // Cancelling a job with no worker on record clears it without claiming a kill, and says
  // what protects the record from a worker that starts afterwards.
  const noPid = renderCancelReport(jobFixture({ pid: null }), { attempted: false, delivered: false, method: null });
  assert.match(noPid, /No worker was recorded for this job, so nothing was stopped\./);
  assert.match(noPid, /it may still run and replace this cancellation/);
  // Nothing was stopped here, so the no-result promise the other branches make must not
  // appear in this one.
  assert.doesNotMatch(noPid, /stored no result/);
  // Nothing here may promise the run was stopped, because that is exactly what could not
  // be established.
  assert.doesNotMatch(noPid, /Terminated/);
});

test("a queued launch points at the commands that follow it", () => {
  const output = renderQueuedJobLaunch({ jobId: "review-abc", title: "Review", summary: "Review of HEAD" });

  assert.match(output, /Queued as review-abc/);
  assert.match(output, /\/claude-status review-abc/);
  assert.match(output, /\/claude-result review-abc/);
  assert.match(output, /\/claude-cancel review-abc/);
});

// A run that finished while the cancel was in flight is reported as what it is. Calling it
// cancelled would hide a result the user can still read.
test("a cancel that lost the race reports the outcome instead of a cancellation", () => {
  const output = renderLateCancelReport(jobFixture(), "completed");

  assert.match(output, /is recorded as completed, so no cancellation was written over it/);
  assert.match(output, /See what it recorded with `\/claude-result review-abc`/);
  assert.doesNotMatch(output, /stored no result/);
});

// A signal is a request. Saying the run "ended there" would claim an outcome the code
// never observed, and only `taskkill /T /F` cannot be declined.
test("a signalled cancellation does not claim the run ended", () => {
  const output = renderCancelReport(jobFixture({ pid: 4242 }), { attempted: true, delivered: true, method: "process" });

  assert.match(output, /Sent SIGTERM to pid 4242 alone; no process group answered to it/);
  // Only one process was reached, so nothing may be said about what the run started.
  assert.match(output, /may still finish and replace this cancellation/);
  assert.doesNotMatch(output, /Nothing under that pid survives it/);

  // Windows without taskkill ends one process outright, and there is no group to address.
  const killed = renderCancelReport(jobFixture({ pid: 4242 }), { attempted: true, delivered: true, method: "kill" });
  assert.match(killed, /Ended pid 4242 on its own, because taskkill was not available/);
  assert.doesNotMatch(killed, /SIGTERM/);

  // Reaching the group is the case where the run's own processes were addressed.
  const grouped = renderCancelReport(jobFixture({ pid: 4242 }), {
    attempted: true,
    delivered: true,
    method: "process-group"
  });
  assert.match(grouped, /Sent SIGTERM to the process group of pid 4242/);
  assert.match(grouped, /What was signalled ends there if it takes the signal/);
});

// The termination went out before the outcome came into view, so reporting only that the
// job was left alone would hide a signal that was actually sent.
test("a cancel that lost the race still reports the stop it had already sent", () => {
  const output = renderLateCancelReport(jobFixture({ pid: 4242 }), "completed", {
    attempted: true,
    delivered: true,
    method: "taskkill"
  });

  assert.match(output, /A stop had already been sent to pid 4242/);
  assert.match(output, /is recorded as completed, so no cancellation was written over it/);
});
