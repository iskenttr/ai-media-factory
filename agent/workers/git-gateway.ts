import { spawn } from "node:child_process";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { appendAudit } from "../orchestrator/audit-log";

async function git(root: string, taskId: string, cwd: string, args: string[]) {
  const forbidden = new Set(["push", "remote", "config", "merge", "rebase", "reset", "clean", "fetch", "pull", "tag"]);
  if (!args[0] || forbidden.has(args[0]) || args.some((arg) => arg === "-c" || arg === "-C" || arg.startsWith("--git-dir") || arg.startsWith("--work-tree"))) {
    throw new Error(`git_gateway_refused:${args.join(" ")}`);
  }
  const started = Date.now();
  const result = await new Promise<{ status: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn("git", args, {
      cwd, shell: false,
      env: {
        PATH: "/usr/local/bin:/usr/bin:/bin", LANG: "C.UTF-8", NODE_ENV: "test" as const,
        GIT_AUTHOR_NAME: "AI Media Factory Engineering Agent", GIT_AUTHOR_EMAIL: "agent@localhost",
        GIT_COMMITTER_NAME: "AI Media Factory Engineering Agent", GIT_COMMITTER_EMAIL: "agent@localhost",
        GIT_CONFIG_NOSYSTEM: "1",
      },
      stdio: ["ignore", "pipe", "pipe"] as const,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code: number | null) => resolve({ status: code ?? 1, stdout, stderr }));
  });
  await appendAudit(root, { timestamp: new Date().toISOString(), taskId, category: "command", event: "git_gateway_command", detail: { args, cwd, exitCode: result.status, durationMs: Date.now() - started } });
  if (result.status !== 0) throw new Error(`git_gateway_failed:${args.join(" ")}:${result.stderr.trim()}`);
  return result.stdout.trim();
}

/** Run git but do NOT throw on non-zero exit; return status + output. Used for probe-only calls. */
async function gitProbe(root: string, taskId: string, cwd: string, args: string[]) {
  const started = Date.now();
  const result = await new Promise<{ status: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn("git", args, {
      cwd, shell: false,
      env: {
        PATH: "/usr/local/bin:/usr/bin:/bin", LANG: "C.UTF-8", NODE_ENV: "test" as const,
        GIT_AUTHOR_NAME: "AI Media Factory Engineering Agent", GIT_AUTHOR_EMAIL: "agent@localhost",
        GIT_COMMITTER_NAME: "AI Media Factory Engineering Agent", GIT_COMMITTER_EMAIL: "agent@localhost",
        GIT_CONFIG_NOSYSTEM: "1",
      },
      stdio: ["ignore", "pipe", "pipe"] as const,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code: number | null) => resolve({ status: code ?? 1, stdout, stderr }));
  });
  await appendAudit(root, { timestamp: new Date().toISOString(), taskId, category: "command", event: "git_gateway_command", detail: { args, cwd, exitCode: result.status, durationMs: Date.now() - started } });
  return result;
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "task";
}

/** Returns true when the path exists as a directory. */
async function isDirectory(p: string): Promise<boolean> {
  try { return (await stat(p)).isDirectory(); } catch { return false; }
}

/** Returns true when the given branch name exists locally. */
async function branchExists(root: string, taskId: string, branch: string): Promise<boolean> {
  const result = await gitProbe(root, taskId, root, ["branch", "--list", branch]);
  return result.stdout.trim().length > 0;
}

/**
 * Returns the git-porcelain status of a worktree path.
 * Returns null when the directory does not exist or is not a valid worktree.
 */
async function worktreeStatus(root: string, taskId: string, worktreePath: string): Promise<string | null> {
  if (!(await isDirectory(worktreePath))) return null;
  const result = await gitProbe(root, taskId, worktreePath, ["status", "--porcelain"]);
  if (result.status !== 0) return null;
  return result.stdout;
}

/**
 * Remove a worktree and, optionally, its associated branch.
 * Only removes the worktree when it is clean (no tracked modifications, no staged changes).
 * Untracked files are tolerated (they are not part of the branch).
 * Throws `worktree_is_dirty` when tracked modifications are present so callers can move to BLOCKED.
 */
