import dotenv from 'dotenv';
dotenv.config();
import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ] });
client.login(process.env.DISCORD_TOKEN);

client.on("messageCreate", async (message) => {
    if(!message.author.bot) {
        message.author.send(`You said: ${message.content}`);
    }
});