#!/usr/bin/env node
// Single entry point for every bridge command. The Codex-side command and agent files
// are thin: they decide which subcommand to run and print its stdout unchanged.

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { parseArgs, splitRawArgumentString } from "./lib/args.mjs";
import { runClaudeOnce } from "./lib/claude-cli.mjs";
import { getClaudeAuthStatus, getClaudeAvailability, MINIMUM_CLAUDE_VERSION } from "./lib/claude.mjs";
import { readJsonFile } from "./lib/fs.mjs";
import {
  collectReviewContext,
  describeReviewScope,
  ensureGitRepository,
  resolveReviewTarget
} from "./lib/git.mjs";
import { interpolateTemplate, loadPromptTemplate } from "./lib/prompts.mjs";
import { renderNativeReviewResult, renderReviewResult, renderSetupReport } from "./lib/render.mjs";
import { getConfig, setConfig } from "./lib/state.mjs";
import { resolveWorkspaceRoot } from "./lib/workspace.mjs";

const ROOT_DIR = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const REVIEW_SCHEMA_PATH = path.join(ROOT_DIR, "schemas", "review-output.schema.json");

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
  "  node scripts/claude-companion.mjs review [--json] [--base <ref>] [--scope auto|working-tree|branch] [--model <model>] [--cwd <path>]",
  "  node scripts/claude-companion.mjs adversarial-review [--json] [--base <ref>] [--scope auto|working-tree|branch] [--model <model>] [--cwd <path>] [focus text]",
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
      "Optional: run `/claude-setup --enable-review-gate` to require a fresh Claude review before a turn ends."
    );
  }

  return {
    ready: node.available && claudeStatus.available && authStatus.loggedIn,
    node,
    claude: claudeStatus,
    auth: authStatus,
    workspaceRoot,
    reviewGateEnabled: Boolean(config.stopReviewGate),
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
    actionsTaken.push(`Enabled the stop-time review gate for ${workspaceRoot}.`);
  } else if (options["disable-review-gate"]) {
    setConfig(workspaceRoot, "stopReviewGate", false);
    actionsTaken.push(`Disabled the stop-time review gate for ${workspaceRoot}.`);
  }

  const report = buildSetupReport(cwd, actionsTaken);
  outputResult(options.json ? report : renderSetupReport(report), Boolean(options.json));
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

function resolveReviewRequest(options, positionals, scopeOptions = {}) {
  const cwd = resolveCommandCwd(options);
  ensureClaudeAvailable(cwd);
  ensureGitRepository(cwd);

  const target = resolveReviewTarget(cwd, { base: options.base, scope: options.scope });
  return {
    cwd,
    target,
    scopeNote: describeReviewScope(cwd, target, scopeOptions),
    focusText: positionals.join(" ").trim(),
    model: options.model ? String(options.model) : undefined
  };
}

async function runNativeReview(request) {
  const result = await runClaudeOnce(request.cwd, buildNativeReviewPrompt(request.target), {
    ...NATIVE_REVIEW_SESSION,
    model: request.model
  });

  const meta = {
    reviewLabel: "Review",
    targetLabel: request.target.label,
    scopeNote: request.scopeNote,
    evidenceNote: "the built-in reviewer collected its own evidence; this bridge supplied no diff"
  };

  return {
    payload: {
      review: "Review",
      target: request.target,
      scopeNote: request.scopeNote,
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

async function runAdversarialReview(request) {
  const context = collectReviewContext(request.cwd, request.target);
  const result = await runClaudeOnce(context.repoRoot, buildAdversarialReviewPrompt(context, request.focusText), {
    ...READ_ONLY_SESSION,
    model: request.model,
    jsonSchema: readJsonFile(REVIEW_SCHEMA_PATH)
  });
  const parsed = parseReviewOutput(result);

  const meta = {
    reviewLabel: "Adversarial Review",
    targetLabel: request.target.label,
    scopeNote: request.scopeNote,
    evidenceNote: describeReviewEvidence(context)
  };

  return {
    payload: {
      review: "Adversarial Review",
      target: request.target,
      scopeNote: request.scopeNote,
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

async function handleReview(argv) {
  const { options, positionals } = parseCommandInput(argv, {
    valueOptions: ["cwd", "base", "scope", "model"],
    booleanOptions: ["json"]
  });

  const request = resolveReviewRequest(options, positionals, { authoritative: false });
  if (request.focusText) {
    throw new Error(
      `\`/claude-review\` runs the built-in reviewer and takes no focus text. Retry with \`/claude-adversarial-review ${request.focusText}\`.`
    );
  }

  const outcome = await runNativeReview(request);
  outputResult(options.json ? outcome.payload : outcome.rendered, Boolean(options.json));
}

async function handleAdversarialReview(argv) {
  const { options, positionals } = parseCommandInput(argv, {
    valueOptions: ["cwd", "base", "scope", "model"],
    booleanOptions: ["json"]
  });

  const outcome = await runAdversarialReview(resolveReviewRequest(options, positionals));
  outputResult(options.json ? outcome.payload : outcome.rendered, Boolean(options.json));
}

async function main() {
  const [subcommand, ...argv] = process.argv.slice(2);

  switch (subcommand) {
    case "setup":
      handleSetup(argv);
      break;
    case "review":
      await handleReview(argv);
      break;
    case "adversarial-review":
      await handleAdversarialReview(argv);
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
