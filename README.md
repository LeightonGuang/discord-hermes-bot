# Hermes Discord Bot

> A Discord assistant with AI-powered thread routing, session notifications, and job search reporting — powered by a local LLM.

---

## Features

- Smart Thread Routing — Automatically classifies incoming messages into topics and creates Discord threads
- AI Chat Responses — Replies to @mentions with responses from your local LLM (Ollama / LM Studio / llama.cpp)
- Session Notifications — Embeds sent when Hermes agent sessions start and end (via webhook)
- Session Status — View your active Hermes agent sessions via `/hermes-status`
- Notification Controls — Toggle session notification alerts on/off via `/notifications`
- Status Channel Updates — Voice channel names update in real-time to show bot status (online / running)

---

## How It Works

```
+-----------------+         +--------------------+
|  You in Discord |-------->|   Main Bot         |
|                 |         |   (index.ts)       |
|  @mention bot   |-------->|   - Thread routing |
|  /hermes-status |-------->|   - AI chat        |
|  /notifications |-------->|   - Session embeds |
+-----------------+         +--------+-----------+
                                     |
                                     | HTTP POST (webhook)
                                     v
                        +------------------+
                        |  Hermes Agent    |
                        |  (Python)        |
                        |  fires:          |
                        |  on_session_start|
                        |  on_session_end  |
                        +------------------+
                                     |
                                     |  +-----------------+
                                     +->|  /session-start |
                                        |  /session-end   |
                                        +-----------------+
```

The bot runs as a **single Node.js process** with two subsystems:
1. **Discord client** (discord.js) — listens for messages, creates threads, replies via AI
2. **HTTP server** (port 3001) — receives webhook events from Hermes about session lifecycle

The **job messenger** (`runJob.ts`) is a separate process that shares state via `pending_jobs.json` and uses a `bot_is_running.txt` lock file to avoid double-runs.

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js (ESM) + TypeScript |
| Discord SDK | discord.js v14 |
| AI Model | Qwen 3.6-35B-A3B (Mac Mini M6, 32GB) |
| Database | SQLite (Hermes state integration) |
| Job Scraping | Cheerio + Axios (DuckDuckGo) |

---

## Installation

### Prerequisites

- Node.js 18+
- A local AI model (Qwen 3.6-35B-A3B recommended)
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
| `DISCORD_TOKEN` | Yes | Your Discord bot token |
| `CLIENT_ID` | Yes | Your Discord application ID |
| `GUILD_ID` | Yes | Your Discord guild/server ID |
| `LOCAL_AI_ENDPOINT` | Yes | Your local LLM API URL (e.g. `http://localhost:11434`) |
| `LOCAL_AI_MODEL` | Yes | Model name (e.g. `llama3.2`) |
| `TARGET_CHANNEL_ID` | Yes | Channel to monitor for messages |
| `DAILY_JOBS_CHANNEL_ID` | Yes | Channel for job search reports |
| `STATUS_CHANNEL_ID` | Yes | Voice channel for status display |
| `NOTIFICATION_CHANNEL_ID` | Yes | Voice channel for notification status |
| `REMINDER_CHANNEL_ID` | Yes | Channel for session/activity reminders |

---

## Commands

| Command | Description |
|---------|-------------|
| `/notifications` | Toggle task notification alerts (with enable/disable buttons) |
| `/hermes-status` | Display your active Hermes agent sessions |

---

## CLI Utilities

| Command | Description |
|---------|-------------|
| `npm run job-search` | Run the job messenger manually — scrapes, ranks, and posts to Discord |
| `npm run report-task` | CLI utility to trigger a task report via Discord |
| `npm run auto-configure` | Interactive setup wizard |

---

## Bot Architecture

### Main Bot + Webhook

```
Main Bot (index.ts)
+-- Discord client (discord.js)
|   +-- Message listener -> AI classification -> Thread creation
|   +-- @mention handler -> local LLM -> reply
|   +-- /hermes-status -> queries state.db -> embed
+-- HTTP server (localhost:3001)
|   +-- POST /session-start -> "running" embed
|   +-- POST /session-end -> "complete" embed
+-- Settings (src/config/settings.json)
    +-- notificationsEnabled flag
```

### Job Messenger (Standalone)

```
Hermes Agent (job-researcher skill)
     |
     v
pending_jobs.json  <--  shared file
     |
     v
runJob.ts  <--  job messenger (runs independently)
     |
     v
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
│   ├── index.ts           # Main bot (chat + threads + webhooks)
│   ├── deploy-commands.ts # Slash command registration
│   ├── jobs/
│   │   ├── runJob.ts      # Job messenger (standalone process)
│   │   └── jobService.ts  # Job scraping + AI extraction
│   ├── config/
│   │   └── settings.json  # Persisted bot settings
│   └── utils/
│       ├── reportTask.ts  # CLI task report utility
│       └── auto_configure.ts # Interactive setup wizard
├── .env.example
├── package.json
└── tsconfig.json
```

---

## License

ISC
