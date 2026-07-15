import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { engineeringTaskSchema, type EngineeringTask } from "../tasks/schema";

/**
 * Priority order for task generation (highest to lowest)
 */
export const PRIORITY_ORDER = [
  "bug",           // Confirmed bugs
  "reliability",    // Reliability improvements
  "subtitle_quality", // Subtitle quality
  "translation_quality", // Translation quality
  "rendering",     // Rendering improvements
  "product_ux",     // Product UX
  "performance",    // Performance
  "security",       // Security
  "test_gaps",     // Test gaps
] as const;

export type Priority = (typeof PRIORITY_ORDER)[number];

/**
 * Task category for ratio tracking
 */
export type TaskCategory = "source_code" | "documentation" | "test" | "config";

/**
 * Cadence constraints for task generation
 */
export const CADENCE = {
  MIN_MINUTES_BETWEEN_TASKS: 60,      // Minimum 60 minutes between generated tasks
  MAX_TASKS_PER_DAY: 10,             // Maximum 10 tasks per day
  ONE_ACTIVE_TASK_MAX: true,          // One active task maximum
} as const;

/**
 * Ratio constraints
 */
export const RATIOS = {
  MIN_SOURCE_CODE_RATIO: 1 / 3,       // At least 1 in 3 tasks must modify source code
  MAX_DOCUMENTATION_RATIO: 1 / 5,    // Documentation tasks no more than 1 in 5
} as const;

/**
 * Task generation metadata stored with each generated task
 */
export interface TaskMetadata {
  taskId: string;
  generatedAt: string;
  category: TaskCategory;
  priority: Priority;
  branchName: string;
  prNumber?: number;
  status: "generated" | "accepted" | "rejected" | "failed";
  failureReason?: string;
}

/**
 * Backlog generator state
 */
export interface BacklogState {
  generatedTasks: TaskMetadata[];
  lastGeneratedAt: string | null;
  tasksToday: number;
  todayDate: string;
  completedTaskIds: Set<string>;
  failedTaskIds: Map<string, number>; // taskId -> retryCount
}

/**
 * Task suggestion from the generator
 */
export interface TaskSuggestion {
  priority: Priority;
  category: TaskCategory;
  title: string;
  objective: string;
  allowedPaths: string[];
  testCommands: string[][];
}

/**
 * Check if the current time is within the cooldown period
 */
export function isWithinCooldown(state: BacklogState): boolean {
  if (!state.lastGeneratedAt) return false;
  const lastTime = new Date(state.lastGeneratedAt).getTime();
  const now = Date.now();
  const minutesSince = (now - lastTime) / 1000 / 60;
  return minutesSince < CADENCE.MIN_MINUTES_BETWEEN_TASKS;
}

/**
 * Check if daily task limit has been reached
 */
export function isDailyLimitReached(state: BacklogState): boolean {
  const today = new Date().toISOString().split("T")[0];
  return state.tasksToday >= CADENCE.MAX_TASKS_PER_DAY && state.todayDate === today;
}

/**
 * Check if there are tasks currently processing
 */
export async function hasProcessingTasks(root: string): Promise<boolean> {
  const processingDir = path.join(root, "agent/tasks/processing");
  try {
    const files = await readdir(processingDir);
    return files.filter((f) => f.endsWith(".json")).length > 0;
  } catch {
    return false;
  }
}

/**
 * Check if queue is empty
 */
export async function isQueueEmpty(root: string): Promise<boolean> {
  const queueDir = path.join(root, "agent/tasks/queue");
  try {
    const files = await readdir(queueDir);
    return files.filter((f) => f.endsWith(".json")).length === 0;
  } catch {
    return true;
  }
}

/**
 * Check if task was previously completed
 */
export function wasTaskCompleted(state: BacklogState, taskTitle: string): boolean {
  const normalizedTitle = taskTitle.toLowerCase().replace(/[^a-z0-9]/g, "-");
  return state.completedTaskIds.has(normalizedTitle);
}

/**
 * Check if task has exceeded retry limit
 */
export function hasExceededRetryLimit(state: BacklogState, taskTitle: string): boolean {
  const normalizedTitle = taskTitle.toLowerCase().replace(/[^a-z0-9]/g, "-");
  const retryCount = state.failedTaskIds.get(normalizedTitle) || 0;
  return retryCount >= 1; // Only retry once
}

/**
 * Calculate documentation ratio
 */
