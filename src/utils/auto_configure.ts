import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

async function autoConfigure() {
  const TOKEN = process.env.DISCORD_TOKEN;
  if (!TOKEN) {
    console.error('❌ ERROR: DISCORD_TOKEN is missing from .env. Please add it manually.');
    process.exit(1);
  }

  try {
    console.log('Fetching application info from Discord...');
    const response = await axios.get('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bot ${TOKEN}` }
    });

    const clientId = response.data.id;
    const envPath = path.join(process.cwd(), '.env');
    let envContent = fs.readFileSync(envPath, 'utf8');

    if (!envContent.includes('CLIENT_ID=')) {
      console.log(`Found Client ID: ${clientId}. Adding to .env...`);
      envContent += `\nCLIENT_ID=${clientId}\n`;
      fs.writeFileSync(envPath, envContent);
      console.log('✅ Successfully added CLIENT_ID to .env.');
    } else {
      console.log('✅ CLIENT_ID is already present in .env.');
    }

    console.log('Configuration complete. You can now run "npm run deploy".');
  } catch (err: any) {
    console.error('❌ ERROR: Failed to fetch info from Discord. Check if your DISCORD_TOKEN is valid.');
    console.error(err.response?.data || err.message);
    process.exit(1);
  }
}

autoConfigure();
