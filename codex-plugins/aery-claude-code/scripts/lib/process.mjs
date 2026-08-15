import { spawnSync } from "node:child_process";
import fs from "node:fs";
import process from "node:process";

export function runCommand(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    input: options.input,
    maxBuffer: options.maxBuffer,
    stdio: options.stdio ?? "pipe",
    // No shell. Arguments reach a shell concatenated rather than escaped, so a value
    // carrying `;` or `&&` would run as a second command; and a POSIX shell on Windows
    // rewrites a `/PID`-style switch into a path. Every executable this package runs
    // resolves without one.
    shell: options.shell ?? false,
    // Routing a Windows batch wrapper through cmd.exe requires the command line to
    // reach it unmodified, so callers that pre-quote must be able to say so.
    windowsVerbatimArguments: options.windowsVerbatimArguments ?? false,
    windowsHide: true
  });

  return {
    command,
    args,
    status: result.status ?? 0,
    signal: result.signal ?? null,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error ?? null
  };
}

export function runCommandChecked(command, args = [], options = {}) {
  const result = runCommand(command, args, options);
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(formatCommandFailure(result));
  }
  return result;
}

// `taskkill` reports a missing process by failing, and its message is localised, so the
// text cannot be read to tell "already gone" from "could not kill it". Signal 0 delivers
// nothing and answers the same question in every locale.
function processIsGone(target, killImpl) {
  try {
    killImpl(target, 0);
    return false;
  } catch (error) {
    return error?.code === "ESRCH";
  }
}

// A pid names a process only for as long as that process lives; the operating system hands
// the number on afterwards, and a job record outlives the worker it named. So the process is
// asked what it is running immediately before anything is sent to it. This narrows the
// window rather than closing it: nothing here holds a handle on the process, so a worker that
// exits between the answer and the signal leaves the number free to be taken again. Closing
// it needs the worker to stop itself on request, which is what a broker would carry.
//
// Arguments are wanted, not a line of text. `/proc` separates them with NUL and ends with
// one, so only that last separator is dropped: an argument that is empty is still an argument,
// and removing it would shift every argument after it into a position it was never passed in.
// A Windows command line is one string that quotes what it must, so it splits back into what
// was passed. `ps` has neither property — it hands back an argv already flattened into a line,
// where a `--cwd` naming a directory that contains `--job-id` is indistinguishable from a
// second option, and `--job-id=x` from `--job-id x`. Nothing can be established from that, so
// nothing is: a system with no `/proc` and no Windows command line answers with nothing at
// all, and the caller refuses to signal rather than guessing.
function readProcessArguments(target, platform, runCommandImpl, options) {
  if (platform !== "win32") {
    try {
      const raw = fs.readFileSync("/proc/" + target + "/cmdline", "utf8");
      const args = raw.replace(/\0$/, "").split("\0");
      if (args.length > 1) {
        return args;
      }
    } catch {
      // Not Linux, or the process is gone. Either way there is nothing else to read.
    }
    return null;
  }

  const result = runCommandImpl(
    "powershell",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      '(Get-CimInstance Win32_Process -Filter "ProcessId=' + target + '").CommandLine'
    ],
    { cwd: options.cwd, env: options.env }
  );
  if (result.error || result.status !== 0) {
    return null;
  }
  const line = String(result.stdout ?? "").trim();
  return line ? splitCommandLine(line) : null;
}

// Windows hands back the command line as one string, and `CommandLineToArgvW` is the rule
// that turned the arguments into it. A backslash is ordinary except before a quote: an even
// run of them leaves the quote to open or close an argument, an odd run leaves the quote as a
// character in it. A path ending in a separator produces exactly that odd run, so reading
// every quote as a boundary invents an argument break in the middle of one argument — which
// is how a line that is not a worker's can be made to count seven.
function splitCommandLine(commandLine) {
  const args = [];
  let current = "";
  let quoted = false;
  let open = false;
  let backslashes = 0;

  const flushBackslashes = (count) => {
    current += "\\".repeat(count);
    if (count > 0) {
      open = true;
    }
  };

  for (let index = 0; index < commandLine.length; index += 1) {
    const char = commandLine[index];
    if (char === "\\") {
      backslashes += 1;
      continue;
    }
    if (char === '"') {
      flushBackslashes(Math.floor(backslashes / 2));
      const literal = backslashes % 2 === 1;
      backslashes = 0;
      open = true;
      if (literal) {
        current += '"';
        continue;
      }
      // Inside a quoted argument a doubled quote is one quote and the argument goes on. Reading
      // the second as an opening quote would end the argument where it does not end.
      if (quoted && commandLine[index + 1] === '"') {
        current += '"';
        index += 1;
        continue;
      }
      quoted = !quoted;
      continue;
    }
    flushBackslashes(backslashes);
    backslashes = 0;
    // Space and tab alone separate arguments. Every other space-like character — U+3000 among
    // them — is an ordinary character in a path, and treating one as a separator would count a
    // worker's own arguments wrong and refuse to cancel it.
    if (!quoted && (char === " " || char === "	")) {
      if (open) {
        args.push(current);
        current = "";
        open = false;
      }
      continue;
    }
    current += char;
    open = true;
  }
  flushBackslashes(backslashes);
  if (open) {
    args.push(current);
  }
  return args;
}

