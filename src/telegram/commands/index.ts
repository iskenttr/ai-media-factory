import TelegramBot from "node-telegram-bot-api";
import { formatStart, formatHelp, formatStatus, formatSystem, formatQueue, formatToday, formatErrors, formatCost, formatLogs, formatVersion } from "../formatters/markdown";
import { getSystemStatus } from "../services/system";
import { getServerMetrics } from "../services/metrics";
import { getQueueStats, getErrorReport } from "../services/system";
import { getDailyReport, getCostSummary } from "../services/report";
import { getRecentLogs, getSystemLogs, logTelegramCommand } from "../services/log";
import { getVersionInfo } from "../services/version";
import type { TelegramCommand } from "../types";

export function registerCommands(bot: TelegramBot, root: string): void {
  const startTime = Date.now();

  bot.onText(/\/start/, async (msg) => {
    await logCommand(root, msg, "/start", startTime);
    await bot.sendMessage(msg.chat.id, formatStart(), { parse_mode: "Markdown" });
  });

  bot.onText(/\/help/, async (msg) => {
    await logCommand(root, msg, "/help", startTime);
    await bot.sendMessage(msg.chat.id, formatHelp(), { parse_mode: "Markdown" });
  });

  bot.onText(/\/status/, async (msg) => {
    const cmdStart = Date.now();
    try {
      const status = await getSystemStatus(root);
      await bot.sendMessage(msg.chat.id, formatStatus(status), { parse_mode: "Markdown" });
    } catch {
      await bot.sendMessage(msg.chat.id, "❌ Failed to get system status");
    }
    await logCommand(root, msg, "/status", cmdStart);
  });

  bot.onText(/\/system/, async (msg) => {
    const cmdStart = Date.now();
    try {
      const metrics = await getServerMetrics();
      await bot.sendMessage(msg.chat.id, formatSystem(metrics), { parse_mode: "Markdown" });
    } catch {
      await bot.sendMessage(msg.chat.id, "❌ Failed to get server metrics");
    }
    await logCommand(root, msg, "/system", cmdStart);
  });

  bot.onText(/\/queue/, async (msg) => {
    const cmdStart = Date.now();
    try {
      const stats = await getQueueStats(root);
      await bot.sendMessage(msg.chat.id, formatQueue(stats), { parse_mode: "Markdown" });
    } catch {
      await bot.sendMessage(msg.chat.id, "❌ Failed to get queue statistics");
    }
    await logCommand(root, msg, "/queue", cmdStart);
  });

  bot.onText(/\/today/, async (msg) => {
    const cmdStart = Date.now();
    try {
      const report = await getDailyReport(root);
      await bot.sendMessage(msg.chat.id, formatToday(report), { parse_mode: "Markdown" });
    } catch {
      await bot.sendMessage(msg.chat.id, "❌ Failed to generate daily report");
    }
    await logCommand(root, msg, "/today", cmdStart);
  });

  bot.onText(/\/errors/, async (msg) => {
    const cmdStart = Date.now();
    try {
      const report = await getErrorReport(root);
      await bot.sendMessage(msg.chat.id, formatErrors(report), { parse_mode: "Markdown" });
    } catch {
      await bot.sendMessage(msg.chat.id, "❌ Failed to get error report");
    }
    await logCommand(root, msg, "/errors", cmdStart);
  });

  bot.onText(/\/cost/, async (msg) => {
    const cmdStart = Date.now();
    try {
      const summary = await getCostSummary(root);
      await bot.sendMessage(msg.chat.id, formatCost(summary), { parse_mode: "Markdown" });
    } catch {
      await bot.sendMessage(msg.chat.id, "❌ Failed to get cost summary");
    }
    await logCommand(root, msg, "/cost", cmdStart);
  });

  bot.onText(/\/logs/, async (msg) => {
    const cmdStart = Date.now();
    try {
      const [commandLogs, systemLogs] = await Promise.all([
        getRecentLogs(root, 5),
        getSystemLogs(root, 10),
      ]);
      const allLogs = [...commandLogs, ...systemLogs];
      await bot.sendMessage(msg.chat.id, formatLogs(allLogs), { parse_mode: "Markdown" });
    } catch {
      await bot.sendMessage(msg.chat.id, "❌ Failed to get logs");
    }
    await logCommand(root, msg, "/logs", cmdStart);
  });

  bot.onText(/\/version/, async (msg) => {
    const cmdStart = Date.now();
    try {
      const info = await getVersionInfo();
      await bot.sendMessage(msg.chat.id, formatVersion(info), { parse_mode: "Markdown" });
    } catch {
      await bot.sendMessage(msg.chat.id, "❌ Failed to get version info");
    }
    await logCommand(root, msg, "/version", cmdStart);
  });
}

async function logCommand(
  root: string,
  msg: import("node-telegram-bot-api").Message,
  command: string,
  startTime: number
): Promise<void> {
  if (!msg.from) return;

  const telegramCommand: TelegramCommand = {
    command,
    userId: msg.from.id,
    username: msg.from.username,
    chatId: msg.chat.id,
    timestamp: new Date(),
    executionTime: Date.now() - startTime,
  };

  await logTelegramCommand(root, telegramCommand);
}
