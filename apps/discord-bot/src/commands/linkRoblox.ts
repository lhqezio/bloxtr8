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
import { sendDMWithEmbed, createDMDisabledEmbed } from '../utils/dmHelper.js';
import { getWebAppBaseUrl, getApiBaseUrl } from '../utils/urls.js';
import {
  checkUserExists,
  checkProviderAccount,
} from '../utils/userVerification.js';

export async function handleLinkRoblox(
  interaction: ChatInputCommandInteraction
) {
  try {
    // Defer reply immediately to prevent timeout
    await interaction.deferReply({ ephemeral: true });

    // Check if user exists (without creating them)
    const userResult = await checkUserExists(interaction.user.id);

    if (!userResult.user) {
      // User not signed up - trigger signup flow via DM
      const signupEmbed = new EmbedBuilder()
        .setColor(0x00d4aa)
        .setTitle('🚀 Welcome to Bloxtr8!')
        .setDescription('**The secure marketplace for Roblox trading**')
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields(
          {
            name: '🛡️ Secure Trading',
            value: 'Escrow protection • Verified users • Safe transactions',
            inline: false,
          },
          {
            name: '🔒 Privacy First',
            value: 'Encrypted data • No sharing • You control your info',
            inline: false,
          },
          {
            name: '⚖️ Requirements',
            value: '13+ years old • KYC verification • Follow guidelines',
            inline: false,
          },
          {
            name: '📋 Next Steps',
            value:
              '**1.** Sign up for an account\n**2.** Link your Roblox account\n**3.** Start trading!',
            inline: false,
          }
        )
        .setFooter({
          text: 'By signing up, you agree to our Terms of Service',
          iconURL: interaction.user.displayAvatarURL(),
        })
        .setTimestamp();

      // Try to send DM
      const dmResult = await sendDMWithEmbed(interaction.user, signupEmbed);

      if (dmResult.success) {
        // DM sent successfully - edit deferred reply
        await interaction.editReply({
          content:
            '📩 **Check your DMs to sign up and link your Roblox account!**',
        });
      } else {
        // DM failed - show fallback message
        const fallbackEmbed = createDMDisabledEmbed('link', interaction.user);
        await interaction.editReply({
          embeds: [fallbackEmbed],
        });
      }
      return;
    }

    // Check if we're in a DM context
    const isDM = !interaction.guildId;

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

    // If in server, send DM with link instructions
    if (!isDM) {
      // Generate link token
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
        await interaction.editReply({
          content: '❌ Failed to generate link token. Please try again later.',
        });
        return;
      }

      const tokenData = (await tokenResponse.json()) as {
        token: string;
        expiresIn: number;
      };

      // Create link instructions embed
      const linkEmbed = Bloxtr8Embed.info(
        'Connect Roblox Account',
        'Link your Roblox account to unlock trading features'
      )
        .addUserAvatar(
          interaction.user.id,
          interaction.user.avatar || undefined
        )
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
          `<t:${Math.floor((Date.now() + tokenData.expiresIn * 1000) / 1000)}:R>`,
          true
        );

      // Create connect button
      const connectButton = Bloxtr8Button.link(
        '🔗 Connect Roblox Account',
        `${getWebAppBaseUrl()}/auth/link/roblox?token=${tokenData.token}`
      );

      const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        connectButton
      );

      // Try to send DM
      const dmResult = await sendDMWithEmbed(interaction.user, linkEmbed, [
        buttonRow,
      ]);

      if (dmResult.success) {
        // DM sent successfully - edit deferred reply
        await interaction.editReply({
          content: '📩 **Check your DMs to link your Roblox account!**',
        });
      } else {
        // DM failed - show fallback message
        const fallbackEmbed = createDMDisabledEmbed('link', interaction.user);
        await interaction.editReply({
          embeds: [fallbackEmbed],
        });
      }
      return;
    }

    // Already in DM context - continue with deferred reply

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
