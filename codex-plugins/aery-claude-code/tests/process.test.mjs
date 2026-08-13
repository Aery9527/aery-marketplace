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
