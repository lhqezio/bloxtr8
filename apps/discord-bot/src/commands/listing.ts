import {
  ActionRowBuilder,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';

import { createListing } from '../utils/apiClient.js';
import { getApiBaseUrl } from '../utils/apiClient.js';
import { verifyUserForListing } from '../utils/userVerification.js';
import { ensureUserExists } from '../utils/userVerification.js';

export async function handleListingCreate(
  interaction: ChatInputCommandInteraction
) {
  try {
    // Ensure user exists in database
    const userResult = await ensureUserExists(
      interaction.user.id,
      interaction.user.username
    );

    if (!userResult.user) {
      const errorEmbed = new EmbedBuilder()
        .setColor(0xef4444)
        .setTitle('❌ Account Error')
        .setDescription('**Unable to access your account**')
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields({
          name: '🔧 Quick Fix',
          value: 'Try `/signup` to create a new account',
        })
        .setFooter({
          text: 'Need help? Contact support',
          iconURL: interaction.user.displayAvatarURL(),
        })
        .setTimestamp();

      await interaction.reply({
        embeds: [errorEmbed],
        ephemeral: true,
      });
      return;
    }

    // Check if user is verified
    const verificationResult = await verifyUserForListing(interaction.user.id);

    if (!verificationResult.isVerified) {
      const embed = new EmbedBuilder()
        .setColor(0xf59e0b)
        .setTitle('🔒 Verification Required')
        .setDescription('**Complete KYC to create listings**')
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields(
          {
            name: '📋 What is KYC?',
            value: 'Identity verification for safe trading',
            inline: true,
          },
          {
            name: '⏱️ Processing',
            value: '1-3 business days',
            inline: true,
          },
          {
            name: '🌐 Get Started',
            value: 'Visit our web app to verify',
            inline: true,
          }
        )
        .setFooter({
          text: 'Protects you and other traders',
          iconURL: interaction.user.displayAvatarURL(),
        })
        .setTimestamp();

      await interaction.reply({
        embeds: [embed],
        ephemeral: true,
      });
      return;
    }

    // User is verified, show the listing creation modal
    const modal = new ModalBuilder()
      .setCustomId('listing_create_modal')
      .setTitle('Create New Listing');

    // Title input
    const titleInput = new TextInputBuilder()
      .setCustomId('listing_title')
      .setLabel('Listing Title')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter a descriptive title for your listing')
      .setRequired(true)
      .setMaxLength(255);

    // Summary input
    const summaryInput = new TextInputBuilder()
      .setCustomId('listing_summary')
      .setLabel('Description')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Describe what you are selling in detail')
      .setRequired(true)
      .setMaxLength(1000);

    // Price input
    const priceInput = new TextInputBuilder()
      .setCustomId('listing_price')
      .setLabel('Price (in cents)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter price in cents (e.g., 1000 for $10.00)')
      .setRequired(true);

    // Category input
    const categoryInput = new TextInputBuilder()
      .setCustomId('listing_category')
      .setLabel('Category')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g., Game Pass, Developer Products, Virtual Items')
      .setRequired(true)
      .setMaxLength(100);

    // Add inputs to action rows
    const titleRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
      titleInput
    );
    const summaryRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
      summaryInput
    );
    const priceRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
      priceInput
    );
    const categoryRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
      categoryInput
    );

    modal.addComponents(titleRow, summaryRow, priceRow, categoryRow);

    await interaction.showModal(modal);
  } catch (error) {
    console.error('Error handling listing create:', error);
    await interaction.reply({
      content:
        '❌ An error occurred while processing your request. Please try again later.',
      ephemeral: true,
    });
  }
}

export async function handleListingModalSubmit(
  interaction: ModalSubmitInteraction
) {
  try {
    // Extract form data
    const title = interaction.fields.getTextInputValue('listing_title');
    const summary = interaction.fields.getTextInputValue('listing_summary');
    const priceText = interaction.fields.getTextInputValue('listing_price');
    const category = interaction.fields.getTextInputValue('listing_category');

    // Validate price
    const price = parseInt(priceText, 10);
    if (isNaN(price) || price <= 0) {
      await interaction.reply({
        content: '❌ Invalid price. Please enter a positive number in cents.',
        ephemeral: true,
      });
      return;
    }

    // Get user info
    const userResult = await ensureUserExists(
      interaction.user.id,
      interaction.user.username
    );

    if (!userResult.user) {
      const errorEmbed = new EmbedBuilder()
        .setColor(0xef4444)
        .setTitle('❌ Account Error')
        .setDescription('**Unable to access your account**')
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields({
          name: '🔧 Quick Fix',
          value: 'Try `/signup` to create a new account',
        })
        .setFooter({
          text: 'Need help? Contact support',
          iconURL: interaction.user.displayAvatarURL(),
        })
        .setTimestamp();

      await interaction.reply({
        embeds: [errorEmbed],
        ephemeral: true,
      });
      return;
    }

    // Show loading message
    const loadingEmbed = new EmbedBuilder()
      .setColor(0x00d4aa)
      .setTitle('⏳ Creating Listing...')
      .setDescription('**Please wait while we process your listing**')
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields({
        name: '🔄 Status',
        value: 'Processing your information...',
      })
      .setFooter({
        text: 'Almost ready...',
        iconURL: interaction.user.displayAvatarURL(),
      })
      .setTimestamp();

    await interaction.reply({
      embeds: [loadingEmbed],
      ephemeral: true,
    });

    // Create listing via API
    const apiResult = await createListing({
      title,
      summary,
      price,
      category,
      sellerId: userResult.user.id,
      guildId: interaction.guildId || undefined,
    });

    if (!apiResult.success) {
      const errorMessage = apiResult.error.errors
        ? apiResult.error.errors.map(e => `${e.field}: ${e.message}`).join('\n')
        : apiResult.error.message;

      await interaction.editReply({
        content: `❌ Failed to create listing:\n${errorMessage}`,
      });
      return;
    }

    // Success - show listing created message with ID and link
    const embed = new EmbedBuilder()
      .setColor(0x00d4aa)
      .setTitle('🎉 Listing Created!')
      .setDescription('**Your listing is now live!**')
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields(
        {
          name: '📋 Details',
          value: `**${title}**\n$${(price / 100).toFixed(2)} • ${category}`,
          inline: true,
        },
        {
          name: '🆔 ID',
          value: `\`${apiResult.data.id}\``,
          inline: true,
        },
        {
          name: '🔗 View',
          value: `[Open Listing](${getApiBaseUrl()}/api/listings/${apiResult.data.id})`,
          inline: true,
        }
      )
      .setTimestamp()
      .setFooter({
        text: `Created by ${interaction.user.username}`,
        iconURL: interaction.user.displayAvatarURL(),
      });

    await interaction.editReply({
      content: '',
      embeds: [embed],
    });
  } catch (error) {
    console.error('Error handling modal submission:', error);
    await interaction.editReply({
      content:
        '❌ An error occurred while creating your listing. Please try again later.',
    });
  }
}
