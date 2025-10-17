import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';

import { createOffer, getListing } from '../utils/apiClient.js';
import { verify } from '../utils/userVerification.js';

/**
 * Handle "Make Offer" button click
 * Shows a modal for the user to enter offer amount and conditions
 */
export async function handleMakeOfferButton(
  interaction: ButtonInteraction
): Promise<void> {
  try {
    // Extract listing ID from button customId (format: make_offer_${listingId})
    const listingId = interaction.customId.replace('make_offer_', '');

    if (!listingId) {
      await interaction.reply({
        content: '❌ Invalid listing ID. Please try again.',
        ephemeral: true,
      });
      return;
    }

    // Fetch listing details to show price in modal
    const listingResult = await getListing(listingId);

    if (!listingResult.success) {
      await interaction.reply({
        content: `❌ Could not fetch listing details: ${listingResult.error.message}`,
        ephemeral: true,
      });
      return;
    }

    const listing = listingResult.data;

    // Check if listing is active
    if (listing.status !== 'ACTIVE') {
      await interaction.reply({
        content: '❌ This listing is no longer active.',
        ephemeral: true,
      });
      return;
    }

    // Verify user exists and has linked Roblox account (TIER_1+)
    const verifyResult = await verify(interaction.user.id);

    if (!verifyResult.success) {
      await interaction.reply({
        content:
          '❌ You must sign up first. Use `/signup` command to get started.',
        ephemeral: true,
      });
      return;
    }

    // Check if user has linked Roblox account
    const userData = Array.isArray(verifyResult.data)
      ? null
      : verifyResult.data;

    if (!userData || userData.user.kycTier === 'TIER_0') {
      await interaction.reply({
        content:
          '❌ You must link your Roblox account to make offers. Use `/link` command to link your account.',
        ephemeral: true,
      });
      return;
    }

    // Check if user is trying to offer on their own listing
    if (userData.user.id === listing.userId) {
      await interaction.reply({
        content: '❌ You cannot make an offer on your own listing.',
        ephemeral: true,
      });
      return;
    }

    // Create modal for offer details
    const modal = new ModalBuilder()
      .setCustomId(`make_offer_modal_${listingId}`)
      .setTitle(`Make Offer - ${listing.title}`);

    // Offer amount input (required)
    const amountInput = new TextInputBuilder()
      .setCustomId('offer_amount')
      .setLabel('Your Offer Amount (USD)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder(`Listing Price: $${listing.price}`)
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(10);

    // Conditions input (optional)
    const conditionsInput = new TextInputBuilder()
      .setCustomId('offer_conditions')
      .setLabel('Conditions (Optional)')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder(
        'Any conditions or notes for your offer (e.g., payment method, timeline, etc.)'
      )
      .setRequired(false)
      .setMaxLength(500);

    const firstActionRow =
      new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput);
    const secondActionRow =
      new ActionRowBuilder<TextInputBuilder>().addComponents(conditionsInput);

    modal.addComponents(firstActionRow, secondActionRow);

    await interaction.showModal(modal);
  } catch (error) {
    console.error('Error in handleMakeOfferButton:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content:
          '❌ An error occurred while processing your request. Please try again.',
        ephemeral: true,
      });
    }
  }
}

/**
 * Handle modal submission for offer creation
 * Shows a confirmation embed with offer details
 */
