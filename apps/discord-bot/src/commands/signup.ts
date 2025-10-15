import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';

import { sendDMWithEmbed, createDMDisabledEmbed } from '../utils/dmHelper.js';
import { getWebAppBaseUrl, getApiBaseUrl } from '../utils/urls.js';
import { verify } from '../utils/userVerification.js';
import { ensureUserExists } from '../utils/userVerification.js';

export async function handleSignup(interaction: ChatInputCommandInteraction) {
  try {
    // Check if user already exists first
    const existingUser = await verify(interaction.user.id);

    if (
      existingUser.success &&
      ((Array.isArray(existingUser.data) && existingUser.data.length > 0) ||
        (!Array.isArray(existingUser.data) && existingUser.data.user))
    ) {
      // User already exists - reply ephemerally in server
      const embed = new EmbedBuilder()
        .setColor(0xf59e0b)
        .setTitle('👋 Welcome Back!')
        .setDescription('**You already have a Bloxtr8 account!**')
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields(
          {
            name: '📊 Status',
            value: '`/verify` - Check account',
            inline: true,
          },
          {
            name: '🔗 Link',
            value: '`/link` - Connect Roblox',
            inline: true,
          },
          {
            name: '📝 Create',
            value: '`/listing create` - New listing',
            inline: true,
          }
        )
        .setFooter({
          text: 'Ready to trade?',
          iconURL: interaction.user.displayAvatarURL(),
        })
        .setTimestamp();

      await interaction.reply({
        embeds: [embed],
        ephemeral: true,
      });
      return;
    }

    // User doesn't exist - send DM with signup invitation
    const consentEmbed = new EmbedBuilder()
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
        }
      )
      .setFooter({
        text: 'By signing up, you agree to our Terms of Service',
        iconURL: interaction.user.displayAvatarURL(),
      })
      .setTimestamp();

    // Create accept/decline buttons
    const acceptButton = new ButtonBuilder()
      .setCustomId('consent_accept')
      .setLabel('🚀 Join Bloxtr8')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✨');

    const declineButton = new ButtonBuilder()
      .setCustomId('consent_decline')
      .setLabel('Maybe Later')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('👋');

    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      acceptButton,
      declineButton
    );

    // Try to send DM
    const dmResult = await sendDMWithEmbed(interaction.user, consentEmbed, [
      buttonRow,
    ]);

    if (dmResult.success) {
      // DM sent successfully - reply ephemerally in server
      await interaction.reply({
        content: '📩 **Check your DMs for signup instructions!**',
        ephemeral: true,
      });
    } else {
      // DM failed - show fallback message in server
      const fallbackEmbed = createDMDisabledEmbed('signup', interaction.user);
      await interaction.reply({
        embeds: [fallbackEmbed],
        ephemeral: true,
      });
    }
  } catch (error) {
    console.error('Error handling signup:', error);

    // Try to edit the reply if it was deferred, otherwise send a follow-up
    try {
      await interaction.editReply({
        content:
          '❌ An error occurred while processing your signup request. Please try again later.',
      });
    } catch {
      // If edit fails, try to send a follow-up message
      try {
        await interaction.followUp({
          content:
            '❌ An error occurred while processing your signup request. Please try again later.',
          ephemeral: true,
        });
      } catch (followUpError) {
        console.error('Failed to send error message:', followUpError);
      }
    }
  }
}

