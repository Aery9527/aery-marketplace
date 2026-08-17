#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { requestBrokerShutdown } from "./lib/broker-lifecycle.mjs";
import { loadAuthoritativeJobs } from "./lib/job-control.mjs";
import { terminateProcessTree, waitForProcessExit } from "./lib/process.mjs";
import { isActiveJobStatus, resolveJobFile, updateState } from "./lib/state.mjs";
import { resolveWorkspaceRoot } from "./lib/workspace.mjs";

const COMPANION_PATH = fileURLToPath(new URL("./claude-companion.mjs", import.meta.url));

function removeFileIfExists(filePath) {
  if (!filePath) {
    return;
  }
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

export async function handleSessionLifecycleEvent(input = {}, options = {}) {
  const eventName = options.eventName ?? input.hook_event_name ?? "";
  if (eventName !== "SessionEnd") {
    return { handled: eventName === "SessionStart", cleanedJobIds: [] };
  }

  const sessionId = typeof input.session_id === "string" && input.session_id.trim()
    ? input.session_id.trim()
    : null;
  if (!sessionId) {
    return { handled: true, cleanedJobIds: [] };
  }

  const cwd = resolveWorkspaceRoot(input.cwd || options.cwd || process.cwd());
  const matchingJobs = loadAuthoritativeJobs(cwd).filter((job) => job.sessionId === sessionId);
  const requestShutdown = options.requestShutdown ?? requestBrokerShutdown;
  const terminate = options.terminateProcessTree ?? terminateProcessTree;
  const waitForExit = options.waitForProcessExit ?? waitForProcessExit;
  const removableJobs = [];

  for (const job of matchingJobs) {
    if (!isActiveJobStatus(job.status)) {
      removableJobs.push(job);
      continue;
    }

    let shutdownAcknowledged = false;
    if (job.brokerEndpoint) {
      try {
        const result = await requestShutdown({ endpoint: job.brokerEndpoint, ownerId: job.id });
        shutdownAcknowledged = result?.acknowledged === true;
      } catch {
        shutdownAcknowledged = false;
      }
    }

    if (shutdownAcknowledged) {
      try {
        if (await waitForExit(job.pid)) {
          removableJobs.push(job);
        }
      } catch {
        // A broker reply proves that Claude accepted shutdown, not that the worker
        // released its process. Preserve its evidence until that stronger fact exists.
      }
    } else {
      try {
        const termination = terminate(job.pid, {
          identity: job.id,
          companionPath: COMPANION_PATH,
          runtimePath: process.execPath,
          sameWorkspace: (candidateCwd) => resolveWorkspaceRoot(candidateCwd) === cwd
        });
        if (termination?.attempted === true && await waitForExit(job.pid)) {
          removableJobs.push(job);
        }
      } catch {
        // Without a confirmed shutdown or termination, the record remains the user's
        // evidence and a manual cancellation target.
      }
    }
  }

  const removableIds = new Set(removableJobs.map((job) => job.id));
  updateState(cwd, (state) => {
    state.jobs = state.jobs.filter((job) => !removableIds.has(job.id));
  });
  for (const job of removableJobs) {
    removeFileIfExists(resolveJobFile(cwd, job.id));
    removeFileIfExists(job.logFile);
  }

  return { handled: true, cleanedJobIds: removableJobs.map((job) => job.id) };
}

async function main() {
  const raw = fs.readFileSync(0, "utf8").trim();
  const input = raw ? JSON.parse(raw) : {};
  await handleSessionLifecycleEvent(input, { eventName: process.argv[2] });
}

const scriptPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (scriptPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
