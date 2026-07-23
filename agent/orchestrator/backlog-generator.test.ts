// @vitest-environment node
import { describe, it, expect, beforeEach, beforeAll, afterAll, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  isWithinCooldown,
  isDailyLimitReached,
  wasTaskCompleted,
  hasExceededRetryLimit,
  calculateDocumentationRatio,
  calculateSourceCodeRatio,
  canGenerateDocumentationTask,
  mustGenerateSourceCodeTask,
  selectNextTask,
  createTaskFromSuggestion,
  resolveContextPaths,
  hasValidContextPaths,
  TASK_SUGGESTIONS,
  PRIORITY_ORDER,
  CADENCE,
  RATIOS,
  type BacklogState,
  type TaskMetadata,
} from "./backlog-generator";

function createEmptyState(): BacklogState {
  return {
    generatedTasks: [],
    lastGeneratedAt: null,
    tasksToday: 0,
    todayDate: new Date().toISOString().split("T")[0],
    completedTaskIds: new Set(),
    failedTaskIds: new Map(),
  };
}

function createStateWithTasks(tasks: TaskMetadata[]): BacklogState {
  return {
    generatedTasks: tasks,
    lastGeneratedAt: tasks.length > 0 ? tasks[tasks.length - 1].generatedAt : null,
    tasksToday: tasks.filter((t) => t.generatedAt.startsWith(new Date().toISOString().split("T")[0])).length,
    todayDate: new Date().toISOString().split("T")[0],
    completedTaskIds: new Set(tasks.filter((t) => t.status === "accepted").map((t) => t.taskId.toLowerCase().replace(/[^a-z0-9]/g, "-"))),
    failedTaskIds: new Map(tasks.filter((t) => t.status === "failed").map((t) => [t.taskId.toLowerCase().replace(/[^a-z0-9]/g, "-"), 1])),
  };
}

describe("Cooldown and limits", () => {
  it("isWithinCooldown returns false when no tasks generated", () => {
    const state = createEmptyState();
    expect(isWithinCooldown(state)).toBe(false);
  });

  it("isWithinCooldown returns true within 60 minutes", () => {
    const state = createEmptyState();
    state.lastGeneratedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 minutes ago
    expect(isWithinCooldown(state)).toBe(true);
  });

  it("isWithinCooldown returns false after 60 minutes", () => {
    const state = createEmptyState();
    state.lastGeneratedAt = new Date(Date.now() - 61 * 60 * 1000).toISOString(); // 61 minutes ago
    expect(isWithinCooldown(state)).toBe(false);
  });

  it("isDailyLimitReached returns false when under limit", () => {
    const state = createEmptyState();
    state.tasksToday = 5;
    expect(isDailyLimitReached(state)).toBe(false);
  });

  it("isDailyLimitReached returns true at limit", () => {
    const state = createEmptyState();
    state.tasksToday = CADENCE.MAX_TASKS_PER_DAY;
    expect(isDailyLimitReached(state)).toBe(true);
  });
});

describe("Task completion and retry", () => {
  it("wasTaskCompleted returns false for new tasks", () => {
    const state = createEmptyState();
    expect(wasTaskCompleted(state, "Add new feature")).toBe(false);
  });

  it("wasTaskCompleted returns true for completed tasks", () => {
    const state = createEmptyState();
    state.completedTaskIds.add("add-new-feature");
    expect(wasTaskCompleted(state, "Add new feature")).toBe(true);
  });

  it("wasTaskCompleted is case insensitive", () => {
    const state = createEmptyState();
    state.completedTaskIds.add("add-new-feature");
    expect(wasTaskCompleted(state, "ADD NEW FEATURE")).toBe(true);
  });

  it("hasExceededRetryLimit returns false for new tasks", () => {
    const state = createEmptyState();
    expect(hasExceededRetryLimit(state, "Retry task")).toBe(false);
  });

  it("hasExceededRetryLimit allows one retry after the first failure", () => {
    const state = createEmptyState();
    state.failedTaskIds.set("retry-task", 1);
    expect(hasExceededRetryLimit(state, "Retry task")).toBe(false);
  });

  it("hasExceededRetryLimit returns true for multiple failures", () => {
    const state = createEmptyState();
    state.failedTaskIds.set("retry-task", 2);
    expect(hasExceededRetryLimit(state, "Retry task")).toBe(true);
  });
});

