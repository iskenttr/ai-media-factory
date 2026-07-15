import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { SystemStatus, QueueStats, ErrorReport, ErrorEntry } from "../types";
import { getUptime } from "./metrics";

export async function getSystemStatus(root: string): Promise<SystemStatus> {
  const queuePath = path.join(root, "agent/tasks/queue");
  const processingPath = path.join(root, "agent/tasks/processing");
  const completedPath = path.join(root, "agent/tasks/completed");
  const failedPath = path.join(root, "agent/tasks/failed");
  const heartbeatPath = path.join(root, "agent/state/heartbeat.json");

  const [queueSize, processingJobs, lastHeartbeat] = await Promise.all([
    countFiles(queuePath),
    countFiles(processingPath),
    readHeartbeat(heartbeatPath),
  ]);

  const today = new Date().toISOString().split("T")[0];
  const [completedToday, failedToday] = await Promise.all([
    countFilesToday(completedPath, today),
    countFilesToday(failedPath, today),
  ]);

  const agentStatus = await determineAgentStatus(lastHeartbeat);

  return {
    agentStatus,
    queueSize,
    processingJobs,
    completedJobs: completedToday,
    failedJobs: failedToday,
    lastHeartbeat,
    uptime: Math.floor(getUptime()),
  };
}

async function countFiles(dirPath: string): Promise<number> {
  try {
    const files = await readdir(dirPath);
    return files.filter((f) => f.endsWith(".json")).length;
  } catch {
    return 0;
  }
}

async function countFilesToday(dirPath: string, today: string): Promise<number> {
  try {
    const files = await readdir(dirPath);
    let count = 0;
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const filePath = path.join(dirPath, file);
      try {
        const stats = await stat(filePath);
        const fileDate = stats.mtime.toISOString().split("T")[0];
        if (fileDate === today) count++;
      } catch {
        continue;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

async function readHeartbeat(heartbeatPath: string): Promise<string | null> {
  try {
    const content = await readFile(heartbeatPath, "utf8");
    const data = JSON.parse(content);
    return data.timestamp || null;
  } catch {
    return null;
  }
}

async function determineAgentStatus(lastHeartbeat: string | null): Promise<SystemStatus["agentStatus"]> {
  if (!lastHeartbeat) return "stopped";

  const lastTime = new Date(lastHeartbeat).getTime();
  const now = Date.now();
  const diffMinutes = (now - lastTime) / 60000;

  if (diffMinutes > 5) return "error";
  return "running";
}

export async function getQueueStats(root: string): Promise<QueueStats> {
  const queuePath = path.join(root, "agent/tasks/queue");
  const processingPath = path.join(root, "agent/tasks/processing");
  const completedPath = path.join(root, "agent/tasks/completed");
  const failedPath = path.join(root, "agent/tasks/failed");

  const today = new Date().toISOString().split("T")[0];

  const [queued, running, completedToday, failedToday] = await Promise.all([
    countFiles(queuePath),
    countFiles(processingPath),
    countFilesToday(completedPath, today),
    countFilesToday(failedPath, today),
  ]);

  const averageWaitingTime = await calculateAverageWaitingTime(completedPath, today);

  return {
    queued,
    running,
    completedToday,
    failedToday,
    averageWaitingTime,
  };
}

async function calculateAverageWaitingTime(completedPath: string, today: string): Promise<number> {
  try {
    const files = await readdir(completedPath);
    let totalWait = 0;
    let count = 0;

    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const filePath = path.join(completedPath, file);
      try {
        const stats = await stat(filePath);
        const fileDate = stats.mtime.toISOString().split("T")[0];
        if (fileDate === today) {
          const content = await readFile(filePath, "utf8");
          const task = JSON.parse(content);
          if (task.metadata?.waitingTime) {
            totalWait += task.metadata.waitingTime;
            count++;
          }
        }
      } catch {
        continue;
      }
    }

    return count > 0 ? totalWait / count : 0;
  } catch {
    return 0;
  }
}

export async function getErrorReport(root: string, limit = 20): Promise<ErrorReport> {
  const failedPath = path.join(root, "agent/tasks/failed");

  try {
    const files = await readdir(failedPath);
    const jsonFiles = files.filter((f) => f.endsWith(".json")).sort().reverse();

    const errors: ErrorEntry[] = [];

    for (const file of jsonFiles.slice(0, limit)) {
      const filePath = path.join(failedPath, file);
      try {
        const content = await readFile(filePath, "utf8");
        const task = JSON.parse(content);
        const stats = await stat(filePath);

        errors.push({
          taskId: task.task_id || file.replace(".json", ""),
          errorMessage: task.error?.message || task.error || "Unknown error",
          timestamp: stats.mtime.toISOString(),
          retryCount: task.retryCount || 0,
        });
      } catch {
        continue;
      }
    }

    return {
      errors,
      total: jsonFiles.length,
    };
  } catch {
    return { errors: [], total: 0 };
  }
}
