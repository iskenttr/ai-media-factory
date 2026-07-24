import { mkdir, readFile, readdir, access, writeFile } from "node:fs/promises";
import path from "node:path";
import { engineeringTaskSchema, type EngineeringTask } from "../tasks/schema";

const MAX_CONTEXT_PATHS = 5;
const SAFE_MAX_EXECUTION_MS = 1800000; // 30 minutes

/**
 * Converts glob patterns to safe existing context paths.
 * Examples: lib/render/**\/\*.ts -> lib/render, workers/**\/\*.ts -> workers
 */
export async function resolveContextPaths(
  allowedPaths: string[],
  root: string
): Promise<string[]> {
  const resolvedPaths = new Set<string>();
  const seen = new Set<string>();

  for (const allowedPath of allowedPaths) {
    if (resolvedPaths.size >= MAX_CONTEXT_PATHS) break;

    // Extract the base directory from glob patterns
    const basePath = extractGlobBase(allowedPath);

    // Resolve to absolute path
    const absolutePath = path.resolve(root, basePath);

    // Reject path traversal attempts
    if (!isPathSafe(absolutePath, root)) continue;

    // Check if path exists
    try {
      await access(absolutePath);
    } catch {
      // Path doesn't exist, skip it
      continue;
    }

    // Convert to relative path for the task
    const relativePath = path.relative(root, absolutePath);
    const normalized = relativePath.replace(/\\/g, "/"); // Normalize Windows paths

    if (seen.has(normalized)) continue;
    seen.add(normalized);

    resolvedPaths.add(normalized);
  }

  return Array.from(resolvedPaths).slice(0, MAX_CONTEXT_PATHS);
}

/**
 * Extracts the base directory from glob patterns.
 */
