import type { SystemStatus, ServerMetrics, QueueStats, DailyReport, ErrorReport, CostSummary } from "../types";

export function formatStart(): string {
  return `*🤖 AI Media Factory Bot*

Welcome! I'm your operations monitoring assistant.

Use /help to see all available commands.`;
}

export function formatHelp(): string {
  return `*📚 Available Commands*

*Status & Monitoring*
• /start - Start the bot
• /help - Show this help message
• /status - System status overview
• /system - Detailed server metrics

*Reports*
• /today - Daily summary report
• /queue - Queue statistics
• /errors - Last 20 failed jobs
• /cost - Cost summary

*System*
• /logs - Recent system logs
• /version - Application version`;
}

export function formatStatus(status: SystemStatus): string {
  const heartbeat = status.lastHeartbeat
    ? new Date(status.lastHeartbeat).toLocaleString()
    : "Never";

  const uptime = formatUptime(status.uptime);

  return `*📊 System Status*

*Agent:* ${formatAgentStatus(status.agentStatus)}
*Queue:* ${status.queueSize} tasks
*Processing:* ${status.processingJobs} jobs
*Completed:* ${status.completedJobs} jobs
*Failed:* ${status.failedJobs} jobs

*Last Heartbeat:* ${heartbeat}
*Uptime:* ${uptime}`;
}

function formatAgentStatus(status: SystemStatus["agentStatus"]): string {
  switch (status) {
    case "running": return "🟢 Running";
    case "stopped": return "🔴 Stopped";
    case "error": return "🟡 Error";
  }
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);

  return parts.join(" ");
}

export function formatSystem(metrics: ServerMetrics): string {
  return `*🖥️ Server Metrics*

*CPU:* ${metrics.cpuUsage.toFixed(1)}%
*RAM:* ${metrics.ramUsage.toFixed(1)}%
*Disk:* ${metrics.diskUsage.toFixed(1)}%
*Load Avg:* ${metrics.loadAverage.map((l) => l.toFixed(2)).join(", ")}

*OS:* ${metrics.os}
*Node:* ${metrics.nodeVersion}
*Hostname:* ${metrics.hostname}`;
}

export function formatQueue(stats: QueueStats): string {
  const avgWait = formatDuration(stats.averageWaitingTime);

  return `*📋 Queue Statistics*

*Queued:* ${stats.queued}
*Running:* ${stats.running}
*Completed Today:* ${stats.completedToday}
*Failed Today:* ${stats.failedToday}
*Avg Wait Time:* ${avgWait}`;
}

export function formatToday(report: DailyReport): string {
  const costLines = [`*Today's Cost:*`];
  if (report.costSummary.vertexAI > 0) {
    costLines.push(`Vertex AI $${report.costSummary.vertexAI.toFixed(2)}`);
  }
  if (report.costSummary.total > 0 && report.costSummary.vertexAI !== report.costSummary.total) {
    costLines.push(`Total $${report.costSummary.total.toFixed(2)}`);
  }

  const warningLines = report.warnings.length > 0
    ? report.warnings.map((w) => `• ${w}`)
    : ["None"];

  return `*🤖 AI MEDIA FACTORY*

*Videos:* ${report.videosProcessed}
*Success:* ${report.successfulJobs}
*Failed:* ${report.failedJobs}

*CPU:* ${report.queueSummary.running > 0 ? "Active" : "Idle"}

${costLines.join("\n")}

*Warnings:*
${warningLines.join("\n")}`;
}

export function formatErrors(report: ErrorReport): string {
  if (report.errors.length === 0) {
    return "*✅ No errors to display*";
  }

  const lines = ["*❌ Error Report*\n"];
  lines.push(`Showing ${report.errors.length} of ${report.total} errors\n`);

  for (const error of report.errors) {
    const time = new Date(error.timestamp).toLocaleString();
    const message = error.errorMessage.length > 100
      ? error.errorMessage.substring(0, 100) + "..."
      : error.errorMessage;
    const retries = error.retryCount > 0 ? ` (${error.retryCount} retries)` : "";

    lines.push(`*${error.taskId}*${retries}`);
    lines.push(`${time}`);
    lines.push(`${message}`);
    lines.push("");
  }

  return lines.join("\n");
}

export function formatCost(summary: CostSummary): string {
  return `*💰 Cost Summary*

*Vertex AI:* $${summary.vertexAI.toFixed(2)}
*Total:* $${summary.total.toFixed(2)}

*Note:* Estimates based on current billing cycle.`;
}

export function formatLogs(logs: string[]): string {
  if (logs.length === 0) {
    return "*📝 No recent logs*";
  }

  const lines = ["*📝 Recent Logs*\n"];
  for (const log of logs.slice(0, 10)) {
    lines.push(log);
  }

  if (logs.length > 10) {
    lines.push(`\n... and ${logs.length - 10} more`);
  }

  return lines.join("\n");
}

export function formatVersion(info: { version: string; commit: string; buildDate: string }): string {
  return `*ℹ️ Version Info*

*Version:* ${info.version}
*Commit:* ${info.commit.substring(0, 8)}
*Build Date:* ${info.buildDate}`;
}

export function formatUnauthorized(): string {
  return "⛔ *Unauthorized.*\n\nYou are not authorized to use this bot.";
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}
