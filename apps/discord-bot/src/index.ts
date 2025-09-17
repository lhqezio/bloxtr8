import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('ready', () => {
  console.log(`🤖 Bloxtr8 Discord Bot is online!`);
  console.log(`👤 Logged in as ${client.user?.tag}`);
  console.log(`🏠 Serving ${client.guilds.cache.size} guilds`);
});

client.on('messageCreate', async message => {
  // Ignore bot messages
  if (message.author.bot) return;

  // Simple ping command for testing
  if (message.content === '!ping') {
    message.reply('🏓 Pong! Bloxtr8 bot is running!');
  }
});

// Handle process termination gracefully
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down Bloxtr8 Discord Bot...');
  client.destroy();
  process.exit(0);
});

// Start the bot
if (!process.env.DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN is not set in environment variables');
  console.log('💡 Create a .env file with DISCORD_TOKEN=your_bot_token');
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN).catch(error => {
  console.error('❌ Failed to login to Discord:', error);
  process.exit(1);
});
