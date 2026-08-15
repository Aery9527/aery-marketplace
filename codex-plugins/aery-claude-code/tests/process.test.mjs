import { spawn } from "node:child_process";
import process from "node:process";
import test from "node:test";
import assert from "node:assert/strict";

import { terminateProcessTree } from "../scripts/lib/process.mjs";

test("terminateProcessTree uses taskkill on Windows", () => {
  let captured = null;
  const outcome = terminateProcessTree(1234, {
    platform: "win32",
    runCommandImpl(command, args) {
      captured = { command, args };
      return {
        command,
        args,
        status: 0,
        signal: null,
        stdout: "",
        stderr: "",
        error: null
      };
    },
    killImpl() {
      throw new Error("kill fallback should not run");
    }
  });

  assert.deepEqual(captured, {
    command: "taskkill",
    args: ["/PID", "1234", "/T", "/F"]
  });
  assert.equal(outcome.delivered, true);
  assert.equal(outcome.method, "taskkill");
});

// `taskkill` announces a missing process in the console's own language, so what separates
// "already gone" from "could not kill it" has to be the pid itself, not the message.
test("terminateProcessTree treats missing Windows processes as already stopped", () => {
  const failedKill = {
    platform: "win32",
    runCommandImpl(command, args) {
      return {
        command,
        args,
        status: 128,
        signal: null,
        stdout: "",
        stderr: "錯誤: 找不到處理程序 \"1234\"。",
        error: null
      };
    }
  };

  const outcome = terminateProcessTree(1234, {
    ...failedKill,
    killImpl() {
      throw Object.assign(new Error("no such process"), { code: "ESRCH" });
    }
  });

  assert.equal(outcome.attempted, true);
  assert.equal(outcome.delivered, false);
  assert.equal(outcome.method, "taskkill");

  // The same failure with the process still there is a real failure, not a no-op.
  assert.throws(
    () =>
      terminateProcessTree(1234, {
        ...failedKill,
        killImpl() {
          return undefined;
        }
      }),
    /taskkill/
  );
});

// The injected cases above prove which arguments are chosen. This one proves the call
// itself lands: a shell in the middle would rewrite `/PID` into a path and the process
// would survive.
test("terminateProcessTree stops a process it was given for real", async () => {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    stdio: "ignore",
    windowsHide: true
  });
  const exited = new Promise((resolve) => child.on("exit", resolve));

  try {
    const outcome = terminateProcessTree(child.pid);

    assert.equal(outcome.attempted, true);
    assert.equal(outcome.delivered, true);
    // Waiting forever would report a surviving process as a hung test rather than a
    // failing one, and would leave it running.
    await Promise.race([
      exited,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("the process outlived its termination")), 5000).unref?.();
      })
    ]);
  } finally {
    child.kill();
  }
});

// A foreground run records the companion's own pid, and that process is not a group
// leader, so `kill(-pid)` answers ESRCH exactly as a departed group would. Stopping there
// would report a cancellation that never signalled anything.
test("terminateProcessTree falls back to the process when it leads no group", () => {
  const signalled = [];
  const outcome = terminateProcessTree(1234, {
    platform: "linux",
    killImpl(target, signal) {
      signalled.push([target, signal]);
      if (target < 0) {
        throw Object.assign(new Error("no such process group"), { code: "ESRCH" });
      }
    }
  });

  assert.deepEqual(signalled, [[-1234, "SIGTERM"], [1234, "SIGTERM"]]);
  assert.equal(outcome.delivered, true);
  assert.equal(outcome.method, "process");
});

test("terminateProcessTree reports nothing delivered only when the process is gone too", () => {
  const outcome = terminateProcessTree(1234, {
    platform: "linux",
    killImpl() {
      throw Object.assign(new Error("no such process"), { code: "ESRCH" });
    }
  });

  assert.equal(outcome.attempted, true);
  assert.equal(outcome.delivered, false);
  assert.equal(outcome.method, "process");
});

