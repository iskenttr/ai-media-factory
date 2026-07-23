import { z } from "zod";
import { assertAllowedPath } from "../policies/path-policy";

const safeRelativeGlob = z.string().min(1).refine(
  (value) => !value.startsWith("/") && !value.includes("..") && !value.includes("\\") && value !== "*" && value !== "**" && value !== "**/*",
  "unsafe_path_glob",
);

export const taskStateSchema = z.enum([
  "QUEUED", "ANALYZING", "PLANNED", "IMPLEMENTING", "TESTING", "RENDERING", "EVALUATING", "REPAIRING",
  "ACCEPTED", "REJECTED", "BLOCKED", "BLOCKED_REQUIRES_HUMAN_APPROVAL", "FAILED",
]);

/**
 * Production Mode Limits
 * These are the maximum allowed values for production environments.
 */
const PRODUCTION_LIMITS = {
  maximum_iterations: { min: 1, max: 6 },
  maximum_changed_files: { min: 1, max: 25 },
  maximum_diff_lines: { min: 1, max: 2_500 },
  maximum_render_attempts: { min: 0, max: 4 },
  maximum_model_calls: { min: 0, max: 12 },
  maximum_model_tokens: { min: 1_000, max: 1_000_000 },
  maximum_execution_ms: { min: 10_000, max: 7_200_000 },
};

/**
 * Development Mode Limits
 * These are relaxed limits for development environments.
 * Development mode is enabled by setting AMF_AGENT_MODE=development
 */
const DEVELOPMENT_LIMITS = {
  maximum_iterations: { min: 1, max: 10 },
  maximum_changed_files: { min: 1, max: 50 },
  maximum_diff_lines: { min: 1, max: 10_000 },
  maximum_render_attempts: { min: 0, max: 4 },
  maximum_model_calls: { min: 0, max: 20 },
  maximum_model_tokens: { min: 1_000, max: 1_000_000 },
  maximum_execution_ms: { min: 10_000, max: 3_600_000 }, // 1 hour
};

/**
 * Check if development mode is enabled via environment variable
 */
export function isDevelopmentMode(): boolean {
  return process.env.AMF_AGENT_MODE === "development";
}

/**
 * Get the appropriate limits based on environment mode
 */
function getLimitsSchema(developmentMode: boolean) {
  const limits = developmentMode ? DEVELOPMENT_LIMITS : PRODUCTION_LIMITS;
  return z.object({
    maximum_iterations: z.number().int().min(limits.maximum_iterations.min).max(limits.maximum_iterations.max),
    maximum_changed_files: z.number().int().min(limits.maximum_changed_files.min).max(limits.maximum_changed_files.max),
    maximum_diff_lines: z.number().int().min(limits.maximum_diff_lines.min).max(limits.maximum_diff_lines.max),
    maximum_render_attempts: z.number().int().min(limits.maximum_render_attempts.min).max(limits.maximum_render_attempts.max),
    maximum_model_calls: z.number().int().min(limits.maximum_model_calls.min).max(limits.maximum_model_calls.max),
    maximum_model_tokens: z.number().int().min(limits.maximum_model_tokens.min).max(limits.maximum_model_tokens.max).default(200_000),
    maximum_execution_ms: z.number().int().min(limits.maximum_execution_ms.min).max(limits.maximum_execution_ms.max),
  }).strict();
}

export const engineeringTaskSchema = z.object({
  task_id: z.string().regex(/^[A-Z][A-Z0-9-]{2,63}$/),
  title: z.string().min(3).max(200),
  priority: z.enum(["low", "medium", "high", "critical"]),
  objective: z.string().min(10).max(4_000),
  enabled: z.boolean().default(false),
  allowed_paths: z.array(safeRelativeGlob).min(1).max(20),
  forbidden_paths: z.array(safeRelativeGlob).max(50),
  success_criteria: z.object({
    unit_tests_pass: z.boolean(),
    integration_tests_pass: z.boolean(),
    render_tests_pass: z.boolean(),
    maximum_critical_errors: z.number().int().min(0).max(20),
    minimum_quality_delta: z.number().min(0).max(100),
    maximum_regressions: z.number().int().min(0).max(20),
  }).strict(),
  limits: getLimitsSchema(isDevelopmentMode()),
  required_artifacts: z.array(z.enum([
    "technical-summary.md", "test-report.json", "benchmark-report.json", "quality-report.json", "git-diff.patch",
  ])).min(1),
  test_commands: z.array(z.array(z.string().min(1)).min(1).max(20)).max(8).default([]),
  execution: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("controlled_sample"), target: safeRelativeGlob, content: z.string().max(10_000) }).strict(),
    z.object({ kind: z.literal("gemini_patch"), context_paths: z.array(safeRelativeGlob).min(1).max(20), repair_strategy: z.enum(["gemini_patch_review", "none"]).default("none") }).strict(),
    z.object({ kind: z.literal("approval_required") }).strict(),
  ]),
}).strict();

export type EngineeringTask = z.infer<typeof engineeringTaskSchema>;
export type TaskState = z.infer<typeof taskStateSchema>;

const globallyForbidden = [
  "production", "deploy", "secrets", ".github", ".git", ".git/config", ".gitmodules", "agent/policies", "docs/AI_MEDIA_FACTORY_CONSTITUTION.md",
  "storage", ".env", ".gemini",
];

/**
 * Development-Allowed Paths
 * These paths are allowed in development mode even though they would normally be forbidden.
 */
const DEVELOPMENT_ALLOWED_PATHS = [
  "docs",       // Documentation directory
];

export function validateTaskSafety(input: unknown, developmentMode = false): EngineeringTask {
  const task = engineeringTaskSchema.parse(input);
  const allowed = task.allowed_paths.map((value) => value.replace(/\/\*\*.*$/, ""));
  const violation = allowed.find((path) => {
    // In development mode, skip paths that are in DEVELOPMENT_ALLOWED_PATHS
    if (developmentMode && DEVELOPMENT_ALLOWED_PATHS.includes(path)) {
      return false;
    }
    return globallyForbidden.some((blocked) => 
      path === blocked || path.startsWith(`${blocked}/`) || blocked.startsWith(`${path}/`) || (blocked === ".env" && path.startsWith(".env."))
    );
  });
  if (violation) throw new Error(`task_allows_globally_forbidden_path:${violation}`);
  if (task.execution.kind === "gemini_patch") {
    for (const contextPath of task.execution.context_paths) {
      try {
        assertAllowedPath(contextPath, task.allowed_paths, task.forbidden_paths, developmentMode);
      } catch {
        throw new Error(`task_context_path_not_allowed:${contextPath}`);
      }
    }
  }
  return task;
}
