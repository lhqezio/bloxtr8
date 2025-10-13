import {
  ActionRowBuilder,
  type ButtonBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';

import {
  Bloxtr8Embed,
  Bloxtr8Button,
  EmbedPatterns,
} from '../utils/designSystem.js';
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

    if (!userResult.user) {
      const errorEmbed = EmbedPatterns.accountSetupRequired().addUserAvatar(
        interaction.user.id,
        interaction.user.avatar || undefined
      );

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
      const alreadyLinkedEmbed = EmbedPatterns.successfullyLinked(
        'roblox'
      ).addUserAvatar(
        interaction.user.id,
        interaction.user.avatar || undefined
      );

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

    // Show linking instructions with new design system
    const linkEmbed = Bloxtr8Embed.info(
      'Connect Roblox Account',
      'Link your Roblox account to unlock trading features'
    )
      .addUserAvatar(interaction.user.id, interaction.user.avatar || undefined)
      .addActionField(
        'Quick Setup',
        '**1.** Click the button below\n**2.** Sign in with Roblox\n**3.** Authorize connection',
        false
      )
      .addActionField(
        'Benefits',
        'Verified status • Enhanced security • Trading access',
        true
      )
      .addActionField(
        'Security',
        'OAuth 2.0 • No passwords • Limited access',
        true
      )
      .addActionField(
        'Expires',
        `<t:${Math.floor((Date.now() + expiresIn * 1000) / 1000)}:R>`,
        true
      );

    // Create connect button with secure token
    const connectButton = Bloxtr8Button.link(
      '🔗 Connect Roblox Account',
      `${getWebAppBaseUrl()}/auth/link/roblox?token=${token}`
    );

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
