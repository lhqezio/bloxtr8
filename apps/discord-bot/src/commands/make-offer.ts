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

import {
  createOffer,
  createOfferDraft,
  deleteOfferDraft,
  getOfferDraft,
  getListing,
} from '../utils/apiClient.js';
import { formatPrice } from '../utils/marketplace.js';
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
      .setPlaceholder(`Listing Price: ${formatPrice(listing.price)}`)
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
    // Defer reply immediately to prevent timeout
    await interaction.deferReply({ ephemeral: true });

    // Extract listing ID from modal customId (format: make_offer_modal_${listingId})
    const listingId = interaction.customId.replace('make_offer_modal_', '');

    if (!listingId) {
      await interaction.editReply({
        content: '❌ Invalid listing ID. Please try again.',
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
      await interaction.editReply({
        content: '❌ Invalid offer amount. Please enter a positive number.',
      });
      return;
    }

    // Fetch listing details again for confirmation
    const listingResult = await getListing(listingId);

    if (!listingResult.success) {
      await interaction.editReply({
        content: `❌ Could not fetch listing details: ${listingResult.error.message}`,
      });
      return;
    }

    const listing = listingResult.data;
    // Convert listing price from cents to dollars
    const listingPriceCents = BigInt(listing.price);
    const listingPrice = Number(listingPriceCents) / 100;

    // Check if offer amount exceeds listing price
    if (offerAmount > listingPrice) {
      await interaction.editReply({
        content: `❌ Your offer ($${offerAmount.toFixed(2)}) cannot exceed the listing price (${formatPrice(listing.price)}).`,
      });
      return;
    }

    // Create confirmation embed
    const confirmEmbed = new EmbedBuilder()
      .setTitle('🤝 Confirm Your Offer')
      .setDescription(`You are about to make an offer on **${listing.title}**`)
      .setColor(0x00d4aa)
      .addFields(
        {
          name: '💰 Listing Price',
          value: formatPrice(listing.price),
          inline: true,
        },
        {
          name: '💸 Your Offer',
          value: `$${offerAmount.toFixed(2)}`,
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

    // Store offer draft in database (replaces in-memory cache)
    // Convert offer amount to cents for storage
    const offerAmountCents = Math.round(offerAmount * 100);

    const draftResult = await createOfferDraft({
      discordUserId: interaction.user.id,
      listingId,
      amount: offerAmountCents.toString(),
      conditions: conditions || undefined,
      // Draft expires in 10 minutes (handled by API default)
    });

    if (!draftResult.success) {
      await interaction.editReply({
        content: `❌ Failed to save offer draft: ${draftResult.error.message}`,
      });
      return;
    }

    // Create confirmation buttons (simplified customId)
    const confirmButton = new ButtonBuilder()
      .setCustomId(`confirm_offer_${listingId}`)
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

    await interaction.editReply({
      embeds: [confirmEmbed],
      components: [buttonRow],
    });
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
    // Parse customId (format: confirm_offer_${listingId})
    const listingId = interaction.customId.replace('confirm_offer_', '');

    if (!listingId) {
      await interaction.reply({
        content: '❌ Invalid confirmation data. Please try again.',
        ephemeral: true,
      });
      return;
    }

    // Defer reply as API call might take time
    await interaction.deferReply({ ephemeral: true });

    // Retrieve draft from database
    const draftResult = await getOfferDraft(interaction.user.id, listingId);

    if (!draftResult.success) {
      await interaction.editReply({
        content: `❌ Could not retrieve offer details: ${draftResult.error.message}\n\nYour offer may have expired. Please try again.`,
      });
      return;
    }

    const draft = draftResult.data;
    // Convert amount from cents (stored in DB) to dollars for display
    const offerAmount = parseFloat(draft.amount) / 100;
    const conditions = draft.conditions || undefined;

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
        content:
          '❌ Could not retrieve your user information. Please try again.',
      });
      return;
    }

    // Submit offer to API
    // Amount is already in cents from the draft
    const offerResult = await createOffer({
      listingId,
      buyerId: userData.user.id,
      amount: draft.amount, // Already in cents
      conditions,
      // expiry is optional - API will default to 7 days
    });

    // Clean up draft from database (do this regardless of offer creation result)
    await deleteOfferDraft(interaction.user.id, listingId);

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
          value: `$${offerAmount.toFixed(2)}`,
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

    // Clean up draft from database
    await deleteOfferDraft(interaction.user.id, listingId);

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