// A pid outlives the process it named, and the operating system hands the number on. What
// is running under it is therefore read before anything is sent to it: the worker's command
// line carries the job id it was started with.
test("a pid whose process is not this job's worker is left alone", () => {
  const sent = [];
  const outcome = terminateProcessTree(1234, {
    platform: "win32",
    identity: "adv-abc123",
    companionPath: "/plugin/scripts/claude-companion.mjs",
    runtimePath: "node",
    sameWorkspace: () => true,
    runCommandImpl: (command, args) => {
      sent.push(command);
      // Carrying the job id is not the same as being its worker: an editor with the job's
      // own log open would pass a substring test.
      return {
        command,
        args,
        status: 0,
        signal: null,
        stdout: "/usr/bin/some-editor /state/jobs/adv-abc123.log\n",
        stderr: "",
        error: null
      };
    },
    killImpl() {
      throw new Error("nothing may be signalled on a pid that was not confirmed");
    }
  });

  assert.deepEqual(sent, ["powershell"]);
  assert.deepEqual(outcome, { attempted: false, delivered: false, method: null, identity: "mismatched" });
});

test("a pid whose process cannot be read is left alone", () => {
  const outcome = terminateProcessTree(1234, {
    platform: "win32",
    identity: "adv-abc123",
    companionPath: "/plugin/scripts/claude-companion.mjs",
    runtimePath: "node",
    sameWorkspace: () => true,
    runCommandImpl: (command, args) => ({
      command,
      args,
      status: 1,
      signal: null,
      stdout: "",
      stderr: "",
      error: null
    }),
    killImpl() {
      throw new Error("nothing may be signalled on a pid that could not be read");
    }
  });

  assert.deepEqual(outcome, { attempted: false, delivered: false, method: null, identity: "unverified" });
});

test("a confirmed worker is terminated as it would be without the check", () => {
  const commands = [];
  const outcome = terminateProcessTree(1234, {
    platform: "win32",
    identity: "adv-abc123",
    companionPath: "/plugin/scripts/claude-companion.mjs",
    runtimePath: "node",
    sameWorkspace: () => true,
    runCommandImpl: (command, args) => {
      commands.push(command);
      return {
        command,
        args,
        status: 0,
        signal: null,
        stdout: "node /plugin/scripts/claude-companion.mjs run-job --cwd /repo --job-id adv-abc123\n",
        stderr: "",
        error: null
      };
    },
    killImpl() {
      throw new Error("taskkill answers here, so nothing falls back to kill");
    }
  });

  assert.deepEqual(commands, ["powershell", "taskkill"]);
  assert.equal(outcome.delivered, true);
});

// A job id is a prefix of nothing here: matching it as a whole argument is what keeps a
// cancellation for one job from reaching a worker started for another.
test("a worker started for a job whose id extends this one is left alone", () => {
  const outcome = terminateProcessTree(1234, {
    platform: "win32",
    identity: "adv-abc",
    companionPath: "/plugin/scripts/claude-companion.mjs",
    runtimePath: "node",
    sameWorkspace: () => true,
    runCommandImpl: (command, args) => ({
      command,
      args,
      status: 0,
      signal: null,
      stdout: "node /plugin/scripts/claude-companion.mjs run-job --cwd /repo --job-id adv-abc123\n",
      stderr: "",
      error: null
    }),
    killImpl() {
      throw new Error("a different job's worker may not be signalled");
    }
  });

  assert.equal(outcome.identity, "mismatched");
});

// A quote is not an argument boundary: `--job-id adv-a"1"` names something else entirely,
// and reading it as the job `adv-a` would signal a process this job never started.
test("a quoted tail is not read as the end of the job id", () => {
  const outcome = terminateProcessTree(1234, {
    platform: "win32",
    identity: "adv-abc",
    companionPath: "companion.mjs",
    runtimePath: "node",
    sameWorkspace: () => true,
    runCommandImpl: (command, args) => ({
      command,
      args,
      status: 0,
      signal: null,
      stdout: 'node companion.mjs run-job --cwd /repo --job-id adv-abc"123"\n',
      stderr: "",
      error: null
    }),
    killImpl() {
      throw new Error("a pid that was not confirmed may not be signalled");
    }
  });

  assert.equal(outcome.identity, "mismatched");
});

// `run-job` inside a script's own name is not the subcommand, and a command line that merely
// mentions the job id is not this bridge's worker running it.
test("a process that only reads like a worker is left alone", () => {
  const outcome = terminateProcessTree(1234, {
    platform: "win32",
    identity: "adv-abc",
    companionPath: "C:\\bridge\\claude-companion.mjs",
    runtimePath: "node",
    sameWorkspace: () => true,
    runCommandImpl: (command, args) => ({
      command,
      args,
      status: 0,
      signal: null,
      stdout: `node C:\\tools\\not-a-worker-run-job-helper.mjs --job-id adv-abc\n`,
      stderr: "",
      error: null
    }),
    killImpl() {
      throw new Error("a pid that was not confirmed may not be signalled");
    }
  });

  assert.equal(outcome.identity, "mismatched");
});

