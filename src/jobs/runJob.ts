import { Client, GatewayIntentBits, TextChannel, ChannelType } from 'discord.js';
import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { fileURLToPath } from 'url';
import { fetchAndRankJobs, type Job } from './jobService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BOT_ROOT = path.resolve(__dirname, '../../');
const PENDING_JOBS_FILE = path.join(BOT_ROOT, 'pending_jobs.json');
const RUNNING_FILE = path.join(BOT_ROOT, 'bot_is_running.txt');
const STATUS_CHANNEL_ID = process.env.STATUS_CHANNEL_ID as string;
const NOTIFICATION_CHANNEL_ID = process.env.NOTIFICATION_CHANNEL_ID as string;
const REMINDER_CHANNEL_ID = process.env.REMINDER_CHANNEL_ID as string;
const HERMES_DB_PATH = path.join(os.homedir(), '.hermes', 'state.db');

async function setChannelName(client: Client, channelId: string, name: string): Promise<void> {
  try {
    const channel = await client.channels.fetch(channelId) as TextChannel | null;
    if (channel && (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildVoice)) {
      await channel.setName(name);
    }
  } catch (err) {
    console.error(`Failed to update channel ${channelId}:`, err);
  }
}

async function getLastSessionTitle(): Promise<string | null> {
  try {
    const db = await open({
      filename: HERMES_DB_PATH,
      driver: sqlite3.Database,
    });
    const row = await db.get(
      `SELECT title FROM sessions WHERE archived = 0 AND ended_at IS NOT NULL ORDER BY last_activity_at DESC LIMIT 1`
    );
    await db.close();
    return row?.title || null;
  } catch (err) {
    console.error('Error reading Hermes session title:', err);
    return null;
  }
}

