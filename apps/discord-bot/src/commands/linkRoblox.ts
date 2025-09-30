import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';

import { getWebAppBaseUrl, getApiBaseUrl } from '../utils/urls.js';
import {
  checkUserExists,
  checkProviderAccount,
} from '../utils/userVerification.js';

export async function handleLinkRoblox(
  interaction: ChatInputCommandInteraction
) {
  try {
    // Defer the reply immediately to extend the timeout to 15 minutes
    await interaction.deferReply({ ephemeral: true });

    // Check if user exists (without creating them)
    const userResult = await checkUserExists(interaction.user.id);

    if (!userResult.isVerified || !userResult.user) {
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

      await interaction.editReply({
        embeds: [errorEmbed],
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

      await interaction.editReply({
        embeds: [alreadyLinkedEmbed],
      });
      return;
    }

    // Generate secure link token
    const tokenResponse = await fetch(
      `${getApiBaseUrl()}/api/users/link-token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          discordId: interaction.user.id,
          purpose: 'roblox_link',
        }),
      }
    );

    if (!tokenResponse.ok) {
      let errorMessage =
        'Failed to generate secure link. Please try again later.';

      try {
        const errorData = (await tokenResponse.json()) as { message?: string };
        if (errorData.message) {
          errorMessage = errorData.message;
        }
      } catch {
        // Use default error message
      }

      const errorEmbed = new EmbedBuilder()
        .setColor(0xef4444)
        .setTitle('❌ Error')
        .setDescription(errorMessage)
        .addFields({
          name: '💡 Need Help?',
          value: errorMessage.includes('sign up')
            ? 'Use `/signup` command to create your account first'
            : 'Please contact support if this issue persists',
          inline: false,
        })
        .setTimestamp();

      await interaction.editReply({
        embeds: [errorEmbed],
      });
      return;
    }

    const tokenData = (await tokenResponse.json()) as {
      token: string;
      expiresIn: number;
    };
    const { token, expiresIn } = tokenData;

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
          name: '⏰ Expires',
          value: `This link expires in ${Math.floor(expiresIn / 60)} minutes`,
          inline: true,
        },
        {
          name: '🕐 Expires At',
          value: `<t:${Math.floor((Date.now() + expiresIn * 1000) / 1000)}:R>`,
          inline: true,
        },
        {
          name: '🔗 Start Process',
          value: 'Click the button below to connect your Roblox account',
          inline: false,
        }
      )
      .setFooter({
        text: 'Secure • Fast • Trusted • Link expires in 15 minutes',
        iconURL: interaction.user.displayAvatarURL(),
      })
      .setTimestamp();

    // Create connect button with secure token
    const connectButton = new ButtonBuilder()
      .setLabel('🔗 Connect Roblox Account')
      .setStyle(ButtonStyle.Link)
      .setURL(`${getWebAppBaseUrl()}/auth/link/roblox?token=${token}`);

    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      connectButton
    );

    await interaction.editReply({
      embeds: [linkEmbed],
      components: [buttonRow],
    });
  } catch (error) {
    console.error('Error handling link Roblox:', error);

    // Try to edit the reply if it was deferred, otherwise send a follow-up
    try {
      await interaction.editReply({
        content:
          '❌ An error occurred while processing your request. Please try again later.',
      });
    } catch {
      // If edit fails, try to send a follow-up message
      try {
        await interaction.followUp({
          content:
            '❌ An error occurred while processing your request. Please try again later.',
          ephemeral: true,
        });
      } catch (followUpError) {
        console.error('Failed to send error message:', followUpError);
      }
    }
  }
}
