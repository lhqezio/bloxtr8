import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';

import { getWebAppBaseUrl } from '../utils/urls.js';
import {
  ensureUserExists,
  checkProviderAccount,
} from '../utils/userVerification.js';

export async function handleLinkRoblox(
  interaction: ChatInputCommandInteraction
) {
  try {
    // Check if user exists
    const userResult = await ensureUserExists(
      interaction.user.id,
      interaction.user.username
    );

    if (!userResult.user) {
      const errorEmbed = new EmbedBuilder()
        .setColor(0xef4444)
        .setTitle('🚫 Account Required')
        .setDescription('**You need a Bloxtr8 account first!**')
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields({
          name: '🚀 Get Started',
          value: 'Use `/signup` to create your account',
        })
        .setFooter({
          text: 'Join thousands of secure traders!',
          iconURL: interaction.user.displayAvatarURL(),
        })
        .setTimestamp();

      await interaction.reply({
        embeds: [errorEmbed],
        ephemeral: true,
      });
      return;
    }

    // Check if Roblox account is already linked
    const hasRobloxAccount = await checkProviderAccount(
      interaction.user.id,
      'roblox'
    );

    if (hasRobloxAccount) {
      const alreadyLinkedEmbed = new EmbedBuilder()
        .setColor(0x10b981)
        .setTitle('✅ Roblox Connected!')
        .setDescription('**Your Roblox account is already linked!**')
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields(
          {
            name: '📊 Status',
            value: '`/verify` - Check accounts',
            inline: true,
          },
          {
            name: '📝 Create',
            value: '`/listing create` - New listing',
            inline: true,
          },
          {
            name: '🌐 Browse',
            value: 'Visit our web app',
            inline: true,
          }
        )
        .setFooter({
          text: "You're ready to trade!",
          iconURL: interaction.user.displayAvatarURL(),
        })
        .setTimestamp();

      await interaction.reply({
        embeds: [alreadyLinkedEmbed],
        ephemeral: true,
      });
      return;
    }

    // Show linking instructions
    const linkEmbed = new EmbedBuilder()
      .setColor(0x00d4aa)
      .setTitle('🔗 Connect Roblox Account')
      .setDescription(
        '**Link your Roblox account to unlock trading features!**'
      )
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields(
        {
          name: '🚀 Quick Setup',
          value:
            '**1.** Click the link below\n**2.** Sign in with Roblox\n**3.** Authorize connection',
          inline: false,
        },
        {
          name: '✅ Benefits',
          value: 'Verified status • Enhanced security • Trading access',
          inline: true,
        },
        {
          name: '🔒 Security',
          value: 'OAuth 2.0 • No passwords • Limited access',
          inline: true,
        },
        {
          name: '🔗 Start Process',
          value: 'Click the button below to connect your Roblox account',
          inline: false,
        }
      )
      .setFooter({
        text: 'Secure • Fast • Trusted',
        iconURL: interaction.user.displayAvatarURL(),
      })
      .setTimestamp();

    // Create connect button
    const connectButton = new ButtonBuilder()
      .setLabel('🔗 Connect Roblox Account')
      .setStyle(ButtonStyle.Link)
      .setURL(
        `${getWebAppBaseUrl()}/auth/link/roblox?discordId=${interaction.user.id}`
      );

    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      connectButton
    );

    await interaction.reply({
      embeds: [linkEmbed],
      components: [buttonRow],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error handling link Roblox:', error);
    await interaction.reply({
      content:
        '❌ An error occurred while processing your request. Please try again later.',
      ephemeral: true,
    });
  }
}