// The one spelling that must still be recognised: a Windows path with spaces arrives quoted.
test("a worker whose path is quoted is still recognised", () => {
  const commands = [];
  const outcome = terminateProcessTree(1234, {
    platform: "win32",
    identity: "adv-abc",
    companionPath: "C:\\Program Files\\bridge\\scripts\\claude-companion.mjs",
    runtimePath: "node",
    sameWorkspace: () => true,
    runCommandImpl: (command, args) => {
      commands.push(command);
      return {
        command,
        args,
        status: 0,
        signal: null,
        stdout: `node "C:\\Program Files\\bridge\\scripts\\claude-companion.mjs" run-job --cwd "C:\\repo" --job-id adv-abc\n`,
        stderr: "",
        error: null
      };
    },
    killImpl() {
      throw new Error("taskkill answers here, so nothing falls back to kill");
    }
  });

  assert.deepEqual(commands, ["powershell", "taskkill"]);
  assert.equal(outcome.delivered, true);
});

// `run-job` has to be the subcommand, not a word further along the line: this command line
// runs a status report, and terminating it would end a report the user asked for.
test("a companion running some other subcommand is left alone", () => {
  const outcome = terminateProcessTree(1234, {
    platform: "win32",
    identity: "adv-abc",
    companionPath: "C:\\bridge\\scripts\\claude-companion.mjs",
    runtimePath: "node",
    sameWorkspace: () => true,
    runCommandImpl: (command, args) => ({
      command,
      args,
      status: 0,
      signal: null,
      stdout: `node C:\\bridge\\scripts\\claude-companion.mjs status run-job --job-id adv-abc\n`,
      stderr: "",
      error: null
    }),
    killImpl() {
      throw new Error("a pid that was not confirmed may not be signalled");
    }
  });

  assert.equal(outcome.identity, "mismatched");
});

// A space inside a quoted argument does not end it. Splitting on whitespace alone would cut
// this single script argument into a companion name followed by `run-job` — two arguments
// that were never passed, standing in exactly the relationship a worker's are checked for.
test("a quoted argument is not cut into a companion and a subcommand", () => {
  const outcome = terminateProcessTree(1234, {
    platform: "win32",
    identity: "adv-abc",
    companionPath: "C:\\tools\\claude-companion.mjs",
    runtimePath: "node",
    sameWorkspace: () => true,
    runCommandImpl: (command, args) => ({
      command,
      args,
      status: 0,
      signal: null,
      stdout: `node "C:\\tools\\claude-companion.mjs run-job" --job-id adv-abc\n`,
      stderr: "",
      error: null
    }),
    killImpl() {
      throw new Error("a pid that was not confirmed may not be signalled");
    }
  });

  assert.equal(outcome.identity, "mismatched");
});

// The words a worker's command line carries are not the worker: an inline script that was
// handed them as arguments it never reads would answer any search that only asks whether
// they appear. Where they sit is what separates the two.
test("a process holding a worker's words as arguments is left alone", () => {
  const outcome = terminateProcessTree(1234, {
    platform: "win32",
    identity: "adv-abc",
    companionPath: "C:\\bridge\\claude-companion.mjs",
    runtimePath: "node",
    sameWorkspace: () => true,
    runCommandImpl: (command, args) => ({
      command,
      args,
      status: 0,
      signal: null,
      stdout: `node -e "setInterval(() => {}, 1000)" C:\\bridge\\claude-companion.mjs run-job --job-id adv-abc\n`,
      stderr: "",
      error: null
    }),
    killImpl() {
      throw new Error("a pid that was not confirmed may not be signalled");
    }
  });

  assert.equal(outcome.identity, "mismatched");
});

// An apostrophe is an ordinary character in a Windows path. Reading it as a quote would take
// the worker's own command line apart and refuse to cancel a run that is plainly this job's.
test("a worker whose path contains an apostrophe is still recognised", () => {
  const commands = [];
  const outcome = terminateProcessTree(1234, {
    platform: "win32",
    identity: "adv-abc",
    companionPath: "C:\\Users\\O'Brien\\bridge\\claude-companion.mjs",
    runtimePath: "node",
    sameWorkspace: () => true,
    runCommandImpl: (command, args) => {
      commands.push(command);
      return {
        command,
        args,
        status: 0,
        signal: null,
        stdout: `node C:\\Users\\O'Brien\\bridge\\claude-companion.mjs run-job --cwd C:\\repo --job-id adv-abc\n`,
        stderr: "",
        error: null
      };
    },
    killImpl() {
      throw new Error("taskkill answers here, so nothing falls back to kill");
    }
  });

  assert.deepEqual(commands, ["powershell", "taskkill"]);
  assert.equal(outcome.delivered, true);
});

