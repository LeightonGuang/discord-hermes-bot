require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TARGET_CHANNEL_ID = process.env.TARGET_CHANNEL_ID;
const THREADS_FILE = path.join(__dirname, 'threads.json');

// Helper to load/save thread state
function loadThreads() {
  try {
    if (!fs.existsSync(THREADS_FILE)) return {};
    return JSON.parse(fs.readFileSync(THREADS_FILE, 'utf8'));
  } catch (err) {
    console.error('Error loading threads.json:', err);
    return {};
  }
}

function saveThreads(threads) {
  try {
    fs.writeFileSync(THREADS_FILE, JSON.stringify(threads, null, 2));
  } catch (err) {
    console.error('Error saving threads.json:', err);
  }
}

async function classifyTopic(content, currentTopics) {
  const topicsString = currentTopics.length > 0 ? currentTopics.join(', ') : 'None';
  
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          { 
            role: 'system', 
            content: `You are a Discord Topic Classifier. Your job is to decide if a message belongs to an existing topic or starts a new one.
            
            Current active topics: [${topicsString}]
            
            Respond ONLY with a JSON object in this format:
            {
              "action": "new" | "existing" | "none",
              "topic_name": "short descriptive name" | null,
              "existing_topic_name": "exact name of existing topic" | null
            }

            Rules:
            1. 'new': If the message introduces a distinct new subject. Provide a 2-4 word 'topic_name'.
            2. 'existing': If the message clearly continues one of the current topics. 'existing_topic_name' must match an existing topic exactly.
            3. 'none': If it is just a greeting, noise, or doesn't warrant a thread.
            4. Always use JSON. No other text.`
          },
          { role: 'user', content: content }
        ],
        response_format: { type: "json_object" }
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return JSON.parse(response.data.choices[0].message.content);
  } catch (error) {
    console.error('Error classifying topic:', error.response?.data || error.message);
    return { action: 'none' };
  }
}

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  console.log(`Monitoring channel: ${TARGET_CHANNEL_ID}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.channel.id !== TARGET_CHANNEL_ID) return;

  console.log(`[${message.author.username}]: ${message.content}`);
  await message.channel.sendTyping();

  const threadsState = loadThreads();
  const currentTopics = Object.keys(threadsState);

  const classification = await classifyTopic(message.content, currentTopics);
  console.log('Classification:', classification);

  try {
    let targetThread = null;

    if (classification.action === 'new' && classification.topic_name) {
      const topicName = classification.topic_name;
      console.log(`Creating new thread for topic: ${topicName}`);
      
      const thread = await message.channel.threads.create({
        name: topicName,
        autoArchiveDuration: 1440,
        reason: `New topic detected: ${topicName}`,
      });
      
      targetThread = thread;
      threadsState[topicName] = thread.id;
      saveThreads(threadsState);
      
      await thread.send(`🧵 **New Topic Detected: ${topicName}**\nStarting discussion here.`);
      
    } else if (classification.action === 'existing' && classification.existing_topic_name) {
      const topicName = classification.existing_topic_name;
      const threadId = threadsState[topicName];
      
      if (threadId) {
        const thread = await message.channel.threads.fetch(threadId).catch(() => null);
        if (thread) {
          targetThread = thread;
        } else {
          console.log(`Thread for ${topicName} not found. Treating as new.`);
          const newThread = await message.channel.threads.create({
            name: topicName,
            autoArchiveDuration: 1440,
          });
          targetThread = newThread;
          threadsState[topicName] = newThread.id;
          saveThreads(threadsState);
        }
      } else {
        console.log(`Topic ${topicName} listed but no thread ID found. Treating as new.`);
        const newThread = await message.channel.threads.create({
          name: topicName,
          autoArchiveDuration: 1440,
        });
        targetThread = newThread;
        threadsState[topicName] = newThread.id;
        saveThreads(threadsState);
      }
    }

    // AI Response logic
    const aiResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a helpful assistant. Respond concisely.' },
          { role: 'user', content: message.content }
        ],
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const aiReply = aiResponse.data.choices[0].message.content;

    const sendResponse = async (text) => {
      if (text.length > 2000) {
        const chunks = text.match(/[\s\S]{1,2000}/g);
        for (const chunk of chunks) {
          if (targetThread) await targetThread.send(chunk);
          else await message.reply(chunk);
        }
      } else {
        if (targetThread) await targetThread.send(text);
        else await message.reply(text);
      }
    };

    await sendResponse(aiReply);

  } catch (error) {
    console.error('Error in message processing:', error.response?.data || error.message);
    await message.reply('❌ Sorry, I encountered an error processing that message.');
  }
});

client.login(DISCORD_TOKEN);
