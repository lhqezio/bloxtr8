import { config } from '@dotenvx/dotenvx';
import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
} from 'discord.js';

// Command handlers
import { execute as handleAdminHelp } from './commands/admin-help.js';
import { handleHelp } from './commands/help.js';
import { handleLinkRoblox } from './commands/linkRoblox.js';
import {
  handleListingCreateWithVerification,
  handleGameVerificationModalSubmit,
  handleCreateListingWithGameButton,
  handleListingWithGameModalSubmit,
  handleCancelListingCreation,
  handleExperienceSelection,
  cleanupVerificationCache,
} from './commands/listing-enhanced.js';
import {
  handleMakeOfferButton,
  handleMakeOfferModalSubmit,
  handleConfirmOffer,
  handleCancelOffer,
} from './commands/make-offer.js';
import { execute as handleMarketplaceSetup } from './commands/marketplace-setup.js';
import { execute as handleMarketplaceTest } from './commands/marketplace-test.js';
import { handlePing } from './commands/ping.js';
import {
  handleSignup,
  handleConsentAccept,
  handleConsentDecline,
  handleLinkRobloxAfterSignup,
} from './commands/signup.js';
import { execute as handleSyncListings } from './commands/sync-listings.js';
import { handleVerify } from './commands/verify.js';
// Offer notification service
import { LinkNotificationService } from './services/linkNotifications.js';
import { OfferNotificationService } from './services/offerNotifications.js';
// Link notification service
// Marketplace utilities
import { syncPublicListingsToGuild } from './utils/listingSync.js';
import {
  setupMarketplaceChannels,
  cleanupMarketplaceChannels,
} from './utils/marketplace.js';

// Load environment variables
config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // Required for guild member information
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildPresences, // May be needed for guild information
  ],
  partials: [
    Partials.Channel, // Required for thread support - allows bot to receive events from threads
    Partials.GuildMember, // Required for proper guild member data in threads
  ],
});

// Initialize notification services
let offerNotificationService: OfferNotificationService | null = null;
let linkNotificationService: LinkNotificationService | null = null;