async function removeStaleWorktree(root: string, taskId: string, worktreePath: string, branch: string): Promise<void> {
  const status = await worktreeStatus(root, taskId, worktreePath);
  if (status !== null) {
    // Dirty = any tracked modification (M, D, A, R, C) – NOT just untracked (??)
    const dirtyLines = status.split("\n").filter((line) => line.length >= 2 && line[0] !== "?" && line[1] !== "?");
    if (dirtyLines.length > 0) {
      await appendAudit(root, {
        timestamp: new Date().toISOString(), taskId, category: "system",
        event: "worktree_dirty_refused_removal",
        detail: { worktreePath, branch, dirtyLines },
      });
      throw new Error(`worktree_is_dirty:${worktreePath}`);
    }
    // Clean worktree – detach it from git's worktree registry and delete the directory.
    await appendAudit(root, {
      timestamp: new Date().toISOString(), taskId, category: "system",
      event: "worktree_stale_clean_removing",
      detail: { worktreePath, branch },
    });
    // `git worktree remove` is not in the allowlist; use lower-level prune after rm.
    await rm(worktreePath, { recursive: true, force: true });
    // Prune dangling worktree entries.
    await gitProbe(root, taskId, root, ["worktree", "prune"]);
  }

  // Remove the branch if it exists.
  const exists = await branchExists(root, taskId, branch);
  if (exists) {
    await appendAudit(root, {
      timestamp: new Date().toISOString(), taskId, category: "system",
      event: "branch_stale_removing",
      detail: { branch },
    });
    // Branch deletion is not in the forbidden list – `branch` command is allowed.
    await git(root, taskId, root, ["branch", "-D", branch]);
  }
}

/**
 * Safely remove a task's worktree and branch after finalization.
 * Unlike removeStaleWorktree, this never throws on dirty state.
 * It attempts to remove the worktree if clean, and always removes the branch.
 * Does not delete the main repository or active worktrees.
 */
export async function cleanupFailedTaskWorktree(root: string, taskId: string, worktree: string, branch: string): Promise<void> {
  const status = await worktreeStatus(root, taskId, worktree);
  if (status !== null) {
    const dirtyLines = status.split("\n").filter((line) => line.length >= 2 && line[0] !== "?" && line[1] !== "?");
    if (dirtyLines.length > 0) {
      // Dirty worktree from failed task – log and leave for inspection
      await appendAudit(root, {
        timestamp: new Date().toISOString(), taskId, category: "system",
        event: "worktree_failed_dirty_left",
        detail: { worktreePath: worktree, branch, dirtyLines },
      });
    } else {
      // Clean worktree – remove it safely
      await appendAudit(root, {
        timestamp: new Date().toISOString(), taskId, category: "system",
        event: "worktree_failed_clean_removing",
        detail: { worktreePath: worktree, branch },
      });
      await rm(worktree, { recursive: true, force: true });
      await gitProbe(root, taskId, root, ["worktree", "prune"]);
    }
  }

  // Always attempt branch removal (force delete even if not merged)
  const exists = await branchExists(root, taskId, branch);
  if (exists) {
    await appendAudit(root, {
      timestamp: new Date().toISOString(), taskId, category: "system",
      event: "branch_failed_removing",
      detail: { branch },
    });
    await git(root, taskId, root, ["branch", "-D", branch]);
  }
}

export async function createTaskWorktree(root: string, taskId: string, title: string, baseCommit: string) {
  const branch = `agent/${taskId.toLowerCase()}-${slug(title)}`;
  const worktree = path.join(root, "worktrees", taskId);
  await mkdir(path.dirname(worktree), { recursive: true });

  const wtExists = await isDirectory(worktree);
  const brExists = await branchExists(root, taskId, branch);

  await appendAudit(root, {
    timestamp: new Date().toISOString(), taskId, category: "system",
    event: "worktree_prep_start",
    detail: { branch, worktree, baseCommit, worktreeExists: wtExists, branchExists: brExists },
  });

  if (wtExists || brExists) {
    // Stale artefacts from a previous run – attempt safe cleanup.
    await removeStaleWorktree(root, taskId, worktree, branch);
    await appendAudit(root, {
      timestamp: new Date().toISOString(), taskId, category: "system",
      event: "worktree_prep_stale_cleaned",
      detail: { branch, worktree },
    });
  }

  await git(root, taskId, root, ["worktree", "add", "-b", branch, worktree, baseCommit]);

  await appendAudit(root, {
    timestamp: new Date().toISOString(), taskId, category: "system",
    event: "worktree_prep_complete",
    detail: { branch, worktree, baseCommit },
  });

  return { branch, worktree };
}

