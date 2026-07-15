import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { DailyReport, CostSummary } from "../types";
import { getQueueStats } from "./system";

export async function getDailyReport(root: string): Promise<DailyReport> {
  const today = new Date().toISOString().split("T")[0];
  const queueStats = await getQueueStats(root);

  const [completedTasks, failedTasks, costData] = await Promise.all([
    getCompletedTasksToday(root, today),
    getFailedTasksToday(root, today),
    getCostData(root, today),
  ]);

  const warnings = generateWarnings(queueStats, costData);

  return {
    date: today,
    videosProcessed: completedTasks.length,
    successfulJobs: completedTasks.length,
    failedJobs: failedTasks.length,
    averageProcessingTime: calculateAverageTime(completedTasks),
    translationCount: countByType(completedTasks, "translation"),
    subtitleCount: countByType(completedTasks, "subtitle"),
    costSummary: costData,
    queueSummary: queueStats,
    warnings,
  };
}

interface TaskInfo {
  task_id: string;
  title?: string;
  completedAt?: string;
  duration?: number;
  type?: string;
  metadata?: Record<string, unknown>;
}

async function getCompletedTasksToday(root: string, today: string): Promise<TaskInfo[]> {
  const completedPath = path.join(root, "agent/tasks/completed");
  const tasks: TaskInfo[] = [];

  try {
    const files = await readdir(completedPath);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const filePath = path.join(completedPath, file);
      try {
        const content = await readFile(filePath, "utf8");
        const task = JSON.parse(content) as TaskInfo;
        if (task.completedAt?.startsWith(today) || task.metadata?.completedAt?.toString().startsWith(today)) {
          tasks.push(task);
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Directory doesn't exist
  }

  return tasks;
}

async function getFailedTasksToday(root: string, today: string): Promise<TaskInfo[]> {
  const failedPath = path.join(root, "agent/tasks/failed");
  const tasks: TaskInfo[] = [];

  try {
    const files = await readdir(failedPath);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const filePath = path.join(failedPath, file);
      try {
        const content = await readFile(filePath, "utf8");
        const task = JSON.parse(content) as TaskInfo;
        if (task.completedAt?.startsWith(today) || task.metadata?.failedAt?.toString().startsWith(today)) {
          tasks.push(task);
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Directory doesn't exist
  }

  return tasks;
}

async function getCostData(root: string, today: string): Promise<CostSummary> {
  const auditPath = path.join(root, "agent/state/audit.jsonl");
  let vertexAI = 0;
  let total = 0;

  try {
    const content = await readFile(auditPath, "utf8");
    const lines = content.trim().split("\n");

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.detail?.cost && entry.timestamp?.startsWith(today)) {
          if (entry.detail.costVertexAI) {
            vertexAI += entry.detail.costVertexAI;
          }
          total += entry.detail.cost;
        }
      } catch {
        continue;
      }
    }
  } catch {
    // File doesn't exist
  }

  return { vertexAI, total };
}

function calculateAverageTime(tasks: TaskInfo[]): number {
  if (tasks.length === 0) return 0;
  const total = tasks.reduce((sum, task) => sum + (task.duration || 0), 0);
  return total / tasks.length;
}

function countByType(tasks: TaskInfo[], type: string): number {
  return tasks.filter((task) => task.type === type || task.title?.toLowerCase().includes(type)).length;
}

function generateWarnings(queueStats: { queued: number; running: number }, costData: CostSummary): string[] {
  const warnings: string[] = [];

  if (queueStats.queued > 100) {
    warnings.push(`High queue: ${queueStats.queued} tasks pending`);
  }

  if (costData.vertexAI > 100) {
    warnings.push(`High cost: Vertex AI $${costData.vertexAI.toFixed(2)}`);
  }

  if (warnings.length === 0) {
    warnings.push("None");
  }

  return warnings;
}

export async function getCostSummary(root: string): Promise<CostSummary> {
  const today = new Date().toISOString().split("T")[0];
  return getCostData(root, today);
}
