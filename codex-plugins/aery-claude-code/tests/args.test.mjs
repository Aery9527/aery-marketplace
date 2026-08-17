import test from "node:test";
import assert from "node:assert/strict";

import { parseArgs, splitRawArgumentString } from "../scripts/lib/args.mjs";

// A flag is never the value of another flag, in either spelling. Taking one would swallow it
// whole, and the check that refuses two flags together would have nothing left to refuse.
test("a value option refuses to take a flag as its value", () => {
  assert.throws(
    () => parseArgs(["--resume-session", "--fresh", "repair"], { valueOptions: ["resume-session"], booleanOptions: ["fresh"] }),
    /Missing value for --resume-session/
  );

  assert.throws(
    () => parseArgs(["-c", "--fresh"], { valueOptions: ["cwd"], booleanOptions: ["fresh"], aliasMap: { c: "cwd" } }),
    /Missing value for -c/
  );
});

// The escape hatch for a value that really does begin with `--`, where nothing is ambiguous.
test("an inline value may begin with dashes", () => {
  const { options } = parseArgs(["--cwd=--odd-directory-name"], { valueOptions: ["cwd"] });

  assert.equal(options.cwd, "--odd-directory-name");
});

test("a value that does not look like a flag is still taken", () => {
  const shortForm = parseArgs(["-c", "/repo", "rest"], { valueOptions: ["cwd"], aliasMap: { c: "cwd" } });
  const longForm = parseArgs(["--cwd", "/repo", "rest"], { valueOptions: ["cwd"] });

  assert.equal(shortForm.options.cwd, "/repo");
  assert.deepEqual(shortForm.positionals, ["rest"]);
  assert.equal(longForm.options.cwd, "/repo");
  assert.deepEqual(longForm.positionals, ["rest"]);
});

// The whole grammar, pinned: whitespace separates, a quote groups, the matching quote ends
// the group, and a backslash is always a character. The path case is why nothing escapes a
// quote — `"C:\Program Files\"` has to end where it looks like it ends, or the words after
// it stop being words of the request. Only a double quote groups.
test("quoting groups and a backslash is always a character", () => {
  const B = String.fromCharCode(92);
  const Q = String.fromCharCode(34);

  assert.deepEqual(splitRawArgumentString("investigate C:" + B + "src" + B + "file"), [
    "investigate",
    "C:" + B + "src" + B + "file"
  ]);

  assert.deepEqual(splitRawArgumentString("--cwd " + Q + "C:" + B + "Program Files" + B + Q + " inspect"), [
    "--cwd",
    "C:" + B + "Program Files" + B,
    "inspect"
  ]);

  // An apostrophe is a character, not a quote: requests are written in English and paths are
  // written by people with names.
  assert.deepEqual(splitRawArgumentString("don't modify the API"), ["don't", "modify", "the", "API"]);
  assert.deepEqual(splitRawArgumentString("--cwd C:" + B + "Users" + B + "O'Brien" + B + "repo"), [
    "--cwd",
    "C:" + B + "Users" + B + "O'Brien" + B + "repo"
  ]);

  // Runs of whitespace inside a quoted run are kept; between arguments they are not.
  assert.deepEqual(splitRawArgumentString("a   " + Q + "b  c" + Q), ["a", "b  c"]);
});

// A quote that never closes is a typo, and swallowing the rest of the line would hand the
// request to whatever the quote opened.
test("an unbalanced quote is refused rather than run to the end", () => {
  const B = String.fromCharCode(92);
  const Q = String.fromCharCode(34);

  assert.throws(
    () => splitRawArgumentString("--cwd " + Q + "C:" + B + "dir fix the bug"),
    /Unbalanced double quote/
  );
  // An apostrophe never opens anything, so it never leaves anything open.
  assert.deepEqual(splitRawArgumentString("say don't"), ["say", "don't"]);
});

// The shapes a grammar this small still has to answer for.
test("empty and adjacent quoted runs keep their place", () => {
  const Q = String.fromCharCode(34);

  assert.deepEqual(splitRawArgumentString("a " + Q + Q + " b"), ["a", "", "b"]);
  assert.deepEqual(splitRawArgumentString(Q + Q), [""]);
  assert.deepEqual(splitRawArgumentString("pre" + Q + "in" + Q + "post"), ["preinpost"]);
});
