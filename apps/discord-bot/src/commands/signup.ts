import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';

import { verify } from '../utils/userVerification.js';
import { ensureUserExists } from '../utils/userVerification.js';

export async function handleSignup(interaction: ChatInputCommandInteraction) {
  try {
    // Defer the reply immediately to extend the timeout to 15 minutes
    await interaction.deferReply({ ephemeral: true });

    // Check if user already exists
    const existingUser = await verify(interaction.user.id);

    if (
      existingUser.success &&
      ((Array.isArray(existingUser.data) && existingUser.data.length > 0) ||
        (!Array.isArray(existingUser.data) && existingUser.data.user))
    ) {
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

      await interaction.editReply({
        embeds: [embed],
      });
      return;
    }

    // Show consent form
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

    await interaction.editReply({
      embeds: [consentEmbed],
      components: [buttonRow],
    });
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

    // Success message
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
          name: '🚀 Next Steps',
          value: '`/link` - Connect Roblox\n`/verify` - Check status',
          inline: false,
        }
      )
      .setTimestamp()
      .setFooter({
        text: `Welcome aboard, ${interaction.user.username}!`,
        iconURL: interaction.user.displayAvatarURL(),
      });

    await interaction.editReply({
      embeds: [successEmbed],
      components: [],
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