export async function inspectWorktree(root: string, taskId: string, worktree: string) {
  const status = await git(root, taskId, worktree, ["status", "--porcelain"]);
  const files = status.split("\n").filter(Boolean).map((line) => line.slice(3));
  let patch = await git(root, taskId, worktree, ["diff", "--binary", "--no-ext-diff"]);
  for (const line of status.split("\n").filter((entry) => entry.startsWith("?? "))) {
    const file = line.slice(3);
    const content = await readFile(path.join(worktree, file), "utf8");
    const additions = content.split("\n").map((entry) => `+${entry}`).join("\n");
    patch += `\ndiff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n${additions}\n`;
  }
  return { files, patch, status };
}

export async function commitCandidate(root: string, taskId: string, worktree: string, files: string[], message: string) {
  await git(root, taskId, worktree, ["add", "--", ...files]);
  await git(root, taskId, worktree, ["commit", "-m", message]);
  return git(root, taskId, worktree, ["rev-parse", "HEAD"]);
}

export function acceptedCandidateRefspec(taskId: string, branch: string, commitHash: string) {
  const normalizedTaskId = taskId.toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(normalizedTaskId)) throw new Error("candidate_publish_invalid_task_id");
  if (!branch.startsWith(`agent/${normalizedTaskId}-`) || !/^agent\/[a-z0-9][a-z0-9/-]*$/.test(branch)) {
    throw new Error("candidate_publish_invalid_branch");
  }
  if (!/^[0-9a-f]{40}$/.test(commitHash)) throw new Error("candidate_publish_invalid_commit");
  return `${commitHash}:refs/heads/${branch}`;
}

/**
 * Publish one already-accepted candidate through a deliberately narrow path.
 * The generic Git gateway continues to reject push. This publisher cannot
 * force, delete, retarget, configure, or update any non-agent branch.
 */
export async function publishAcceptedCandidate(root: string, taskId: string, worktree: string, branch: string, commitHash: string) {
  const refspec = acceptedCandidateRefspec(taskId, branch, commitHash);
  const started = Date.now();
  const result = await new Promise<{ status: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn("git", ["push", "--porcelain", "origin", refspec], {
      cwd: worktree,
      shell: false,
      env: {
        PATH: "/usr/local/bin:/usr/bin:/bin", LANG: "C.UTF-8", NODE_ENV: "production" as const, GIT_CONFIG_NOSYSTEM: "1",
        GIT_TERMINAL_PROMPT: "0", SSH_ASKPASS_REQUIRE: "never",
      },
      stdio: ["ignore", "pipe", "pipe"] as const,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code: number | null) => resolve({ status: code ?? 1, stdout, stderr }));
  });
  await appendAudit(root, {
    timestamp: new Date().toISOString(), taskId, category: "command", event: "accepted_candidate_publish",
    detail: { branch, commitHash, remote: "origin", force: false, exitCode: result.status, durationMs: Date.now() - started },
  });
  if (result.status !== 0) throw new Error(`candidate_publish_failed:${result.stderr.trim()}`);
  return { published: true as const, remote: "origin", branch, commitHash, force: false as const };
}

export async function applyCandidatePatch(root: string, taskId: string, worktree: string, patchFile: string) {
  await git(root, taskId, worktree, ["apply", "--check", patchFile]);
  await git(root, taskId, worktree, ["apply", patchFile]);
}

export async function resolveHead(root: string, taskId = "SYSTEM") {
  return git(root, taskId, root, ["rev-parse", "HEAD"]);
}