export async function handleMakeOfferModalSubmit(
  interaction: ModalSubmitInteraction
): Promise<void> {
  try {
    // Extract listing ID from modal customId (format: make_offer_modal_${listingId})
    const listingId = interaction.customId.replace('make_offer_modal_', '');

    if (!listingId) {
      await interaction.reply({
        content: '❌ Invalid listing ID. Please try again.',
        ephemeral: true,
      });
      return;
    }

    // Get modal input values
    const offerAmountRaw = interaction.fields.getTextInputValue('offer_amount');
    const conditions =
      interaction.fields.getTextInputValue('offer_conditions') || '';

    // Validate and parse offer amount
    const offerAmount = parseFloat(offerAmountRaw.replace(/[^0-9.-]/g, ''));

    if (isNaN(offerAmount) || offerAmount <= 0) {
      await interaction.reply({
        content: '❌ Invalid offer amount. Please enter a positive number.',
        ephemeral: true,
      });
      return;
    }

    // Fetch listing details again for confirmation
    const listingResult = await getListing(listingId);

    if (!listingResult.success) {
      await interaction.reply({
        content: `❌ Could not fetch listing details: ${listingResult.error.message}`,
        ephemeral: true,
      });
      return;
    }

    const listing = listingResult.data;
    const listingPrice = parseFloat(listing.price);

    // Check if offer amount exceeds listing price
    if (offerAmount > listingPrice) {
      await interaction.reply({
        content: `❌ Your offer ($${offerAmount}) cannot exceed the listing price ($${listingPrice}).`,
        ephemeral: true,
      });
      return;
    }

    // Create confirmation embed
    const confirmEmbed = new EmbedBuilder()
      .setTitle('🤝 Confirm Your Offer')
      .setDescription(
        `You are about to make an offer on **${listing.title}**`
      )
      .setColor(0x00d4aa)
      .addFields(
        {
          name: '💰 Listing Price',
          value: `$${listingPrice}`,
          inline: true,
        },
        {
          name: '💸 Your Offer',
          value: `$${offerAmount}`,
          inline: true,
        },
        {
          name: '📊 Percentage',
          value: `${Math.round((offerAmount / listingPrice) * 100)}% of asking price`,
          inline: true,
        }
      );

    if (conditions) {
      confirmEmbed.addFields({
        name: '📝 Conditions',
        value: conditions,
        inline: false,
      });
    }

    confirmEmbed.addFields({
      name: 'ℹ️ What happens next?',
      value:
        '• The seller will be notified of your offer\n• Your offer will expire in 7 days\n• The seller can accept, decline, or counter your offer',
      inline: false,
    });

    // Encode conditions in customId (use "1" if has conditions, "0" if not)
    const hasConditions = conditions ? '1' : '0';

    // Create confirmation buttons
    const confirmButton = new ButtonBuilder()
      .setCustomId(`confirm_offer_${listingId}_${offerAmount}_${hasConditions}`)
      .setLabel('✅ Confirm Offer')
      .setStyle(ButtonStyle.Success);

    const cancelButton = new ButtonBuilder()
      .setCustomId(`cancel_offer_${listingId}`)
      .setLabel('❌ Cancel')
      .setStyle(ButtonStyle.Danger);

    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      confirmButton,
      cancelButton
    );

    // Store conditions in a temporary way (we'll retrieve from the original modal submission context)
    // For now, we'll pass it through the interaction update
    await interaction.reply({
      embeds: [confirmEmbed],
      components: [buttonRow],
      ephemeral: true,
    });

    // Store the conditions in a Map for retrieval when confirm is clicked
    // This is a simple in-memory store - consider Redis for production
    if (!global.offerConfirmationCache) {
      global.offerConfirmationCache = new Map();
    }
    global.offerConfirmationCache.set(
      `${interaction.user.id}_${listingId}_${offerAmount}`,
      conditions
    );

    // Clean up cache after 5 minutes
    setTimeout(() => {
      global.offerConfirmationCache?.delete(
        `${interaction.user.id}_${listingId}_${offerAmount}`
      );
    }, 5 * 60 * 1000);
  } catch (error) {
    console.error('Error in handleMakeOfferModalSubmit:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content:
          '❌ An error occurred while processing your offer. Please try again.',
        ephemeral: true,
      });
    }
  }
}

/**
 * Handle offer confirmation
 * Submits the offer to the API
 */
