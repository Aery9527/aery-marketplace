import fs from "node:fs";
import path from "node:path";

import { isProbablyText } from "./fs.mjs";
import { formatCommandFailure, runCommand, runCommandChecked } from "./process.mjs";

const MAX_UNTRACKED_BYTES = 24 * 1024;
const DEFAULT_INLINE_DIFF_MAX_FILES = 2;
const DEFAULT_INLINE_DIFF_MAX_BYTES = 256 * 1024;

// Git is directly executable on Windows. Repository-derived arguments must never pass through a shell.
function git(cwd, args, options = {}) {
  return runCommand("git", args, { cwd, ...options, shell: false });
}

function gitChecked(cwd, args, options = {}) {
  return runCommandChecked("git", args, { cwd, ...options, shell: false });
}

function listUniqueFiles(...groups) {
  return [...new Set(groups.flat().filter(Boolean))].sort();
}

function normalizeMaxInlineFiles(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_INLINE_DIFF_MAX_FILES;
  }
  return Math.floor(parsed);
}

function normalizeMaxInlineDiffBytes(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_INLINE_DIFF_MAX_BYTES;
  }
  return Math.floor(parsed);
}

function measureGitOutputBytes(cwd, args, maxBytes) {
  const result = git(cwd, args, { maxBuffer: maxBytes + 1 });
  if (result.error && /** @type {NodeJS.ErrnoException} */ (result.error).code === "ENOBUFS") {
    return maxBytes + 1;
  }
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(formatCommandFailure(result));
  }
  return Buffer.byteLength(result.stdout, "utf8");
}

function measureCombinedGitOutputBytes(cwd, argSets, maxBytes) {
  let totalBytes = 0;
  for (const args of argSets) {
    const remainingBytes = maxBytes - totalBytes;
    if (remainingBytes < 0) {
      return maxBytes + 1;
    }
    totalBytes += measureGitOutputBytes(cwd, args, remainingBytes);
    if (totalBytes > maxBytes) {
      return totalBytes;
    }
  }
  return totalBytes;
}

function buildBranchComparison(cwd, baseRef) {
  const mergeBase = gitChecked(cwd, ["merge-base", "HEAD", baseRef]).stdout.trim();
  return {
    mergeBase,
    commitRange: `${mergeBase}..HEAD`,
    reviewRange: `${baseRef}...HEAD`
  };
}

export function ensureGitRepository(cwd) {
  const result = git(cwd, ["rev-parse", "--show-toplevel"]);
  const errorCode = result.error && "code" in result.error ? result.error.code : null;
  if (errorCode === "ENOENT") {
    throw new Error("git is not installed. Install Git and retry.");
  }
  if (result.status !== 0) {
    throw new Error("This command must run inside a Git repository.");
  }
  return result.stdout.trim();
}

export function getRepoRoot(cwd) {
  return gitChecked(cwd, ["rev-parse", "--show-toplevel"]).stdout.trim();
}

export function detectDefaultBranch(cwd) {
  const symbolic = git(cwd, ["symbolic-ref", "refs/remotes/origin/HEAD"]);
  if (symbolic.status === 0) {
    const remoteHead = symbolic.stdout.trim();
    if (remoteHead.startsWith("refs/remotes/origin/")) {
      return remoteHead.replace("refs/remotes/origin/", "");
    }
  }

  const candidates = ["main", "master", "trunk"];
  for (const candidate of candidates) {
    const local = git(cwd, ["show-ref", "--verify", "--quiet", `refs/heads/${candidate}`]);
    if (local.status === 0) {
      return candidate;
    }
    const remote = git(cwd, ["show-ref", "--verify", "--quiet", `refs/remotes/origin/${candidate}`]);
    if (remote.status === 0) {
      return `origin/${candidate}`;
    }
  }

  throw new Error("Unable to detect the repository default branch. Pass --base <ref> or use --scope working-tree.");
}

export function getCurrentBranch(cwd) {
  return gitChecked(cwd, ["branch", "--show-current"]).stdout.trim() || "HEAD";
}

export function getWorkingTreeState(cwd) {
  const staged = gitChecked(cwd, ["diff", "--cached", "--name-only"]).stdout.trim().split("\n").filter(Boolean);
  const unstaged = gitChecked(cwd, ["diff", "--name-only"]).stdout.trim().split("\n").filter(Boolean);
  const untracked = gitChecked(cwd, ["ls-files", "--others", "--exclude-standard"]).stdout.trim().split("\n").filter(Boolean);

  return {
    staged,
    unstaged,
    untracked,
    isDirty: staged.length > 0 || unstaged.length > 0 || untracked.length > 0
  };
}