export async function handleConsentAccept(interaction: ButtonInteraction) {
  try {
    // Show loading message
    await interaction.deferUpdate();

    // Create user account
    const userResult = await ensureUserExists(
      interaction.user.id,
      interaction.user.username
    );

    if (!userResult.user) {
      const errorEmbed = new EmbedBuilder()
        .setColor(0xff6b6b)
        .setTitle('❌ Account Creation Failed')
        .setDescription(
          userResult.error ||
            'Failed to create your account. Please try again later.'
        )
        .setTimestamp();

      await interaction.editReply({
        embeds: [errorEmbed],
        components: [],
      });
      return;
    }

    // Success message with automatic link prompt
    const successEmbed = new EmbedBuilder()
      .setColor(0x00d4aa)
      .setTitle('🎉 Welcome to Bloxtr8!')
      .setDescription('**Your account has been created!**')
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields(
        {
          name: '👤 Account',
          value: `ID: \`${userResult.user.id}\`\nStatus: ${userResult.user.kycVerified ? '🟢 Verified' : '🟡 Pending'}`,
          inline: true,
        },
        {
          name: '🔗 Connected',
          value: 'Discord: ✅\nRoblox: ❌',
          inline: true,
        },
        {
          name: '🚀 Next Step',
          value: '**Link your Roblox account to start trading!**',
          inline: false,
        }
      )
      .setTimestamp()
      .setFooter({
        text: `Welcome aboard, ${interaction.user.username}!`,
        iconURL: interaction.user.displayAvatarURL(),
      });

    // Generate link token for Roblox linking
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
      // Fallback without link button
      await interaction.editReply({
        embeds: [successEmbed],
        components: [],
      });
      return;
    }

    // Create link button
    const linkButton = new ButtonBuilder()
      .setCustomId('link_roblox_after_signup')
      .setLabel('🔗 Link Roblox Account')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🎮');

    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      linkButton
    );

    await interaction.editReply({
      embeds: [successEmbed],
      components: [buttonRow],
    });
  } catch (error) {
    console.error('Error handling consent acceptance:', error);
    await interaction.editReply({
      content:
        '❌ An error occurred while creating your account. Please try again later.',
      components: [],
    });
  }
}

export async function handleConsentDecline(interaction: ButtonInteraction) {
  try {
    const declineEmbed = new EmbedBuilder()
      .setColor(0x6b7280)
      .setTitle('👋 No Problem!')
      .setDescription('**Registration cancelled**')
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields({
        name: '💡 Remember',
        value: 'Use `/signup` anytime to create your account',
      })
      .setTimestamp()
      .setFooter({
        text: 'Thanks for considering Bloxtr8!',
        iconURL: interaction.user.displayAvatarURL(),
      });

    await interaction.update({
      embeds: [declineEmbed],
      components: [],
    });
  } catch (error) {
    console.error('Error handling consent decline:', error);
    await interaction.editReply({
      content: '❌ An error occurred. Please try again later.',
      components: [],
    });
  }
}

export async function handleLinkRobloxAfterSignup(
  interaction: ButtonInteraction
) {
  try {
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
      await interaction.reply({
        content: '❌ Failed to generate link token. Please try again later.',
        ephemeral: true,
      });
      return;
    }

    const tokenData = (await tokenResponse.json()) as {
      token: string;
      expiresIn: number;
    };

    // Create link instructions embed
    const linkEmbed = new EmbedBuilder()
      .setColor(0x00d4aa)
      .setTitle('🔗 Link Your Roblox Account')
      .setDescription(
        '**Connect your Roblox account to unlock trading features**'
      )
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields(
        {
          name: '⚡ Quick Setup',
          value:
            '**1.** Click the button below\n**2.** Sign in with Roblox\n**3.** Authorize connection',
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
          value: `<t:${Math.floor((Date.now() + tokenData.expiresIn * 1000) / 1000)}:R>`,
          inline: true,
        }
      )
      .setFooter({
        text: '🛡️ Bloxtr8 • Secure Trading Platform',
        iconURL:
          'https://cdn.discordapp.com/attachments/1234567890/1234567890/bloxtr8-logo.png',
      })
      .setTimestamp();

    // Create connect button
    const connectButton = new ButtonBuilder()
      .setLabel('🔗 Connect Roblox Account')
      .setStyle(ButtonStyle.Link)
      .setURL(
        `${getWebAppBaseUrl()}/auth/link/roblox?token=${tokenData.token}`
      );

    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      connectButton
    );

    await interaction.update({
      embeds: [linkEmbed],
      components: [buttonRow],
    });
  } catch (error) {
    console.error('Error handling link Roblox after signup:', error);
    await interaction.editReply({
      content:
        '❌ An error occurred while setting up Roblox linking. Please try again later.',
      components: [],
    });
  }
}
