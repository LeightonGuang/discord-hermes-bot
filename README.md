# Hermes Discord Bot

Node.js bot for my Discord server. Connects the Hermes agent to Discord.

**AI Model:** Qwen 3.6-35B-A3B on Mac Mini M6 32GB

## What it does

1. **Thread routing** — listens on `TARGET_CHANNEL_ID`, classifies messages with AI, creates threads
2. **AI chat** — replies to @mentions via local LLM
3. **Session notifications** — receives webhooks from Hermes on session start/end, posts embeds to reminder channel
4. **Job messenger** — standalone process that reads `pending_jobs.json` (written by Hermes agent) and posts job listings

## How Hermes talks to the bot

Two paths:

### File handoff (jobs)
```
Hermes agent (job-researcher skill)
       |
       v writes
pending_jobs.json
       |
       v read + delete
runJob.ts
       |
       v post
Discord channel
```

### Webhooks (sessions)
```
Hermes agent
       |
       v POST /session-start  or  POST /session-end
Bot HTTP server (localhost:3001)
       |
       v send embed
Discord reminder channel
```

## Project structure

```
src/
├── index.ts              # Main bot — Discord client + webhook server
├── deploy-commands.ts    # Registers slash commands
├── jobs/
│   ├── runJob.ts         # Job messenger (standalone process)
│   └── jobService.ts     # Scrapes DuckDuckGo, ranks with AI
├── config/
│   └── settings.json     # { "notificationsEnabled": true }
└── utils/
    ├── reportTask.ts     # CLI task report
    └── auto_configure.ts # Interactive setup wizard
```

## Environment variables

All in `.env` (see `.env.example` for structure):

| Variable | Used by | Purpose |
|----------|---------|---------|
| `DISCORD_TOKEN` | both | Bot authentication |
| `CLIENT_ID` | deploy-commands.ts | Discord app ID |
| `GUILD_ID` | deploy-commands.ts | Server ID |
| `LOCAL_AI_ENDPOINT` | both | e.g. `http://127.0.0.1:60597/v1` |
| `LOCAL_AI_MODEL` | both | Model name |
| `TARGET_CHANNEL_ID` | index.ts | Channel to monitor for messages |
| `DAILY_JOBS_CHANNEL_ID` | runJob.ts | Channel for job reports |
| `STATUS_CHANNEL_ID` | runJob.ts | Voice channel for status display |
| `NOTIFICATION_CHANNEL_ID` | runJob.ts | Voice channel for notification status |
| `REMINDER_CHANNEL_ID` | both | Channel for session reminders |

## Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript |
| `npm start` | Run main bot |
| `npm run dev` | Run main bot with hot reload (tsx) |
| `npm run job-search` | Run job messenger manually |
| `npm run deploy` | Register slash commands |
| `npm run report-task` | CLI task report |

## Notes

- `pending_jobs.json` is gitignored — handoff file between Hermes agent and bot
- `bot_is_running.txt` is a lock file to prevent double-runs
- `settings.json` persists notification toggle state
- `src/threads.json` stores thread ID mappings
- Bot webhooks run on hardcoded port 3001 — configure Hermes outbound webhook accordingly
- `runJob.ts` has its own Discord client (separate process from main bot)