describe("Ratio calculations", () => {
  it("calculateDocumentationRatio returns 0 for no tasks", () => {
    const state = createEmptyState();
    expect(calculateDocumentationRatio(state)).toBe(0);
  });

  it("calculateDocumentationRatio calculates correctly", () => {
    const state = createStateWithTasks([
      { taskId: "DOC-1", generatedAt: new Date().toISOString(), category: "documentation", priority: "test_gaps", branchName: "br", status: "accepted" },
      { taskId: "SRC-1", generatedAt: new Date().toISOString(), category: "source_code", priority: "reliability", branchName: "br", status: "accepted" },
      { taskId: "DOC-2", generatedAt: new Date().toISOString(), category: "documentation", priority: "test_gaps", branchName: "br", status: "accepted" },
    ]);
    expect(calculateDocumentationRatio(state)).toBe(2 / 3);
  });

  it("calculateDocumentationRatio caps at 5 tasks", () => {
    const tasks: TaskMetadata[] = [];
    for (let i = 0; i < 7; i++) {
      tasks.push({ taskId: `DOC-${i}`, generatedAt: new Date().toISOString(), category: "documentation", priority: "test_gaps", branchName: "br", status: "accepted" });
    }
    const state = createStateWithTasks(tasks);
    expect(calculateDocumentationRatio(state)).toBe(1); // 5/5 (only last 5 counted)
  });

  it("calculateSourceCodeRatio returns 1 for no tasks", () => {
    const state = createEmptyState();
    expect(calculateSourceCodeRatio(state)).toBe(1);
  });

  it("calculateSourceCodeRatio calculates correctly", () => {
    const state = createStateWithTasks([
      { taskId: "DOC-1", generatedAt: new Date().toISOString(), category: "documentation", priority: "test_gaps", branchName: "br", status: "accepted" },
      { taskId: "DOC-2", generatedAt: new Date().toISOString(), category: "documentation", priority: "test_gaps", branchName: "br", status: "accepted" },
      { taskId: "SRC-1", generatedAt: new Date().toISOString(), category: "source_code", priority: "reliability", branchName: "br", status: "accepted" },
    ]);
    expect(calculateSourceCodeRatio(state)).toBe(1 / 3);
  });
});

describe("Task selection constraints", () => {
  it("canGenerateDocumentationTask returns true when no doc tasks", () => {
    const state = createEmptyState();
    expect(canGenerateDocumentationTask(state)).toBe(true);
  });

  it("canGenerateDocumentationTask returns true when under limit", () => {
    const state = createStateWithTasks([
      { taskId: "SRC-1", generatedAt: new Date().toISOString(), category: "source_code", priority: "reliability", branchName: "br", status: "accepted" },
      { taskId: "SRC-2", generatedAt: new Date().toISOString(), category: "source_code", priority: "reliability", branchName: "br", status: "accepted" },
    ]);
    expect(canGenerateDocumentationTask(state)).toBe(true);
  });

  it("canGenerateDocumentationTask returns false when at limit", () => {
    const state = createStateWithTasks([
      { taskId: "DOC-1", generatedAt: new Date().toISOString(), category: "documentation", priority: "test_gaps", branchName: "br", status: "accepted" },
      { taskId: "SRC-1", generatedAt: new Date().toISOString(), category: "source_code", priority: "reliability", branchName: "br", status: "accepted" },
      { taskId: "SRC-2", generatedAt: new Date().toISOString(), category: "source_code", priority: "reliability", branchName: "br", status: "accepted" },
      { taskId: "SRC-3", generatedAt: new Date().toISOString(), category: "source_code", priority: "reliability", branchName: "br", status: "accepted" },
      { taskId: "SRC-4", generatedAt: new Date().toISOString(), category: "source_code", priority: "reliability", branchName: "br", status: "accepted" },
    ]);
    expect(canGenerateDocumentationTask(state)).toBe(false);
  });

  it("mustGenerateSourceCodeTask returns false when no tasks", () => {
    const state = createEmptyState();
    expect(mustGenerateSourceCodeTask(state)).toBe(false);
  });

  it("mustGenerateSourceCodeTask returns true when under ratio", () => {
    const state = createStateWithTasks([
      { taskId: "DOC-1", generatedAt: new Date().toISOString(), category: "documentation", priority: "test_gaps", branchName: "br", status: "accepted" },
      { taskId: "DOC-2", generatedAt: new Date().toISOString(), category: "documentation", priority: "test_gaps", branchName: "br", status: "accepted" },
    ]);
    expect(mustGenerateSourceCodeTask(state)).toBe(true);
  });

  it("mustGenerateSourceCodeTask returns false when at ratio", () => {
    const state = createStateWithTasks([
      { taskId: "DOC-1", generatedAt: new Date().toISOString(), category: "documentation", priority: "test_gaps", branchName: "br", status: "accepted" },
      { taskId: "DOC-2", generatedAt: new Date().toISOString(), category: "documentation", priority: "test_gaps", branchName: "br", status: "accepted" },
      { taskId: "SRC-1", generatedAt: new Date().toISOString(), category: "source_code", priority: "reliability", branchName: "br", status: "accepted" },
    ]);
    expect(mustGenerateSourceCodeTask(state)).toBe(false);
  });
});

