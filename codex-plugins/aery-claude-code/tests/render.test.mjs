import test from "node:test";
import assert from "node:assert/strict";

import { renderNativeReviewResult, renderReviewResult, renderSetupReport } from "../scripts/lib/render.mjs";

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
    reviewGateEnabled: false,
    actionsTaken: [],
    nextSteps: ["Run `claude auth login`."]
  });

  assert.match(output, /Status: needs attention/);
  assert.match(output, /Run `claude auth login`\./);
});
