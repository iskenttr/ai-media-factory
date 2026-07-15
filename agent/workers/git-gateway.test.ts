// @vitest-environment node
/**
 * Regression tests for MIGRATION-SMOKE-001 rerun idempotency.
 *
 * Covers:
 *   - stale branch (no worktree dir, branch exists)         → cleaned and re-created
 *   - stale clean worktree (worktree dir + branch exist)    → cleaned and re-created
 *   - dirty worktree                                        → throws worktree_is_dirty
 *   - successful rerun of the same task ID                  → both runs complete
 *   - failed finalization still moves task file to failed/  → terminal state guaranteed
 *   - blocked finalization moves task file to blocked/      → terminal state guaranteed
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// ────────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────────

let repoRoot = "";
let agentRoot = "";

/** Synchronous git convenience – runs in repoRoot by default. */
function g(args: string, cwd = repoRoot) {
  return execSync(`git ${args}`, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Test",
      GIT_AUTHOR_EMAIL: "test@localhost",
      GIT_COMMITTER_NAME: "Test",
      GIT_COMMITTER_EMAIL: "test@localhost",
      GIT_CONFIG_NOSYSTEM: "1",
    },
  }).trim();
}

/** Create a minimal git repo with one commit and the agent state directory. */
async function makeRepo() {
  repoRoot = await mkdtemp(path.join(os.tmpdir(), "amf-gwtest-"));
  agentRoot = repoRoot; // audit log will go under repoRoot/agent/state/

  // Init repo
  g("init -b main");
  g("config user.email test@localhost");
  g("config user.name Test");
  await writeFile(path.join(repoRoot, "README.md"), "test\n");
  g("add README.md");
  g('commit -m "initial"');

  // Create agent state dir so audit-log doesn't fail
  await mkdir(path.join(repoRoot, "agent/state"), { recursive: true });
}

async function cleanRepo() {
  if (repoRoot) await rm(repoRoot, { recursive: true, force: true });
  repoRoot = "";
  agentRoot = "";
}

// ────────────────────────────────────────────────────────────────────────────────
// Lazily import after repo is ready (module caches are fine – we test at call-site)
// ────────────────────────────────────────────────────────────────────────────────
async function gateway() {
  const mod = await import("../workers/git-gateway");
  return mod;
}

// ────────────────────────────────────────────────────────────────────────────────
// Test fixtures
// ────────────────────────────────────────────────────────────────────────────────

const TASK_ID = "TEST-IDEMPOTENT-001";
const TITLE = "idempotent worktree test";

function baseCommit(): string {
  return g("rev-parse HEAD");
}

// ────────────────────────────────────────────────────────────────────────────────
// git-gateway regression suite
// ────────────────────────────────────────────────────────────────────────────────

