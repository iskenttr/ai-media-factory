import type { EngineeringTask } from "../tasks/schema";
import { executeSandboxedCommand, type CommandResult } from "./command-executor";

export async function runQa(root: string, task: EngineeringTask, worktree: string, artifacts: string) {
  const commands = task.test_commands.length ? task.test_commands : [["npm", "test", "--", "--run", "agent"]];
  const results: CommandResult[] = [];
  for (const argv of commands) {
    const result = await executeSandboxedCommand(root, worktree, artifacts, { argv, cwd: worktree, taskId: task.task_id, timeoutMs: task.limits.maximum_execution_ms });
    results.push(result);
    if (result.exitCode !== 0 || result.timedOut) break;
  }
  return { passed: results.length === commands.length && results.every((result) => result.exitCode === 0 && !result.timedOut && !result.outputLimitExceeded), commands: results };
}
