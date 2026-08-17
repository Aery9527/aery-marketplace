// Host-facing half of the runtime: what "Claude Code is usable here" means, and how
// the bridge asks it a question. Upstream reaches the equivalent answers through the
// Codex app server; the CLI answers them directly.
import process from "node:process";

import { buildSpawnPlan, runClaudeOnce } from "./claude-cli.mjs";
import { runCommand } from "./process.mjs";
import { isInitEvent, readSessionId } from "./stream-protocol.mjs";

// `capabilities` on the stream init event, which the bridge relies on for feature
// detection, first shipped in this release.
export const MINIMUM_CLAUDE_VERSION = "2.1.205";

// Upstream accepts `none` and `minimal`, which the Claude CLI does not offer, and
// does not accept `max`, which it does. Silently remapping either would change what
// the user asked for, so unsupported values are rejected instead.
export const VALID_REASONING_EFFORTS = new Set(["low", "medium", "high", "xhigh", "max"]);

export function normalizeReasoningEffort(effort) {
  if (effort == null) {
    return null;
  }
  const normalized = String(effort).trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (!VALID_REASONING_EFFORTS.has(normalized)) {
    throw new Error(
      `Unsupported reasoning effort "${effort}". Use one of: low, medium, high, xhigh, max.`
    );
  }
  return normalized;
}

// `claude --version` prints `2.1.227 (Claude Code)`. Anchoring on that shape keeps an
// unrelated binary that happens to print a version number from being accepted.
const VERSION_LINE = /^(\d+)\.(\d+)\.(\d+)\b/;

function parseVersion(text) {
  const match = VERSION_LINE.exec(String(text ?? "").trim());
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) {
    return null;
  }
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) {
      return a[index] < b[index] ? -1 : 1;
    }
  }
  return 0;
}

// Every `claude` invocation goes through the resolved executable rather than a bare
// name, so availability, auth and turns all reach the same install.
function runClaudeCommand(cwd, args, env = process.env) {
  const plan = buildSpawnPlan(args, env);
  return runCommand(plan.file, plan.args, { cwd, env, shell: false, ...plan.options });
}

function claudeVersionStatus(cwd, env) {
  const result = runClaudeCommand(cwd, ["--version"], env);
  if (result.error?.code === "ENOENT") {
    return { available: false, detail: "not found" };
  }
  if (result.error) {
    return { available: false, detail: result.error.message };
  }
  if (result.status !== 0) {
    return {
      available: false,
      detail: result.stderr.trim() || result.stdout.trim() || `exit ${result.status}`
    };
  }
  return { available: true, detail: result.stdout.trim() || result.stderr.trim() || "ok" };
}

export function getClaudeAvailability(cwd, env = process.env) {
  const versionStatus = claudeVersionStatus(cwd, env);
  if (!versionStatus.available) {
    return { ...versionStatus, version: null, meetsMinimum: false };
  }

  const version = parseVersion(versionStatus.detail);
  if (!version) {
    return {
      available: false,
      detail: `\`claude --version\` printed something unrecognisable: ${versionStatus.detail}`,
      version: null,
      meetsMinimum: false
    };
  }

  // The version is advisory. What the bridge actually depends on is announced per
  // session in `system/init.capabilities`, so the runtime feature-detects rather than
  // refusing to start on a version string.
  const comparison = compareVersions(versionStatus.detail, MINIMUM_CLAUDE_VERSION);
  return {
    available: true,
    detail: versionStatus.detail,
    version: version.join("."),
    meetsMinimum: comparison !== null && comparison >= 0
  };
}