export function resolveReviewTarget(cwd, options = {}) {
  ensureGitRepository(cwd);

  const requestedScope = options.scope ?? "auto";
  const baseRef = options.base ?? null;
  const state = getWorkingTreeState(cwd);
  const supportedScopes = new Set(["auto", "working-tree", "branch"]);

  if (baseRef) {
    return {
      mode: "branch",
      label: `branch diff against ${baseRef}`,
      baseRef,
      explicit: true
    };
  }

  if (requestedScope === "working-tree") {
    return {
      mode: "working-tree",
      label: "working tree diff",
      explicit: true
    };
  }

  if (!supportedScopes.has(requestedScope)) {
    throw new Error(
      `Unsupported review scope "${requestedScope}". Use one of: auto, working-tree, branch, or pass --base <ref>.`
    );
  }

  if (requestedScope === "branch") {
    const detectedBase = detectDefaultBranch(cwd);
    return {
      mode: "branch",
      label: `branch diff against ${detectedBase}`,
      baseRef: detectedBase,
      explicit: true
    };
  }

  if (state.isDirty) {
    return {
      mode: "working-tree",
      label: "working tree diff",
      explicit: false
    };
  }

  const detectedBase = detectDefaultBranch(cwd);
  return {
    mode: "branch",
    label: `branch diff against ${detectedBase}`,
    baseRef: detectedBase,
    explicit: false
  };
}

// `auto` picks the working tree or a branch diff on its own, and an explicit `--base`
// drops every uncommitted change from the context this bridge builds. Both cases would
// otherwise be reported as "the current changes", so the scope is spelled out.
//
// `authoritative` distinguishes the two review paths. When the bridge assembles the
// context, this describes exactly what the reviewer saw. The built-in reviewer instead
// receives a target and decides for itself — it was observed to review staged work on
// top of a requested branch diff — so there the scope is stated as what was asked for.
export function describeReviewScope(cwd, target, options = {}) {
  const authoritative = options.authoritative !== false;
  const repoRoot = getRepoRoot(cwd);
  const state = getWorkingTreeState(repoRoot);
  const selection = target.explicit ? "requested" : "selected automatically";
  const caveat = authoritative
    ? ""
    : " The built-in reviewer sets its own final scope and may cover more than this; its report states what it read.";

  if (target.mode === "working-tree") {
    const covered = `uncommitted work, ${selection} — ${state.staged.length} staged, ${state.unstaged.length} unstaged, ${state.untracked.length} untracked file(s).`;
    return authoritative ? `${covered} Committed history is not reviewed.` : `${covered}${caveat}`;
  }

  const pendingCount = listUniqueFiles(state.staged, state.unstaged, state.untracked).length;
  const base = `commits between ${target.baseRef} and HEAD, ${selection}.`;
  if (!authoritative) {
    return `${base}${caveat}`;
  }
  return pendingCount > 0
    ? `${base} ${pendingCount} uncommitted file(s) are excluded from this review.`
    : `${base} The working tree is clean.`;
}

function formatSection(title, body) {
  return [`## ${title}`, "", body.trim() ? body.trim() : "(none)", ""].join("\n");
}

// Untracked content is read straight off disk rather than through git, so containment
// is this bridge's responsibility. `git ls-files --others` walks into a symlinked
// directory or an NTFS junction and reports what it finds there as an ordinary
// untracked path, which then reads as a plain file: only the resolved path reveals
// that it lives outside the repository.
export function isContainedInRepo(repoRoot, absolutePath) {
  try {
    const realRoot = fs.realpathSync(repoRoot);
    const realPath = fs.realpathSync(absolutePath);
    return realPath === realRoot || realPath.startsWith(realRoot + path.sep);
  } catch {
    return false;
  }
}

