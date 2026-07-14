import { open, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { evaluateSmokeQuality } from "../evaluators/subtitle-quality-agent";
import { renderSmokeArtifact } from "../evaluators/render-analysis-agent";
import { writeBenchmarkReports } from "../evaluators/benchmark";
import { sendCompletionNotification } from "../notifications/email";
import { inspectDiff } from "../policies/diff-policy";
import { validateTaskSafety, type EngineeringTask, type TaskState } from "../tasks/schema";
import { commitCandidate, createTaskWorktree, inspectWorktree, resolveHead } from "../workers/git-gateway";
import { implementTask } from "../workers/engineering-agent";
import { runQa } from "../workers/qa-agent";
import { reviewCandidate } from "../workers/security-agent";
import { appendAudit } from "./audit-log";
import { assertTransition } from "./state-machine";
import { claimNextTask, finishTaskFile } from "./task-queue";
import { writeDashboardSnapshot } from "./dashboard";
import { numericSetting } from "../policies/limits";
import { mayAttemptRepair, type RepairObservation } from "../../lib/subtitle-quality/v3";

interface TaskRuntime {
  state: TaskState;
  branch: string;
  commitHash: string | null;
  files: string[];
  startedAt: number;
  worktree: string;
  artifactDirectory: string;
}

async function transition(root: string, taskId: string, runtime: TaskRuntime, to: TaskState, detail: Record<string, unknown> = {}) {
  assertTransition(runtime.state, to);
  const from = runtime.state;
  runtime.state = to;
  await appendAudit(root, { timestamp: new Date().toISOString(), taskId, category: "state", event: `${from}->${to}`, detail });
  await writeFile(path.join(runtime.artifactDirectory, "task-status.json"), `${JSON.stringify({ taskId, state: to, branch: runtime.branch, commitHash: runtime.commitHash, updatedAt: new Date().toISOString(), ...detail }, null, 2)}\n`);
}

function productionRequest(task: EngineeringTask) {
  return /(?:deploy|restart|modify|inspect|access|read|write|migrate)\s+(?:the\s+)?production/i.test(`${task.title}\n${task.objective}`);
}

async function writePlan(runtime: TaskRuntime, task: EngineeringTask, implementation: Awaited<ReturnType<typeof implementTask>>) {
  await writeFile(path.join(runtime.artifactDirectory, "implementation-plan.json"), `${JSON.stringify({ taskId: task.task_id, objective: task.objective, plan: implementation.plan, rationale: implementation.rationale, modelCalls: implementation.modelCalls }, null, 2)}\n`);
}

async function finalize(root: string, task: EngineeringTask, runtime: TaskRuntime, testResult: string, renderResult: string, score: number | null, criticalErrors: number, processingFile?: string) {
  const report = {
    taskId: task.task_id, taskTitle: task.title, title: task.title, status: runtime.state, branch: runtime.branch, commitHash: runtime.commitHash,
    durationMs: Date.now() - runtime.startedAt, filesChanged: runtime.files, testResult, renderResult, baselineQualityScore: null,
    candidateQualityScore: score, qualityDelta: null, criticalErrors, artifactLocation: runtime.artifactDirectory,
    recommendedNextTask: "SQV3-001 Establish Subtitle Quality Engine V3 baseline with a human-approved fixture.",
  };
  await writeFile(path.join(runtime.artifactDirectory, "completion-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  const email = await sendCompletionNotification(root, report);
  await writeFile(path.join(runtime.artifactDirectory, "notification-report.json"), `${JSON.stringify(email, null, 2)}\n`);
  if (processingFile) {
    const destination = runtime.state === "ACCEPTED" ? "completed" : runtime.state.startsWith("BLOCKED") ? "blocked" : "failed";
    await appendAudit(root, {
      timestamp: new Date().toISOString(), taskId: task.task_id, category: "system",
      event: "task_finalize",
      detail: { finalState: runtime.state, destination, processingFile, durationMs: report.durationMs },
    });
    await finishTaskFile(root, processingFile, destination);
    await appendAudit(root, {
      timestamp: new Date().toISOString(), taskId: task.task_id, category: "system",
      event: "task_file_moved",
      detail: { destination, processingFile },
    });
  }
  return report;
}

export async function processTask(root: string, task: EngineeringTask, processingFile?: string) {
  const startedAt = Date.now();
  const artifactDirectory = path.join(root, "artifacts", task.task_id, new Date().toISOString().replace(/[:.]/g, "-"));
  await mkdir(artifactDirectory, { recursive: true });
  const runtime: TaskRuntime = { state: "QUEUED", branch: "not-created", commitHash: null, files: [], startedAt, worktree: "not-created", artifactDirectory };
  await appendAudit(root, { timestamp: new Date().toISOString(), taskId: task.task_id, category: "state", event: "TASK_CREATED", detail: { state: "QUEUED" } });
  try {
    await transition(root, task.task_id, runtime, "ANALYZING");
    validateTaskSafety(task);
    if (productionRequest(task)) {
      await transition(root, task.task_id, runtime, "BLOCKED_REQUIRES_HUMAN_APPROVAL", { reason: "production_access_requested" });
      return await finalize(root, task, runtime, "not_run", "not_run", null, 0, processingFile);
    }
    const baseCommit = await resolveHead(root, task.task_id);
    await transition(root, task.task_id, runtime, "PLANNED", { baseCommit });
    await appendAudit(root, { timestamp: new Date().toISOString(), taskId: task.task_id, category: "system", event: "worktree_prep_requested", detail: { baseCommit } });
    const isolated = await createTaskWorktree(root, task.task_id, task.title, baseCommit);
    runtime.branch = isolated.branch;
    runtime.worktree = isolated.worktree;
    await appendAudit(root, { timestamp: new Date().toISOString(), taskId: task.task_id, category: "system", event: "worktree_ready", detail: { branch: runtime.branch, worktree: runtime.worktree } });
    const observations: RepairObservation[] = [];
    let repairContext: string | undefined;
    let renderAttempts = 0;
    const effectiveExecutionLimitMs = Math.min(task.limits.maximum_execution_ms, numericSetting(process.env.AMF_AGENT_MAX_EXECUTION_MS, 3_600_000));
    for (let iteration = 1; iteration <= task.limits.maximum_iterations; iteration += 1) {
      if (Date.now() - startedAt > effectiveExecutionLimitMs) throw new Error("task_execution_time_limit_exhausted");
      await transition(root, task.task_id, runtime, "IMPLEMENTING", { iteration });
      const implementation = await implementTask(root, task, runtime.worktree, runtime.artifactDirectory, repairContext);
      await writePlan(runtime, task, implementation);
      const candidate = await inspectWorktree(root, task.task_id, runtime.worktree);
      runtime.files = candidate.files;
      const security = reviewCandidate(task, candidate.files, candidate.patch);
      await writeFile(path.join(runtime.artifactDirectory, "security-report.json"), `${JSON.stringify(security, null, 2)}\n`);
      await writeFile(path.join(runtime.artifactDirectory, "git-diff.patch"), candidate.patch);
      await transition(root, task.task_id, runtime, "TESTING", { iteration });
      const qa = await runQa(root, { ...task, limits: { ...task.limits, maximum_execution_ms: effectiveExecutionLimitMs } }, runtime.worktree, runtime.artifactDirectory);
      await writeFile(path.join(runtime.artifactDirectory, "test-report.json"), `${JSON.stringify(qa, null, 2)}\n`);
      if (!qa.passed) {
        observations.push({ iteration, score: 0, criticalErrors: 1, failureFingerprint: "qa_failed", testsPassed: false });
        await transition(root, task.task_id, runtime, "REJECTED", { reason: "tests_failed" });
        return await finalize(root, task, runtime, "failed", "not_run", null, 1, processingFile);
      }
      await transition(root, task.task_id, runtime, "RENDERING", { iteration });
      const render = task.limits.maximum_render_attempts === 0 && !task.success_criteria.render_tests_pass
        ? { passed: true, skipped: true, reason: "render_not_required_by_task_contract" }
        : await (async () => {
            renderAttempts += 1;
            if (renderAttempts > task.limits.maximum_render_attempts) throw new Error("render_attempt_limit_exhausted");
            return renderSmokeArtifact(root, task, runtime.worktree, runtime.artifactDirectory);
          })();
      await writeFile(path.join(runtime.artifactDirectory, "render-report.json"), `${JSON.stringify(render, null, 2)}\n`);
      await transition(root, task.task_id, runtime, "EVALUATING", { iteration });
      const quality = evaluateSmokeQuality(`${task.task_id}-${iteration}`);
      const benchmark = await writeBenchmarkReports(runtime.artifactDirectory, `${task.task_id}-${iteration}`, quality);
      const accepted = render.passed && quality.criticalErrorCount <= task.success_criteria.maximum_critical_errors && benchmark.artifactsComplete;
      if (accepted) {
        inspectDiff(task, candidate.files, candidate.patch);
        runtime.commitHash = await commitCandidate(root, task.task_id, runtime.worktree, candidate.files, `agent(${task.task_id}): ${task.title}`);
        await transition(root, task.task_id, runtime, "ACCEPTED", { score: quality.overallScore, criticalErrors: quality.criticalErrorCount });
        return await finalize(root, task, runtime, "passed", "passed", quality.overallScore, quality.criticalErrorCount, processingFile);
      }
      const fingerprint = JSON.stringify({ render: render.passed, issues: quality.issues.map((issue) => issue.code).sort() });
      observations.push({ iteration, score: quality.overallScore, criticalErrors: quality.criticalErrorCount, failureFingerprint: fingerprint, testsPassed: qa.passed });
      const repair = mayAttemptRepair(observations, task.limits.maximum_iterations);
      const hasStrategy = task.execution.kind === "gemini_patch" && task.execution.repair_strategy === "gemini_patch_review";
      if (!repair.allowed || !hasStrategy) {
        await transition(root, task.task_id, runtime, "REJECTED", { reason: hasStrategy ? repair.reason : "no_specific_repair_strategy" });
        return await finalize(root, task, runtime, "passed", render.passed ? "passed" : "failed", quality.overallScore, quality.criticalErrorCount, processingFile);
      }
      await transition(root, task.task_id, runtime, "REPAIRING", { reason: repair.reason, iteration });
      repairContext = JSON.stringify({ quality, render, benchmark });
    }
    throw new Error("unreachable_iteration_limit");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const target: TaskState =
      /approval|production|credential|gemini_keyless_runtime_not_configured|worktree_is_dirty/.test(message)
        ? "BLOCKED"
        : "FAILED";
    await appendAudit(root, { timestamp: new Date().toISOString(), taskId: task.task_id, category: "system", event: "task_exception", detail: { message, targetState: target } });
    if (!["ACCEPTED", "REJECTED", "BLOCKED", "BLOCKED_REQUIRES_HUMAN_APPROVAL", "FAILED"].includes(runtime.state)) {
      try {
        await transition(root, task.task_id, runtime, target, { reason: message });
      } catch {
        // transition may fail if state is already terminal; still finalize
      }
    }
    // finalize always moves processingFile to a terminal directory, preventing stale entries.
    // If finalize itself throws, re-throw but the processingFile guard in finally ensures cleanup.
    return await finalize(root, task, runtime, "not_completed", "not_completed", null, 1, processingFile);
  } finally {
    // Last-resort stale-file guard: if finalize was never reached (e.g. thrown inside finalize
    // itself), move the processingFile to failed so the queue is never permanently blocked.
    if (processingFile) {
      try {
        const { stat } = await import("node:fs/promises");
        await stat(processingFile); // still exists?
        const failedDir = path.join(root, "agent/tasks/failed");
        await mkdir(failedDir, { recursive: true });
        const { rename } = await import("node:fs/promises");
        await rename(processingFile, path.join(failedDir, path.basename(processingFile)));
        await appendAudit(root, {
          timestamp: new Date().toISOString(), taskId: task.task_id, category: "system",
          event: "task_stale_processing_recovered",
          detail: { processingFile, reason: "finally_guard" },
        });
      } catch {
        // file already moved by finalize — this is the normal path
      }
    }
  }
}

async function acquireLock(root: string) {
  const file = path.join(root, "agent/state/orchestrator.lock");
  await mkdir(path.dirname(file), { recursive: true });
  try {
    const handle = await open(file, "wx", 0o600);
    await handle.writeFile(`${process.pid}\n`);
    return async () => { await handle.close(); await rm(file, { force: true }); };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const pid = Number((await readFile(file, "utf8")).trim());
    try { process.kill(pid, 0); throw new Error(`orchestrator_already_running:${pid}`); } catch (probe) {
      if (probe instanceof Error && probe.message.startsWith("orchestrator_already_running")) throw probe;
      await rm(file, { force: true });
      return acquireLock(root);
    }
  }
}

export async function runOrchestrator(root: string, options: { once: boolean }) {
  const release = await acquireLock(root);
  const heartbeat = path.join(root, "agent/state/heartbeat.json");
  try {
    do {
      await writeFile(heartbeat, `${JSON.stringify({ pid: process.pid, timestamp: new Date().toISOString(), idle: true })}\n`, { mode: 0o600 });
      const claimed = await claimNextTask(root);
      if (claimed) {
        await appendAudit(root, {
          timestamp: new Date().toISOString(), taskId: claimed.task.task_id, category: "system",
          event: "task_claimed",
          detail: { processingFile: claimed.processingFile, taskTitle: claimed.task.title },
        });
        await processTask(root, claimed.task, claimed.processingFile);
      }
      await writeDashboardSnapshot(root);
      if (options.once) return;
      await new Promise((resolve) => setTimeout(resolve, numericSetting(process.env.AMF_AGENT_POLL_INTERVAL_MS, 30_000)));
    } while (true);
  } finally { await release(); }
}

export async function loadAndProcessTask(root: string, taskFile: string) {
  const task = validateTaskSafety(JSON.parse(await readFile(taskFile, "utf8")));
  return processTask(root, task);
}