export function calculateDocumentationRatio(state: BacklogState): number {
  const recentTasks = state.generatedTasks.slice(-5);
  if (recentTasks.length === 0) return 0;
  const docTasks = recentTasks.filter((t) => t.category === "documentation").length;
  return docTasks / recentTasks.length;
}

/**
 * Calculate source code ratio
 */
export function calculateSourceCodeRatio(state: BacklogState): number {
  const recentTasks = state.generatedTasks.slice(-3);
  if (recentTasks.length === 0) return 1;
  const sourceTasks = recentTasks.filter((t) => t.category === "source_code").length;
  return sourceTasks / recentTasks.length;
}

/**
 * Check if we can generate a documentation task
 */
export function canGenerateDocumentationTask(state: BacklogState): boolean {
  return calculateDocumentationRatio(state) < RATIOS.MAX_DOCUMENTATION_RATIO;
}

/**
 * Check if we must generate a source code task
 */
export function mustGenerateSourceCodeTask(state: BacklogState): boolean {
  return calculateSourceCodeRatio(state) < RATIOS.MIN_SOURCE_CODE_RATIO;
}

/**
 * Task suggestions organized by priority
 */
export const TASK_SUGGESTIONS: TaskSuggestion[] = [
  // Reliability
  {
    priority: "reliability",
    category: "source_code",
    title: "Add error boundary for API routes",
    objective: "Add comprehensive error handling with proper error classification to all /api/* routes. Each endpoint should catch errors, classify them using the error system, and return appropriate HTTP status codes with structured error responses.",
    allowedPaths: ["app/api/**", "lib/**/*.ts"],
    testCommands: [["npm", "test", "--", "error"]],
  },
  {
    priority: "reliability",
    category: "source_code",
    title: "Add health check to background workers",
    objective: "Implement health check endpoints for all background worker processes (rendering, localization, analysis). Workers should expose /health endpoints that report their status, current job, and resource usage.",
    allowedPaths: ["lib/**/*.ts", "app/api/**/*.ts"],
    testCommands: [["npm", "test", "--", "worker"]],
  },
  // Subtitle quality
  {
    priority: "subtitle_quality",
    category: "source_code",
    title: "Add timing validation for subtitle segments",
    objective: "Add validation to ensure subtitle segments have minimum 0.5s duration and maximum 10s duration. Validate that segments don't overlap and that gap between segments is at least 0.1s.",
    allowedPaths: ["lib/subtitle-quality/**/*.ts", "lib/**/*.ts"],
    testCommands: [["npm", "test", "--", "timing"]],
  },
  {
    priority: "subtitle_quality",
    category: "test",
    title: "Add tests for SRT parser edge cases",
    objective: "Add comprehensive tests for the SRT parser covering: empty files, malformed timestamps, missing sequence numbers, Unicode characters, HTML tags in text, and overlapping segments.",
    allowedPaths: ["lib/subtitle-quality/**/*.ts"],
    testCommands: [["npm", "test", "--", "srt"]],
  },
  // Translation quality
  {
    priority: "translation_quality",
    category: "source_code",
    title: "Add language detection fallback",
    objective: "Implement language detection fallback chain: 1) Use detected language from source, 2) Use user preference, 3) Use content analysis, 4) Default to English. Log when falling back.",
    allowedPaths: ["lib/translation/**/*.ts", "lib/**/*.ts"],
    testCommands: [["npm", "test", "--", "translation"]],
  },
  // Rendering
  {
    priority: "rendering",
    category: "source_code",
    title: "Add render progress streaming",
    objective: "Implement Server-Sent Events (SSE) for render progress updates. Clients should receive real-time updates on frame progress, ETA, and any warnings/errors during rendering.",
    allowedPaths: ["app/api/render/**/*.ts", "lib/render/**/*.ts"],
    testCommands: [["npm", "test", "--", "render"]],
  },
  // Performance
  {
    priority: "performance",
    category: "source_code",
    title: "Add caching layer for translation API",
    objective: "Implement LRU cache for translation API responses. Cache should use source text hash + target language as key, with 1-hour TTL and 1000 entry maximum.",
    allowedPaths: ["lib/translation/**/*.ts", "lib/cache/**/*.ts"],
    testCommands: [["npm", "test", "--", "cache"]],
  },
  {
    priority: "performance",
    category: "test",
    title: "Benchmark subtitle processing pipeline",
    objective: "Create benchmark tests for the subtitle processing pipeline measuring: SRT parsing time, segment alignment time, timing adjustment time. Identify bottlenecks and add results to benchmark-report.json.",
    allowedPaths: ["lib/subtitle-quality/**/*.ts"],
    testCommands: [["npm", "test", "--", "benchmark"]],
  },
  // Product UX
  {
    priority: "product_ux",
    category: "documentation",
    title: "Add API documentation for /api/analysis endpoints",
    objective: "Document all /api/analysis endpoints with OpenAPI-style comments. Include request/response schemas, error codes, authentication requirements, and usage examples.",
    allowedPaths: ["app/api/analysis/**/*.ts"],
    testCommands: [["npm", "run", "lint"]],
  },
  {
    priority: "product_ux",
    category: "source_code",
    title: "Add job status polling fallback",
    objective: "Implement WebSocket connection fallback when SSE is not available. Clients should automatically detect connection type and use appropriate transport method.",
    allowedPaths: ["app/api/**/route.ts", "lib/**/*.ts"],
    testCommands: [["npm", "test", "--", "websocket"]],
  },
  // Security
  {
    priority: "security",
    category: "source_code",
    title: "Add rate limiting to upload endpoint",
    objective: "Implement rate limiting for /api/uploads endpoint: 10 uploads per minute per IP, 100MB max file size, and max 10 pending uploads per session. Return 429 when exceeded.",
    allowedPaths: ["app/api/uploads/**/*.ts"],
    testCommands: [["npm", "test", "--", "upload"]],
  },
  // Test gaps
  {
    priority: "test_gaps",
    category: "test",
    title: "Add tests for alignment algorithm",
    objective: "Add unit tests for the alignment algorithm covering: exact matches, fuzzy matches with 80%+ similarity, no-match scenarios, and multi-speaker segments.",
    allowedPaths: ["lib/subtitle-quality/**/*.ts"],
    testCommands: [["npm", "test", "--", "alignment"]],
  },
  {
    priority: "test_gaps",
    category: "test",
    title: "Add tests for quality scoring",
    objective: "Add comprehensive tests for quality scoring covering: perfect score scenarios, zero-length segment handling, Unicode text scoring, and edge cases with extreme timestamps.",
    allowedPaths: ["lib/subtitle-quality/**/*.ts"],
    testCommands: [["npm", "test", "--", "quality"]],
  },
  // Bug fixes (highest priority)
  {
    priority: "bug",
    category: "source_code",
    title: "Fix memory leak in render worker",
    objective: "Investigate and fix memory leak in render worker. Profile memory usage over 1 hour of continuous rendering. Close all file handles, release WebGPU resources, and clear event listeners.",
    allowedPaths: ["lib/render/**/*.ts", "workers/**/*.ts"],
    testCommands: [["npm", "test", "--", "render"]],
  },
  {
    priority: "bug",
    category: "test",
    title: "Add regression test for SRT timestamp parsing",
    objective: "Add regression test for SRT timestamp parsing bug reported in GitHub issue. Test with timestamps like '00:00:00,000' (comma) and '00:00:00.000' (period) decimal separators.",
    allowedPaths: ["lib/subtitle-quality/**/*.ts"],
    testCommands: [["npm", "test", "--", "srt"]],
  },
];

