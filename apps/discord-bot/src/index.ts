import { config } from '@dotenvx/dotenvx';
import { createAuthClient } from "better-auth/client"
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
} from 'discord.js';

// Load environment variables
config();

type AuthClient = ReturnType<typeof createAuthClient>;

export const authClient: AuthClient = createAuthClient({
    /** The base URL of the server (optional if you're using the same domain) */
    //baseURL: "http://localhost:3000"
})

const signIn = async (interaction: any) => {
  try {
    const clientId = process.env.DISCORD_CLIENT_ID;
    const publicApi = process.env.API_BASE_URL || 'http://localhost:3000';
    if (!clientId) {
      await interaction.reply({ content: 'OAuth is not configured', ephemeral: true });
      return;
    }
    const redirectUri = encodeURIComponent(`${publicApi}/api/identity/discord/callback`);
    const scopes = encodeURIComponent('identify email');
    const authUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&scope=${scopes}`;

    const embed = new EmbedBuilder()
      .setTitle('🔐 Discord Authentication')
      .setDescription('Click the link below to authenticate with Discord and link your account!')
      .setColor(0x5865F2)
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      content: `**Authentication Link:**\n${authUrl}`,
      ephemeral: true,
    });
  } catch (error) {
    console.error('Sign in error:', error);
    await interaction.reply({ content: '❌ Failed to initiate login.', ephemeral: true });
  }
}


const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user?.tag}`);

  // Register guild slash commands on startup
  const commands = [
    new SlashCommandBuilder()
      .setName('hello')
      .setDescription('Say hello in the channel')
      .addStringOption(opt =>
        opt.setName('name').setDescription('Name to greet').setRequired(false)
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName('ping')
      .setDescription('Check bot latency')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('signin')
      .setDescription('Sign in with Discord OAuth')
      .toJSON(),
    // auth-status and logout are not implemented in this flow
  ];

  const token = process.env.DISCORD_BOT_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID; // Application (bot) ID
  const guildId = process.env.DISCORD_GUILD_ID; // Target guild to register commands

  if (!token || !clientId || !guildId) {
    console.warn(
      'Missing DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, or DISCORD_GUILD_ID. Skipping command registration.'
    );
    return;
  }

  const rest = new REST({ version: '10' }).setToken(token);
  try {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: commands,
    });
    console.log('Slash commands registered for guild', guildId);
  } catch (err) {
    console.error('Failed to register slash commands:', err);
  }
});

client.on('messageCreate', async message => {
  if (!message.author.bot) {
    message.author.send(`You said: ${message.content}`);
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'hello') {
    const provided = interaction.options.getString('name');
    const targetName =
      provided || interaction.user.displayName || interaction.user.username;
    await interaction.reply({ content: `Hello there ${targetName}!` });
  }

  if (interaction.commandName === 'ping') {
    const startTime = Date.now();
    await interaction.reply({ content: 'Pinging...' });
    const latency = Date.now() - startTime;
    const apiLatency = Math.round(client.ws.ping);

    await interaction.editReply({
      content: ` Pong! Latency: ${latency}ms | API Latency: ${apiLatency}ms`,
    });
  }

  if (interaction.commandName === 'signin') {
    await signIn(interaction);
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
