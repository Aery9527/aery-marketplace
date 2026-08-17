import { randomUUID } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import { startClaudeBroker } from "../claude-broker.mjs";
import { createBrokerEndpoint, parseBrokerEndpoint } from "./broker-endpoint.mjs";

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function removeEndpointArtifacts(control) {
  try {
    const target = parseBrokerEndpoint(control.endpoint);
    if (target.kind === "unix" && fs.existsSync(target.path)) {
      fs.unlinkSync(target.path);
    }
  } catch {
    // Cleanup is intentionally safe after partial startup or earlier removal.
  }

  if (control.sessionDir && fs.existsSync(control.sessionDir)) {
    try {
      fs.rmdirSync(control.sessionDir);
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
  }
}

export async function openBrokerControl(options) {
  const sessionDir = fs.mkdtempSync(path.join(options.tempRoot ?? os.tmpdir(), "claude-companion-broker-"));
  const endpoint = createBrokerEndpoint(sessionDir, options.platform);
  let broker;
  try {
    broker = await (options.startBroker ?? startClaudeBroker)({
      endpoint,
      ownerId: options.jobId,
      session: options.session
    });
  } catch (error) {
    removeEndpointArtifacts({ endpoint, sessionDir });
    return { available: false, endpoint: null, sessionDir: null, reason: errorMessage(error) };
  }

  const control = {
    available: true,
    endpoint,
    sessionDir,
    ownerId: options.jobId,
    broker,
    closed: false
  };
  try {
    await options.onReady?.(control);
  } catch (error) {
    await closeBrokerControl(control);
    throw error;
  }
  return control;
}

function sendBrokerRequest({ endpoint, method, ownerId, timeoutMs = 1000 }) {
  let target;
  try {
    target = parseBrokerEndpoint(endpoint);
  } catch (error) {
    return Promise.resolve({ acknowledged: false, reason: errorMessage(error) });
  }

  return new Promise((resolve) => {
    const socket = net.createConnection({ path: target.path });
    const id = randomUUID();
    let buffer = "";
    let settled = false;

    function finish(value) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      socket.destroy();
      resolve(value);
    }

    const timeout = setTimeout(() => finish({ acknowledged: false, reason: "timeout" }), timeoutMs);
    socket.setEncoding("utf8");
    socket.on("connect", () => {
      socket.write(`${JSON.stringify({ id, method, params: { ownerId } })}\n`);
    });
    socket.on("data", (chunk) => {
      buffer += chunk;
      const newline = buffer.indexOf("\n");
      if (newline === -1) {
        return;
      }
      let response;
      try {
        response = JSON.parse(buffer.slice(0, newline));
      } catch {
        finish({ acknowledged: false, reason: "invalid-response" });
        return;
      }
      if (response?.id !== id) {
        finish({ acknowledged: false, reason: "invalid-response" });
      } else if (response.error) {
        finish({ acknowledged: false, reason: response.error.code ?? response.error.message ?? "broker-error" });
      } else {
        finish({ acknowledged: true, result: response.result });
      }
    });
    socket.on("error", () => finish({ acknowledged: false, reason: "unreachable" }));
    socket.on("close", () => finish({ acknowledged: false, reason: "unreachable" }));
  });
}

export async function requestBrokerInterrupt(request) {
  const response = await sendBrokerRequest({ ...request, method: "session/interrupt" });
  if (!response.acknowledged) {
    return { acknowledged: false, interrupted: false, reason: response.reason };
  }
  if (typeof response.result?.interrupted !== "boolean") {
    return { acknowledged: false, interrupted: false, reason: "invalid-response" };
  }
  return {
    acknowledged: true,
    interrupted: response.result.interrupted,
    reason: response.result.reason ?? null
  };
}

export async function requestBrokerShutdown(request) {
  const response = await sendBrokerRequest({ ...request, method: "broker/shutdown" });
  return response.acknowledged
    ? { acknowledged: true }
    : { acknowledged: false, reason: response.reason };
}

export async function closeBrokerControl(control) {
  if (!control || control.closed) {
    return;
  }
  control.closed = true;
  try {
    await control.broker?.close();
  } finally {
    removeEndpointArtifacts(control);
  }
}

export async function interruptBrokeredJob(job, options = {}) {
  let brokerReason = null;
  if (job.brokerEndpoint) {
    try {
      const response = await (options.requestInterrupt ?? requestBrokerInterrupt)({
        endpoint: job.brokerEndpoint,
        ownerId: job.id,
        timeoutMs: options.timeoutMs
      });
      if (response.acknowledged && response.interrupted) {
        return { attempted: true, delivered: true, method: "broker", reason: response.reason ?? null };
      }
      brokerReason = response.reason ?? "interrupt-not-established";
    } catch (error) {
      brokerReason = errorMessage(error);
    }
  }

  if (typeof options.terminateFallback !== "function") {
    throw new Error("Broker interruption requires a verified termination fallback.");
  }
  const fallback = options.terminateFallback(job.pid);
  return brokerReason ? { ...fallback, brokerReason } : fallback;
}
