# Telegram Operations Bot

A production-ready Telegram bot for remote monitoring and reporting of AI Media Factory.

## Features

- **Real-time Monitoring**: Track agent status, queue size, and job progress
- **Daily Reports**: Get comprehensive daily summaries with cost tracking
- **Error Tracking**: View last 20 failed jobs with error details
- **System Metrics**: CPU, RAM, disk usage, and load averages
- **Automatic Notifications**: Alerts for job completion, failures, and system issues
- **Command Logging**: All bot commands are logged with execution times

## Setup

### Prerequisites

- Node.js 18+
- A Telegram bot token from [@BotFather](https://t.me/BotFather)

### Installation

1. Copy the example environment file:

```bash
cp .env.telegram.example .env
```

2. Edit `.env` and add your configuration:

```bash
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
TELEGRAM_ADMIN_IDS=123456789,987654321
```

3. Get your Telegram User ID:

   - Start a chat with [@userinfobot](https://t.me/userinfobot)
   - Copy your user ID
   - Add it to `TELEGRAM_ADMIN_IDS` (comma-separated for multiple admins)

4. Start the bot:

```bash
npm run bot
```

### Running in Development

```bash
# Development mode with auto-reload
npx tsx watch src/telegram/bot.ts
```

### Running in Production

```bash
# Using PM2
pm2 start npm --name "telegram-bot" -- run bot

# Or with tsx
npx tsx src/telegram/bot.ts
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | Bot token from @BotFather |
| `TELEGRAM_ADMIN_IDS` | Yes | Comma-separated list of admin user IDs |
| `AMF_ROOT` | No | Root directory for AI Media Factory (defaults to cwd) |
| `TELEGRAM_WEBHOOK_MODE` | No | Enable webhook mode (requires HTTPS) |
| `TELEGRAM_WEBHOOK_URL` | No | HTTPS URL for webhook endpoint |

## Commands

### Status & Monitoring

| Command | Description |
|---------|-------------|
| `/start` | Start the bot and show welcome message |
| `/help` | Show all available commands |
| `/status` | System status overview (agent, queue, jobs) |
| `/system` | Detailed server metrics (CPU, RAM, disk) |

### Reports

| Command | Description |
|---------|-------------|
| `/today` | Daily summary report with cost tracking |
| `/queue` | Queue statistics (queued, running, completed) |
| `/errors` | Last 20 failed jobs with error details |
| `/cost` | Cost summary for current billing cycle |

### System

| Command | Description |
|---------|-------------|
| `/logs` | Recent system and command logs |
| `/version` | Application version information |

## Automatic Notifications

The bot sends automatic notifications to admin users when:

| Event | Trigger | Message |
|-------|---------|---------|
| Job Completed | Task finishes successfully | Task title and ID |
| Job Failed | Task encounters error | Task title, ID, and error |
| Queue Blocked | Queue cannot process | Reason for block |
| Agent Offline | No heartbeat for 5+ minutes | Agent status |
| High CPU | CPU usage > 90% | CPU percentage |
| Low Disk | Disk usage > 90% | Free space percentage |
| Deployment | New version deployed | Version number |

## Architecture

```
src/telegram/
├── bot.ts              # Main bot entry point
├── index.ts            # Module exports
├── types.ts            # TypeScript interfaces
├── commands/
│   └── index.ts        # Command handlers
├── services/
│   ├── metrics.ts      # Server metrics collection
│   ├── notification.ts # Notification service
│   ├── report.ts       # Daily report generation
│   ├── system.ts       # System status queries
│   ├── log.ts          # Command logging
│   └── version.ts      # Version info
├── formatters/
│   ├── markdown.ts      # Markdown message formatters
│   └── markdown.test.ts
└── middleware/
    ├── auth.ts         # Admin authorization
    └── index.ts        # Middleware utilities
```

## Command Logging

Every command execution is logged to `agent/state/telegram-commands.jsonl` with:

```json
{
  "command": "/status",
  "userId": 123456789,
  "username": "johndoe",
  "chatId": 123456789,
  "timestamp": "2024-01-15T10:30:00.000Z",
  "executionTime": 150
}
```

## Troubleshooting

### Bot not responding

1. Check the bot token is correct
2. Verify `TELEGRAM_ADMIN_IDS` contains your user ID
3. Check the bot has been started with `/start`

### Unauthorized messages

- Ensure your Telegram user ID is in `TELEGRAM_ADMIN_IDS`
- Get your ID from [@userinfobot](https://t.me/userinfobot)

### Polling errors

The bot uses long polling by default. For production, consider:

1. Using webhook mode with a valid HTTPS endpoint
2. Running behind a process manager (PM2)
3. Setting up proper logging

### No data showing

- Ensure `AMF_ROOT` points to the correct AI Media Factory directory
- Check that `agent/tasks/` directory exists and has proper permissions

## Security

- All admin commands require authorization via `TELEGRAM_ADMIN_IDS`
- Bot token is never hardcoded (always use environment variables)
- All command executions are logged with user information
- Unauthorized access attempts are logged and rejected

## Deployment to Google Cloud

### Option 1: Google Cloud Run (Recommended)

1. GCP projesinde Cloud Run API'sini etkinleştir:
```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com
```

2. Docker imajını build et ve deploy et:
```bash
export TELEGRAM_BOT_TOKEN="your_token"
export TELEGRAM_ADMIN_IDS="your_admin_id"
export GCP_PROJECT_ID="your-project-id"

./scripts/deploy-telegram.sh
```

### Option 2: Google Compute Engine

1. VM oluştur (Debian/Ubuntu):
```bash
gcloud compute instances create telegram-bot \
  --zone=europe-west1-b \
  --machine-type=e2-medium \
  --image-family=debian-12 \
  --image-project=debian-cloud \
  --tags=http-server
```

2. VM'e SSH ile bağlan ve projeyi klonla:
```bash
git clone https://github.com/iskenttr/ai-media-factory.git
cd ai-media-factory
npm install
```

3. Environment değişkenlerini ayarla:
```bash
export TELEGRAM_BOT_TOKEN="your_token"
export TELEGRAM_ADMIN_IDS="your_admin_id"
```

4. PM2 ile başlat:
```bash
npm install -g pm2
pm2 start npm --name "telegram-bot" -- start "npm run bot"
pm2 save
pm2 startup
```

### Option 3: Systemd Service

```bash
sudo nano /etc/systemd/system/telegram-bot.service
```

```ini
[Unit]
Description=AI Media Factory Telegram Bot
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/ai-media-factory
Environment=TELEGRAM_BOT_TOKEN=your_token
Environment=TELEGRAM_ADMIN_IDS=your_admin_id
ExecStart=/usr/bin/npm run bot
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable telegram-bot
sudo systemctl start telegram-bot
```

## License

Same as AI Media Factory project.
