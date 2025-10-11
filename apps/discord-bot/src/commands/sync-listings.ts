import {
  type ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js';

import { syncPublicListingsToGuild } from '../utils/listingSync.js';

export const data = new SlashCommandBuilder()
  .setName('sync-listings')
  .setDescription('Manually sync all public listings to this server (Admin only)')
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

    // Get guild
    let guild = interaction.guild;

    // Handle missing guild object
    if (!guild && interaction.guildId) {
      try {
        const cachedGuild = interaction.client.guilds.cache.get(interaction.guildId);
        
        if (cachedGuild) {
          guild = cachedGuild;
        } else {
          guild = await interaction.client.guilds.fetch(interaction.guildId);
        }
      } catch {
        throw new Error(
          `Could not access guild information. Please ensure the bot has proper permissions.`
        );
      }
    }

    if (!guild) {
      throw new Error(
        `Could not find guild. Make sure the bot is present in this server.`
      );
    }

    // Start sync
    const embed = new EmbedBuilder()
      .setTitle('🔄 Syncing Listings...')
      .setDescription(
        `Starting sync of all public listings to **${guild.name}**...\n\n` +
        `This may take a moment depending on the number of listings.`
      )
      .setColor('#ffaa00')
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    // Perform the sync
    try {
      await syncPublicListingsToGuild(guild);

      const successEmbed = new EmbedBuilder()
        .setTitle('✅ Sync Complete!')
        .setDescription(
          `Successfully synced all public listings to **${guild.name}**!\n\n` +
          `All listings have been created or updated in their respective channels.`
        )
        .setColor('#00ff00')
        .setTimestamp();

      await interaction.editReply({ embeds: [successEmbed] });
    } catch (syncError) {
      throw new Error(
        `Sync failed: ${syncError instanceof Error ? syncError.message : 'Unknown error'}`
      );
    }
  } catch (error) {
    console.error(
      `Failed to sync listings for guild ${interaction.guild?.id}:`,
      error
    );

    const errorEmbed = new EmbedBuilder()
      .setTitle('❌ Sync Failed')
      .setDescription(
        `Failed to sync listings. Please check the bot's permissions and try again.\n\n` +
        `**Error:** ${error instanceof Error ? error.message : 'Unknown error'}`
      )
      .setColor('#ff0000')
      .setTimestamp();

    if (interaction.deferred) {
      await interaction.editReply({ embeds: [errorEmbed] });
    } else if (!interaction.replied) {
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  }
}

