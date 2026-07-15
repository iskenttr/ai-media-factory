import { readFile } from "node:fs/promises";
import path from "node:path";
import type { TelegramCommand } from "../types";

const LOG_FILE = "agent/state/telegram-commands.jsonl";

export async function logTelegramCommand(
  root: string,
  command: TelegramCommand
): Promise<void> {
  const logPath = path.join(root, LOG_FILE);
  const logEntry = JSON.stringify(command) + "\n";

  try {
    const { appendFile, mkdir } = await import("node:fs/promises");
    await mkdir(path.dirname(logPath), { recursive: true });
    await appendFile(logPath, logEntry, { encoding: "utf8", flag: "a" });
  } catch (error) {
    console.error("Failed to log Telegram command:", error);
  }
}

export async function getRecentLogs(root: string, limit = 50): Promise<string[]> {
  const logsPath = path.join(root, LOG_FILE);
  const logs: string[] = [];

  try {
    const content = await readFile(logsPath, "utf8");
    const lines = content.trim().split("\n").filter(Boolean);

    for (const line of lines.slice(-limit)) {
      try {
        const entry = JSON.parse(line);
        const time = new Date(entry.timestamp).toLocaleTimeString();
        const user = entry.username || entry.userId;
        const cmd = entry.command;
        const execTime = entry.executionTime?.toFixed(0) || "0";

        logs.push(`[${time}] ${user}: /${cmd} (${execTime}ms)`);
      } catch {
        continue;
      }
    }
  } catch {
    // File doesn't exist
  }

  return logs;
}

export async function getSystemLogs(root: string, limit = 20): Promise<string[]> {
  const auditPath = path.join(root, "agent/state/audit.jsonl");
  const logs: string[] = [];

  try {
    const content = await readFile(auditPath, "utf8");
    const lines = content.trim().split("\n").filter(Boolean);

    for (const line of lines.slice(-limit)) {
      try {
        const entry = JSON.parse(line);
        const time = new Date(entry.timestamp).toLocaleTimeString();
        const event = entry.event;
        const taskId = entry.taskId || "-";

        logs.push(`[${time}] ${taskId}: ${event}`);
      } catch {
        continue;
      }
    }
  } catch {
    // File doesn't exist
  }

  return logs;
}