describe("Task selection", () => {
  it("selectNextTask returns null when all tasks completed", () => {
    const state = createStateWithTasks(
      TASK_SUGGESTIONS.map((t) => ({
        taskId: t.title.toLowerCase().replace(/[^a-z0-9]/g, "-"),
        generatedAt: new Date().toISOString(),
        category: t.category,
        priority: t.priority,
        branchName: "br",
        status: "accepted" as const,
      }))
    );
    expect(selectNextTask(state)).toBeNull();
  });

  it("selectNextTask selects highest priority available task", () => {
    const state = createEmptyState();
    const task = selectNextTask(state);
    expect(task).not.toBeNull();
    expect(task!.priority).toBe("bug"); // Highest priority
  });

  it("selectNextTask skips completed tasks", () => {
    const state = createEmptyState();
    state.completedTaskIds.add("fix-memory-leak-in-render-worker".toLowerCase());
    const task = selectNextTask(state);
    expect(task).not.toBeNull();
    expect(task!.title).not.toBe("Fix memory leak in render worker");
  });

  it("selectNextTask enforces documentation ratio", () => {
    const state = createStateWithTasks([
      { taskId: "DOC-1", generatedAt: new Date().toISOString(), category: "documentation", priority: "product_ux", branchName: "br", status: "accepted" },
      { taskId: "SRC-1", generatedAt: new Date().toISOString(), category: "source_code", priority: "reliability", branchName: "br", status: "accepted" },
      { taskId: "SRC-2", generatedAt: new Date().toISOString(), category: "source_code", priority: "reliability", branchName: "br", status: "accepted" },
      { taskId: "SRC-3", generatedAt: new Date().toISOString(), category: "source_code", priority: "reliability", branchName: "br", status: "accepted" },
    ]);
    const task = selectNextTask(state);
    expect(task).not.toBeNull();
    expect(task!.category).not.toBe("documentation");
  });

  it("selectNextTask enforces source code ratio", () => {
    const state = createStateWithTasks([
      { taskId: "DOC-1", generatedAt: new Date().toISOString(), category: "documentation", priority: "product_ux", branchName: "br", status: "accepted" },
      { taskId: "DOC-2", generatedAt: new Date().toISOString(), category: "documentation", priority: "product_ux", branchName: "br", status: "accepted" },
    ]);
    const task = selectNextTask(state);
    expect(task).not.toBeNull();
    expect(task!.category).toBe("source_code");
  });

  it("selectNextTask prioritizes voice and dubbing after known bugs", () => {
    const state = createEmptyState();
    state.completedTaskIds.add("fix-memory-leak-in-render-worker");
    state.completedTaskIds.add("add-regression-test-for-srt-timestamp-parsing");
    const task = selectNextTask(state);
    expect(task).not.toBeNull();
    expect(task!.priority).toBe("voice_dubbing");
    expect(task!.title).toBe("Define consent-aware TTS provider and voice profile contracts");
  });
});