// The runtime and the script are both part of the shape: a program that is not this bridge's
// worker can still be handed the worker's own arguments.
test("a process that was handed the worker's own arguments is left alone", () => {
  const outcome = terminateProcessTree(1234, {
    platform: "win32",
    identity: "adv-abc",
    companionPath: "C:\\bridge\\claude-companion.mjs",
    runtimePath: "node",
    sameWorkspace: () => true,
    runCommandImpl: (command, args) => ({
      command,
      args,
      status: 0,
      signal: null,
      stdout: `C:\\tools\\unrelated.exe C:\\bridge\\claude-companion.mjs run-job --job-id adv-abc\n`,
      stderr: "",
      error: null
    }),
    killImpl() {
      throw new Error("a pid that was not confirmed may not be signalled");
    }
  });

  assert.equal(outcome.identity, "mismatched");
});

// The worker's own parser takes the last `--job-id` it is given, so a line carrying two names
// a different job than its first one does.
test("a command line carrying a second job id is left alone", () => {
  const outcome = terminateProcessTree(1234, {
    platform: "win32",
    identity: "adv-abc",
    companionPath: "C:\\bridge\\claude-companion.mjs",
    runtimePath: "node",
    sameWorkspace: () => true,
    runCommandImpl: (command, args) => ({
      command,
      args,
      status: 0,
      signal: null,
      stdout: `node C:\\bridge\\claude-companion.mjs run-job --job-id adv-abc --job-id review-other\n`,
      stderr: "",
      error: null
    }),
    killImpl() {
      throw new Error("a job this process is not running may not be cancelled through it");
    }
  });

  assert.equal(outcome.identity, "mismatched");
});

// The worker's own parser reads `--job-id=x` as well, and takes the last value it is given.
// A line carrying both spellings therefore runs a job other than the one being cancelled, and
// only comparing the whole argv against the one this side spawns can tell.
test("a command line carrying a second job id in its other spelling is left alone", () => {
  const outcome = terminateProcessTree(1234, {
    platform: "win32",
    identity: "adv-abc",
    companionPath: "/bridge/claude-companion.mjs",
    runtimePath: "node",
    sameWorkspace: () => true,
    runCommandImpl: (command, args) => ({
      command,
      args,
      status: 0,
      signal: null,
      stdout: "node /bridge/claude-companion.mjs run-job --job-id adv-abc --job-id=real-other\n",
      stderr: "",
      error: null
    }),
    killImpl() {
      throw new Error("a job this process is not running may not be cancelled through it");
    }
  });

  assert.equal(outcome.identity, "mismatched");
});

// `ps` hands back an argv already flattened into a line, where a `--cwd` naming a directory
// that contains `--job-id` cannot be told from a second option. A system with no `/proc` is
// therefore answered with nothing, and nothing is signalled on a pid nothing could confirm.
test("a system whose arguments cannot be read signals nothing", () => {
  const commands = [];
  const outcome = terminateProcessTree(1234, {
    platform: "darwin",
    identity: "adv-abc",
    companionPath: "/bridge/claude-companion.mjs",
    runtimePath: "node",
    sameWorkspace: () => true,
    runCommandImpl: (command) => {
      commands.push(command);
      return { command, args: [], status: 0, signal: null, stdout: "", stderr: "", error: null };
    },
    killImpl() {
      throw new Error("nothing may be signalled on a pid that could not be read");
    }
  });

  assert.deepEqual(commands, []);
  assert.deepEqual(outcome, { attempted: false, delivered: false, method: null, identity: "unverified" });
});

