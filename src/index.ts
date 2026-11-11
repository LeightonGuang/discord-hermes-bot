import { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, ButtonInteraction, SlashCommandBuilder } from 'discord.js';
import 'dotenv/config';
import axios from 'axios';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as http from 'http';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BOT_ROOT = path.resolve(__dirname, '..');

const RUNNING_FILE = path.join(BOT_ROOT, 'bot_is_running.txt');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// --- Settings Management ---
const SETTINGS_FILE = path.join(BOT_ROOT, 'src', 'config', 'settings.json');

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

function saveSettings(settings: Settings): void {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch (err) {
    console.error('Error saving settings:', err);
  }
}

let settings = loadSettings();
// --- Notification Helpers ---
const REMINDER_CHANNEL_ID = process.env.REMINDER_CHANNEL_ID as string;

async function sendToReminderChannel(title: string, description: string, color: number): Promise<void> {
  try {
    const settings = loadSettings();
    if (!settings.notificationsEnabled) return;

    const channel = await client.channels.fetch(REMINDER_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(color);

    const textChannel = channel as { send: (opts: { embeds: EmbedBuilder[] }) => Promise<any> };
    await textChannel.send({ embeds: [embed] });
  } catch (err) {
    console.error('Error sending to reminder channel:', err);
  }
}

async function sendSessionNotification(sessionId: string): Promise<void> {
  try {
    const dbPath = path.join(
      process.env.HERMES_HOME || path.join(os.homedir(), '.hermes'),
      'state.db'
    );
    if (!fs.existsSync(dbPath)) return;

    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    const session = await db.get(
      `SELECT title FROM sessions WHERE id = ?`,
      [sessionId]
    );
    await db.close();

    if (!session) return;

    const title = session.title || `Untitled session #${sessionId}`;
    const desc = `**Title:** ${title}\n**Status:** Completed`;

    await sendToReminderChannel('🔔 Session complete', desc, 0x00ff00);
    console.log(`✅ Session complete notification sent: ${title}`);
  } catch (err) {
    console.error('Error sending session notification:', err);
  }
}

async function sendStartNotification(sessionId: string, title: string | null): Promise<void> {
  try {
    const displayTitle = title || `Untitled session #${sessionId}`;
    const desc = `**Title:** ${displayTitle}\n**Status:** Running`;

    await sendToReminderChannel('🚀 Session running', desc, 0x0088ff);
    console.log(`✅ Session running notification sent: ${displayTitle}`);
  } catch (err) {
    console.error('Error sending start notification:', err);
  }
}

const LOCAL_AI_ENDPOINT = process.env.LOCAL_AI_ENDPOINT as string;
const LOCAL_AI_MODEL = process.env.LOCAL_AI_MODEL as string;
if (!LOCAL_AI_ENDPOINT || !LOCAL_AI_MODEL) {
  console.error('❌ ERROR: LOCAL_AI_ENDPOINT or LOCAL_AI_MODEL is not defined in your .env file.');
  process.exit(1);
}

const DISCORD_TOKEN = process.env.DISCORD_TOKEN as string;
if (!DISCORD_TOKEN) {
  console.error('❌ ERROR: DISCORD_TOKEN is not defined in your .env file.');
  process.exit(1);
}

const TARGET_CHANNEL_ID = process.env.TARGET_CHANNEL_ID as string;
if (!TARGET_CHANNEL_ID) {
  console.error('❌ ERROR: TARGET_CHANNEL_ID is not defined in your .env file.');
  process.exit(1);
}

const THREADS_FILE = path.join(BOT_ROOT, 'src', 'threads.json');

interface Classification {
  action: 'new' | 'existing' | 'none';
  topic_name: string | null;
  existing_topic_name: string | null;
}

interface ThreadsState {
  [key: string]: string;
}

function loadThreads(): ThreadsState {
  try {
    if (!fs.existsSync(THREADS_FILE)) return {};
    return JSON.parse(fs.readFileSync(THREADS_FILE, 'utf8'));
  } catch (err) {
    console.error('Error loading threads.json:', err);
    return {};
  }
}

function saveThreads(threads: ThreadsState): void {
  try {
    fs.writeFileSync(THREADS_FILE, JSON.stringify(threads, null, 2));
  } catch (err) {
    console.error('Error saving threads.json:', err);
  }
}

async function classifyTopic(content: string, currentTopics: string[]): Promise<Classification> {
  const topicsString = currentTopics.length > 0 ? currentTopics.join(', ') : 'None';
  
  try {
    const response = await axios.post(
      `${LOCAL_AI_ENDPOINT}/chat/completions`,
      {
        model: LOCAL_AI_MODEL,
        messages: [
          { 
            role: 'system', 
            content: `You are a Discord Topic Classifier. Your job is to decide if a message belongs to an existing topic or starts a new one.\\n            \\n            Current active topics: [${topicsString}]\\n            \\n            Respond ONLY with a JSON object in this format:\\n            {\\n              \\"action\\": \\"new\\" | \\"existing\\" | \\"none\\",\\n              \\"topic_name\\": \\"short descriptive name\\" | null,\\n              \\"existing_topic_name\\": \\"exact name of existing topic\\" | null\\n            }\\n            \\n            Rules:\\n            1. 'new': If the message introduces a distinct new subject. Provide a 2-4 word 'topic_name'.\\n            2. 'existing': If the message clearly continues one of the current topics. 'existing_topic_name' must match an existing topic exactly.\\n            3. 'none': If it is just a greeting, noise, or doesn't warrant a thread.\\n            4. Always use JSON. No other text.`
          },
          { role: 'user', content: content }
        ],
        response_format: { type: 'json_object' }
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    return JSON.parse(response.data.choices[0].message.content);
  } catch (error: any) {
    console.error('Error classifying topic:', (error as any).response?.data || error.message);
    return { action: 'none', topic_name: null, existing_topic_name: null };
  }
}

client.once('ready', () => {
  console.log(`Logged in as ${client.user?.tag}!`);
  console.log(`Monitoring channel: ${TARGET_CHANNEL_ID}`);
  console.log(`Notifications: ${settings.notificationsEnabled ? '✅ Enabled' : '❌ Disabled'}`);

  const isRunning = fs.existsSync(RUNNING_FILE);
  if (isRunning) {
    console.log('⚠️ Running file detected — another process may be active.');
  }
  // Start as running if no other process is active
  if (!isRunning) {
    fs.writeFileSync(RUNNING_FILE, `${Date.now()}\n`);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'notifications') {
      const isOn = settings.notificationsEnabled;
      const icon = isOn ? '🔔' : '🔕';
      const embed = new EmbedBuilder()
        .setTitle(`${icon} Notification Settings`)
        .setDescription(`Current status: **${isOn ? '✅ Enabled' : '❌ Disabled'}**`)
        .setColor(isOn ? 0x00ff00 : 0xff0000);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('notif_on')
          .setLabel('Enable')
          .setStyle(ButtonStyle.Success)
          .setDisabled(isOn),
        new ButtonBuilder()
          .setCustomId('notif_off')
          .setLabel('Disable')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(!isOn)
      );

      await interaction.reply({ embeds: [embed], components: [row] });
    } else if (interaction.commandName === 'hermes-status') {
      try {
        const dbPath = path.join(
          process.env.HERMES_HOME || path.join(os.homedir(), '.hermes'),
          'state.db'
        );
        if (!fs.existsSync(dbPath)) {
          await interaction.reply('❌ Hermes state database not found.');
          return;
        }

        const db = await open({
          filename: dbPath,
          driver: sqlite3.Database,
        });

        const currentSessionId = process.env.HERMES_SESSION_ID || 'current';

        // Get all non-archived sessions that are either open (ended_at IS NULL) or ended within the last 7 days
        const sessions = await db.all(
          `SELECT id, title, source, last_activity_at, ended_at, end_reason, message_count, tool_call_count
           FROM sessions
           WHERE archived = 0
           ORDER BY last_activity_at DESC LIMIT 10`
        );

        await db.close();

        const now = Math.floor(Date.now() / 1000);
        const SEVEN_DAYS = 7 * 24 * 60 * 60;

        let openSessions: typeof sessions = [];
        let recentClosed: typeof sessions = [];

        for (const s of sessions) {
          const lastAct = s.last_activity_at as number;
          if (s.ended_at === null || s.ended_at === undefined) {
            openSessions.push(s);
          } else if (now - (lastAct as number) < SEVEN_DAYS) {
            recentClosed.push(s);
          }
        }

        const allShown = [...openSessions, ...recentClosed];

        if (allShown.length === 0) {
          const embed = new EmbedBuilder()
            .setTitle('🤖 Hermes Sessions')
            .setDescription('No active sessions found in the last 7 days.')
            .setColor(0xffaa00);
          await interaction.reply({ embeds: [embed] });
          return;
        }

        const activeLabel = openSessions.length > 0 ? `${openSessions.length} open, ${recentClosed.length} recent` : `${recentClosed.length} recent`;
        const color = openSessions.length > 0 ? 0x00ff00 : 0xffaa00;

        let sessionsList = '';
        for (const s of allShown) {
          const lastAct = s.last_activity_at as number;
          const elapsed = now - lastAct;
          let timeStr: string;
          if (elapsed < 60) timeStr = 'just now';
          else if (elapsed < 3600) timeStr = `${Math.floor(elapsed / 60)}m ago`;
          else if (elapsed < 86400) timeStr = `${Math.floor(elapsed / 3600)}h ago`;
          else timeStr = `${Math.floor(elapsed / 86400)}d ago`;

          const icon = s.ended_at === null || s.ended_at === undefined ? '🟢' : '🔵';
          const sourceLabel = s.source === 'local' ? '💻 Desktop' : '💬 Discord';
          const title = s.title || 'Untitled';
          const trunc = title.length > 40 ? title.slice(0, 37) + '...' : title;
          sessionsList += `${icon} **${trunc}** · ${sourceLabel} · ${timeStr}\n`;
        }

        const embed = new EmbedBuilder()
          .setTitle('🤖 Hermes Sessions')
          .setDescription(`**${activeLabel}** sessions in the last 7 days:\n\n${sessionsList}`)
          .setColor(color)
          .setFooter({ text: `Total: ${allShown.length} sessions shown (top 10 by activity)` });

        await interaction.reply({ embeds: [embed] });
      } catch (err) {
        console.error('Error fetching Hermes status:', err);
        await interaction.reply('❌ Failed to retrieve Hermes session status.');
      }
    }
  } else if (interaction.isButton()) {
    if (interaction.customId === 'notif_on' || interaction.customId === 'notif_off') {
      settings.notificationsEnabled = interaction.customId === 'notif_on';
      saveSettings(settings);

      const status = settings.notificationsEnabled ? 'Enabled' : 'Disabled';
      const color = settings.notificationsEnabled ? 0x00ff00 : 0xff0000;

      const icon = settings.notificationsEnabled ? '🔔' : '🔕';

      const embed = new EmbedBuilder()
        .setTitle(`${icon} Notification Settings`)
        .setDescription(`Current status: **${status}**`)
        .setColor(color);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('notif_on')
          .setLabel('Enable')
          .setStyle(ButtonStyle.Success)
          .setDisabled(settings.notificationsEnabled),
        new ButtonBuilder()
          .setCustomId('notif_off')
          .setLabel('Disable')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(!settings.notificationsEnabled)
      );

      await interaction.update({ embeds: [embed], components: [row] });
    }
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  
  const isTargetChannel = message.channel.id === TARGET_CHANNEL_ID || 
    ('parentId' in message.channel && message.channel.parentId === TARGET_CHANNEL_ID);
  if (!isTargetChannel) return;

  // Only respond if bot is mentioned, or message is in a thread owned by the bot
  if (!message.channel.isThread()) {
    const botMentioned = message.mentions.has(client.user!);
    if (!botMentioned) return;
  } else {
    // In a thread — only process if the thread was created by the bot
    const threadOwner = await message.channel.fetchOwner().catch(() => null);
    if (!threadOwner || threadOwner.id !== client.user!.id) return;
  }

  console.log(`[${message.author.username}]: ${message.content}`);
  message.channel.sendTyping().catch(() => {});

  const threadsState = loadThreads();
  const currentTopics = Object.keys(threadsState);

  let targetThread: any = null;

  try {
    if (message.channel.isThread()) {
      targetThread = message.channel;
    } else {
      const classification = await classifyTopic(message.content, currentTopics);
      console.log('Classification:', classification);

      if (classification.action === 'new' && classification.topic_name) {
        const topicName = classification.topic_name;
        console.log(`Creating new thread for topic: ${topicName}`);
        const thread = await (message.channel as any).threads.create({
          name: topicName,
          autoArchiveDuration: 1440,
          reason: `New topic detected: ${topicName}`,
        });
        targetThread = thread;
        threadsState[topicName] = thread.id;
        saveThreads(threadsState);
        await thread.send(`🧵 **New Topic Detected: ${topicName}**\\nStarting discussion here.`).catch(() => {});
      } else if (classification.action === 'existing' && classification.existing_topic_name) {
        const topicName = classification.existing_topic_name;
        const threadId = threadsState[topicName];
        if (threadId) {
          const thread = await (message.channel as any).threads.fetch(threadId).catch(() => null);
          if (thread) {
            targetThread = thread;
          } else {
            console.log(`Thread for ${topicName} not found. Treating as new.`);
            const newThread = await (message.channel as any).threads.create({
              name: topicName,
              autoArchiveDuration: 1440,
            });
            targetThread = newThread;
            threadsState[topicName] = newThread.id;
            saveThreads(threadsState);
          }
        } else {
          console.log(`Topic ${topicName} listed but no thread ID found. Treating as new.`);
          const newThread = await (message.channel as any).threads.create({
            name: topicName,
            autoArchiveDuration: 1440,
          });
          targetThread = newThread;
          threadsState[topicName] = newThread.id;
          saveThreads(threadsState);
        }
      }
    }
  } catch (error: any) {
    console.error('Error in thread routing:', (error as any).response?.data || (error as any).message);
    // Thread routing failed but we'll still try to respond directly
    targetThread = null;
  }

  try {
    const aiResponse = await axios.post(
      `${LOCAL_AI_ENDPOINT}/chat/completions`,
      {
        model: LOCAL_AI_MODEL,
        messages: [
          { role: 'system', content: 'You are a helpful assistant. Respond concisely.' },
          { role: 'user', content: message.content }
        ],
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const aiReply = aiResponse.data.choices[0].message.content;

    if (aiReply.length > 2000) {
      const chunks = aiReply.match(/[\\s\\S]{1,2000}/g) || [];
      for (const chunk of chunks) {
        if (targetThread) await targetThread.send(chunk).catch(() => {});
        else await message.reply(chunk).catch(() => {});
      }
    } else {
      if (targetThread) await targetThread.send(aiReply).catch(() => {});
      else await message.reply(aiReply).catch(() => {});
    }
  } catch (error: any) {
    console.error('Error in AI response or sending:', (error as any).response?.data || (error as any).message);
    // Don't reply — the user may have just been chatting, and the bot responding anyway is enough
  }
});

// Handle graceful shutdown: remove running file, update channel, stop webhook server
const cleanup = () => {
  server.close();
  try {
    if (fs.existsSync(RUNNING_FILE)) {
      fs.unlinkSync(RUNNING_FILE);
    }
  } catch (err) {
    console.error('Error cleaning up running file:', err);
  }
  process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// --- Session lifecycle HTTP endpoints (called by Hermes outbound webhooks) ---
const WEBHOOK_PORT = parseInt(process.env.WEBHOOK_PORT || '3001', 10);
const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/session-start') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const sessionId = payload.session_id;
        const title = payload.title || null;
        if (!sessionId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing session_id' }));
          return;
        }
        console.log(`📩 Session-start webhook received: ${sessionId} — ${title || 'untitled'}`);
        await sendStartNotification(sessionId, title);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      } catch (err) {
        console.error('Error processing webhook:', err);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad request' }));
      }
    });
    return;
  }
  if (req.method === 'POST' && req.url === '/session-end') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const sessionId = payload.session_id;
        if (!sessionId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing session_id' }));
          return;
        }
        console.log(`📩 Session-end webhook received: ${sessionId}`);
        await sendSessionNotification(sessionId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      } catch (err) {
        console.error('Error processing webhook:', err);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad request' }));
      }
    });
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(WEBHOOK_PORT, () => {
  console.log(`📡 Webhook listener on port ${WEBHOOK_PORT}`);
});

client.login(DISCORD_TOKEN);