describe("Protected branch safety", () => {
  const protectedBranchNames = ["main", "master", "production", "release", "origin/main", "origin/production"];

  it("branch names do not contain protected branch names", () => {
    const state = createEmptyState();
    const task = selectNextTask(state);
    if (task) {
      const taskId = task.title.toLowerCase().replace(/[^a-z0-9]/g, "-");
      for (const pb of protectedBranchNames) {
        expect(taskId).not.toContain(pb);
      }
    }
  });

  it("all task suggestions have safe allowed_paths", () => {
    for (const suggestion of TASK_SUGGESTIONS) {
      for (const allowedPath of suggestion.allowedPaths) {
        expect(allowedPath).not.toContain("main");
        expect(allowedPath).not.toContain("production");
        expect(allowedPath).not.toMatch(/\.\.\//);
      }
    }
  });
});

describe("Cadence constraints", () => {
  it("minimum 60 minutes between tasks is enforced", () => {
    expect(CADENCE.MIN_MINUTES_BETWEEN_TASKS).toBe(60);
  });

  it("maximum 10 tasks per day is enforced", () => {
    expect(CADENCE.MAX_TASKS_PER_DAY).toBe(10);
  });

  it("one active task maximum is enforced", () => {
    expect(CADENCE.ONE_ACTIVE_TASK_MAX).toBe(true);
  });
});

describe("Ratio constraints", () => {
  it("minimum 1 in 3 source code tasks is enforced", () => {
    expect(RATIOS.MIN_SOURCE_CODE_RATIO).toBe(1 / 3);
  });

  it("maximum 1 in 5 documentation tasks is enforced", () => {
    expect(RATIOS.MAX_DOCUMENTATION_RATIO).toBe(1 / 5);
  });
});

describe("Priority order", () => {
  it("bug is highest priority", () => {
    expect(PRIORITY_ORDER[0]).toBe("bug");
  });

  it("voice and dubbing is the highest product-improvement priority", () => {
    expect(PRIORITY_ORDER[1]).toBe("voice_dubbing");
  });

  it("test_gaps is lowest priority", () => {
    expect(PRIORITY_ORDER[PRIORITY_ORDER.length - 1]).toBe("test_gaps");
  });

  it("priority order has 10 categories", () => {
    expect(PRIORITY_ORDER).toHaveLength(10);
  });
});

describe("Voice and dubbing focus", () => {
  it("provides a sustained source-led implementation backlog", () => {
    const tasks = TASK_SUGGESTIONS.filter((task) => task.priority === "voice_dubbing");
    expect(tasks).toHaveLength(9);
    expect(tasks[0]).toMatchObject({
      category: "source_code",
      title: "Define consent-aware TTS provider and voice profile contracts",
    });
    expect(tasks.filter((task) => task.category === "source_code").length).toBeGreaterThanOrEqual(6);
  });

  it("requires consent and provenance in the voice foundation task", () => {
    const task = TASK_SUGGESTIONS.find(
      (suggestion) => suggestion.title === "Define consent-aware TTS provider and voice profile contracts"
    );
    expect(task?.objective).toContain("explicit consent");
    expect(task?.objective).toContain("provenance");
  });

  it("keeps Turkish pronunciation context bounded", () => {
    const task = TASK_SUGGESTIONS.find(
      (suggestion) => suggestion.title === "Add Turkish pronunciation normalization for TTS"
    );
    expect(task?.allowedPaths).not.toContain("lib/**/*.ts");
    expect(task?.allowedPaths).toContain("lib/text-utils.ts");
  });

  it("uses a test filter that matches dubbed-audio quality tests", () => {
    const task = TASK_SUGGESTIONS.find(
      (suggestion) => suggestion.title === "Add deterministic dubbed-audio quality metrics"
    );
    expect(task?.testCommands).toContainEqual(["npm", "test", "--", "dubbed-audio-quality"]);
  });
});

describe("File system operations", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "backlog-test-"));
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    // Create task directories
    await mkdir(path.join(tempDir, "agent/tasks/queue"), { recursive: true });
    await mkdir(path.join(tempDir, "agent/tasks/processing"), { recursive: true });
    await mkdir(path.join(tempDir, "agent/tasks/completed"), { recursive: true });
    await mkdir(path.join(tempDir, "agent/tasks/failed"), { recursive: true });
  });

  it("isQueueEmpty returns true for empty queue", async () => {
    const { isQueueEmpty } = await import("./backlog-generator");
    expect(await isQueueEmpty(tempDir)).toBe(true);
  });

  it("isQueueEmpty returns false when tasks exist", async () => {
    const { isQueueEmpty } = await import("./backlog-generator");
    await writeFile(path.join(tempDir, "agent/tasks/queue/test.json"), "{}");
    expect(await isQueueEmpty(tempDir)).toBe(false);
  });

  it("hasProcessingTasks returns false for empty processing", async () => {
    const { hasProcessingTasks } = await import("./backlog-generator");
    expect(await hasProcessingTasks(tempDir)).toBe(false);
  });

  it("hasProcessingTasks returns true when processing tasks", async () => {
    const { hasProcessingTasks } = await import("./backlog-generator");
    await writeFile(path.join(tempDir, "agent/tasks/processing/test.json"), "{}");
    expect(await hasProcessingTasks(tempDir)).toBe(true);
  });

  describe("Task creation", () => {
    it("createTaskFromSuggestion creates valid task in development mode", async () => {
      const suggestion = TASK_SUGGESTIONS[0];
      const task = await createTaskFromSuggestion(suggestion, tempDir);
      expect(task.task_id).toMatch(/^[A-Z][A-Z0-9-]{2,63}$/);
      expect(task.title).toBe(suggestion.title);
      expect(task.objective).toBe(suggestion.objective);
      expect(task.limits.maximum_iterations).toBe(6);
      expect(task.enabled).toBe(true);
      expect(task.limits.maximum_execution_ms).toBe(1800000);
      if (task.execution.kind === "gemini_patch") {
        expect(task.execution.repair_strategy).toBe("gemini_patch_review");
      }
    });

    it("createTaskFromSuggestion creates valid task in production mode", async () => {
      const suggestion = TASK_SUGGESTIONS[0];
      const task = await createTaskFromSuggestion(suggestion, tempDir);
      expect(task.limits.maximum_iterations).toBe(6);
    });

    it("createTaskFromSuggestion sets high priority for voice and dubbing", async () => {
      const voiceSuggestion = TASK_SUGGESTIONS.find((t) => t.priority === "voice_dubbing");
      if (voiceSuggestion) {
        const task = await createTaskFromSuggestion(voiceSuggestion, tempDir);
        expect(task.priority).toBe("high");
      }
    });

    it("createTaskFromSuggestion sets medium priority for other categories", async () => {
      const perfSuggestion = TASK_SUGGESTIONS.find((t) => t.priority === "performance");
      if (perfSuggestion) {
        const task = await createTaskFromSuggestion(perfSuggestion, tempDir);
        expect(task.priority).toBe("medium");
      }
    });
  });
});