export async function handleConfirmOffer(
  interaction: ButtonInteraction
): Promise<void> {
  try {
    // Parse customId (format: confirm_offer_${listingId}_${amount}_${hasConditions})
    const parts = interaction.customId.split('_');
    if (parts.length < 5) {
      await interaction.reply({
        content: '❌ Invalid confirmation data. Please try again.',
        ephemeral: true,
      });
      return;
    }

    const listingId = parts[2] as string;
    const offerAmount = parseFloat(parts[3] as string);

    // Retrieve conditions from cache
    const cacheKey = `${interaction.user.id}_${listingId}_${offerAmount}`;
    const conditions = global.offerConfirmationCache?.get(cacheKey) || undefined;

    // Clean up cache
    global.offerConfirmationCache?.delete(cacheKey);

    // Defer reply as API call might take time
    await interaction.deferReply({ ephemeral: true });

    // Get buyer's user ID from Discord ID
    const verifyResult = await verify(interaction.user.id);

    if (!verifyResult.success) {
      await interaction.editReply({
        content:
          '❌ Could not verify your account. Please sign up first using `/signup`.',
      });
      return;
    }

    const userData = Array.isArray(verifyResult.data)
      ? null
      : verifyResult.data;

    if (!userData) {
      await interaction.editReply({
        content: '❌ Could not retrieve your user information. Please try again.',
      });
      return;
    }

    // Submit offer to API
    const offerResult = await createOffer({
      listingId,
      buyerId: userData.user.id,
      amount: offerAmount.toString(),
      conditions,
      // expiry is optional - API will default to 7 days
    });

    if (!offerResult.success) {
      await interaction.editReply({
        content: `❌ Failed to create offer: ${offerResult.error.message}`,
      });
      return;
    }

    // Success! Show confirmation
    const successEmbed = new EmbedBuilder()
      .setTitle('✅ Offer Submitted Successfully!')
      .setDescription('Your offer has been sent to the seller.')
      .setColor(0x00d4aa)
      .addFields(
        {
          name: '💸 Offer Amount',
          value: `$${offerAmount}`,
          inline: true,
        },
        {
          name: '🆔 Offer ID',
          value: offerResult.data.id,
          inline: true,
        },
        {
          name: '⏰ Expires',
          value: 'In 7 days',
          inline: true,
        }
      );

    if (conditions) {
      successEmbed.addFields({
        name: '📝 Conditions',
        value: conditions,
        inline: false,
      });
    }

    successEmbed.addFields({
      name: 'ℹ️ Next Steps',
      value:
        "• You'll be notified when the seller responds\n• The seller can accept, decline, or counter your offer\n• Check your DMs for updates",
      inline: false,
    });

    await interaction.editReply({
      content: null,
      embeds: [successEmbed],
    });

    // Update the original message to remove buttons
    try {
      await interaction.message.edit({
        components: [],
      });
    } catch (error) {
      console.error('Could not update confirmation message:', error);
    }
  } catch (error) {
    console.error('Error in handleConfirmOffer:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content:
          '❌ An error occurred while confirming your offer. Please try again.',
        ephemeral: true,
      });
    } else {
      await interaction.editReply({
        content:
          '❌ An error occurred while confirming your offer. Please try again.',
      });
    }
  }
}

/**
 * Handle offer cancellation
 * Simply dismisses the confirmation message
 */
export async function handleCancelOffer(
  interaction: ButtonInteraction
): Promise<void> {
  try {
    // Parse listingId from customId (format: cancel_offer_${listingId})
    const listingId = interaction.customId.replace('cancel_offer_', '');

    // Clean up any cached data
    // We need to find the cache entry - iterate through keys starting with user ID
    if (global.offerConfirmationCache) {
      const userIdPrefix = `${interaction.user.id}_${listingId}_`;
      for (const key of global.offerConfirmationCache.keys()) {
        if (key.startsWith(userIdPrefix)) {
          global.offerConfirmationCache.delete(key);
        }
      }
    }

    await interaction.update({
      content: '❌ Offer cancelled.',
      embeds: [],
      components: [],
    });
  } catch (error) {
    console.error('Error in handleCancelOffer:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ An error occurred. Please try again.',
        ephemeral: true,
      });
    }
  }
}

// Extend global type for cache
declare global {
  var offerConfirmationCache: Map<string, string> | undefined;
}

