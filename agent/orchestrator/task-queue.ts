import { mkdir, readdir, readFile, rename } from "node:fs/promises";
import path from "node:path";
import { validateTaskSafety, isDevelopmentMode, type EngineeringTask } from "../tasks/schema";
import { appendAudit } from "./audit-log";

export async function claimNextTask(root: string): Promise<{ task: EngineeringTask; processingFile: string } | null> {
  const queued = path.join(root, "agent/tasks/queue");
  const processing = path.join(root, "agent/tasks/processing");
  await mkdir(queued, { recursive: true });
  await mkdir(processing, { recursive: true });
  const files = (await readdir(queued)).filter((file) => file.endsWith(".json")).sort();
  const developmentMode = isDevelopmentMode();
  for (const file of files) {
    const source = path.join(queued, file);
    const destination = path.join(processing, file);
    try {
      await rename(source, destination);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`task_queue_claim_failed:${file}:${detail}`, { cause: error });
    }
    try {
      const task = validateTaskSafety(JSON.parse(await readFile(destination, "utf8")), developmentMode);
      if (!task.enabled) {
        await rename(destination, source);
        continue;
      }
      await appendAudit(root, {
        timestamp: new Date().toISOString(),
        taskId: task.task_id,
        category: "system",
        event: "task_queue_claimed",
        detail: { file, source, destination, taskTitle: task.title, developmentMode },
      });
      return { task, processingFile: destination };
    } catch (error) {
      const failed = path.join(root, "agent/tasks/failed", file);
      await mkdir(path.dirname(failed), { recursive: true });
      await rename(destination, failed);
      throw error;
    }
  }
  return null;
}

export async function finishTaskFile(root: string, processingFile: string, status: "completed" | "failed" | "blocked") {
  const destination = path.join(root, "agent/tasks", status, path.basename(processingFile));
  await mkdir(path.dirname(destination), { recursive: true });
  await rename(processingFile, destination);
  await appendAudit(root, {
    timestamp: new Date().toISOString(),
    taskId: path.basename(processingFile, ".json").replace(/^\d+-/, "").toUpperCase(),
    category: "system",
    event: "task_queue_finished",
    detail: { processingFile, destination, status },
  });
  return destination;
}
