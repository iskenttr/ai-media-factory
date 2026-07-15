import type { Middleware } from "./index";
import { notificationService } from "../services/notification";
import { formatUnauthorized } from "../formatters/markdown";

export function authMiddleware(bot: import("node-telegram-bot-api").default): Middleware {
  const adminIds = getAdminIds();

  if (adminIds.length > 0) {
    notificationService.setAdminIds(adminIds);
    console.log(`Telegram bot configured with ${adminIds.length} admin(s)`);
  }

  bot.on("message", (msg) => {
    if (!msg.text?.startsWith("/")) return;
    if (!msg.from) return;

    const userId = msg.from.id;

    if (adminIds.length > 0 && !adminIds.includes(userId)) {
      bot.sendMessage(msg.chat.id, formatUnauthorized(), { parse_mode: "Markdown" });
      console.warn(`Unauthorized access attempt from user ${userId} (${msg.from.username || "no username"})`);
    }
  });

  return async (ctx, next) => {
    if (!ctx.msg.from) {
      return;
    }

    const userId = ctx.msg.from.id;

    if (adminIds.length > 0 && !adminIds.includes(userId)) {
      return;
    }

    await next();
  };
}

function getAdminIds(): number[] {
  const envValue = process.env.TELEGRAM_ADMIN_IDS;
  if (!envValue) return [];

  return envValue
    .split(",")
    .map((id) => parseInt(id.trim(), 10))
    .filter((id) => !isNaN(id) && id > 0);
}