export function getClaudeAuthStatus(cwd, env = process.env) {
  const availability = getClaudeAvailability(cwd, env);
  if (!availability.available) {
    return {
      available: false,
      loggedIn: false,
      detail: availability.detail,
      source: "availability",
      authMethod: null,
      apiProvider: null,
      subscriptionType: null
    };
  }

  const result = runClaudeCommand(cwd, ["auth", "status", "--json"], env);
  if (result.error || result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim() || `exit ${result.status}`;
    return {
      available: true,
      loggedIn: false,
      detail,
      source: "auth-status",
      authMethod: null,
      apiProvider: null,
      subscriptionType: null
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (error) {
    return {
      available: true,
      loggedIn: false,
      detail: `claude auth status returned unreadable JSON: ${error.message}`,
      source: "auth-status",
      authMethod: null,
      apiProvider: null,
      subscriptionType: null
    };
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      available: true,
      loggedIn: false,
      detail: "claude auth status returned JSON that is not an object",
      source: "auth-status",
      authMethod: null,
      apiProvider: null,
      subscriptionType: null
    };
  }

  // Only a real boolean true counts. A string "false" is truthy and would otherwise
  // report a signed-out install as ready.
  const loggedIn = parsed.loggedIn === true;
  return {
    available: true,
    loggedIn,
    detail: loggedIn
      ? `signed in via ${parsed.authMethod ?? "unknown"}${parsed.subscriptionType ? ` (${parsed.subscriptionType})` : ""}`
      : "not signed in",
    source: "auth-status",
    authMethod: parsed.authMethod ?? null,
    apiProvider: parsed.apiProvider ?? null,
    subscriptionType: parsed.subscriptionType ?? null
  };
}

export function ensureClaudeAvailable(cwd, env = process.env) {
  const availability = getClaudeAvailability(cwd, env);
  if (!availability.available) {
    throw new Error(
      `Claude Code is not usable here: ${availability.detail}. Install or update it, then rerun /claude-setup.`
    );
  }
  return availability;
}

// Every environment variable Claude Code reads for its own runtime is inherited, so
// the bridge uses the same install, login and configuration the user already has.
export function buildClaudeEnv(overrides = {}) {
  return { ...process.env, ...overrides };
}

// A progress line is only ever a report of a frame that arrived. Upstream's app server
// names the phase itself; the CLI does not, so the phase is read off what the stream
// shows: the session announcing itself, a tool call in flight, an answer being written.
const PROGRESS_TOOL_TARGET_FIELDS = ["file_path", "pattern", "command", "description"];
const MAX_PROGRESS_DETAIL = 80;

// A log line is one line by contract, so anything quoted out of the stream is flattened
// before it can break the progress reader that parses those lines back.
function shortenForProgress(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > MAX_PROGRESS_DETAIL ? `${text.slice(0, MAX_PROGRESS_DETAIL - 1)}…` : text;
}

function describeToolUse(block) {
  const name = typeof block.name === "string" && block.name.trim() ? shortenForProgress(block.name) : "a tool";
  const input = block.input && typeof block.input === "object" ? block.input : {};
  const field = PROGRESS_TOOL_TARGET_FIELDS.find((key) => typeof input[key] === "string" && input[key].trim());
  return field ? `Using ${name}: ${shortenForProgress(input[field])}` : `Using ${name}`;
}

export function describeStreamEvent(event) {
  if (isInitEvent(event)) {
    // Every value quoted into a message is flattened, including the ones that arrive as
    // identifiers: the protocol only guarantees they are strings, and one line is what the
    // log format promises.
    const sessionId = readSessionId(event);
    return {
      message: sessionId ? `Claude session ready (${shortenForProgress(sessionId)}).` : "Claude session ready.",
      phase: "starting",
      sessionId
    };
  }

  if (event.type === "assistant") {
    const blocks = Array.isArray(event.message?.content) ? event.message.content : [];
    const toolUse = blocks.find((block) => block?.type === "tool_use");
    if (toolUse) {
      return { message: describeToolUse(toolUse), phase: "working" };
    }
    const text = blocks.find((block) => block?.type === "text" && String(block.text ?? "").trim());
    if (text) {
      return { message: `Writing: ${shortenForProgress(text.text)}`, phase: "responding" };
    }
    return null;
  }

  if (event.type === "result") {
    const subtype = typeof event.subtype === "string" ? shortenForProgress(event.subtype) : "unknown";
    return { message: `Turn ended (${subtype}).`, sessionId: readSessionId(event) };
  }

  return null;
}

export function createStreamProgressListener(onProgress) {
  if (!onProgress) {
    return undefined;
  }
  return (event) => {
    const progress = describeStreamEvent(event);
    if (progress) {
      onProgress(progress);
    }
  };
}

export async function runClaudePrompt(cwd, prompt, options = {}) {
  // The availability check and the run must see the same environment, or the bridge
  // could verify one install and then drive a different one.
  const env = buildClaudeEnv(options.envOverrides);
  ensureClaudeAvailable(cwd, env);
  return runClaudeOnce(cwd, prompt, {
    ...options,
    effort: normalizeReasoningEffort(options.effort),
    env
  });
}