async function run() {
  const startTime = Date.now();
  console.log('🚀 Starting job messenger (Full Auto Mode)...');

  // Signal that we are running — main bot will see this and go offline
  try {
    await fs.writeFile(RUNNING_FILE, `${Date.now()}\n`);
  } catch (err) {
    console.error('Warning: Could not write running file:', err);
  }

  const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
  const DAILY_JOBS_CHANNEL_ID = process.env.DAILY_JOBS_CHANNEL_ID;

  if (!DISCORD_TOKEN || !DAILY_JOBS_CHANNEL_ID) {
    console.error('❌ ERROR: Missing DISCORD_TOKEN or DAILY_JOBS_CHANNEL_ID in .env');
    // Best-effort cleanup
    await fs.unlink(RUNNING_FILE).catch(() => {});
    process.exit(1);
  }

  // Load settings to know notification state
  const SETTINGS_FILE = path.join(BOT_ROOT, 'config/settings.json');
  let notificationsEnabled = true;
  try {
    const raw = await fs.readFile(SETTINGS_FILE, 'utf-8');
    const s = JSON.parse(raw);
    notificationsEnabled = s.notificationsEnabled ?? true;
  } catch (e) {
    console.log('Could not load settings, defaulting notifications to on');
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
    ],
  });

  client.once('ready', async () => {
    try {
      // Update status channel to "running"
      await setChannelName(client, STATUS_CHANNEL_ID, '⚡ Hermes status: running');
      // Update notification channel
      await setChannelName(
        client,
        NOTIFICATION_CHANNEL_ID,
        `Notification status: ${notificationsEnabled ? 'on' : 'off'}`
      );

      const targetChannel = await client.channels.fetch(DAILY_JOBS_CHANNEL_ID) as TextChannel | null;

      if (!targetChannel) {
        console.error('❌ ERROR: Target Discord channel not found.');
        await setChannelName(client, STATUS_CHANNEL_ID, '🟢 Hermes status: online');
        await fs.unlink(RUNNING_FILE).catch(() => {});
        process.exit(1);
      }

      // 1. Check for existing pending jobs first
      let jobs: Job[] = [];
      try {
        const existingData = await fs.readFile(PENDING_JOBS_FILE, 'utf-8');
        jobs = JSON.parse(existingData);
        console.log(`📂 Loaded ${jobs.length} existing jobs from ${PENDING_JOBS_FILE}.`);
      } catch (e) {
        console.log('ℹ️ No pending jobs file found, proceeding to search...');
      }

      if (jobs.length === 0) {
        console.log('🔍 Searching for jobs...');
        jobs = await fetchAndRankJobs();
        
        if (jobs.length === 0) {
          console.log('⚠️ No new jobs found today.');
          // Reset to online
          await setChannelName(client, STATUS_CHANNEL_ID, '🟢 Hermes status: online');
          await fs.unlink(RUNNING_FILE).catch(() => {});
          process.exit(0);
        }

        console.log(`📂 Found ${jobs.length} new jobs. Saving to ${PENDING_JOBS_FILE}...`);
        await fs.writeFile(PENDING_JOBS_FILE, JSON.stringify(jobs, null, 2));
      }

      // 2. Send to Discord
      const endTime = Date.now();
      const durationSeconds = ((endTime - startTime) / 1000).toFixed(2);

      // Header
      let header = `💼 Jobs found today\nProcessing time: ${durationSeconds}s\n\n`;
      
      const chunks: string[] = [];
      let currentChunk = header;

      for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];
        const rank = i + 1;
        const score = job.score ? `${job.score}/10` : 'N/A';
        const title = job.title || 'Unknown Job';
        const company = job.company || 'Unknown Company';
        const location = (job as any).location || 'Not specified';
        const workType = (job as any).work_type || 'Not specified';
        
        // CLEAN DESCRIPTION: Strip all whitespace/newlines AND remove any Markdown syntax
        const description = (job.description || 'No description provided.')
          .replace(/\[.*?\]\(.*?\)/g, '')
          .replace(/[*_~`#]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
          
        const link = job.link || '#';
        
        // Plain text link instead of Markdown link
        const jobBlock = `${rank}. ${title} @ ${company}\n` +
                         `${workType} | ${location}\n` +
                         `Score: ${score}\n` +
                         `Summary: ${description}\n` +
                         `Link: ${link}\n\n`;

        if ((currentChunk + jobBlock).length > 1900) {
          chunks.push(currentChunk);
          currentChunk = jobBlock;
        } else {
          currentChunk += jobBlock;
        }
      }
      
      if (currentChunk.trim()) {
        chunks.push(currentChunk);
      }

      for (const chunk of chunks) {
        await targetChannel.send(chunk);
      }

      console.log(`✅ Sent ${chunks.length} message(s) to Discord.`);

      await fs.unlink(PENDING_JOBS_FILE);
      console.log('🧹 Cleaned up pending_jobs.json');

      // Send session title to reminders channel if notifications are on
      if (notificationsEnabled) {
        try {
          const sessionTitle = await getLastSessionTitle();
          const reminderMsg = sessionTitle
            ? `🔔 Session complete\n\nTitle: ${sessionTitle}`
            : `🔔 Job messenger session complete`;
          const reminderChannel = await client.channels.fetch(REMINDER_CHANNEL_ID) as TextChannel | null;
          if (reminderChannel) {
            await reminderChannel.send(reminderMsg);
            console.log('✅ Reminder sent to Discord.');
          } else {
            console.log('⚠️ Reminder channel not found, skipping reminder.');
          }
        } catch (err) {
          console.error('❌ Error sending reminder:', err);
        }
      }

      // Reset status back to online
      await setChannelName(client, STATUS_CHANNEL_ID, '🟢 Hermes status: online');
      await fs.unlink(RUNNING_FILE).catch(() => {});

    } catch (error) {
      console.error('❌ Error during Discord transmission:', error);
      // Still try to clean up
      await setChannelName(client, STATUS_CHANNEL_ID, '🟢 Hermes status: online').catch(() => {});
      await fs.unlink(RUNNING_FILE).catch(() => {});
      process.exit(1);
    } finally {
      await client.destroy();
    }
  });

  await client.login(DISCORD_TOKEN);
}

run().catch(async (err) => {
  console.error('Fatal:', err);
  await fs.unlink(RUNNING_FILE).catch(() => {});
  process.exit(1);
});
