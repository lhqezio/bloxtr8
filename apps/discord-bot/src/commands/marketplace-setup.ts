import {
  type ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js';

import { syncPublicListingsToGuild } from '../utils/listingSync.js';
import { setupMarketplaceChannels } from '../utils/marketplace.js';

export const data = new SlashCommandBuilder()
  .setName('marketplace-setup')
  .setDescription('Manually set up marketplace channels for this server')
  .addBooleanOption(option =>
    option
      .setName('force')
      .setDescription(
        'Force setup even without admin permissions (for testing)'
      )
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  try {
    console.log(
      `Marketplace setup command triggered - Guild: ${interaction.guild?.id}, Channel: ${interaction.channel?.id}`
    );
    console.log(`Interaction type: ${interaction.type}`);
    console.log(`Interaction guildId: ${interaction.guildId}`);
    console.log(`Bot user: ${interaction.client.user?.tag}`);
    console.log(`Bot guilds cache size: ${interaction.client.guilds.cache.size}`);

    // Check if command is being used in a guild (works for threads and regular channels)
    if (!interaction.guildId) {
      console.log('Command used in DM - rejecting');
      return interaction.reply({
        content: '❌ This command can only be used in a Discord server where the bot is present!',
        ephemeral: true,
      });
    }

    // Additional debug: Check if bot can see any guilds at all
    console.log(`Bot can see guilds: ${interaction.client.guilds.cache.size > 0}`);
    if (interaction.client.guilds.cache.size > 0) {
      console.log(`Bot is in these guilds: ${Array.from(interaction.client.guilds.cache.keys()).join(', ')}`);
    }

    const force = interaction.options.getBoolean('force') ?? false;

    // Check if user has admin permissions (unless force is used)
    if (
      !force &&
      !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
    ) {
      await interaction.reply({
        content:
          'You need administrator permissions to run this command! Use `/marketplace-setup force:true` for testing.',
        ephemeral: true,
      });
      return; // Exit early to prevent double response
    }

    // Defer reply immediately to prevent timeout
    await interaction.deferReply({ ephemeral: true });

    // Setup marketplace channels
    console.log('Starting marketplace setup...');

    // Get guild - use interaction.guild first, then fetch by guildId if needed
    // This works for both regular channels and threads
    let guild = interaction.guild;
    
    console.log(`Interaction.guild: ${guild?.id || 'null'}`);
    console.log(`Interaction.guildId: ${interaction.guildId}`);

    // Handle missing guild object (common in threads with partials enabled)
    if (!guild && interaction.guildId) {
      console.log(`Guild object not available, attempting to resolve by guildId: ${interaction.guildId}`);
      try {
        // Try to get from cache first
        const cachedGuild = interaction.client.guilds.cache.get(interaction.guildId);
        
        if (cachedGuild) {
          console.log(`Found guild in cache: ${cachedGuild.name} (${cachedGuild.id})`);
          guild = cachedGuild;
        } else {
          // Not in cache, fetch from Discord API
          console.log(`Guild not in cache, fetching from Discord API...`);
          guild = await interaction.client.guilds.fetch(interaction.guildId);
          console.log(`Successfully fetched guild: ${guild.name} (${guild.id})`);
        }
      } catch (error) {
        console.error(`Failed to fetch guild ${interaction.guildId}:`, error);
        console.error(`Guild cache contents:`, Array.from(interaction.client.guilds.cache.keys()));
        throw new Error(
          `Could not access guild information. Please ensure:\n` +
          `1. The bot is properly invited to this server\n` +
          `2. The bot has been restarted since being invited\n` +
          `3. The bot has the necessary permissions (Manage Channels, Manage Threads)`
        );
      }
    }

    if (!guild) {
      throw new Error(
        `Could not find guild for marketplace setup. Make sure you're running this command in a server where the bot is present.`
      );
    }

    console.log(`Using guild: ${guild.name} (${guild.id})`);
    const channels = await setupMarketplaceChannels(guild);

    // Sync existing public listings to this guild
    // Run in background to avoid blocking
    syncPublicListingsToGuild(guild).catch(error => {
      console.error(`Background sync failed for guild ${guild.id}:`, error);
    });

    const embed = new EmbedBuilder()
      .setTitle('🏪 Marketplace Setup Complete!')
      .setDescription(
        `Successfully set up marketplace channels for **${guild.name}**!\n\n` +
          `**Created Channels:**\n${Array.from(channels.entries())
            .map(([, channel]) => `• ${channel}`)
            .join('\n')}\n\n` +
          `✅ Price-range channels created\n` +
          `✅ Permissions configured\n` +
          `✅ Welcome messages posted\n` +
          `🔄 Syncing existing public listings...`
      )
      .setColor('#00ff00')
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    console.log(
      `Manual marketplace setup completed for guild ${guild.name} (${guild.id})`
    );
  } catch (error) {
    console.error(
      `Failed to setup marketplace for guild ${interaction.guild?.id}:`,
      error
    );

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content:
          'An error occurred while setting up the marketplace. Please try again.',
        ephemeral: true,
      });
    } else if (interaction.deferred) {
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Setup Failed')
        .setDescription(
          `Failed to set up marketplace channels. Please check the bot's permissions and try again.\n\n` +
            `**Error:** ${error instanceof Error ? error.message : 'Unknown error'}`
        )
        .setColor('#ff0000')
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
}