/**
 * Select the next task based on state and constraints
 */
export function selectNextTask(state: BacklogState): TaskSuggestion | null {
  // Filter out completed tasks
  const availableTasks = TASK_SUGGESTIONS.filter(
    (task) => !wasTaskCompleted(state, task.title) && !hasExceededRetryLimit(state, task.title)
  );

  if (availableTasks.length === 0) return null;

  // Check if we must generate source code task
  if (mustGenerateSourceCodeTask(state)) {
    const sourceTask = availableTasks.find((t) => t.category === "source_code");
    if (sourceTask) return sourceTask;
  }

  // Check if we can generate documentation task
  if (!canGenerateDocumentationTask(state)) {
    const nonDocTasks = availableTasks.filter((t) => t.category !== "documentation");
    if (nonDocTasks.length > 0) {
      // Pick highest priority non-doc task
      return nonDocTasks.reduce((highest, task) => {
        const highestIdx = PRIORITY_ORDER.indexOf(highest.priority as Priority);
        const taskIdx = PRIORITY_ORDER.indexOf(task.priority as Priority);
        return taskIdx < highestIdx ? task : highest;
      });
    }
  }

  // Default: pick highest priority available task
  return availableTasks.reduce((highest, task) => {
    const highestIdx = PRIORITY_ORDER.indexOf(highest.priority as Priority);
    const taskIdx = PRIORITY_ORDER.indexOf(task.priority as Priority);
    return taskIdx < highestIdx ? task : highest;
  });
}