// Returns the section to embed plus, when the file was left out, why. The caller needs
// the reason as data: a review whose context silently dropped a changed file must not be
// reported as having covered the whole target.
function formatUntrackedFile(repoRoot, relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const skip = (reason) => ({
    body: `### ${relativePath}\n(skipped: ${reason})`,
    skippedReason: `${relativePath} (${reason})`
  });

  let stat;
  try {
    stat = fs.lstatSync(absolutePath);
  } catch {
    return skip("broken symlink or unreadable file");
  }
  if (!fs.existsSync(absolutePath)) {
    return skip("broken symlink or unreadable file");
  }
  if (!isContainedInRepo(repoRoot, absolutePath)) {
    return skip("resolves outside the repository");
  }
  if (stat.isDirectory()) {
    return skip("directory");
  }
  if (stat.size > MAX_UNTRACKED_BYTES) {
    return skip(`${stat.size} bytes exceeds ${MAX_UNTRACKED_BYTES} byte limit`);
  }

  let buffer;
  try {
    buffer = fs.readFileSync(absolutePath);
  } catch {
    return skip("broken symlink or unreadable file");
  }
  if (!isProbablyText(buffer)) {
    return skip("binary file");
  }

  return {
    body: [`### ${relativePath}`, "```", buffer.toString("utf8").trimEnd(), "```"].join("\n"),
    skippedReason: null
  };
}

function collectWorkingTreeContext(cwd, state, options = {}) {
  const includeDiff = options.includeDiff !== false;
  const status = gitChecked(cwd, ["status", "--short", "--untracked-files=all"]).stdout.trim();
  const changedFiles = listUniqueFiles(state.staged, state.unstaged, state.untracked);
  const untracked = state.untracked.map((file) => formatUntrackedFile(cwd, file));
  const untrackedBody = untracked.map((entry) => entry.body).join("\n\n");
  const skippedUntracked = untracked.filter((entry) => entry.skippedReason !== null);

  let parts;
  if (includeDiff) {
    const stagedDiff = gitChecked(cwd, ["diff", "--cached", "--binary", "--no-ext-diff", "--submodule=diff"]).stdout;
    const unstagedDiff = gitChecked(cwd, ["diff", "--binary", "--no-ext-diff", "--submodule=diff"]).stdout;
    parts = [
      formatSection("Git Status", status),
      formatSection("Staged Diff", stagedDiff),
      formatSection("Unstaged Diff", unstagedDiff),
      formatSection("Untracked Files", untrackedBody)
    ];
  } else {
    const stagedStat = gitChecked(cwd, ["diff", "--shortstat", "--cached"]).stdout.trim();
    const unstagedStat = gitChecked(cwd, ["diff", "--shortstat"]).stdout.trim();
    parts = [
      formatSection("Git Status", status),
      formatSection("Staged Diff Stat", stagedStat),
      formatSection("Unstaged Diff Stat", unstagedStat),
      formatSection("Changed Files", changedFiles.join("\n")),
      formatSection("Untracked Files", untrackedBody)
    ];
  }

  return {
    mode: "working-tree",
    summary: `Reviewing ${state.staged.length} staged, ${state.unstaged.length} unstaged, and ${state.untracked.length} untracked file(s).`,
    content: parts.join("\n"),
    changedFiles,
    // Counted apart from `changedFiles` because only a tracked file contributes to the
    // diff: reporting the total against the diff would credit it with files it never had.
    trackedFileCount: listUniqueFiles(state.staged, state.unstaged).length,
    untrackedIncludedCount: untracked.length - skippedUntracked.length,
    skippedUntracked: skippedUntracked.map((entry) => entry.skippedReason)
  };
}

function collectBranchContext(cwd, baseRef, options = {}) {
  const includeDiff = options.includeDiff !== false;
  const comparison = options.comparison ?? buildBranchComparison(cwd, baseRef);
  const currentBranch = getCurrentBranch(cwd);
  const changedFiles = gitChecked(cwd, ["diff", "--name-only", comparison.commitRange]).stdout.trim().split("\n").filter(Boolean);
  const logOutput = gitChecked(cwd, ["log", "--oneline", "--decorate", comparison.commitRange]).stdout.trim();
  const diffStat = gitChecked(cwd, ["diff", "--stat", comparison.commitRange]).stdout.trim();

  return {
    mode: "branch",
    summary: `Reviewing branch ${currentBranch} against ${baseRef} from merge-base ${comparison.mergeBase}.`,
    content: includeDiff
      ? [
          formatSection("Commit Log", logOutput),
          formatSection("Diff Stat", diffStat),
          formatSection(
            "Branch Diff",
            gitChecked(cwd, ["diff", "--binary", "--no-ext-diff", "--submodule=diff", comparison.commitRange]).stdout
          )
        ].join("\n")
      : [
          formatSection("Commit Log", logOutput),
          formatSection("Diff Stat", diffStat),
          formatSection("Changed Files", changedFiles.join("\n"))
        ].join("\n"),
    changedFiles,
    // A branch comparison only ever spans committed files, so every changed file is
    // tracked and no untracked content reaches the context.
    trackedFileCount: changedFiles.length,
    untrackedIncludedCount: 0,
    skippedUntracked: [],
    comparison
  };
}

