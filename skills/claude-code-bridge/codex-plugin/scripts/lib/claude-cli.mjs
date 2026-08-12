// Upstream talks JSON-RPC to a Codex app server. Claude Code ships no such server,
// but `claude -p --input-format stream-json` is a long-lived session that serves
// successive turns over one process, so this client plays the same role: one warm
// child, one active turn at a time, interruptible, with a lifecycle the caller owns.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  buildInterruptRequest,
  buildUserMessage,
  createStreamLineReader,
  describeResult,
  isInitEvent,
  isTurnResult,
  readCapabilities,
  readControlResponse,
  readSessionId
} from "./stream-protocol.mjs";

export const CLAUDE_BINARY = "claude";
export const INTERRUPT_CAPABILITY = "interrupt_receipt_v1";

const DEFAULT_TURN_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_CONTROL_TIMEOUT_MS = 30 * 1000;

export class ClaudeCliError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ClaudeCliError";
    Object.assign(this, details);
  }
}

// A global npm install puts `claude.cmd` on PATH while a native install puts
// `claude.exe` there. Windows resolves neither from a bare name without a shell, and
// running everything through a shell would concatenate arguments unescaped, so the
// executable is resolved here and a batch wrapper is routed through cmd.exe.
export function resolveClaudeExecutable(env = process.env) {
  if (process.platform !== "win32") {
    return { file: CLAUDE_BINARY, viaCmd: false, target: CLAUDE_BINARY };
  }

  const extensions = (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean);
  const searchDirs = (env.PATH ?? "").split(path.delimiter).filter(Boolean);

  for (const dir of searchDirs) {
    for (const extension of extensions) {
      const candidate = path.join(dir, `${CLAUDE_BINARY}${extension}`);
      if (!fs.existsSync(candidate)) {
        continue;
      }
      if (/\.(cmd|bat)$/i.test(extension)) {
        return { file: env.ComSpec ?? "cmd.exe", viaCmd: true, target: candidate };
      }
      return { file: candidate, viaCmd: false, target: candidate };
    }
  }

  return { file: CLAUDE_BINARY, viaCmd: false, target: CLAUDE_BINARY };
}

// cmd.exe expands `%VAR%` even inside quotes and there is no escape for it on a `/c`
// command line, so a value carrying one cannot be passed through safely at all. Control
// characters cannot survive a command line either.
const UNPASSABLE_THROUGH_CMD = /[\u0000-\u001f%]/;

// The command line is passed verbatim, so each argument carries its own escaping. This
// is the `CommandLineToArgvW` convention — a quote becomes `\"` and the backslashes in
// front of one are doubled. The alternative `""` convention some parsers also accept is
// not usable here: the Claude binary rejects it, so an inline JSON schema arrives torn.
//
// Every argument is quoted, not only one that looks like it needs it. cmd.exe treats
// `&`, `|`, `<`, `>` and `^` as control characters wherever they are unquoted, so an
// unquoted value carrying one splits the command line instead of reaching Claude.
export function quoteForWindowsCommandLine(value) {
  const text = String(value);
  if (text === "") {
    return '""';
  }

  let quoted = '"';
  let backslashes = 0;
  for (const character of text) {
    if (character === "\\") {
      backslashes += 1;
      continue;
    }
    if (character === '"') {
      quoted += "\\".repeat(backslashes * 2 + 1) + '"';
      backslashes = 0;
      continue;
    }
    quoted += "\\".repeat(backslashes) + character;
    backslashes = 0;
  }
  return `${quoted}${"\\".repeat(backslashes * 2)}"`;
}

// `cmd /s /c "<line>"` strips exactly the outer quotes and runs the rest verbatim,
// which is the only reliable way to pass a path containing spaces through cmd.exe.
export function buildSpawnPlan(args, env = process.env) {
  const resolved = resolveClaudeExecutable(env);
  if (!resolved.viaCmd) {
    return { file: resolved.file, args, options: {} };
  }

  for (const arg of args) {
    if (UNPASSABLE_THROUGH_CMD.test(String(arg))) {
      throw new ClaudeCliError(
        `Cannot pass ${JSON.stringify(String(arg))} to Claude on Windows: a percent sign or control character cannot be escaped on a cmd.exe command line.`
      );
    }
  }

  const line = [resolved.target, ...args].map(quoteForWindowsCommandLine).join(" ");
  return {
    file: resolved.file,
    args: ["/d", "/s", "/c", `"${line}"`],
    options: { windowsVerbatimArguments: true }
  };
}

