# discord-hermes-bot

My Discord bot. Connects the Hermes agent to my server.

Runs on my Mac Mini M6 32GB using Qwen 3.6-35B-A3B as the AI model.

## What it actually does

- Listens on one channel, looks at messages, classifies them and creates threads based on topic
- When I @mention it, calls my local AI and replies with the answer
- Gets told by Hermes (via webhook) when a session starts/ends, posts a little message in my reminder channel
- Separately, runs a job scraper that pulls from DuckDuckGo, ranks listings with AI, posts to Discord

## How Hermes and the bot talk

Two ways:

**Jobs** — Hermes writes `pending_jobs.json`, the bot reads it and deletes it. One-way file drop.

**Sessions** — Hermes POSTs to the bot's server on port 3001 (`/session-start`, `/session-end`). Bot sends embed to Discord.

## Structure

```
src/
├── index.ts              # Main bot — handles Discord + webhook server on port 3001
├── deploy-commands.ts    # Registers /notifications and /hermes-status
├── jobs/
│   ├── runJob.ts         # Job scraper (separate process, has its own Discord client)
│   └── jobService.ts     # DuckDuckGo scraping + AI ranking
├── config/
│   └── settings.json     # stores notificationsEnabled: true/false
└── utils/
    ├── reportTask.ts     # CLI helper
    └── auto_configure.ts # setup wizard (don't need this anymore tbh)
```

## Environment

Everything in `.env`. `LOCAL_AI_ENDPOINT` is my Mac Mini, `LOCAL_AI_MODEL` is the Qwen model name.

The Discord token and channel IDs are straightforward — there's a target channel for messages, a jobs channel, three voice channels for status, and a reminder channel.

## Running it

- `npm run dev` — development, hot reload with tsx
- `npm start` — production, compiled JS
- `npm run job-search` — manually trigger a job run
- `npm run deploy` — register slash commands (once)

## Stuff to remember

- `pending_jobs.json` is the handoff from Hermes — gitignored, transient
- `bot_is_running.txt` is a lock so the job scraper doesn't run twice
- `src/threads.json` maps topic names to thread IDs
- Port 3001 is hardcoded for webhooks — make sure Hermes points there
- The job messenger and main bot are two separate processes, each with their own Discord client
- `/notifications` toggles session alerts on/off, `/hermes-status` shows active sessions