// The review session registers no shell, so guidance must not send the reviewer after a
// git command it cannot run. Without the diff, a tracked change reaches the reviewer as a
// summary and a file name only, so it has to read those files itself with `Read` and
// nothing here observes whether it did; an eligible untracked file still arrives with its
// contents inlined, because it has no committed version to diff against. Either way the
// reviewer cannot see what the change removed — saying so keeps the findings honest.
function buildAdversarialCollectionGuidance(options = {}) {
  if (options.includeDiff !== false) {
    return "Use the repository context below as primary evidence.";
  }

  return [
    "The repository context below is a summary, not a diff. For a tracked file it gives you",
    "the name and a change stat but not the change itself, so read those files to see their",
    "current contents. An untracked file is included with its contents already, unless the",
    "section marks it skipped, in which case you do not have it at all. You cannot",
    "see removed lines or previous versions, and you have no shell, so do not claim a",
    "finding about what the change deleted or replaced. Say plainly in the summary that this",
    "review assessed the current state of the changed files rather than the change itself."
  ].join(" ");
}

// Names the threshold that withheld the diff, or null when neither was crossed. The byte
// count is deliberately not quoted back: the measurement stops at the limit, so the true
// size is only known to be larger.
function describeInlineRefusal(fileCount, diffBytes, maxInlineFiles, maxInlineDiffBytes) {
  const reasons = [];
  if (fileCount > maxInlineFiles) {
    reasons.push(`${fileCount} changed file(s) exceeds the inline limit of ${maxInlineFiles}`);
  }
  if (diffBytes > maxInlineDiffBytes) {
    reasons.push(`the diff exceeds the inline limit of ${maxInlineDiffBytes} bytes`);
  }
  return reasons.length > 0 ? reasons.join(" and ") : null;
}

export function collectReviewContext(cwd, target, options = {}) {
  const repoRoot = getRepoRoot(cwd);
  const currentBranch = getCurrentBranch(repoRoot);
  const maxInlineFiles = normalizeMaxInlineFiles(options.maxInlineFiles);
  const maxInlineDiffBytes = normalizeMaxInlineDiffBytes(options.maxInlineDiffBytes);
  let details;
  let includeDiff;
  let diffBytes;
  let inlineRefusalReason = null;

  if (target.mode === "working-tree") {
    const state = getWorkingTreeState(repoRoot);
    diffBytes = measureCombinedGitOutputBytes(
      repoRoot,
      [
        ["diff", "--cached", "--binary", "--no-ext-diff", "--submodule=diff"],
        ["diff", "--binary", "--no-ext-diff", "--submodule=diff"]
      ],
      maxInlineDiffBytes
    );
    const changedCount = listUniqueFiles(state.staged, state.unstaged, state.untracked).length;
    inlineRefusalReason = describeInlineRefusal(changedCount, diffBytes, maxInlineFiles, maxInlineDiffBytes);
    includeDiff = options.includeDiff ?? inlineRefusalReason === null;
    details = collectWorkingTreeContext(repoRoot, state, { includeDiff });
  } else {
    const comparison = buildBranchComparison(repoRoot, target.baseRef);
    const fileCount = gitChecked(repoRoot, ["diff", "--name-only", comparison.commitRange]).stdout.trim().split("\n").filter(Boolean).length;
    diffBytes = measureGitOutputBytes(
      repoRoot,
      ["diff", "--binary", "--no-ext-diff", "--submodule=diff", comparison.commitRange],
      maxInlineDiffBytes
    );
    inlineRefusalReason = describeInlineRefusal(fileCount, diffBytes, maxInlineFiles, maxInlineDiffBytes);
    includeDiff = options.includeDiff ?? inlineRefusalReason === null;
    details = collectBranchContext(repoRoot, target.baseRef, { includeDiff, comparison });
  }

  return {
    cwd: repoRoot,
    repoRoot,
    branch: currentBranch,
    target,
    fileCount: details.changedFiles.length,
    diffBytes,
    inputMode: includeDiff ? "inline-diff" : "self-collect",
    // Only meaningful when the diff was withheld, and then it names the threshold that
    // was actually crossed. Either one can trip alone: several tiny untracked files
    // cross the file count while the diff itself is empty.
    inlineRefusalReason: includeDiff ? null : inlineRefusalReason ?? "the caller asked for a summary",
    collectionGuidance: buildAdversarialCollectionGuidance({ includeDiff }),
    ...details
  };
}