client.once('ready', async () => {
  console.log(`Logged in as ${client.user?.tag}`);
  console.log(`Bot is in ${client.guilds.cache.size} guild(s):`);
  client.guilds.cache.forEach(guild => {
    console.log(
      `  - ${guild.name} (${guild.id}) - ${guild.memberCount} members`
    );
  });

  if (client.guilds.cache.size === 0) {
    console.warn(
      '⚠️  WARNING: Bot is not in any guilds! Please invite the bot to a server.'
    );
    console.warn(
      "⚠️  Use this invite link (replace CLIENT_ID with your bot's client ID):"
    );
    console.warn(
      `⚠️  https://discord.com/api/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&permissions=8&scope=bot%20applications.commands`
    );
  }

  // Start notification services
  const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:3000';

  // Start offer notification service
  offerNotificationService = new OfferNotificationService(client, apiBaseUrl);
  offerNotificationService.start(30000); // Poll every 30 seconds
  console.log('✅ Offer notification service started');

  // Start link notification service
  linkNotificationService = new LinkNotificationService(client, apiBaseUrl);
  linkNotificationService.start(30000); // Poll every 30 seconds
  console.log('✅ Link notification service started');

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
    new SlashCommandBuilder()
      .setName('marketplace-setup')
      .setDescription(
        'Set up Bloxtr8 marketplace channels for this server (Admin only)'
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .toJSON(),
    new SlashCommandBuilder()
      .setName('sync-listings')
      .setDescription(
        'Manually sync all public listings to this server (Admin only)'
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .toJSON(),
    new SlashCommandBuilder()
      .setName('admin-help')
      .setDescription('Show admin commands and their usage (Admin only)')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .toJSON(),
    new SlashCommandBuilder()
      .setName('marketplace-test')
      .setDescription('Test marketplace setup command')
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
    if (interaction.commandName === 'marketplace-setup') {
      try {
        await handleMarketplaceSetup(interaction);
      } catch (error) {
        console.error(`Error in marketplace-setup command:`, error);
        if (!interaction.replied && !interaction.deferred) {
          try {
            await interaction.reply({
              content:
                'An error occurred while setting up the marketplace. Please try again.',
              ephemeral: true,
            });
          } catch (replyError) {
            console.error('Failed to send error reply:', replyError);
          }
        }
      }
    }
    if (interaction.commandName === 'sync-listings') {
      try {
        await handleSyncListings(interaction);
      } catch (error) {
        console.error(`Error in sync-listings command:`, error);
        if (!interaction.replied && !interaction.deferred) {
          try {
            await interaction.reply({
              content:
                'An error occurred while syncing listings. Please try again.',
              ephemeral: true,
            });
          } catch (replyError) {
            console.error('Failed to send error reply:', replyError);
          }
        }
      }
    }
    if (interaction.commandName === 'admin-help') {
      try {
        await handleAdminHelp(interaction);
      } catch (error) {
        console.error(`Error in admin-help command:`, error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: 'An error occurred while showing help. Please try again.',
            ephemeral: true,
          });
        }
      }
    }
    if (interaction.commandName === 'marketplace-test') {
      try {
        await handleMarketplaceTest(interaction);
      } catch (error) {
        console.error(`Error in marketplace-test command:`, error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: 'Test command failed.',
            ephemeral: true,
          });
        }
      }
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
    if (interaction.customId.startsWith('make_offer_modal_')) {
      await handleMakeOfferModalSubmit(interaction);
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
    if (interaction.customId === 'link_roblox_after_signup') {
      await handleLinkRobloxAfterSignup(interaction);
    }
    if (interaction.customId === 'create_listing_with_game') {
      await handleCreateListingWithGameButton(interaction);
    }
    if (interaction.customId === 'cancel_listing_creation') {
      await handleCancelListingCreation(interaction);
    }
    // Handle make offer buttons
    if (interaction.customId.startsWith('make_offer_')) {
      await handleMakeOfferButton(interaction);
    }
    // Handle confirm/cancel offer buttons
    if (interaction.customId.startsWith('confirm_offer_')) {
      await handleConfirmOffer(interaction);
    }
    if (interaction.customId.startsWith('cancel_offer_')) {
      await handleCancelOffer(interaction);
    }
  }

  // Handle string select menu interactions
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'experience_selection') {
      await handleExperienceSelection(interaction);
    }
  }
});

// Guild join event - setup marketplace
client.on('guildCreate', async guild => {
  console.log(`✅ Bot joined guild: ${guild.name} (${guild.id})`);
  console.log(`   Guild member count: ${guild.memberCount}`);
  console.log(`   Total guilds now: ${guild.client.guilds.cache.size}`);

  try {
    // Setup marketplace channels
    await setupMarketplaceChannels(guild);

    // Sync existing public listings to this guild
    // Run in background to avoid blocking
    syncPublicListingsToGuild(guild).catch(error => {
      console.error(`Background sync failed for guild ${guild.id}:`, error);
    });

    console.log(`Successfully set up marketplace for guild ${guild.name}`);
    console.log(
      `Started background sync of public listings for guild ${guild.name}`
    );
  } catch (error) {
    console.error(`Failed to setup marketplace for guild ${guild.id}:`, error);
  }
});

// Guild leave event - cleanup
client.on('guildDelete', async guild => {
  console.log(`Bot left guild: ${guild.name} (${guild.id})`);

  try {
    // Archive threads before leaving
    await cleanupMarketplaceChannels(guild);

    // TODO: Update database to mark guild as inactive

    console.log(`Successfully cleaned up marketplace for guild ${guild.name}`);
  } catch (error) {
    console.error(
      `Failed to cleanup marketplace for guild ${guild.id}:`,
      error
    );
  }
});

// Graceful shutdown handlers
async function gracefulShutdown(signal: string) {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  // Stop notification services
  if (offerNotificationService) {
    offerNotificationService.stop();
  }
  if (linkNotificationService) {
    linkNotificationService.stop();
  }

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
