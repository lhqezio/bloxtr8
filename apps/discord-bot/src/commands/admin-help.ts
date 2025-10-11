import {
  type ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('admin-help')
  .setDescription('Show admin commands and their usage (Admin only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction) {
  // Check if user has admin permissions
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      content:
        '❌ You need administrator permissions to view this information!',
      ephemeral: true,
    });
  }

  const embed = new EmbedBuilder()
    .setTitle('🛠️ Bloxtr8 Admin Commands')
    .setDescription(
      'Here are all available administrator commands for managing the Bloxtr8 marketplace:\n\n'
    )
    .addFields(
      {
        name: '📋 `/marketplace-setup`',
        value:
          '**Description:** Set up Bloxtr8 marketplace channels for this server\n' +
          '**Usage:** `/marketplace-setup`\n' +
          '**What it does:**\n' +
          '• Creates the 🏪 BLOXTR8 category\n' +
          '• Creates 4 price-range channels (under-5k, 5k-20k, 20k-100k, 100k+)\n' +
          '• Sets proper permissions\n' +
          '• Posts welcome messages\n' +
          '• Auto-syncs existing public listings\n\n' +
          "**Note:** Running multiple times is safe - it won't create duplicates",
        inline: false,
      },
      {
        name: '🔄 `/sync-listings`',
        value:
          '**Description:** Manually sync all public listings to this server\n' +
          '**Usage:** `/sync-listings`\n' +
          '**When to use:**\n' +
          '• After a bot restart or update\n' +
          '• If listings appear missing\n' +
          '• To fix any sync issues\n' +
          '• To refresh listing threads\n\n' +
          "**Note:** This will create threads for all public listings that don't already exist",
        inline: false,
      },
      {
        name: '❓ `/admin-help`',
        value:
          '**Description:** Show this help message\n' +
          '**Usage:** `/admin-help`\n' +
          'Displays all available admin commands and their usage',
        inline: false,
      },
      {
        name: '📊 Other Commands',
        value:
          '**User Commands:**\n' +
          '• `/help` - Show general bot help\n' +
          '• `/listing create` - Create a new listing\n' +
          '• `/signup` - Sign up for Bloxtr8\n' +
          '• `/link` - Link Roblox account\n' +
          '• `/verify` - Verify Discord profile',
        inline: false,
      },
      {
        name: '🔐 Required Permissions',
        value:
          'The bot requires these permissions to function properly:\n' +
          '• **Manage Channels** - To create marketplace channels\n' +
          '• **Manage Threads** - To create listing threads\n' +
          '• **Send Messages** - To post listings and updates\n' +
          '• **Embed Links** - To show rich listing embeds\n' +
          '• **Read Message History** - To manage threads',
        inline: false,
      },
      {
        name: '💡 Tips',
        value:
          '• Run `/marketplace-setup` once when first adding the bot\n' +
          '• Use `/sync-listings` if you notice missing listings\n' +
          '• The bot auto-syncs listings when joining new servers\n' +
          '• Listings are organized by price into different channels',
        inline: false,
      }
    )
    .setColor('#5865f2')
    .setFooter({
      text: 'Bloxtr8 • Professional Game Trading Platform',
    })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