export function buildBaseArgs(options) {
  const args = [
    "-p",
    "--input-format", "stream-json",
    "--output-format", "stream-json",
    "--verbose"
  ];

  if (options.model) {
    args.push("--model", options.model);
  }
  if (options.effort) {
    args.push("--effort", options.effort);
  }
  if (options.sessionId) {
    args.push("--session-id", options.sessionId);
  }
  if (options.resume) {
    args.push("--resume", options.resume);
  }
  if (options.name) {
    args.push("--name", options.name);
  }
  if (options.jsonSchema) {
    // The flag parses its value as JSON, so the schema travels inline rather than as a
    // path. `$schema` is stripped because the validator resolves it as a remote ref and
    // fails on the draft URL every schema in this package declares.
    const { $schema, ...schema } = options.jsonSchema;
    args.push("--json-schema", JSON.stringify(schema));
  }
  if (options.permissionMode) {
    args.push("--permission-mode", options.permissionMode);
  }
  // `--tools` filters built-ins only, so a session that must not write also has to shut
  // the user's MCP servers out; otherwise an MCP write tool stays registered.
  if (options.strictMcpConfig) {
    args.push("--strict-mcp-config");
  }
  if (Array.isArray(options.allowedTools) && options.allowedTools.length > 0) {
    args.push("--allowed-tools", options.allowedTools.join(","));
  }
  if (Array.isArray(options.disallowedTools) && options.disallowedTools.length > 0) {
    args.push("--disallowed-tools", ...options.disallowedTools);
  }
  if (Array.isArray(options.tools)) {
    args.push("--tools", options.tools.length > 0 ? options.tools.join(",") : "");
  }
  return args;
}

export class ClaudeCliSession {
  constructor(child, options = {}) {
    this.child = child;
    this.sessionId = null;
    this.capabilities = [];
    this.stderr = "";
    this.closed = false;
    this.exitCode = null;
    this.exitSignal = null;
    // A turn that fails without a result leaves the process still working on it, so a
    // later result could be matched to the wrong turn. The session is poisoned instead.
    this.unusableReason = null;

    this.pendingTurn = null;
    this.pendingControl = null;
    this.unansweredInterrupt = null;
    this.interruptCounter = 0;
    this.onEvent = options.onEvent ?? (() => {});

    this.closePromise = new Promise((resolve) => {
      this.child.on("close", (code, signal) => {
        this.closed = true;
        this.exitCode = code;
        this.exitSignal = signal;
        this.#settleOnExit(
          new ClaudeCliError("Claude exited before the turn completed.", {
            exitCode: code,
            signal,
            stderr: this.stderr.slice(-2000)
          })
        );
        resolve({ code, signal });
      });
    });

    this.child.on("error", (error) => {
      this.closed = true;
      this.unusableReason = this.unusableReason ?? `failed to start Claude: ${error.message}`;
      this.#settleOnExit(new ClaudeCliError(`Failed to start Claude: ${error.message}`, { cause: error }));
    });

    this.child.stderr?.on("data", (chunk) => {
      this.stderr += String(chunk);
    });

    const reader = createStreamLineReader((event) => this.#handleEvent(event));
    this.child.stdout.on("data", (chunk) => {
      try {
        reader.push(chunk);
      } catch (error) {
        this.#poison(error);
      }
    });
    this.child.stdout.on("end", () => {
      try {
        reader.flush();
      } catch (error) {
        this.#poison(error);
      }
    });
  }

  static start(cwd, options = {}) {
    const env = options.env ?? process.env;
    const plan = buildSpawnPlan(buildBaseArgs(options), env);
    const child = spawn(plan.file, plan.args, {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      ...plan.options
    });
    return new ClaudeCliSession(child, options);
  }

