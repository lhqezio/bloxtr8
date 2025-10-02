import { config } from '@dotenvx/dotenvx';
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
} from 'discord.js';

// Command handlers
import { handleHelp } from './commands/help.js';
import { handleLinkRoblox } from './commands/linkRoblox.js';
import {
  handleListingCreateWithVerification,
  handleGameVerificationModalSubmit,
  handleCreateListingWithGameButton,
  handleListingWithGameModalSubmit,
  handleCancelListingCreation,
  cleanupVerificationCache,
} from './commands/listing-enhanced.js';
import { handlePing } from './commands/ping.js';
import {
  handleSignup,
  handleConsentAccept,
  handleConsentDecline,
} from './commands/signup.js';
import { handleVerify } from './commands/verify.js';

// Load environment variables
config();

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
      .setName('help')
      .setDescription('Show available commands and help information')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('ping')
      .setDescription('Check bot latency')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('listing')
      .setDescription('Manage your listings')
      .addSubcommand(subcommand =>
        subcommand
          .setName('create')
          .setDescription('Create a new verified game ownership listing')
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName('verify')
      .setDescription('Verify a Discord profile')
      .addStringOption(opt =>
        opt
          .setName('id')
          .setDescription('Any linked account ID (defaults to your Discord ID)')
          .setRequired(false)
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName('signup')
      .setDescription('Sign up for a Bloxtr8 account')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('link')
      .setDescription('Link your Roblox account to Bloxtr8')
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

// Note: messageCreate handler removed to prevent spam
// If you need to handle DMs, implement a more specific handler here

client.on('interactionCreate', async interaction => {
  // Handle slash commands
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'help') {
      await handleHelp(interaction);
    }
    if (interaction.commandName === 'verify') {
      await handleVerify(interaction);
    }
    if (interaction.commandName === 'ping') {
      await handlePing(interaction);
    }
    if (
      interaction.commandName === 'listing' &&
      interaction.options.getSubcommand() === 'create'
    ) {
      await handleListingCreateWithVerification(interaction);
    }
    if (interaction.commandName === 'signup') {
      await handleSignup(interaction);
    }
    if (interaction.commandName === 'link') {
      await handleLinkRoblox(interaction);
    }
  }

  // Handle modal submissions
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'game_verification_modal') {
      await handleGameVerificationModalSubmit(interaction);
    }
    if (interaction.customId === 'listing_create_with_game_modal') {
      await handleListingWithGameModalSubmit(interaction);
    }
  }

  // Handle button interactions
  if (interaction.isButton()) {
    if (interaction.customId === 'consent_accept') {
      await handleConsentAccept(interaction);
    }
    if (interaction.customId === 'consent_decline') {
      await handleConsentDecline(interaction);
    }
    if (interaction.customId === 'create_listing_with_game') {
      await handleCreateListingWithGameButton(interaction);
    }
    if (interaction.customId === 'cancel_listing_creation') {
      await handleCancelListingCreation(interaction);
    }
  }
});

// Graceful shutdown handlers
async function gracefulShutdown(signal: string) {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  // Cleanup verification cache
  cleanupVerificationCache();

  // Destroy Discord client
  client.destroy();

  console.log('Shutdown complete.');
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught errors
process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
  console.error('Uncaught exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

client.login(process.env.DISCORD_BOT_TOKEN);
