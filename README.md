# 🤖 Hermes Discord Bot

> An intelligent Discord assistant with AI-powered thread management and automated job search reporting.

---

## Features

- **🧵 Smart Thread Routing** — Automatically classifies messages into topics and creates Discord threads using a local AI model
- **💬 AI Chat Responses** — Replies to mentions with responses from your own local LLM (no third-party APIs)
- **💼 Job Search Reports** — Standalone job messenger that scrapes, ranks, and posts relevant developer jobs to Discord
- **📊 Session Status** — View active Hermes agent sessions via `/hermes-status`
- **🔔 Notification Controls** — Toggle task notifications on/off via `/notifications`
- **⚡ Status Channel Updates** — Voice channel names update in real-time to show bot status

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js (ESM) + TypeScript |
| Discord SDK | discord.js v14 |
| AI Backend | Your own local LLM (Ollama / LM Studio / llama.cpp, etc.) |
| Database | SQLite (Hermes state integration) |
| Job Scraping | Cheerio + Axios (DuckDuckGo) |

---

## Installation

### Prerequisites

- Node.js 18+
- A local AI endpoint (e.g. [Ollama](https://ollama.ai), [LM Studio](https://lmstudio.ai))
- A Discord Bot Token ([Discord Developer Portal](https://discord.com/developers/applications))

### Setup

```bash
# Clone and install dependencies
git clone <your-repo>
cd discord-hermes-bot
npm install

# Create your environment file
cp .env.example .env
# (see .env.example for required variables)

# Register slash commands (once)
npm run deploy

# Build and run
npm run build
npm start

# Or run in dev mode with hot reload
npm run dev
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_TOKEN` | ✅ | Your Discord bot token |
| `CLIENT_ID` | ✅ | Your Discord application ID |
| `GUILD_ID` | ✅ | Your Discord guild/server ID |
| `LOCAL_AI_ENDPOINT` | ✅ | Your local LLM API URL (e.g. `http://localhost:11434`) |
| `LOCAL_AI_MODEL` | ✅ | Model name (e.g. `llama3.2`) |
| `TARGET_CHANNEL_ID` | ✅ | Channel to monitor for messages |
| `DAILY_JOBS_CHANNEL_ID` | ✅ | Channel for job search reports |
| `STATUS_CHANNEL_ID` | ✅ | Voice channel for status display |
| `NOTIFICATION_CHANNEL_ID` | ✅ | Voice channel for notification status |

---

## Commands

| Command | Description |
|---------|-------------|
| `/notifications` | Toggle task notification alerts (with enable/disable buttons) |
| `/hermes-status` | Display your active Hermes agent sessions |

---

## Bot Architecture

Hermes uses a **Handover pattern** — the main bot and job messenger share state via files:

```
Hermes Agent (skill)
     │
     ▼
pending_jobs.json  ←─  shared file
     │
     ▼
src/jobs/runJob.ts  ←──  job messenger (runs independently)
     │
     ▼
Discord channel (job listings)
```

The two processes coordinate via a `bot_is_running.txt` lock file to prevent double-runs.

---

## Slash Command Deployment

```bash
npm run deploy
```

This registers the bot's slash commands to your guild. Run it once after setup, or anytime you modify the commands list in `src/deploy-commands.ts`.

---

## Project Structure

```
discord-hermes-bot/
├── src/
│   ├── index.ts           # Main bot (chat + thread routing)
│   ├── deploy-commands.ts # Slash command registration
│   ├── jobs/
│   │   ├── runJob.ts      # Job messenger (standalone process)
│   │   └── jobService.ts  # Job scraping + AI extraction
│   ├── config/
│   │   └── settings.json  # Persisted bot settings
│   └── utils/             # CLI utilities
├── .env.example
├── package.json
└── tsconfig.json
```

---

## License

ISC
