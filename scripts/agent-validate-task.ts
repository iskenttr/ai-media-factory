import { readFile } from "node:fs/promises";
import path from "node:path";
import { validateTaskSafety } from "../agent/tasks/schema";

async function main() {
  const taskFile = process.argv[2];
  if (!taskFile) throw new Error("usage:npm run agent:validate-task -- <task.json>");
  const task = validateTaskSafety(JSON.parse(await readFile(path.resolve(taskFile), "utf8")));
  console.log(JSON.stringify({ valid: true, taskId: task.task_id }));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
