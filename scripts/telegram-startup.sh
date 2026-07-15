#!/bin/bash
# Telegram Bot - Google Compute Engine Startup Script
# Bu script'i VM'in startup script olarak ayarla

set -e

# Environment variables (Metadata'dan alınabilir)
# TELEGRAM_BOT_TOKEN - Bot token
# TELEGRAM_ADMIN_IDS - Admin ID'ler

# Log
echo "🤖 AI Media Factory Telegram Bot starting..." | tee /var/log/telegram-bot.log

# Bot process'i başlat
cd /opt/ai-media-factory

# Environment dosyasından yükle
if [ -f /opt/ai-media-factory/.env ]; then
    export $(grep -v '^#' /opt/ai-media-factory/.env | xargs)
fi

# PM2 ile başlat
pm2 start npm --name "telegram-bot" -- start "npm run bot" || npm run bot

echo "✅ Bot started successfully" | tee -a /var/log/telegram-bot.log