/**
 * Generate a task ID
 */
function generateTaskId(priority: Priority): string {
  const prefix = priority.toUpperCase().replace("_", "-").slice(0, 3);
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Generate branch name for task
 */
function generateBranchName(taskId: string): string {
  const sanitized = taskId.toLowerCase().replace(/[^a-z0-9]/g, "-");
  return `agent/autonomous-${sanitized}`;
}

/**
 * Create a task file from a suggestion
 */
export function createTaskFromSuggestion(suggestion: TaskSuggestion, developmentMode: boolean): EngineeringTask {
  const taskId = generateTaskId(suggestion.priority);
  const isHighPriority = ["bug", "reliability", "security"].includes(suggestion.priority);

  const limits = developmentMode ? {
    maximum_iterations: 10,
    maximum_changed_files: 50,
    maximum_diff_lines: 10000,
    maximum_render_attempts: 4,
    maximum_model_calls: 20,
    maximum_model_tokens: 200000,
    maximum_execution_ms: 3600000,
  } : {
    maximum_iterations: 6,
    maximum_changed_files: 25,
    maximum_diff_lines: 2500,
    maximum_render_attempts: 4,
    maximum_model_calls: 12,
    maximum_model_tokens: 200000,
    maximum_execution_ms: 7200000,
  };

  return {
    task_id: taskId,
    title: suggestion.title,
    priority: isHighPriority ? "high" : "medium",
    objective: suggestion.objective,
    enabled: false, // Start disabled, agent enables after review
    allowed_paths: suggestion.allowedPaths,
    forbidden_paths: [
      "**/node_modules/**",
      "**/.git/**",
      "**/secrets/**",
      "**/.env*",
      "production/**",
      "deploy/**",
    ],
    success_criteria: {
      unit_tests_pass: true,
      integration_tests_pass: true,
      render_tests_pass: true,
      maximum_critical_errors: 0,
      minimum_quality_delta: 0,
      maximum_regressions: 0,
    },
    limits,
    required_artifacts: ["test-report.json"],
    test_commands: suggestion.testCommands,
    execution: { kind: "approval_required" },
  };
}

/**
 * Write task to queue directory
 */
export async function writeTaskToQueue(root: string, task: EngineeringTask): Promise<string> {
  const queueDir = path.join(root, "agent/tasks/queue");
  await mkdir(queueDir, { recursive: true });

  // Validate task schema
  engineeringTaskSchema.parse(task);

  const filename = `${Date.now()}-${task.task_id.toLowerCase()}.json`;
  const filepath = path.join(queueDir, filename);
  await writeFile(filepath, JSON.stringify(task, null, 2));
  return filepath;
}

/**
 * Load state from disk
 */
export async function loadBacklogState(root: string): Promise<BacklogState> {
  const stateFile = path.join(root, "agent/tasks/.backlog-state.json");
  const progressFile = path.join(root, "docs/AUTONOMOUS_PROGRESS.md");

  const state: BacklogState = {
    generatedTasks: [],
    lastGeneratedAt: null,
    tasksToday: 0,
    todayDate: new Date().toISOString().split("T")[0],
    completedTaskIds: new Set(),
    failedTaskIds: new Map(),
  };

  // Try to load state file
  try {
    const data = await readFile(stateFile, "utf8");
    const parsed = JSON.parse(data);
    state.generatedTasks = parsed.generatedTasks || [];
    state.lastGeneratedAt = parsed.lastGeneratedAt || null;
    state.tasksToday = parsed.tasksToday || 0;
    state.todayDate = parsed.todayDate || new Date().toISOString().split("T")[0];
    state.completedTaskIds = new Set(parsed.completedTaskIds || []);
    state.failedTaskIds = new Map(Object.entries(parsed.failedTaskIds || {}));
  } catch {
    // State file doesn't exist, use defaults
  }

  // Parse completed tasks from AUTONOMOUS_PROGRESS.md
  try {
    const progressData = await readFile(progressFile, "utf8");
    // Extract task titles from completed tasks table
    const taskMatches = progressData.matchAll(/\|\s*([^|]+?)\s*\|/g);
    for (const match of taskMatches) {
      const taskTitle = match[1].trim();
      if (taskTitle && !taskTitle.includes("Task") && !taskTitle.includes("---")) {
        const normalized = taskTitle.toLowerCase().replace(/[^a-z0-9]/g, "-");
        state.completedTaskIds.add(normalized);
      }
    }
  } catch {
    // Progress file doesn't exist
  }

  // Reset daily counter if new day
  if (state.todayDate !== new Date().toISOString().split("T")[0]) {
    state.tasksToday = 0;
    state.todayDate = new Date().toISOString().split("T")[0];
  }

  return state;
}

/**
 * Save state to disk
 */
export async function saveBacklogState(root: string, state: BacklogState): Promise<void> {
  const stateFile = path.join(root, "agent/tasks/.backlog-state.json");
  const dir = path.dirname(stateFile);
  await mkdir(dir, { recursive: true });

  const data = {
    generatedTasks: state.generatedTasks,
    lastGeneratedAt: state.lastGeneratedAt,
    tasksToday: state.tasksToday,
    todayDate: state.todayDate,
    completedTaskIds: Array.from(state.completedTaskIds),
    failedTaskIds: Object.fromEntries(state.failedTaskIds),
  };

  await writeFile(stateFile, JSON.stringify(data, null, 2));
}

/**
 * Main generation function - generates one task when queue is empty
 */
export async function generateBacklogTask(root: string, developmentMode: boolean = false): Promise<{
  generated: boolean;
  task?: EngineeringTask;
  reason?: string;
}> {
  // Check constraints
  const queueEmpty = await isQueueEmpty(root);
  if (!queueEmpty) {
    return { generated: false, reason: "Queue is not empty" };
  }

  const processing = await hasProcessingTasks(root);
  if (processing) {
    return { generated: false, reason: "Tasks are currently processing" };
  }

  const state = await loadBacklogState(root);

  if (isWithinCooldown(state)) {
    return { generated: false, reason: "Within cooldown period" };
  }

  if (isDailyLimitReached(state)) {
    return { generated: false, reason: "Daily task limit reached" };
  }

  const taskSuggestion = selectNextTask(state);
  if (!taskSuggestion) {
    return { generated: false, reason: "No available tasks (all completed or retried)" };
  }

  const task = createTaskFromSuggestion(taskSuggestion, developmentMode);
  await writeTaskToQueue(root, task);

  // Update state
  const metadata: TaskMetadata = {
    taskId: task.task_id,
    generatedAt: new Date().toISOString(),
    category: taskSuggestion.category,
    priority: taskSuggestion.priority,
    branchName: generateBranchName(task.task_id),
    status: "generated",
  };

  state.generatedTasks.push(metadata);
  state.lastGeneratedAt = new Date().toISOString();
  state.tasksToday++;
  await saveBacklogState(root, state);

  return { generated: true, task };
}

/**
 * Check if autonomous backlog generation should trigger
 * Returns the result of generation if triggered
 */
export async function checkAndGenerateBacklogTask(
  root: string,
  developmentMode: boolean = false
): Promise<{
  triggered: boolean;
  result?: {
    generated: boolean;
    task?: EngineeringTask;
    reason?: string;
  };
}> {
  const queueEmpty = await isQueueEmpty(root);
  const processing = await hasProcessingTasks(root);

  // Only trigger if queue is empty and no tasks are processing
  if (!queueEmpty || processing) {
    return { triggered: false };
  }

  const result = await generateBacklogTask(root, developmentMode);
  return { triggered: true, result };
}

/**
 * Record task outcome
 */
export async function recordTaskOutcome(
  root: string,
  taskId: string,
  status: "accepted" | "rejected" | "failed",
  failureReason?: string
): Promise<void> {
  const state = await loadBacklogState(root);

  const task = state.generatedTasks.find((t) => t.taskId === taskId);
  if (task) {
    task.status = status;
    task.prNumber = undefined; // Would be set if we tracked PR numbers
    if (failureReason) {
      task.failureReason = failureReason;
    }
  }

  if (status === "failed" && failureReason) {
    const normalizedTitle = taskId.toLowerCase().replace(/[^a-z0-9]/g, "-");
    const currentRetry = state.failedTaskIds.get(normalizedTitle) || 0;
    state.failedTaskIds.set(normalizedTitle, currentRetry + 1);
  }

  if (status === "accepted") {
    state.completedTaskIds.add(taskId.toLowerCase().replace(/[^a-z0-9]/g, "-"));
  }

  await saveBacklogState(root, state);
}