function extractGlobBase(globPath: string): string {
  // Remove leading slash if present
  let cleaned = globPath.replace(/^\//, "");

  // Handle recursive globs like **/*.ts or **/*.md
  if (cleaned.includes("**/")) {
    // Take everything before /**
    cleaned = cleaned.split("/**")[0];
  }

  // Handle simple globs like *.ts or *.json
  // Take everything before the first glob pattern
  const globIndex = cleaned.search(/[*?[]/);
  if (globIndex > 0) {
    cleaned = cleaned.substring(0, globIndex);
  }

  // Remove trailing slashes
  cleaned = cleaned.replace(/\/+$/, "");

  // If empty after cleaning, use the full path
  return cleaned || globPath;
}

/**
 * Validates that a path is safe and within the repository.
 */
function isPathSafe(resolvedPath: string, root: string): boolean {
  const normalizedResolved = path.normalize(resolvedPath);
  const normalizedRoot = path.normalize(root);

  // Check for path traversal
  if (normalizedResolved.includes("..")) return false;

  // Ensure path is within root directory
  return normalizedResolved.startsWith(normalizedRoot);
}

/**
 * Check if a suggestion has valid context paths.
 */
export async function hasValidContextPaths(
  allowedPaths: string[],
  root: string
): Promise<boolean> {
  const resolved = await resolveContextPaths(allowedPaths, root);
  return resolved.length > 0;
}

/**
 * Priority order for task generation (highest to lowest)
 */
export const PRIORITY_ORDER = [
  "bug",           // Confirmed bugs
  "voice_dubbing", // Voice and dubbing quality
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
  title?: string;
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
  contextPaths?: string[];
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
function normalizeTaskTitle(taskTitle: string): string {
  return taskTitle.toLowerCase().replace(/[^a-z0-9]/g, "-");
}

export function wasTaskCompleted(state: BacklogState, taskTitle: string): boolean {
  const normalizedTitle = normalizeTaskTitle(taskTitle);
  return state.completedTaskIds.has(normalizedTitle);
}

/**
 * Check if task has exceeded retry limit
 */
export function hasExceededRetryLimit(state: BacklogState, taskTitle: string): boolean {
  const normalizedTitle = normalizeTaskTitle(taskTitle);
  const retryCount = state.failedTaskIds.get(normalizedTitle) || 0;
  return retryCount >= 2; // One initial attempt plus one retry
}

/**
 * Calculate documentation ratio from accepted tasks only
 */
export function calculateDocumentationRatio(state: BacklogState): number {
  const acceptedTasks = state.generatedTasks.filter((t) => t.status === "accepted");
  const recentTasks = acceptedTasks.slice(-5);
  if (recentTasks.length === 0) return 0;
  const docTasks = recentTasks.filter((t) => t.category === "documentation").length;
  return docTasks / recentTasks.length;
}

/**
 * Calculate source code ratio from accepted tasks only
 */
export function calculateSourceCodeRatio(state: BacklogState): number {
  const acceptedTasks = state.generatedTasks.filter((t) => t.status === "accepted");
  const recentTasks = acceptedTasks.slice(-3);
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
  // Voice and dubbing quality
  {
    priority: "voice_dubbing",
    category: "source_code",
    title: "Define consent-aware TTS provider and voice profile contracts",
    objective: "Add typed contracts for TTS providers, voice profiles, consent records, provenance, and provider capabilities. Voice cloning must require explicit consent metadata and a traceable source; do not install models, add secrets, or make network calls.",
    allowedPaths: ["lib/providers/**/*.ts", "lib/localization/**/*.ts"],
    testCommands: [["npm", "test", "--", "provider-registry"]],
  },
  {
    priority: "voice_dubbing",
    category: "test",
    title: "Add deterministic dubbed-audio quality metrics",
    objective: "Implement deterministic quality measurements for dubbed audio covering integrated loudness, true peak and clipping, silence ratio, and duration mismatch. Use generated synthetic fixtures only and return structured diagnostics that can be compared in tests.",
    allowedPaths: ["lib/server/**/*.ts", "lib/localization/**/*.ts", "agent/evaluators/**/*.ts"],
    testCommands: [["npm", "test", "--", "dubbed-audio-quality"]],
  },
  {
    priority: "voice_dubbing",
    category: "source_code",
    title: "Add Turkish pronunciation normalization for TTS",
    objective: "Add a conservative Turkish TTS text-normalization stage for common acronyms, numbers, dates, abbreviations, and punctuation pauses. Preserve the original localized text, expose normalization decisions for review, and cover ambiguous inputs with tests.",
    allowedPaths: ["lib/localization/**/*.ts", "lib/text-utils.ts", "lib/text-utils.test.ts"],
    testCommands: [["npm", "test", "--", "text-utils"]],
  },
  {
    priority: "voice_dubbing",
    category: "source_code",
    title: "Add speaker-aware voice assignment for localization",
    objective: "Add deterministic voice assignment that keeps the same approved voice for each speaker across localized segments and honors explicit user overrides. Treat speaker labels as project metadata and do not infer identity, gender, age, or other biometric traits.",
    allowedPaths: ["lib/localization/**/*.ts", "lib/server/**/*.ts"],
    testCommands: [["npm", "test", "--", "store"]],
  },
  {
    priority: "voice_dubbing",
    category: "source_code",
    title: "Add capability-based TTS provider fallback",
    objective: "Implement deterministic TTS provider selection and fallback using declared capabilities such as language support, approved voice use, offline availability, and CPU or GPU requirements. Return structured unavailable and failure reasons without inventing provider capabilities.",
    allowedPaths: ["lib/providers/**/*.ts", "lib/localization/**/*.ts"],
    testCommands: [["npm", "test", "--", "provider-registry"]],
  },
  {
    priority: "voice_dubbing",
    category: "source_code",
    title: "Add loudness normalization and clipping guard for dubbing",
    objective: "Add a tested FFmpeg argument builder and validation layer for dubbed-audio loudness normalization and true-peak limiting. Produce a separate derived output, keep source audio unchanged, and surface clipping or invalid measurement failures clearly.",
    allowedPaths: ["lib/server/**/*.ts", "lib/localization/**/*.ts"],
    testCommands: [["npm", "test", "--", "media"]],
  },
  {
    priority: "voice_dubbing",
    category: "test",
    title: "Add dubbing segment synchronization evaluator",
    objective: "Add a deterministic evaluator that compares generated speech duration with localization segment timing and reports overflow, excessive gaps, and cumulative drift against explicit thresholds. Cover fast, slow, and multi-segment synthetic cases.",
    allowedPaths: ["lib/localization/**/*.ts", "lib/server/**/*.ts", "agent/evaluators/**/*.ts"],
    testCommands: [["npm", "test", "--", "dubbing"]],
  },
  {
    priority: "voice_dubbing",
    category: "source_code",
    title: "Add per-segment voice preview and regeneration workflow",
    objective: "Add the server-side workflow for generating a per-segment voice preview and requesting a revised take with explicit voice and pronunciation settings. Persist status, revision history, consent provenance, and failure details; do not autoplay or overwrite accepted audio.",
    allowedPaths: ["app/api/localization/**/*.ts", "lib/server/**/*.ts", "lib/localization/**/*.ts"],
    testCommands: [["npm", "test", "--", "store"]],
  },
  {
    priority: "voice_dubbing",
    category: "test",
    title: "Build golden Turkish dubbing quality fixtures",
    objective: "Create a deterministic, license-safe Turkish dubbing quality fixture set using synthetic text and generated metadata for single-speaker, multi-speaker, fast, slow, punctuation, number, and abbreviation cases. Add a repeatable benchmark report without copyrighted audio.",
    allowedPaths: ["agent/evaluators/**/*.ts", "lib/localization/**/*.ts", "lib/server/**/*.ts"],
    testCommands: [["npm", "test", "--", "dubbing"]],
  },
  // Reliability
  {
    priority: "reliability",
    category: "source_code",
    title: "Add shared API error response boundary",
    objective: "Introduce or extend a shared error-to-HTTP response mapper and apply it to two representative API routes with deterministic tests. Keep the change incremental; do not rewrite every API route in one task.",
    allowedPaths: ["app/api/**", "lib/**/*.ts"],
    contextPaths: [
      "lib/errors.ts",
      "app/api/uploads/route.ts",
      "app/api/analysis/jobs/[jobId]/retry/route.ts",
      "app/api/localization/runs/[runId]/route.ts",
    ],
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
export async function createTaskFromSuggestion(
  suggestion: TaskSuggestion,
  root: string
): Promise<EngineeringTask> {
  const taskId = generateTaskId(suggestion.priority);
  const isHighPriority = ["bug", "voice_dubbing", "reliability", "security"].includes(suggestion.priority);

  // Writable scope and model context are separate: a task may be allowed to
  // touch a broad area while receiving only the few files needed to reason.
  const contextPaths = await resolveContextPaths(
    suggestion.contextPaths ?? suggestion.allowedPaths,
    root,
  );

  // Always use safe execution limits
  const limits = {
    maximum_iterations: 6,
    maximum_changed_files: 25,
    maximum_diff_lines: 2500,
    maximum_render_attempts: 4,
    maximum_model_calls: 12,
    maximum_model_tokens: 200000,
    maximum_execution_ms: SAFE_MAX_EXECUTION_MS,
  };

  return {
    task_id: taskId,
    title: suggestion.title,
    priority: isHighPriority ? "high" : "medium",
    objective: suggestion.objective,
    enabled: true, // Tasks are enabled for autonomous execution
    allowed_paths: suggestion.allowedPaths, // Keep globs for policy enforcement
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
    execution: {
      kind: "gemini_patch",
      context_paths: contextPaths, // Use resolved existing paths
      repair_strategy: "gemini_patch_review",
    },
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
export async function generateBacklogTask(root: string): Promise<{
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

  // Find a suggestion with valid context paths
  let taskSuggestion = selectNextTask(state);
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    if (!taskSuggestion) {
      return { generated: false, reason: "No available tasks (all completed or retried)" };
    }

    // Check if suggestion has valid context paths
    const hasValid = await hasValidContextPaths(taskSuggestion.allowedPaths, root);
    if (hasValid) {
      break;
    }

    // Skip this suggestion and try another
    const completedTitle = taskSuggestion.title.toLowerCase().replace(/[^a-z0-9]/g, "-");
    state.completedTaskIds.add(completedTitle);
    taskSuggestion = selectNextTask(state);
    attempts++;
  }

  if (!taskSuggestion) {
    return { generated: false, reason: "No available tasks with valid context paths" };
  }

  const task = await createTaskFromSuggestion(taskSuggestion, root);
  await writeTaskToQueue(root, task);

  // Update state
  const metadata: TaskMetadata = {
    taskId: task.task_id,
    title: taskSuggestion.title,
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
  root: string
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

  const result = await generateBacklogTask(root);
  return { triggered: true, result };
}

/**
 * Record task outcome
 */
export async function recordTaskOutcome(
  root: string,
  taskId: string,
  taskTitle: string,
  status: "accepted" | "rejected" | "failed",
  failureReason?: string
): Promise<boolean> {
  const state = await loadBacklogState(root);

  const task = state.generatedTasks.find((t) => t.taskId === taskId);
  if (!task) {
    return false;
  }

  task.title ??= taskTitle;
  task.status = status;
  task.prNumber = undefined; // Would be set if we tracked PR numbers
  if (failureReason) {
    task.failureReason = failureReason;
  }

  const normalizedTitle = normalizeTaskTitle(task.title);

  if (status === "failed" || status === "rejected") {
    const currentRetry = state.failedTaskIds.get(normalizedTitle) || 0;
    state.failedTaskIds.set(normalizedTitle, currentRetry + 1);
  }

  if (status === "accepted") {
    state.completedTaskIds.add(normalizedTitle);
  }

  await saveBacklogState(root, state);
  return true;
}
