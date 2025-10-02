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
  handleListingCreate,
  handleListingModalSubmit,
} from './commands/listing.js';
import { 
  handleListingCreateWithVerification, 
  handleAssetVerificationModalSubmit,
  handleCreateListingWithAssetButton,
  handleListingWithAssetModalSubmit,
  handleCancelListingCreation
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
      .setDescription('Create a new listing')
      .addSubcommand(subcommand =>
        subcommand
          .setName('create')
          .setDescription('Create a new listing for sale')
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('create-verified')
          .setDescription('Create a new verified asset listing')
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

client.on('messageCreate', async message => {
  if (!message.author.bot) {
    message.author.send(`You said: ${message.content}`);
  }
});

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
      await handleListingCreate(interaction);
    }
    if (
      interaction.commandName === 'listing' &&
      interaction.options.getSubcommand() === 'create-verified'
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
    if (interaction.customId === 'listing_create_modal') {
      await handleListingModalSubmit(interaction);
    }
    if (interaction.customId === 'asset_verification_modal') {
      await handleAssetVerificationModalSubmit(interaction);
    }
    if (interaction.customId === 'listing_create_with_asset_modal') {
      await handleListingWithAssetModalSubmit(interaction);
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
    if (interaction.customId === 'create_listing_with_asset') {
      await handleCreateListingWithAssetButton(interaction);
    }
    if (interaction.customId === 'cancel_listing_creation') {
      await handleCancelListingCreation(interaction);
    }
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
