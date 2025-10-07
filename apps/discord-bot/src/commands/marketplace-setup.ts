import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import { setupMarketplaceChannels } from '../utils/marketplace.js';
import { syncPublicListingsToGuild } from '../utils/listingSync.js';

export const data = new SlashCommandBuilder()
  .setName('marketplace-setup')
  .setDescription('Manually set up marketplace channels for this server')
  .addBooleanOption(option =>
    option
      .setName('force')
      .setDescription('Force setup even without admin permissions (for testing)')
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  try {
    console.log(`Marketplace setup command triggered - Guild: ${interaction.guild?.id}, Channel: ${interaction.channel?.id}`);
    
    // Skip guild check for now since Discord.js is being weird
    // if (!interaction.guild) {
    //   console.log('Command used in DM - rejecting');
    //   return interaction.reply({
    //     content: 'This command can only be used in a server!',
    //     ephemeral: true,
    //   });
    // }

    const force = interaction.options.getBoolean('force') ?? false;
    
    // Check if user has admin permissions (unless force is used)
    if (!force && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: 'You need administrator permissions to run this command! Use `/marketplace-setup force:true` for testing.',
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    // Setup marketplace channels
    console.log('Starting marketplace setup...');
    
    // Debug: Check available guilds
    console.log('Available guilds:', Array.from(interaction.client.guilds.cache.keys()));
    console.log('Interaction guild:', interaction.guild?.id);
    
    // Force fetch guilds from Discord API
    await interaction.client.guilds.fetch();
    console.log('After fetch - Available guilds:', Array.from(interaction.client.guilds.cache.keys()));
    
    // Try to get guild from the interaction or find by the registered guild ID
    const registeredGuildId = process.env.DISCORD_GUILD_ID;
    let guild = interaction.guild;
    
    if (!guild && registeredGuildId) {
      guild = interaction.client.guilds.cache.get(registeredGuildId) || null;
    }
    
    if (!guild) {
      guild = interaction.client.guilds.cache.first() || null;
    }
    
    if (!guild) {
      throw new Error('Could not find guild for marketplace setup. Bot may not be in any servers.');
    }
    
    console.log(`Using guild: ${guild.name} (${guild.id})`);
    const channels = await setupMarketplaceChannels(guild);

    // Sync existing public listings to this guild
    // Run in background to avoid blocking
    syncPublicListingsToGuild(guild).catch((error) => {
      console.error(`Background sync failed for guild ${guild.id}:`, error);
    });

    const embed = new EmbedBuilder()
      .setTitle('🏪 Marketplace Setup Complete!')
      .setDescription(
        `Successfully set up marketplace channels for **${guild.name}**!\n\n` +
        `**Created Channels:**\n${Array.from(channels.entries())
          .map(([range, channel]) => `• ${channel}`)
          .join('\n')}\n\n` +
        `✅ Price-range channels created\n` +
        `✅ Permissions configured\n` +
        `✅ Welcome messages posted\n` +
        `🔄 Syncing existing public listings...`
      )
      .setColor('#00ff00')
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    console.log(`Manual marketplace setup completed for guild ${guild.name} (${guild.id})`);
  } catch (error) {
    console.error(`Failed to setup marketplace for guild ${interaction.guild?.id}:`, error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while setting up the marketplace. Please try again.',
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