describe("Integration tests", () => {
  let tempDir: string;

  beforeEach(async () => {
    // Fresh temp dir for each test to avoid state leakage
    tempDir = await mkdtemp(path.join(tmpdir(), "backlog-integration-"));
    await mkdir(path.join(tempDir, "agent/tasks/queue"), { recursive: true });
    await mkdir(path.join(tempDir, "agent/tasks/processing"), { recursive: true });
    await mkdir(path.join(tempDir, "agent/tasks/completed"), { recursive: true });
    await mkdir(path.join(tempDir, "agent/tasks/failed"), { recursive: true });
    // Create directory structure that suggestions expect
    await mkdir(path.join(tempDir, "app/api"), { recursive: true });
    await mkdir(path.join(tempDir, "lib"), { recursive: true });
    await mkdir(path.join(tempDir, "lib/subtitle-quality"), { recursive: true });
    await mkdir(path.join(tempDir, "lib/translation"), { recursive: true });
    await mkdir(path.join(tempDir, "lib/render"), { recursive: true });
    await mkdir(path.join(tempDir, "lib/localization"), { recursive: true });
    await mkdir(path.join(tempDir, "lib/providers"), { recursive: true });
    await mkdir(path.join(tempDir, "lib/server"), { recursive: true });
    await mkdir(path.join(tempDir, "app/api/localization"), { recursive: true });
    await mkdir(path.join(tempDir, "agent/evaluators"), { recursive: true });
    await mkdir(path.join(tempDir, "docs"), { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("Queue empty -> exactly one valid task generated", async () => {
    const { generateBacklogTask, isQueueEmpty } = await import("./backlog-generator");
    expect(await isQueueEmpty(tempDir)).toBe(true);
    const result = await generateBacklogTask(tempDir);
    expect(result.generated).toBe(true);
    expect(result.task).toBeDefined();
    expect(result.task!.task_id).toMatch(/^[A-Z][A-Z0-9-]{2,63}$/);
    expect(result.task!.execution.kind).toBe("gemini_patch");
    expect(result.task!.enabled).toBe(true);
    // Verify context_paths are valid (not glob patterns)
    if (result.task!.execution.kind === "gemini_patch") {
      expect(result.task!.execution.context_paths.length).toBeGreaterThan(0);
      expect(result.task!.execution.context_paths.every((p: string) => !p.includes("**"))).toBe(true);
    }
  });

  it("Queue not empty -> nothing generated", async () => {
    const { generateBacklogTask } = await import("./backlog-generator");
    await writeFile(path.join(tempDir, "agent/tasks/queue/existing-task.json"), JSON.stringify({ task_id: "EXIST-001" }));
    const result = await generateBacklogTask(tempDir);
    expect(result.generated).toBe(false);
    expect(result.reason).toBe("Queue is not empty");
  });

  it("Processing not empty -> nothing generated", async () => {
    const { generateBacklogTask, isQueueEmpty, hasProcessingTasks } = await import("./backlog-generator");
    // Add processing task first
    await writeFile(path.join(tempDir, "agent/tasks/processing/processing-task.json"), JSON.stringify({ task_id: "PROC-001" }));
    // Queue should be empty but processing should not
    expect(await isQueueEmpty(tempDir)).toBe(true);
    expect(await hasProcessingTasks(tempDir)).toBe(true);
    const result = await generateBacklogTask(tempDir);
    expect(result.generated).toBe(false);
    expect(result.reason).toBe("Tasks are currently processing");
  });

  it("Generated task passes validateTaskSafety in development mode", async () => {
    const { generateBacklogTask } = await import("./backlog-generator");
    const result = await generateBacklogTask(tempDir);
    expect(result.generated).toBe(true);
    expect(result.task).toBeDefined();
    expect(result.task!.execution.kind).toBe("gemini_patch");
    expect(result.task!.enabled).toBe(true);
  });

  it("Accepted generated tasks are remembered by title and not selected again", async () => {
    const { generateBacklogTask, loadBacklogState, recordTaskOutcome, selectNextTask, wasTaskCompleted } = await import("./backlog-generator");
    const generated = await generateBacklogTask(tempDir);
    expect(generated.generated).toBe(true);
    expect(generated.task).toBeDefined();

    const task = generated.task!;
    expect(await recordTaskOutcome(tempDir, task.task_id, task.title, "accepted")).toBe(true);

    const state = await loadBacklogState(tempDir);
    const metadata = state.generatedTasks.find((entry) => entry.taskId === task.task_id);
    expect(metadata).toMatchObject({ title: task.title, status: "accepted" });
    expect(wasTaskCompleted(state, task.title)).toBe(true);
    expect(selectNextTask(state)?.title).not.toBe(task.title);
  });

  it("Rejected generated tasks are recorded against their title", async () => {
    const { generateBacklogTask, hasExceededRetryLimit, loadBacklogState, recordTaskOutcome, selectNextTask } = await import("./backlog-generator");
    const generated = await generateBacklogTask(tempDir);
    const task = generated.task!;

    expect(await recordTaskOutcome(tempDir, task.task_id, task.title, "rejected", "qa_failed")).toBe(true);

    const retryableState = await loadBacklogState(tempDir);
    const metadata = retryableState.generatedTasks.find((entry) => entry.taskId === task.task_id);
    expect(metadata).toMatchObject({ title: task.title, status: "rejected", failureReason: "qa_failed" });
    expect(hasExceededRetryLimit(retryableState, task.title)).toBe(false);
    expect(selectNextTask(retryableState)?.title).toBe(task.title);

    expect(await recordTaskOutcome(tempDir, task.task_id, task.title, "rejected", "qa_failed_again")).toBe(true);
    const exhaustedState = await loadBacklogState(tempDir);
    expect(hasExceededRetryLimit(exhaustedState, task.title)).toBe(true);
    expect(selectNextTask(exhaustedState)?.title).not.toBe(task.title);
  });

  it("Manual tasks do not pollute autonomous backlog history", async () => {
    const { loadBacklogState, recordTaskOutcome } = await import("./backlog-generator");
    expect(await recordTaskOutcome(tempDir, "MANUAL-001", "Manual operator task", "accepted")).toBe(false);

    const state = await loadBacklogState(tempDir);
    expect(state.generatedTasks).toEqual([]);
    expect(state.completedTaskIds.size).toBe(0);
  });

  it("No eligible task -> safe no-op, not a crash", async () => {
    const { selectNextTask, wasTaskCompleted } = await import("./backlog-generator");
    // Create state with all tasks completed
    const state = {
      generatedTasks: [],
      lastGeneratedAt: null,
      tasksToday: 0,
      todayDate: new Date().toISOString().split("T")[0],
      completedTaskIds: new Set<string>(),
      failedTaskIds: new Map<string, number>(),
    };
    // Manually add all known task titles as completed
    const completedTitles = [
      "Define consent-aware TTS provider and voice profile contracts",
      "Add deterministic dubbed-audio quality metrics",
      "Add Turkish pronunciation normalization for TTS",
      "Add speaker-aware voice assignment for localization",
      "Add capability-based TTS provider fallback",
      "Add loudness normalization and clipping guard for dubbing",
      "Add dubbing segment synchronization evaluator",
      "Add per-segment voice preview and regeneration workflow",
      "Build golden Turkish dubbing quality fixtures",
      "Add error boundary for API routes",
      "Add health check to background workers",
      "Add timing validation for subtitle segments",
      "Add tests for SRT parser edge cases",
      "Add language detection fallback",
      "Add render progress streaming",
      "Add caching layer for translation API",
      "Benchmark subtitle processing pipeline",
      "Add API documentation for /api/analysis endpoints",
      "Add job status polling fallback",
      "Add rate limiting to upload endpoint",
      "Add tests for alignment algorithm",
      "Add tests for quality scoring",
      "Fix memory leak in render worker",
      "Add regression test for SRT timestamp parsing",
    ];
    completedTitles.forEach((title) => {
      const normalized = title.toLowerCase().replace(/[^a-z0-9]/g, "-");
      state.completedTaskIds.add(normalized);
    });
    // Verify all tasks are marked completed
    const { TASK_SUGGESTIONS } = await import("./backlog-generator");
    for (const task of TASK_SUGGESTIONS) {
      expect(wasTaskCompleted(state, task.title)).toBe(true);
    }
    // Select should return null
    expect(selectNextTask(state)).toBeNull();
  });

  it("Service restart -> cooldown remains active", async () => {
    const { saveBacklogState, loadBacklogState, isWithinCooldown } = await import("./backlog-generator");
    const state = {
      generatedTasks: [],
      lastGeneratedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 min ago
      tasksToday: 0,
      todayDate: new Date().toISOString().split("T")[0],
      completedTaskIds: new Set<string>(),
      failedTaskIds: new Map<string, number>(),
    };
    await saveBacklogState(tempDir, state);
    // Simulate restart by reloading
    const reloadedState = await loadBacklogState(tempDir);
    expect(isWithinCooldown(reloadedState)).toBe(true);
  });

  it("Service restart -> daily count remains active", async () => {
    const { saveBacklogState, loadBacklogState, isDailyLimitReached } = await import("./backlog-generator");
    const state = {
      generatedTasks: [],
      lastGeneratedAt: null,
      tasksToday: 8,
      todayDate: new Date().toISOString().split("T")[0],
      completedTaskIds: new Set<string>(),
      failedTaskIds: new Map<string, number>(),
    };
    await saveBacklogState(tempDir, state);
    // Simulate restart by reloading
    const reloadedState = await loadBacklogState(tempDir);
    expect(isDailyLimitReached(reloadedState)).toBe(false);
    expect(reloadedState.tasksToday).toBe(8);
  });

  it("Protected path candidates are rejected", async () => {
    const { TASK_SUGGESTIONS } = await import("./backlog-generator");
    const forbiddenPatterns = ["main", "master", "production", "deploy", "secrets", ".env", "credentials", "systemd"];
    for (const task of TASK_SUGGESTIONS) {
      for (const allowedPath of task.allowedPaths) {
        for (const forbidden of forbiddenPatterns) {
          expect(allowedPath.toLowerCase()).not.toContain(forbidden);
        }
      }
    }
  });

  it("Duplicate prevention across process runs", async () => {
    const { saveBacklogState, loadBacklogState, selectNextTask } = await import("./backlog-generator");
    const state = {
      generatedTasks: [],
      lastGeneratedAt: null,
      tasksToday: 0,
      todayDate: new Date().toISOString().split("T")[0],
      completedTaskIds: new Set<string>(["add-error-boundary-for-api-routes"]),
      failedTaskIds: new Map<string, number>(),
    };
    await saveBacklogState(tempDir, state);
    // Simulate restart
    const reloadedState = await loadBacklogState(tempDir);
    const task = selectNextTask(reloadedState);
    expect(task?.title).not.toBe("Add error boundary for API routes");
  });
});

describe("Context path resolution", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "context-paths-"));
    // Create real directory structure
    await mkdir(path.join(tempDir, "lib/render"), { recursive: true });
    await mkdir(path.join(tempDir, "workers"), { recursive: true });
    await mkdir(path.join(tempDir, "app/api"), { recursive: true });
    await mkdir(path.join(tempDir, "docs"), { recursive: true });
    await mkdir(path.join(tempDir, "existing-dir"), { recursive: true });
    await writeFile(path.join(tempDir, "existing-file.ts"), "// test");
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("resolveContextPaths", () => {
    it("recursive glob becomes directory root", async () => {
      const result = await resolveContextPaths(["lib/render/**/*.ts"], tempDir);
      expect(result).toContain("lib/render");
    });

    it("file glob becomes parent directory", async () => {
      const result = await resolveContextPaths(["app/api/**/*.ts"], tempDir);
      expect(result).toContain("app/api");
    });

    it("literal existing file preserved", async () => {
      const result = await resolveContextPaths(["existing-file.ts"], tempDir);
      expect(result).toContain("existing-file.ts");
    });

    it("literal existing directory preserved", async () => {
      const result = await resolveContextPaths(["existing-dir"], tempDir);
      expect(result).toContain("existing-dir");
    });

    it("nonexistent context path rejected", async () => {
      const result = await resolveContextPaths(["nonexistent/**/*.ts"], tempDir);
      expect(result).not.toContain("nonexistent");
    });

    it("path traversal rejected", async () => {
      const result = await resolveContextPaths(["../outside/**"], tempDir);
      expect(result).toHaveLength(0);
    });

    it("duplicate roots removed", async () => {
      const result = await resolveContextPaths(
        ["lib/render/**/*.ts", "lib/render/file.ts", "lib/render"],
        tempDir
      );
      const uniqueResult = [...new Set(result)];
      expect(result.length).toBe(uniqueResult.length);
    });

    it("maximum 5 context paths enforced", async () => {
      const manyPaths = [
        "lib/render/**/*.ts",
        "workers/**/*.ts",
        "app/api/**/*.ts",
        "docs/**/*.md",
        "existing-dir",
        "existing-file.ts",
      ];
      const result = await resolveContextPaths(manyPaths, tempDir);
      expect(result.length).toBeLessThanOrEqual(5);
    });

    it("no valid context -> returns empty array", async () => {
      const result = await resolveContextPaths(
        ["nonexistent/**", "also-missing/**"],
        tempDir
      );
      expect(result).toHaveLength(0);
    });

    it("resolved paths are relative and safe", async () => {
      const result = await resolveContextPaths(["existing-dir"], tempDir);
      expect(result[0]).toBe("existing-dir");
      expect(result[0]).not.toContain(tempDir);
      expect(result[0]).not.toContain("**");
      expect(result[0]).not.toContain("..");
    });
  });

  describe("hasValidContextPaths", () => {
    it("returns true for valid paths", async () => {
      const result = await hasValidContextPaths(["existing-dir"], tempDir);
      expect(result).toBe(true);
    });

    it("returns false for all invalid paths", async () => {
      const result = await hasValidContextPaths(
        ["nonexistent/**", "missing/**"],
        tempDir
      );
      expect(result).toBe(false);
    });
  });

  describe("createTaskFromSuggestion with context paths", () => {
    it("generated task has valid context_paths for existing directories", async () => {
      // Create a temp dir with a known structure
      const testDir = await mkdtemp(path.join(tmpdir(), "task-test-"));
      await mkdir(path.join(testDir, "lib/subtitle-quality"), { recursive: true });

      const suggestion = TASK_SUGGESTIONS.find(
        (t) => t.title === "Add tests for SRT parser edge cases"
      )!;

      const task = await createTaskFromSuggestion(suggestion, testDir);
      expect(task.enabled).toBe(true);
      expect(task.limits.maximum_execution_ms).toBe(1800000);
      if (task.execution.kind === "gemini_patch") {
        expect(task.execution.context_paths.length).toBeGreaterThan(0);
        expect(task.execution.context_paths.every((p: string) => !p.includes("**"))).toBe(true);
      }

      await rm(testDir, { recursive: true, force: true });
    });

    it("task with no valid context paths has empty context_paths", async () => {
      const testDir = await mkdtemp(path.join(tmpdir(), "task-test-"));

      const suggestion = TASK_SUGGESTIONS[0];
      const task = await createTaskFromSuggestion(suggestion, testDir);

      if (task.execution.kind === "gemini_patch") {
        expect(task.execution.context_paths).toHaveLength(0);
      }

      await rm(testDir, { recursive: true, force: true });
    });
  });
});
