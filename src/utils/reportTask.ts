import { Client, GatewayIntentBits } from 'discord.js';
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Settings Management ---
const SETTINGS_FILE = path.join(__dirname, '../config/settings.json');

interface Settings {
  notificationsEnabled: boolean;
}

function loadSettings(): Settings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Error loading settings:', err);
  }
  return { notificationsEnabled: true };
}
// ---------------------------

async function report(taskName: string, duration: string) {
  const settings = loadSettings();
  
  // If notifications are disabled, exit silently
  if (!settings.notificationsEnabled) {
    console.log(`Task "${taskName}" completed in ${duration}. (Notifications are currently DISABLED in settings)`);
    process.exit(0);
  }

  const TOKEN = process.env.DISCORD_TOKEN;
  const CHANNEL_ID = process.env.REMINDER_CHANNEL_ID;

  if (!TOKEN || !CHANNEL_ID) {
    console.error('❌ ERROR: Missing DISCORD_TOKEN or REMINDER_CHANNEL_ID in .env');
    process.exit(1);
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once('ready', async () => {
    try {
      const channel = await client.channels.fetch(CHANNEL_ID);
      if (channel && 'send' in channel) {
        await channel.send(`🤖 **Agent Task Complete**\n\n**Task:** ${taskName}\n**Time taken:** ${duration}`);
        console.log('✅ Report sent to Discord.');
      } else {
        console.error('❌ Error: Channel not found or cannot send messages.');
      }
    } catch (err) {
      console.error('❌ Error sending report:', err);
    } finally {
      await client.destroy();
      process.exit(0);
    }
  });

  client.login(TOKEN);
}

const taskName = process.argv[2];
const duration = process.argv[3];
const isSilent = process.argv.includes('--silent');

if (!taskName || !duration) {
  console.error('Usage: npm run report-task -- "<task_name>" "<duration>" [--silent]');
  process.exit(1);
}

if (isSilent) {
  console.log(`Task "${taskName}" completed in ${duration}. (Silent mode - no Discord message sent)`);
  process.exit(0);
}

report(taskName, duration);