// A job id is unique within a workspace, not across them: a worker running the same id for a
// different repository is a different run, and cancelling this one must not end it.
test("a worker running the same job id in another workspace is left alone", () => {
  const outcome = terminateProcessTree(1234, {
    platform: "win32",
    identity: "adv-abc",
    companionPath: "/bridge/claude-companion.mjs",
    runtimePath: "node",
    sameWorkspace: (cwd) => cwd === "/work/mine",
    runCommandImpl: (command, args) => ({
      command,
      args,
      status: 0,
      signal: null,
      stdout: "node /bridge/claude-companion.mjs run-job --cwd /work/theirs --job-id adv-abc\n",
      stderr: "",
      error: null
    }),
    killImpl() {
      throw new Error("another workspace's run may not be cancelled through this one");
    }
  });

  assert.equal(outcome.identity, "mismatched");
});

// `CommandLineToArgvW` reads the quote after an odd run of backslashes as a character, so a
// `--cwd` ending in a separator keeps everything after it inside that one argument. A splitter
// that takes every quote as a boundary counts seven arguments where there are five.
test("a trailing separator in a quoted path does not end the argument", () => {
  const outcome = terminateProcessTree(1234, {
    platform: "win32",
    identity: "adv-abc",
    companionPath: "C:\\bridge\\claude-companion.mjs",
    runtimePath: "node",
    sameWorkspace: () => true,
    runCommandImpl: (command, args) => ({
      command,
      args,
      status: 0,
      signal: null,
      stdout: `node C:${"\\"}bridge${"\\"}claude-companion.mjs run-job --cwd "C:${"\\"}repo${"\\"}" --job-id adv-abc\n`,
      stderr: "",
      error: null
    }),
    killImpl() {
      throw new Error("a pid that was not confirmed may not be signalled");
    }
  });

  assert.equal(outcome.identity, "mismatched");
});

// A worker is started by one runtime, and its path is what says so. Any executable that has
// been named `node.exe` reads the same when only the basename is compared.
test("another node of the same name at another path is left alone", () => {
  const outcome = terminateProcessTree(1234, {
    platform: "win32",
    identity: "adv-abc",
    companionPath: "C:\\bridge\\claude-companion.mjs",
    runtimePath: "C:\\nodejs\\node.exe",
    sameWorkspace: () => true,
    runCommandImpl: (command, args) => ({
      command,
      args,
      status: 0,
      signal: null,
      stdout: "C:\\other\\node.exe C:\\bridge\\claude-companion.mjs run-job --cwd C:\\repo --job-id adv-abc\n",
      stderr: "",
      error: null
    }),
    killImpl() {
      throw new Error("a pid that was not confirmed may not be signalled");
    }
  });

  assert.equal(outcome.identity, "mismatched");
});

// A doubled quote inside a quoted argument is one quote and the argument goes on. Reading the
// second as an opening quote ends an argument that had not ended, which is how a job id with a
// quote in it can be made to read as the id being cancelled.
test("a doubled quote does not end the argument it sits in", () => {
  const outcome = terminateProcessTree(1234, {
    platform: "win32",
    identity: "adv-abc",
    companionPath: "C:\\bridge\\claude-companion.mjs",
    runtimePath: "node",
    sameWorkspace: () => true,
    runCommandImpl: (command, args) => ({
      command,
      args,
      status: 0,
      signal: null,
      stdout: `node C:${"\\"}bridge${"\\"}claude-companion.mjs run-job --cwd C:${"\\"}repo --job-id "adv-abc""x"\n`,
      stderr: "",
      error: null
    }),
    killImpl() {
      throw new Error("a job id that is not this one may not be cancelled through it");
    }
  });

  assert.equal(outcome.identity, "mismatched");
});

// Only space and tab separate arguments. A workspace path holding an ideographic space is one
// argument, and counting it as two would refuse to cancel a run that is plainly this job's.
test("a workspace path holding an ideographic space is still one argument", () => {
  const commands = [];
  const outcome = terminateProcessTree(1234, {
    platform: "win32",
    identity: "adv-abc",
    companionPath: "C:\\bridge\\claude-companion.mjs",
    runtimePath: "node",
    sameWorkspace: (cwd) => cwd === "C:\\work　space",
    runCommandImpl: (command, args) => {
      commands.push(command);
      return {
        command,
        args,
        status: 0,
        signal: null,
        stdout: `node C:${"\\"}bridge${"\\"}claude-companion.mjs run-job --cwd C:${"\\"}work　space --job-id adv-abc\n`,
        stderr: "",
        error: null
      };
    },
    killImpl() {
      throw new Error("taskkill answers here, so nothing falls back to kill");
    }
  });

  assert.deepEqual(commands, ["powershell", "taskkill"]);
  assert.equal(outcome.delivered, true);
});
