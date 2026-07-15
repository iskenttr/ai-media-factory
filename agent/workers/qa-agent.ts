import { existsSync } from "node:fs";
import path from "node:path";
import type { EngineeringTask } from "../tasks/schema";
import { isDevelopmentMode } from "../tasks/schema";
import { executeSandboxedCommand, type CommandResult } from "./command-executor";

/**
 * Bootstrap node_modules in a worktree if they are missing.
 * This is needed because worktrees don't share node_modules with the main repository.
 * Returns true if dependencies were installed, false otherwise.
 * Only performed in development mode where npm install is allowed.
 */
export async function bootstrapWorktreeDependencies(root: string, worktree: string, taskId: string): Promise<boolean> {
  const nodeModulesPath = path.join(worktree, "node_modules");

  // Check if node_modules already exists
  if (existsSync(nodeModulesPath)) {
    return false;
  }

  // Only bootstrap if in development mode (npm install is allowed in development mode)
  const developmentMode = isDevelopmentMode();
  if (!developmentMode) {
    return false;
  }

  // Run npm install to bootstrap dependencies
  const result = await executeSandboxedCommand(root, worktree, path.join(worktree, "artifacts"), {
    argv: ["npm", "install", "--legacy-peer-deps"],
    cwd: worktree,
    taskId: `${taskId}-npm-install`,
    timeoutMs: 5 * 60 * 1000, // 5 minutes for npm install
  });

  return result.exitCode === 0;
}

export async function runQa(root: string, task: EngineeringTask, worktree: string, artifacts: string) {
  // Bootstrap node_modules if missing (for worktrees) - only in development mode
  const dependenciesInstalled = await bootstrapWorktreeDependencies(root, worktree, task.task_id);

  const commands = task.test_commands.length ? task.test_commands : [["npm", "test", "--", "--run", "agent"]];
  const results: CommandResult[] = [];
  for (const argv of commands) {
    const result = await executeSandboxedCommand(root, worktree, artifacts, { argv, cwd: worktree, taskId: task.task_id, timeoutMs: task.limits.maximum_execution_ms });
    results.push(result);
    if (result.exitCode !== 0 || result.timedOut) break;
  }
  return {
    passed: results.length === commands.length && results.every((result) => result.exitCode === 0 && !result.timedOut && !result.outputLimitExceeded),
    commands: results,
    dependenciesInstalled,
  };
}
