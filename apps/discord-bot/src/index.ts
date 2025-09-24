import { config } from '@dotenvx/dotenvx';
import { createAuthClient } from "better-auth/client"
import {
  ActionRowBuilder,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  ModalBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';

import { createListing, getApiBaseUrl } from './utils/apiClient.js';
import {
  ensureUserExists,
  verifyUserForListing,
} from './utils/userVerification.js';

// Load environment variables
config();

type AuthClient = ReturnType<typeof createAuthClient>;

export const authClient: AuthClient = createAuthClient({
    /** The base URL of the server (optional if you're using the same domain) */
    baseURL: process.env.API_BASE_URL || "http://localhost:3000"
})


const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});
const signIn = async (interaction: any) => {
  try {
      // Generate OAuth URL for Discord login using Better Auth client (per docs)
      const { data, error } = await authClient.signIn.social({
          provider: "discord",
          callbackURL: `${process.env.API_BASE_URL || "http://localhost:3000"}/health`
      });

      if (error) {
          console.error('Auth error:', error);
          await interaction.reply({
              content: '❌ Failed to initiate login. Please try again later.',
              ephemeral: true
          });
          return;
      }

      if (data?.url) {
          const embed = new EmbedBuilder()
              .setTitle('🔐 Discord Authentication')
              .setDescription('Click the button below to authenticate with Discord and link your account!')
              .setColor(0x5865F2)
              .addFields(
                  { name: 'Step 1', value: 'Click the link below', inline: false },
                  { name: 'Step 2', value: 'Authorize the application', inline: false },
                  { name: 'Step 3', value: 'You\'ll be redirected back automatically', inline: false }
              )
              .setFooter({ text: 'This link will expire in 10 minutes' })
              .setTimestamp();

          await interaction.reply({
              embeds: [embed],
              content: `**Authentication Link:**\n${data.url}`,
              ephemeral: true
          });
      } else {
          await interaction.reply({
              content: '❌ Failed to generate login URL. Please try again later.',
              ephemeral: true
          });
      }
  } catch (error) {
      console.error('Sign in error:', error);
      await interaction.reply({
          content: '❌ An unexpected error occurred. Please try again later.',
          ephemeral: true
      });
  }
}
const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:3000';

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
      .setDescription('Get a sign-in link for your Bloxtr8 account')
      .toJSON(),
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
  // Handle slash commands
  if (interaction.isChatInputCommand()) {
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
}});

client.login(process.env.DISCORD_BOT_TOKEN);