describe("git-gateway idempotency", () => {
  beforeEach(makeRepo);
  afterEach(cleanRepo);

  it("creates a fresh worktree when nothing exists", async () => {
    const { createTaskWorktree } = await gateway();
    const commit = baseCommit();
    const result = await createTaskWorktree(agentRoot, TASK_ID, TITLE, commit);
    expect(result.branch).toMatch(/^agent\//);
    expect(result.worktree).toContain(TASK_ID);
    // Verify the worktree and branch actually exist
    const branches = g("branch --list");
    expect(branches).toContain(result.branch);
  });

  it("handles stale branch (no worktree dir): cleans and re-creates", async () => {
    const { createTaskWorktree } = await gateway();
    const commit = baseCommit();
    const branch = `agent/${TASK_ID.toLowerCase()}-idempotent-worktree-test`;

    // Manually create just the branch (simulate leftover from a previous run where worktree was
    // already pruned but branch was not deleted).
    g(`branch ${branch}`);

    // Should not throw – should detect stale branch, delete it, and proceed.
    const result = await createTaskWorktree(agentRoot, TASK_ID, TITLE, commit);
    expect(result.branch).toBe(branch);

    // The worktree must now exist as a directory.
    const wt = g("worktree list --porcelain");
    expect(wt).toContain(result.worktree);
  });

  it("handles stale clean worktree: cleans and re-creates", async () => {
    const { createTaskWorktree } = await gateway();
    const commit = baseCommit();

    // First run – creates normally.
    const first = await createTaskWorktree(agentRoot, TASK_ID, TITLE, commit);
    expect(first.branch).toMatch(/^agent\//);

    // Remove the worktree from git but leave the branch (simulate incomplete cleanup).
    const worktreePath = first.worktree;
    execSync(`git worktree remove --force ${worktreePath}`, {
      cwd: repoRoot,
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1" },
    });
    // Branch still exists now.
    expect(g(`branch --list ${first.branch}`)).toBeTruthy();

    // Second run – same task ID, same title, same base commit.
    const second = await createTaskWorktree(agentRoot, TASK_ID, TITLE, commit);
    expect(second.branch).toBe(first.branch);
    expect(second.worktree).toBe(first.worktree);
  });

  it("handles stale clean worktree (both dir and branch exist): cleans and re-creates", async () => {
    const { createTaskWorktree } = await gateway();
    const commit = baseCommit();

    // First run.
    const first = await createTaskWorktree(agentRoot, TASK_ID, TITLE, commit);

    // Second run must succeed (idempotent rerun).
    const second = await createTaskWorktree(agentRoot, TASK_ID, TITLE, commit);
    expect(second.branch).toBe(first.branch);
    expect(second.worktree).toBe(first.worktree);
  });

  it("refuses to remove a dirty worktree and throws worktree_is_dirty", async () => {
    const { createTaskWorktree } = await gateway();
    const commit = baseCommit();

    // First run – creates the worktree.
    const first = await createTaskWorktree(agentRoot, TASK_ID, TITLE, commit);

    // Write a tracked (staged) change to make the worktree dirty.
    const dirtyFile = path.join(first.worktree, "dirty.txt");
    await writeFile(dirtyFile, "dirty content\n");
    g(`add dirty.txt`, first.worktree);

    // Second run must detect the dirty worktree and throw.
    await expect(createTaskWorktree(agentRoot, TASK_ID, TITLE, commit)).rejects.toThrow("worktree_is_dirty");
  });

  it("tolerates untracked files in the worktree (not dirty)", async () => {
    const { createTaskWorktree } = await gateway();
    const commit = baseCommit();

    // First run.
    const first = await createTaskWorktree(agentRoot, TASK_ID, TITLE, commit);

    // Write an untracked file (not staged, not committed).
    await writeFile(path.join(first.worktree, "untracked.txt"), "untracked\n");

    // Second run must succeed – untracked files are not "dirty" for idempotency purposes.
    const second = await createTaskWorktree(agentRoot, TASK_ID, TITLE, commit);
    expect(second.branch).toBe(first.branch);
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// task-queue terminal state guarantee
// ────────────────────────────────────────────────────────────────────────────────

describe("task-queue terminal state guarantee", () => {
  let queueRoot = "";

  beforeEach(async () => {
    queueRoot = await mkdtemp(path.join(os.tmpdir(), "amf-queuetest-"));
    // Create agent state dir for audit-log
    await mkdir(path.join(queueRoot, "agent/state"), { recursive: true });
    // Create queue directories
    for (const dir of ["queue", "processing", "completed", "failed", "blocked"]) {
      await mkdir(path.join(queueRoot, "agent/tasks", dir), { recursive: true });
    }
  });

  afterEach(async () => {
    if (queueRoot) await rm(queueRoot, { recursive: true, force: true });
    queueRoot = "";
  });

  function makeTaskFile(taskId: string, enabled = true) {
    return JSON.stringify({
      task_id: taskId,
      title: "Test task",
      priority: "high",
      objective: "Create a harmless benchmark fixture marker.",
      enabled,
      allowed_paths: ["benchmarks/results/**"],
      forbidden_paths: ["production/**"],
      success_criteria: { unit_tests_pass: true, integration_tests_pass: false, render_tests_pass: true, maximum_critical_errors: 0, minimum_quality_delta: 0, maximum_regressions: 0 },
      limits: { maximum_iterations: 1, maximum_changed_files: 1, maximum_diff_lines: 20, maximum_render_attempts: 1, maximum_model_calls: 0, maximum_execution_ms: 120000 },
      required_artifacts: ["technical-summary.md", "test-report.json", "benchmark-report.json", "quality-report.json", "git-diff.patch"],
      test_commands: [],
      execution: { kind: "controlled_sample", target: "benchmarks/results/test.txt", content: "test\n" },
    });
  }

  it("claimNextTask returns null on empty queue", async () => {
    const { claimNextTask } = await import("../orchestrator/task-queue");
    expect(await claimNextTask(queueRoot)).toBeNull();
  });

  it("claimNextTask atomically moves file to processing/", async () => {
    const { claimNextTask } = await import("../orchestrator/task-queue");
    await writeFile(path.join(queueRoot, "agent/tasks/queue/000-test-001.json"), makeTaskFile("TEST-001"));
    const claimed = await claimNextTask(queueRoot);
    expect(claimed).not.toBeNull();
    expect(claimed!.task.task_id).toBe("TEST-001");
    // File must not be in queue anymore
    const queue = await readdir(path.join(queueRoot, "agent/tasks/queue"));
    expect(queue.filter((f) => f.endsWith(".json"))).toHaveLength(0);
    // File must be in processing/
    const processing = await readdir(path.join(queueRoot, "agent/tasks/processing"));
    expect(processing.filter((f) => f.endsWith(".json"))).toHaveLength(1);
  });

  it("finishTaskFile moves to failed/ → failed finalization is terminal", async () => {
    const { claimNextTask, finishTaskFile } = await import("../orchestrator/task-queue");
    await writeFile(path.join(queueRoot, "agent/tasks/queue/000-test-001.json"), makeTaskFile("TEST-001"));
    const claimed = await claimNextTask(queueRoot);
    expect(claimed).not.toBeNull();
    await finishTaskFile(queueRoot, claimed!.processingFile, "failed");
    const failed = await readdir(path.join(queueRoot, "agent/tasks/failed"));
    expect(failed.filter((f) => f.endsWith(".json"))).toHaveLength(1);
    // Processing must be empty
    const processing = await readdir(path.join(queueRoot, "agent/tasks/processing"));
    expect(processing.filter((f) => f.endsWith(".json"))).toHaveLength(0);
  });

  it("finishTaskFile moves to blocked/ → blocked finalization is terminal", async () => {
    const { claimNextTask, finishTaskFile } = await import("../orchestrator/task-queue");
    await writeFile(path.join(queueRoot, "agent/tasks/queue/000-test-001.json"), makeTaskFile("TEST-001"));
    const claimed = await claimNextTask(queueRoot);
    expect(claimed).not.toBeNull();
    await finishTaskFile(queueRoot, claimed!.processingFile, "blocked");
    const blocked = await readdir(path.join(queueRoot, "agent/tasks/blocked"));
    expect(blocked.filter((f) => f.endsWith(".json"))).toHaveLength(1);
    const processing = await readdir(path.join(queueRoot, "agent/tasks/processing"));
    expect(processing.filter((f) => f.endsWith(".json"))).toHaveLength(0);
  });

  it("finishTaskFile moves to completed/ → completed finalization is terminal", async () => {
    const { claimNextTask, finishTaskFile } = await import("../orchestrator/task-queue");
    await writeFile(path.join(queueRoot, "agent/tasks/queue/000-test-001.json"), makeTaskFile("TEST-001"));
    const claimed = await claimNextTask(queueRoot);
    expect(claimed).not.toBeNull();
    await finishTaskFile(queueRoot, claimed!.processingFile, "completed");
    const completed = await readdir(path.join(queueRoot, "agent/tasks/completed"));
    expect(completed.filter((f) => f.endsWith(".json"))).toHaveLength(1);
  });

  it("skips disabled tasks and puts them back", async () => {
    const { claimNextTask } = await import("../orchestrator/task-queue");
    await writeFile(path.join(queueRoot, "agent/tasks/queue/000-disabled.json"), makeTaskFile("DISABLED-001", false));
    const result = await claimNextTask(queueRoot);
    expect(result).toBeNull();
    // Disabled task should be back in the queue
    const queue = await readdir(path.join(queueRoot, "agent/tasks/queue"));
    expect(queue.filter((f) => f.endsWith(".json"))).toHaveLength(1);
  });
});
