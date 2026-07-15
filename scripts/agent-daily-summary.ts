import { readFile } from "node:fs/promises";
import path from "node:path";
import { sendCompletionNotification } from "../agent/notifications/email";
import { writeDashboardSnapshot } from "../agent/orchestrator/dashboard";

async function main() {
  const root = path.resolve(process.env.AMF_AGENT_ROOT ?? process.cwd());
  await writeDashboardSnapshot(root);
  const dashboardPath = path.join(root, "agent/reports/dashboard-data.json");
  const dashboard = JSON.parse(await readFile(dashboardPath, "utf8")) as {
    taskStatus: { completed: number; failed: number; blocked: number };
    agentErrors: { count: number };
    recommendedTasks: string[];
  };
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const result = await sendCompletionNotification(root, {
    taskId: `DAILY-${date}`, taskTitle: "Daily autonomous engineering summary", status: "SUMMARY", branch: "n/a", commitHash: null, durationMs: 0,
    filesChanged: [], testResult: `completed=${dashboard.taskStatus.completed};failed=${dashboard.taskStatus.failed};blocked=${dashboard.taskStatus.blocked}`,
    renderResult: "See task artifacts", baselineQualityScore: null, candidateQualityScore: null, qualityDelta: null, criticalErrors: dashboard.agentErrors.count,
    artifactLocation: dashboardPath, recommendedNextTask: dashboard.recommendedTasks[0] ?? "No prepared task",
  });
  console.log(JSON.stringify(result));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
