#!/usr/bin/env node
// Single entry point for every bridge command. The Codex-side command and agent files
// are thin: they decide which subcommand to run and print its stdout unchanged.

import process from "node:process";

import { parseArgs, splitRawArgumentString } from "./lib/args.mjs";
import { getClaudeAuthStatus, getClaudeAvailability, MINIMUM_CLAUDE_VERSION } from "./lib/claude.mjs";
import { renderSetupReport } from "./lib/render.mjs";
import { getConfig, setConfig } from "./lib/state.mjs";
import { resolveWorkspaceRoot } from "./lib/workspace.mjs";

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

async function main() {
  const [subcommand, ...argv] = process.argv.slice(2);

  switch (subcommand) {
    case "setup":
      handleSetup(argv);
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
