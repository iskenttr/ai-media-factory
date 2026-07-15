import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

async function jsonFiles(directory: string) {
  try { return (await readdir(directory)).filter((file) => file.endsWith(".json")); } catch { return []; }
}

async function lineCount(file: string, pattern?: string) {
  try {
    const lines = (await readFile(file, "utf8")).split("\n").filter(Boolean);
    return pattern ? lines.filter((line) => line.includes(pattern)).length : lines.length;
  } catch { return 0; }
}

export async function writeDashboardSnapshot(root: string) {
  const taskRoot = path.join(root, "agent/tasks");
  const prepared = await jsonFiles(path.join(taskRoot, "prepared"));
  const snapshot = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    taskStatus: {
      queued: (await jsonFiles(path.join(taskRoot, "queue"))).length,
      processing: (await jsonFiles(path.join(taskRoot, "processing"))).length,
      completed: (await jsonFiles(path.join(taskRoot, "completed"))).length,
      failed: (await jsonFiles(path.join(taskRoot, "failed"))).length,
      blocked: (await jsonFiles(path.join(taskRoot, "blocked"))).length,
    },
    testHealth: { source: "task test-report.json artifacts" },
    benchmarkHealth: { source: "task benchmark-report.json artifacts" },
    subtitleQuality: { source: "task quality-report.json artifacts" },
    renderPerformance: { source: "task render-report.json and ffmpeg.log artifacts" },
    modelUsage: { callsRecorded: await lineCount(path.join(root, "agent/state/model-usage.jsonl")) },
    agentErrors: { count: await lineCount(path.join(root, "agent/state/audit.jsonl"), "task_exception") },
    securityEvents: { count: await lineCount(path.join(root, "agent/state/audit.jsonl"), "\"category\":\"security\"") },
    completedTasks: await jsonFiles(path.join(taskRoot, "completed")),
    queuedTasks: await jsonFiles(path.join(taskRoot, "queue")),
    recommendedTasks: prepared,
  };
  const directory = path.join(root, "agent/reports");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "dashboard-data.json"), `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 });
  return snapshot;
}
