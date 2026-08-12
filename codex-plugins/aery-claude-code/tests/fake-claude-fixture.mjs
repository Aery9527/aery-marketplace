import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { writeExecutable } from "./helpers.mjs";

export const FAKE_CLAUDE_VERSION = "2.1.227 (Claude Code)";

// Stands in for the real CLI so command behaviour can be exercised without spending
// tokens: it answers the three surfaces the bridge depends on — version, auth status,
// and a stream-json session.
export function installFakeClaude(binDir, behavior = "ready") {
  const scriptPath = path.join(binDir, "claude");
  const source = `#!/usr/bin/env node
const readline = require("node:readline");

const fs = require("node:fs");

const BEHAVIOR = ${JSON.stringify(behavior)};

// Flags are the contract between the bridge and the CLI, so a test can assert what was
// actually passed rather than trusting that the run merely succeeded.
if (process.env.FAKE_CLAUDE_ARGV_FILE) {
  fs.writeFileSync(process.env.FAKE_CLAUDE_ARGV_FILE, JSON.stringify(process.argv.slice(2)));
}
const VERSION = BEHAVIOR === "old-version"
  ? "2.1.100 (Claude Code)"
  : BEHAVIOR === "garbage-version"
    ? "some other tool build 9.9.9"
    : ${JSON.stringify(FAKE_CLAUDE_VERSION)};
const argv = process.argv.slice(2);

function send(event) {
  process.stdout.write(JSON.stringify(event) + "\\n");
}

if (argv.includes("--version") || argv.includes("-v")) {
  process.stdout.write(VERSION + "\\n");
  process.exit(0);
}

if (argv[0] === "auth" && argv[1] === "status") {
  if (BEHAVIOR === "auth-fails") {
    process.stderr.write("not authenticated\\n");
    process.exit(1);
  }
  if (BEHAVIOR === "auth-garbage") {
    process.stdout.write("not json at all\\n");
    process.exit(0);
  }
  if (BEHAVIOR === "auth-null") {
    process.stdout.write("null\\n");
    process.exit(0);
  }
  if (BEHAVIOR === "auth-string-false") {
    process.stdout.write(JSON.stringify({ loggedIn: "false" }) + "\\n");
    process.exit(0);
  }
  const loggedIn = BEHAVIOR !== "logged-out";
  process.stdout.write(JSON.stringify({
    loggedIn,
    authMethod: loggedIn ? "claude.ai" : null,
    apiProvider: loggedIn ? "firstParty" : null,
    subscriptionType: loggedIn ? "pro" : null
  }) + "\\n");
  process.exit(0);
}

if (!argv.includes("-p")) {
  process.stderr.write("fake claude: unsupported invocation\\n");
  process.exit(2);
}

const sessionId = "00000000-0000-4000-8000-000000000001";
let turn = 0;

send({
  type: "system",
  subtype: "init",
  session_id: sessionId,
  model: "fake",
  capabilities: BEHAVIOR === "no-interrupt"
    ? ["msg_lifecycle_v1"]
    : ["interrupt_receipt_v1", "interrupt_cancel_queued_v1", "msg_lifecycle_v1"]
});

const reader = readline.createInterface({ input: process.stdin });
let inFlight = null;

const REVIEW_OUTPUT = {
  verdict: "needs-attention",
  summary: "The fixture always reports one finding.",
  findings: [
    {
      severity: "high",
      title: "Fixture finding",
      body: "Planted by the fake CLI so the render path has something to format.",
      file: "README.md",
      line_start: 1,
      line_end: 1,
      confidence: 0.9,
      recommendation: "Nothing to do; this is a fixture."
    }
  ],
  next_steps: ["Read the rendered output."]
};

function completeTurn(text) {
  // A schema-constrained turn answers with the object as well as the text, which is what
  // the real CLI does on the final result event.
  if (argv.includes("--json-schema")) {
    // A turn can fail and still carry well-formed JSON, which is the case that must not
    // be rendered as a trustworthy verdict.
    if (BEHAVIOR === "errored-review") {
      send({
        type: "result",
        subtype: "error_during_execution",
        is_error: true,
        session_id: sessionId,
        result: JSON.stringify(REVIEW_OUTPUT),
        structured_output: REVIEW_OUTPUT
      });
      return;
    }
    // Well-formed JSON in the text with no structured_output means the schema check did
    // not produce it, so the text must not be trusted as a review.
    const payload = BEHAVIOR === "text-json-only"
      ? { result: JSON.stringify({ verdict: "approve", summary: "Looks fine.", findings: [], next_steps: [] }) }
      : BEHAVIOR === "unstructured-review"
        ? { result: "I could not produce JSON." }
        : { result: JSON.stringify(REVIEW_OUTPUT), structured_output: REVIEW_OUTPUT };
    send({
      type: "result",
      subtype: "success",
      is_error: false,
      session_id: sessionId,
      total_cost_usd: 0.01,
      duration_ms: 5,
      ...payload
    });
    return;
  }

  send({
    type: "result",
    subtype: "success",
    is_error: false,
    session_id: sessionId,
    result: text.startsWith("/code-review") ? "Built-in reviewer report for " + text : "turn" + turn + ":" + text,
    total_cost_usd: 0.01,
    duration_ms: 5
  });
}

reader.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }
  const message = JSON.parse(trimmed);

  if (message.type === "control_request") {
    // Models a CLI that accepts the frame but never answers it.
    if (BEHAVIOR === "no-control-response") {
      return;
    }
    // Answers, but too late for a short wait, so the guard has to be released later.
    if (BEHAVIOR === "slow-control-response") {
      const requestId = message.request_id;
      setTimeout(() => {
        send({
          type: "control_response",
          response: { subtype: "success", request_id: requestId, response: {} }
        });
      }, 250);
      return;
    }
    if (BEHAVIOR === "wrong-control-id") {
      send({
        type: "control_response",
        response: { subtype: "success", request_id: "not-the-one-you-sent", response: {} }
      });
      return;
    }
    send({
      type: "control_response",
      response: { subtype: "success", request_id: message.request_id, response: { still_queued: [] } }
    });
    // The real CLI ends the interrupted turn with an error result and keeps serving.
    if (inFlight) {
      clearTimeout(inFlight.timer);
      inFlight = null;
      send({ type: "result", subtype: "error_during_execution", is_error: true, session_id: sessionId });
    }
    return;
  }

  if (message.type !== "user") {
    return;
  }

  turn += 1;
  const text = message.message.content.map((block) => block.text).join("");

  if (BEHAVIOR === "malformed-stream") {
    process.stdout.write("this line is not json\\n");
    return;
  }

  send({ type: "assistant", session_id: sessionId, message: { role: "assistant", content: [{ type: "text", text }] } });

  // A turn that finishes instantly leaves no window to interrupt, so a prompt marked
  // SLOW is held open until it is either interrupted or times out.
  if (BEHAVIOR === "slow-turn" && text.includes("SLOW")) {
    inFlight = { text, timer: setTimeout(() => { inFlight = null; completeTurn(text); }, 10000) };
    return;
  }

  completeTurn(text);
});

reader.on("close", () => {
  process.exit(0);
});
`;
  writeExecutable(scriptPath, source);

  // Windows resolves a bare `claude` on PATH through an executable extension, so the
  // fake binary needs the same .cmd wrapper a global npm install would provide.
  if (process.platform === "win32") {
    fs.writeFileSync(path.join(binDir, "claude.cmd"), `@echo off\r\nnode "%~dp0claude" %*\r\n`, {
      encoding: "utf8"
    });
  }
}

export function buildEnv(binDir, overrides = {}) {
  const separator = process.platform === "win32" ? ";" : ":";
  return {
    ...process.env,
    PATH: `${binDir}${separator}${process.env.PATH}`,
    ...overrides
  };
}
