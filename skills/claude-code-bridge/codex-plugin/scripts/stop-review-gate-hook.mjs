import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { getClaudeAuthStatus, runClaudePrompt } from "./lib/claude.mjs";
import { buildStatusSnapshot } from "./lib/job-control.mjs";
import { getConfig } from "./lib/state.mjs";
import { SESSION_ID_ENV } from "./lib/tracked-jobs.mjs";
import { resolveWorkspaceRoot } from "./lib/workspace.mjs";

const PROMPT_PATH = fileURLToPath(new URL("../prompts/stop-review-gate.md", import.meta.url));
const REVIEW_TIMEOUT_MS = 2 * 60 * 1000;
const READ_ONLY_TOOLS = Object.freeze(["Read", "Glob", "Grep"]);
const PROTOCOL_FAILURE = "Claude stop-time review protocol requires a first line of exactly ALLOW or BLOCK, and BLOCK must include a reason.";

function readSessionId(input) {
  return typeof input.session_id === "string" && input.session_id.trim()
    ? input.session_id.trim()
    : null;
}

function runningJobNote(cwd, sessionId) {
  if (!sessionId) {
    return null;
  }

  const active = buildStatusSnapshot(cwd, {
    all: true,
    env: { [SESSION_ID_ENV]: sessionId }
  }).active;
  if (active.length === 0) {
    return null;
  }

  const jobs = active.map((job) => `${job.id} (${job.status}: ${job.summary ?? "Claude work"})`);
  return `Claude ${jobs.length === 1 ? "job is" : "jobs are"} still running: ${jobs.join(", ")}.`;
}

function allow(systemMessage, jobNote) {
  const messages = [systemMessage, jobNote].filter(Boolean);
  return messages.length > 0
    ? { decision: "allow", systemMessage: messages.join("\n") }
    : { decision: "allow" };
}

function block(reason, jobNote) {
  return {
    decision: "block",
    reason: jobNote ? `${reason}\n\n${jobNote}` : reason
  };
}

function reviewDecision(output, jobNote) {
  const lines = String(output ?? "").split(/\r?\n/);
  if (lines[0] === "ALLOW") {
    return allow(null, jobNote);
  }
  if (lines[0] === "BLOCK") {
    const reason = lines.slice(1).join("\n").trim();
    return reason ? block(reason, jobNote) : block(PROTOCOL_FAILURE, jobNote);
  }
  return block(PROTOCOL_FAILURE, jobNote);
}

function buildPrompt(lastAssistantMessage) {
  const template = fs.readFileSync(PROMPT_PATH, "utf8");
  const encoded = JSON.stringify(lastAssistantMessage).replace(/[<>&]/g, (character) => {
    const escapes = { "<": "\\u003c", ">": "\\u003e", "&": "\\u0026" };
    return escapes[character];
  });
  return template.replace("{{LAST_ASSISTANT_MESSAGE_JSON}}", () => encoded);
}

export async function handleStopReviewEvent(input = {}, options = {}) {
  const cwd = resolveWorkspaceRoot(input.cwd || options.cwd || process.cwd());
  const sessionId = readSessionId(input);
  const jobNote = runningJobNote(cwd, sessionId);
  const config = getConfig(cwd);

  if (!config.stopReviewGate) {
    return allow("Claude stop-time review is disabled for this workspace.", jobNote);
  }

  const lastAssistantMessage = typeof input.last_assistant_message === "string"
    ? input.last_assistant_message
    : "";
  if (!lastAssistantMessage.trim()) {
    return allow("Claude stop-time review was skipped because the previous Codex response was missing.", jobNote);
  }

  const getReadiness = options.getReadiness ?? getClaudeAuthStatus;
  const readiness = getReadiness(cwd);
  if (!readiness.available || readiness.loggedIn !== true) {
    return allow(
      `Claude stop-time review was skipped: ${readiness.detail}. Run /claude-setup to diagnose the installation or sign-in state.`,
      jobNote
    );
  }

  const runReview = options.runReview ?? runClaudePrompt;
  try {
    const result = await runReview(cwd, buildPrompt(lastAssistantMessage), {
      permissionMode: "dontAsk",
      strictMcpConfig: true,
      tools: [...READ_ONLY_TOOLS],
      timeoutMs: REVIEW_TIMEOUT_MS
    });
    if (result.isError) {
      const detail = String(result.text || result.stderr || "Claude returned an unsuccessful review turn.").trim();
      return block(`Claude stop-time review failed: ${detail}`, jobNote);
    }
    return reviewDecision(result.text, jobNote);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return block(`Claude stop-time review failed: ${detail}`, jobNote);
  }
}

async function main() {
  const raw = fs.readFileSync(0, "utf8").trim();
  const input = raw ? JSON.parse(raw) : {};
  const decision = await handleStopReviewEvent(input);
  process.stdout.write(`${JSON.stringify(decision)}\n`);
}

const scriptPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (scriptPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
