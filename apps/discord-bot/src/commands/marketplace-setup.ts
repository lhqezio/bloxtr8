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
  .setDescription(
    'Set up Bloxtr8 marketplace channels for this server (Admin only)'
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction) {
  try {
    // Check if command is being used in a guild
    if (!interaction.guildId) {
      return interaction.reply({
        content: '❌ This command can only be used in a Discord server!',
        ephemeral: true,
      });
    }

    // Check if user has admin permissions
    if (
      !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
    ) {
      return interaction.reply({
        content: '❌ You need administrator permissions to run this command!',
        ephemeral: true,
      });
    }

    // Defer reply immediately to prevent timeout
    await interaction.deferReply({ ephemeral: true });

    // Get guild - use interaction.guild first, then fetch by guildId if needed
    let guild = interaction.guild;

    // Handle missing guild object (common in threads with partials enabled)
    if (!guild && interaction.guildId) {
      try {
        // Try to get from cache first
        const cachedGuild = interaction.client.guilds.cache.get(
          interaction.guildId
        );

        if (cachedGuild) {
          guild = cachedGuild;
        } else {
          // Not in cache, fetch from Discord API
          guild = await interaction.client.guilds.fetch(interaction.guildId);
        }
      } catch {
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
        `Could not find guild. Make sure the bot is present in this server.`
      );
    }

    const channels = await setupMarketplaceChannels(guild);

    // Sync existing public listings to this guild
    // Run in background to avoid blocking
    syncPublicListingsToGuild(guild).catch(error => {
      console.error(`Background sync failed for guild ${guild.id}:`, error);
    });

    const embed = new EmbedBuilder()
      .setTitle('🏪 Bloxtr8 Setup Complete!')
      .setDescription(
        `Successfully set up Bloxtr8 marketplace for **${guild.name}**!\n\n` +
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
