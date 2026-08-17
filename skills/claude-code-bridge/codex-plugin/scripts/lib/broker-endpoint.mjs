import path from "node:path";
import process from "node:process";

function sanitizePipeName(value) {
  return String(value ?? "")
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function createBrokerEndpoint(sessionDir, platform = process.platform) {
  if (platform === "win32") {
    const pipeName = sanitizePipeName(`${path.win32.basename(sessionDir)}-claude-session`);
    if (!pipeName) {
      throw new Error("Broker pipe name is empty.");
    }
    return `pipe:\\\\.\\pipe\\${pipeName}`;
  }

  return `unix:${path.posix.join(String(sessionDir).replaceAll("\\", "/"), "broker.sock")}`;
}

export function parseBrokerEndpoint(endpoint) {
  if (typeof endpoint !== "string" || !endpoint) {
    throw new Error("Missing broker endpoint.");
  }

  if (endpoint.startsWith("unix:")) {
    const socketPath = endpoint.slice("unix:".length);
    if (!path.posix.isAbsolute(socketPath)) {
      throw new Error("Broker Unix socket endpoint must be absolute.");
    }
    return { kind: "unix", path: socketPath };
  }

  if (endpoint.startsWith("pipe:")) {
    const pipePath = endpoint.slice("pipe:".length);
    if (!/^\\\\\.\\pipe\\[^\\/]+$/.test(pipePath)) {
      throw new Error("Broker pipe endpoint must be a named pipe path.");
    }
    return { kind: "pipe", path: pipePath };
  }

  throw new Error(`Unsupported broker endpoint: ${endpoint}`);
}