  #settleOnExit(error) {
    this.#failTurn(error);
    if (this.pendingControl) {
      const control = this.pendingControl;
      this.pendingControl = null;
      clearTimeout(control.timer);
      control.reject(error);
    }
  }

  #failTurn(error) {
    if (!this.pendingTurn) {
      return;
    }
    const turn = this.pendingTurn;
    this.pendingTurn = null;
    clearTimeout(turn.timer);
    turn.reject(error);
  }

  // Anything that breaks turn/result correlation ends the session rather than leaving
  // it looking idle while Claude is still producing output for the abandoned turn.
  #poison(error) {
    this.unusableReason = this.unusableReason ?? (error instanceof Error ? error.message : String(error));
    this.#failTurn(error);
    if (!this.closed) {
      this.child.kill();
    }
  }

  isUsable() {
    return !this.closed && this.unusableReason === null;
  }

  #handleEvent(event) {
    if (isInitEvent(event)) {
      this.sessionId = readSessionId(event) ?? this.sessionId;
      this.capabilities = readCapabilities(event);
    } else if (readSessionId(event)) {
      this.sessionId = readSessionId(event);
    }

    if (event.type === "control_response") {
      const response = readControlResponse(event);
      if (response?.requestId && response.requestId === this.unansweredInterrupt) {
        this.unansweredInterrupt = null;
      }
      if (this.pendingControl && response?.requestId === this.pendingControl.requestId) {
        const control = this.pendingControl;
        this.pendingControl = null;
        clearTimeout(control.timer);
        control.resolve(response);
      }
    }

    this.onEvent(event);

    if (isTurnResult(event) && this.pendingTurn) {
      const turn = this.pendingTurn;
      this.pendingTurn = null;
      clearTimeout(turn.timer);
      turn.resolve(describeResult(event));
    }
  }

  // One active turn at a time, matching what the upstream broker enforces with its
  // busy response rather than trying to multiplex.
  async sendTurn(text, options = {}) {
    if (this.unusableReason) {
      throw new ClaudeCliError(`Claude session is no longer usable: ${this.unusableReason}`);
    }
    if (this.closed) {
      throw new ClaudeCliError("Claude session is already closed.");
    }
    if (this.pendingTurn) {
      throw new ClaudeCliError("Claude session is busy with another turn.");
    }

    const timeoutMs = options.timeoutMs ?? DEFAULT_TURN_TIMEOUT_MS;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#poison(new ClaudeCliError(`Claude turn timed out after ${timeoutMs}ms.`, { timeoutMs }));
      }, timeoutMs);
      timer.unref?.();

      this.pendingTurn = { resolve, reject, timer };
      this.child.stdin.write(`${JSON.stringify(buildUserMessage(text))}\n`, (error) => {
        if (error) {
          this.#poison(new ClaudeCliError(`Failed to send a turn to Claude: ${error.message}`));
        }
      });
    });
  }

  // The interrupted turn ends with a `result` of subtype `error_during_execution`,
  // and the session stays usable, so cancelling does not throw the thread away.
  async interrupt(options = {}) {
    if (this.closed) {
      return { interrupted: false, reason: "session-closed" };
    }
    if (this.unusableReason) {
      return { interrupted: false, reason: "session-unusable" };
    }
    if (!this.supportsInterrupt()) {
      return { interrupted: false, reason: "capability-missing" };
    }
    if (this.pendingControl) {
      return { interrupted: false, reason: "interrupt-in-flight" };
    }
    if (this.unansweredInterrupt) {
      return { interrupted: false, reason: "interrupt-unanswered" };
    }

    this.interruptCounter += 1;
    const requestId = `bridge-interrupt-${this.interruptCounter}`;
    const timeoutMs = options.timeoutMs ?? DEFAULT_CONTROL_TIMEOUT_MS;

    const response = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // The request may still be in flight on Claude's side, so the guard stays up.
        // Sending a second interrupt would race an unanswered one.
        this.unansweredInterrupt = requestId;
        this.pendingControl = null;
        reject(new ClaudeCliError(`Claude did not answer the interrupt within ${timeoutMs}ms.`, { timeoutMs }));
      }, timeoutMs);
      timer.unref?.();

      this.pendingControl = { requestId, resolve, reject, timer };
      this.child.stdin.write(`${JSON.stringify(buildInterruptRequest(requestId))}\n`, (error) => {
        if (!error) {
          return;
        }

        // stdin is the only channel to this session; losing it means the session can no
        // longer be driven at all. This holds even when the wait already timed out, so
        // poisoning is not conditional on the request still being pending.
        const failure = new ClaudeCliError(`Failed to send the interrupt: ${error.message}`);
        this.#poison(failure);

        if (this.pendingControl?.requestId === requestId) {
          const control = this.pendingControl;
          this.pendingControl = null;
          clearTimeout(control.timer);
          control.reject(failure);
        }
      });
    });

    try {
      const result = await response;
      return { interrupted: result.subtype === "success", reason: result.error ?? null };
    } catch (error) {
      return { interrupted: false, reason: error.message };
    }
  }

  supportsInterrupt() {
    return this.capabilities.includes(INTERRUPT_CAPABILITY);
  }

  async close() {
    if (!this.closed) {
      this.child.stdin.end();
    }
    return this.closePromise;
  }

  async kill() {
    if (!this.closed) {
      this.child.kill();
    }
    return this.closePromise;
  }
}

// A single request that needs no follow-up turn still goes through the session, so
// there is one code path for building arguments, validating frames and reading results.
export async function runClaudeOnce(cwd, prompt, options = {}) {
  const session = ClaudeCliSession.start(cwd, options);
  try {
    const result = await session.sendTurn(prompt, options);
    return { ...result, capabilities: session.capabilities, stderr: session.stderr.slice(-2000) };
  } finally {
    await session.close().catch(() => {});
  }
}