// A worker is one shape, and it is this side that chose it — `spawnDetachedWorker` passes
// exactly `<node> <companion> run-job --cwd <cwd> --job-id <id>` and nothing else. So the
// whole argv is compared against that, rather than searched for the parts of it. Searching is
// what lets `--job-id=other` sit alongside `--job-id <id>`: the worker's own parser takes the
// last value it is given, so a line carrying both runs a different job than the one being
// cancelled names.
const WORKER_ARGUMENT_COUNT = 7;

function samePath(left, right) {
  const normalize = (value) => value.replace(/[/\\]+/g, "/").replace(/\/+$/, "");
  const a = normalize(left);
  const b = normalize(right);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}


function looksLikeWorkerFor(args, identity, companionPath, runtimePath, sameWorkspace) {
  return (
    args.length === WORKER_ARGUMENT_COUNT &&
    samePath(args[0] ?? "", runtimePath) &&
    samePath(args[1] ?? "", companionPath) &&
    args[2] === "run-job" &&
    args[3] === "--cwd" &&
    sameWorkspace(args[4] ?? "") &&
    args[5] === "--job-id" &&
    args[6] === identity
  );
}

// Refusing costs the user a manual kill, which they can do with the pid the report prints.
// Killing the wrong process costs them whatever it was running, and on Windows its children
// too. The uncertain case is therefore resolved by not acting.
function verifyProcessIdentity(target, identity, companionPath, runtimePath, sameWorkspace, platform, runCommandImpl, options) {
  const args = readProcessArguments(target, platform, runCommandImpl, options);
  if (!args || !companionPath || !runtimePath || !sameWorkspace) {
    return { attempted: false, delivered: false, method: null, identity: "unverified" };
  }
  if (!looksLikeWorkerFor(args, identity, companionPath, runtimePath, sameWorkspace)) {
    return { attempted: false, delivered: false, method: null, identity: "mismatched" };
  }
  return null;
}

// Only a real pid is acted on, read the same way the liveness check reads it. A stored `0`
// would reach `kill(0, …)`, which signals the caller's own process group rather than a job,
// and a negative one would address a group that has nothing to do with the record.
export function terminateProcessTree(pid, options = {}) {
  const target = Number(pid);
  if (!Number.isInteger(target) || target <= 0) {
    return { attempted: false, delivered: false, method: null };
  }

  const platform = options.platform ?? process.platform;
  const runCommandImpl = options.runCommandImpl ?? runCommand;
  const killImpl = options.killImpl ?? process.kill.bind(process);

  if (options.identity) {
    const refusal = verifyProcessIdentity(
      target,
      options.identity,
      options.companionPath,
      options.runtimePath ?? process.execPath,
      options.sameWorkspace,
      platform,
      runCommandImpl,
      options
    );
    if (refusal) {
      return refusal;
    }
  }

  if (platform === "win32") {
    const result = runCommandImpl("taskkill", ["/PID", String(target), "/T", "/F"], {
      cwd: options.cwd,
      env: options.env
    });

    if (!result.error && result.status === 0) {
      return { attempted: true, delivered: true, method: "taskkill", result };
    }

    if (!result.error && processIsGone(target, killImpl)) {
      return { attempted: true, delivered: false, method: "taskkill", result };
    }

    if (result.error?.code === "ENOENT") {
      try {
        killImpl(target);
        return { attempted: true, delivered: true, method: "kill" };
      } catch (error) {
        if (error?.code === "ESRCH") {
          return { attempted: true, delivered: false, method: "kill" };
        }
        throw error;
      }
    }

    if (result.error) {
      throw result.error;
    }

    throw new Error(formatCommandFailure(result));
  }

  // The group is tried first because a detached worker leads one, and signalling it reaches
  // the Claude process with it. A foreground run is not a group leader, and `kill(-pid)`
  // answers that with the same `ESRCH` a departed group gives — so no failure here is a
  // reason to stop, and the process itself is signalled next.
  try {
    killImpl(-target, "SIGTERM");
    return { attempted: true, delivered: true, method: "process-group" };
  } catch {
    try {
      killImpl(target, "SIGTERM");
      return { attempted: true, delivered: true, method: "process" };
    } catch (error) {
      if (error?.code === "ESRCH") {
        return { attempted: true, delivered: false, method: "process" };
      }
      throw error;
    }
  }
}

export function formatCommandFailure(result) {
  const parts = [`${result.command} ${result.args.join(" ")}`.trim()];
  if (result.signal) {
    parts.push(`signal=${result.signal}`);
  } else {
    parts.push(`exit=${result.status}`);
  }
  const stderr = (result.stderr || "").trim();
  const stdout = (result.stdout || "").trim();
  if (stderr) {
    parts.push(stderr);
  } else if (stdout) {
    parts.push(stdout);
  }
  return parts.join(": ");
}
