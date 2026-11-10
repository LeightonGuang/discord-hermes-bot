import { REST, Routes } from 'discord.js';
import 'dotenv/config';
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
    console.error('❌ ERROR: DISCORD_TOKEN, CLIENT_ID, or GUILD_ID is not defined in your .env file.');
    process.exit(1);
}
const commands = [
    {
        name: 'notifications',
        description: 'Toggle Discord notifications for agent tasks',
    },
    {
        name: 'hermes-status',
        description: 'Show active Hermes agent sessions',
    },
];
const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
    try {
        console.log('Started refreshing application (/) commands (guild-scoped).');
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
            body: commands,
        });
        console.log('Successfully reloaded application (/) commands.');
    }
    catch (error) {
        console.error(error);
    }
})();
