import TelegramBot from "node-telegram-bot-api";
import { registerCommands } from "./commands";
import { authMiddleware } from "./middleware/auth";
import { notificationService } from "./services/notification";
import { getServerMetrics } from "./services/metrics";
import type { NotificationPayload } from "./types";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TELEGRAM_BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN environment variable is required");
  process.exit(1);
}

const ROOT_DIR = process.env.AMF_ROOT || process.cwd();

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, {
  polling: true,
});

console.log("🤖 AI Media Factory Telegram Bot started");

authMiddleware(bot);

registerCommands(bot, ROOT_DIR);

setupAutomaticNotifications();

bot.on("polling_error", (error) => {
  console.error("Polling error:", error);
});

bot.on("error", (error) => {
  console.error("Bot error:", error);
});

process.on("SIGINT", () => {
  console.log("\nShutting down bot...");
  bot.stopPolling();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\nShutting down bot...");
  bot.stopPolling();
  process.exit(0);
});

function setupAutomaticNotifications(): void {
  const adminIds = (process.env.TELEGRAM_ADMIN_IDS || "")
    .split(",")
    .map((id) => parseInt(id.trim(), 10))
    .filter((id) => !isNaN(id));

  if (adminIds.length === 0) {
    console.log("No admin IDs configured for automatic notifications");
    return;
  }

  notificationService.onNotification(async (payload: NotificationPayload) => {
    for (const adminId of adminIds) {
      try {
        await bot.sendMessage(adminId, payload.message, { parse_mode: "Markdown" });
      } catch (err) {
        console.error(`Failed to send notification to ${adminId}:`, err);
      }
    }
  });

  startMonitoring(adminIds);
}

let lastCpuNotification = 0;
const CPU_THRESHOLD = 90;
const CPU_COOLDOWN_MS = 5 * 60 * 1000;

async function startMonitoring(_adminIds: number[]): Promise<void> {
  const checkInterval = 60 * 1000;

  setInterval(async () => {
    try {
      const metrics = await getServerMetrics();

      if (metrics.cpuUsage > CPU_THRESHOLD) {
        const now = Date.now();
        if (now - lastCpuNotification > CPU_COOLDOWN_MS) {
          lastCpuNotification = now;
          await notificationService.notifyHighCpu(metrics.cpuUsage);
        }
      }

      if (metrics.diskUsage > 90) {
        await notificationService.notifyLowDisk(100 - metrics.diskUsage);
      }
    } catch (err) {
      console.error("Monitoring check failed:", err);
    }
  }, checkInterval);
}

export { bot };
