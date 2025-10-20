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
  acceptOffer,
  counterOffer,
  declineOffer,
  generateContract,
} from '../utils/apiClient.js';
import { sendContractSigningNotification } from './contract-notifications.js';
import { verify } from '../utils/userVerification.js';

/**
 * Handle "Accept Offer" button click
 * Shows confirmation before accepting
 */
export async function handleAcceptOfferButton(
  interaction: ButtonInteraction
): Promise<void> {
  try {
    // Extract offer ID from button customId (format: accept_offer_${offerId})
    const offerId = interaction.customId.replace('accept_offer_', '');

    if (!offerId) {
      await interaction.reply({
        content: '❌ Invalid offer ID. Please try again.',
        ephemeral: true,
      });
      return;
    }

    // Fetch offer details from the embed
    const embed = interaction.message.embeds[0];
    if (!embed) {
      await interaction.reply({
        content: '❌ Could not load offer details. Please try again.',
        ephemeral: true,
      });
      return;
    }

    // Extract offer amount from embed fields
    const amountField = embed.fields.find(f => f.name.includes('Offer Amount'));
    const listingField = embed.fields.find(f =>
      f.name.includes('Listing Price')
    );
    const buyerField = embed.fields.find(f => f.name.includes('Buyer'));

    // Create confirmation embed
    const confirmEmbed = new EmbedBuilder()
      .setTitle('✅ Confirm Accept Offer')
      .setDescription(
        '**Are you sure you want to accept this offer?**\n\nThis will:\n• Re-verify your asset ownership\n• Mark the offer as accepted\n• Begin the contract and escrow process'
      )
      .setColor(0x10b981)
      .addFields(
        {
          name: '💸 Offer Amount',
          value: amountField?.value || 'Unknown',
          inline: true,
        },
        {
          name: '📋 Listing Price',
          value: listingField?.value || 'Unknown',
          inline: true,
        },
        {
          name: '👤 Buyer',
          value: buyerField?.value || 'Unknown',
          inline: true,
        }
      )
      .setFooter({
        text: 'Asset ownership will be verified before acceptance',
      })
      .setTimestamp();

    // Create confirmation buttons
    const confirmButton = new ButtonBuilder()
      .setCustomId(`confirm_accept_${offerId}`)
      .setLabel('✅ Confirm Accept')
      .setStyle(ButtonStyle.Success);

    const cancelButton = new ButtonBuilder()
      .setCustomId(`cancel_offer_action`)
      .setLabel('❌ Cancel')
      .setStyle(ButtonStyle.Secondary);

    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      confirmButton,
      cancelButton
    );

    await interaction.reply({
      embeds: [confirmEmbed],
      components: [buttonRow],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error in handleAcceptOfferButton:', error);
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
 * Handle "Decline Offer" button click
 * Shows confirmation before declining
 */
export async function handleDeclineOfferButton(
  interaction: ButtonInteraction
): Promise<void> {
  try {
    // Extract offer ID from button customId (format: decline_offer_${offerId})
    const offerId = interaction.customId.replace('decline_offer_', '');

    if (!offerId) {
      await interaction.reply({
        content: '❌ Invalid offer ID. Please try again.',
        ephemeral: true,
      });
      return;
    }

    // Fetch offer details from the embed
    const embed = interaction.message.embeds[0];
    if (!embed) {
      await interaction.reply({
        content: '❌ Could not load offer details. Please try again.',
        ephemeral: true,
      });
      return;
    }

    // Extract offer amount from embed fields
    const amountField = embed.fields.find(f => f.name.includes('Offer Amount'));
    const buyerField = embed.fields.find(f => f.name.includes('Buyer'));

    // Create confirmation embed
    const confirmEmbed = new EmbedBuilder()
      .setTitle('❌ Confirm Decline Offer')
      .setDescription(
        '**Are you sure you want to decline this offer?**\n\nThe buyer will be notified that their offer was declined.'
      )
      .setColor(0xef4444)
      .addFields(
        {
          name: '💸 Offer Amount',
          value: amountField?.value || 'Unknown',
          inline: true,
        },
        {
          name: '👤 Buyer',
          value: buyerField?.value || 'Unknown',
          inline: true,
        }
      )
      .setFooter({
        text: 'This action cannot be undone',
      })
      .setTimestamp();

    // Create confirmation buttons
    const confirmButton = new ButtonBuilder()
      .setCustomId(`confirm_decline_${offerId}`)
      .setLabel('❌ Confirm Decline')
      .setStyle(ButtonStyle.Danger);

    const cancelButton = new ButtonBuilder()
      .setCustomId(`cancel_offer_action`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary);

    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      confirmButton,
      cancelButton
    );

    await interaction.reply({
      embeds: [confirmEmbed],
      components: [buttonRow],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error in handleDeclineOfferButton:', error);
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
 * Handle "Counter Offer" button click
 * Shows modal for counter amount and conditions
 */
export async function handleCounterOfferButton(
  interaction: ButtonInteraction
): Promise<void> {
  try {
    // Extract offer ID from button customId (format: counter_offer_${offerId})
    const offerId = interaction.customId.replace('counter_offer_', '');

    if (!offerId) {
      await interaction.reply({
        content: '❌ Invalid offer ID. Please try again.',
        ephemeral: true,
      });
      return;
    }

    // Fetch offer details from the embed
    const embed = interaction.message.embeds[0];
    if (!embed) {
      await interaction.reply({
        content: '❌ Could not load offer details. Please try again.',
        ephemeral: true,
      });
      return;
    }

    // Extract offer amount from embed
    const amountField = embed.fields.find(f => f.name.includes('Offer Amount'));
    const offerAmount = amountField?.value || 'Unknown';

    // Create modal for counter offer
    const modal = new ModalBuilder()
      .setCustomId(`counter_offer_modal_${offerId}`)
      .setTitle('Counter Offer');

    // Counter amount input (required)
    const amountInput = new TextInputBuilder()
      .setCustomId('counter_amount')
      .setLabel('Your Counter Offer Amount (USD)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder(`Original Offer: ${offerAmount}`)
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(10);

    // Conditions input (optional)
    const conditionsInput = new TextInputBuilder()
      .setCustomId('counter_conditions')
      .setLabel('Conditions (Optional)')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder(
        'Any conditions or notes for your counter offer (e.g., timeline, payment terms, etc.)'
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
    console.error('Error in handleCounterOfferButton:', error);
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
 * Handle counter offer modal submission
 * Shows confirmation with counter offer details
 */
export async function handleCounterOfferModalSubmit(
  interaction: ModalSubmitInteraction
): Promise<void> {
  try {
    // Extract offer ID from modal customId (format: counter_offer_modal_${offerId})
    const offerId = interaction.customId.replace('counter_offer_modal_', '');

    if (!offerId) {
      await interaction.reply({
        content: '❌ Invalid offer ID. Please try again.',
        ephemeral: true,
      });
      return;
    }

    // Get modal input values
    const counterAmountRaw =
      interaction.fields.getTextInputValue('counter_amount');
    const conditions =
      interaction.fields.getTextInputValue('counter_conditions') || '';

    // Validate and parse counter amount
    const counterAmount = parseFloat(counterAmountRaw.replace(/[^0-9.-]/g, ''));

    if (isNaN(counterAmount) || counterAmount <= 0) {
      await interaction.reply({
        content: '❌ Invalid counter amount. Please enter a positive number.',
        ephemeral: true,
      });
      return;
    }

    // Create confirmation embed
    const confirmEmbed = new EmbedBuilder()
      .setTitle('🔄 Confirm Counter Offer')
      .setDescription(
        '**Review your counter offer before sending**\n\nThis will decline the original offer and send a new offer to the buyer.'
      )
      .setColor(0xf59e0b)
      .addFields({
        name: '💸 Your Counter Offer',
        value: `$${counterAmount.toFixed(2)}`,
        inline: true,
      });

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
        '• The original offer will be marked as countered\n• The buyer will receive your counter offer\n• Your counter will expire in 7 days',
      inline: false,
    });

    // Encode conditions in customId (use "1" if has conditions, "0" if not)
    const hasConditions = conditions ? '1' : '0';

    // Create confirmation buttons
    const confirmButton = new ButtonBuilder()
      .setCustomId(
        `confirm_counter_${offerId}_${counterAmount}_${hasConditions}`
      )
      .setLabel('✅ Send Counter Offer')
      .setStyle(ButtonStyle.Success);

    const cancelButton = new ButtonBuilder()
      .setCustomId(`cancel_offer_action`)
      .setLabel('❌ Cancel')
      .setStyle(ButtonStyle.Secondary);

    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      confirmButton,
      cancelButton
    );

    // Store conditions in cache for retrieval when confirm is clicked
    if (!global.counterOfferCache) {
      global.counterOfferCache = new Map();
    }
    global.counterOfferCache.set(
      `${interaction.user.id}_${offerId}_${counterAmount}`,
      conditions
    );

    // Clean up cache after 5 minutes
    setTimeout(
      () => {
        global.counterOfferCache?.delete(
          `${interaction.user.id}_${offerId}_${counterAmount}`
        );
      },
      5 * 60 * 1000
    );

    await interaction.reply({
      embeds: [confirmEmbed],
      components: [buttonRow],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error in handleCounterOfferModalSubmit:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content:
          '❌ An error occurred while processing your counter offer. Please try again.',
        ephemeral: true,
      });
    }
  }
}

/**
 * Handle confirm accept offer
 * Submits the acceptance to the API
 */
export async function handleConfirmAcceptOffer(
  interaction: ButtonInteraction
): Promise<void> {
  try {
    // Parse customId (format: confirm_accept_${offerId})
    const offerId = interaction.customId.replace('confirm_accept_', '');

    if (!offerId) {
      await interaction.reply({
        content: '❌ Invalid offer data. Please try again.',
        ephemeral: true,
      });
      return;
    }

    // Defer reply as API call might take time
    await interaction.deferReply({ ephemeral: true });

    // Get seller's user ID from Discord ID
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

    // Submit acceptance to API
    const result = await acceptOffer(offerId, userData.user.id);

    if (!result.success) {
      await interaction.editReply({
        content: `❌ Failed to accept offer: ${result.error.message}`,
      });
      return;
    }

    // Success! Show confirmation
    const successEmbed = new EmbedBuilder()
      .setTitle('✅ Offer Accepted Successfully!')
      .setDescription(
        'Your acceptance has been recorded and the buyer has been notified.'
      )
      .setColor(0x10b981)
      .addFields(
        {
          name: '🆔 Offer ID',
          value: offerId,
          inline: true,
        },
        {
          name: '📋 Next Steps',
          value:
            '1. Contract will be generated\n2. Escrow will be set up\n3. Asset transfer will be coordinated',
          inline: false,
        }
      )
      .setFooter({
        text: 'Bloxtr8 - Secure Trading',
      })
      .setTimestamp();

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
      console.error('Could not update original message:', error);
    }

    // Generate contract automatically in the background
    try {
      console.log(`Generating contract for accepted offer ${offerId}...`);
      const contractResult = await generateContract(offerId);

      if (contractResult.success) {
        console.log(
          `Contract generated successfully: ${contractResult.data.contractId}`
        );

        // Get offer data to send notifications (we'll fetch from API to get all details)
        // Note: In a production system, we might want to fetch the full offer details
        // including buyer/seller Discord IDs to send proper notifications
        // For now, we'll log success and rely on a notification service to pick this up
        console.log(`Contract ready for signatures: ${contractResult.data.pdfUrl}`);
      } else {
        console.error(
          `Failed to generate contract for offer ${offerId}:`,
          contractResult.error.message
        );
        // Don't fail the whole operation if contract generation fails
        // The contract can be generated manually later if needed
      }
    } catch (contractError) {
      console.error('Error generating contract:', contractError);
      // Continue execution - contract generation failure shouldn't block offer acceptance
    }
  } catch (error) {
    console.error('Error in handleConfirmAcceptOffer:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content:
          '❌ An error occurred while accepting the offer. Please try again.',
        ephemeral: true,
      });
    } else {
      await interaction.editReply({
        content:
          '❌ An error occurred while accepting the offer. Please try again.',
      });
    }
  }
}

/**
 * Handle confirm decline offer
 * Submits the decline to the API
 */
export async function handleConfirmDeclineOffer(
  interaction: ButtonInteraction
): Promise<void> {
  try {
    // Parse customId (format: confirm_decline_${offerId})
    const offerId = interaction.customId.replace('confirm_decline_', '');

    if (!offerId) {
      await interaction.reply({
        content: '❌ Invalid offer data. Please try again.',
        ephemeral: true,
      });
      return;
    }

    // Defer reply as API call might take time
    await interaction.deferReply({ ephemeral: true });

    // Get seller's user ID from Discord ID
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

    // Submit decline to API
    const result = await declineOffer(offerId, userData.user.id);

    if (!result.success) {
      await interaction.editReply({
        content: `❌ Failed to decline offer: ${result.error.message}`,
      });
      return;
    }

    // Success! Show confirmation
    const successEmbed = new EmbedBuilder()
      .setTitle('❌ Offer Declined')
      .setDescription(
        'The offer has been declined and the buyer has been notified.'
      )
      .setColor(0xef4444)
      .addFields({
        name: '🆔 Offer ID',
        value: offerId,
        inline: true,
      })
      .setFooter({
        text: 'Bloxtr8 - Secure Trading',
      })
      .setTimestamp();

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
      console.error('Could not update original message:', error);
    }
  } catch (error) {
    console.error('Error in handleConfirmDeclineOffer:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content:
          '❌ An error occurred while declining the offer. Please try again.',
        ephemeral: true,
      });
    } else {
      await interaction.editReply({
        content:
          '❌ An error occurred while declining the offer. Please try again.',
      });
    }
  }
}

/**
 * Handle confirm counter offer
 * Submits the counter offer to the API
 */
export async function handleConfirmCounterOffer(
  interaction: ButtonInteraction
): Promise<void> {
  try {
    // Parse customId (format: confirm_counter_${offerId}_${amount}_${hasConditions})
    const parts = interaction.customId.split('_');
    if (parts.length < 5) {
      await interaction.reply({
        content: '❌ Invalid counter offer data. Please try again.',
        ephemeral: true,
      });
      return;
    }

    const offerId = parts[2] as string;
    const counterAmount = parseFloat(parts[3] as string);

    // Retrieve conditions from cache
    const cacheKey = `${interaction.user.id}_${offerId}_${counterAmount}`;
    const conditions = global.counterOfferCache?.get(cacheKey) || undefined;

    // Clean up cache
    global.counterOfferCache?.delete(cacheKey);

    // Defer reply as API call might take time
    await interaction.deferReply({ ephemeral: true });

    // Get seller's user ID from Discord ID
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

    // Submit counter offer to API
    // Convert counter amount from dollars to cents for the API
    const counterAmountCents = Math.round(counterAmount * 100);
    const result = await counterOffer(
      offerId,
      userData.user.id,
      counterAmountCents.toString(),
      conditions
    );

    if (!result.success) {
      await interaction.editReply({
        content: `❌ Failed to send counter offer: ${result.error.message}`,
      });
      return;
    }

    // Success! Show confirmation
    const successEmbed = new EmbedBuilder()
      .setTitle('🔄 Counter Offer Sent Successfully!')
      .setDescription(
        'Your counter offer has been sent and the buyer has been notified.'
      )
      .setColor(0xf59e0b)
      .addFields(
        {
          name: '💸 Counter Offer Amount',
          value: `$${counterAmount.toFixed(2)}`,
          inline: true,
        },
        {
          name: '🆔 Counter Offer ID',
          value: result.data.id,
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
        "• The buyer will be notified of your counter offer\n• You'll receive a notification when they respond\n• Check your DMs for updates",
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
      console.error('Could not update original message:', error);
    }
  } catch (error) {
    console.error('Error in handleConfirmCounterOffer:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content:
          '❌ An error occurred while sending your counter offer. Please try again.',
        ephemeral: true,
      });
    } else {
      await interaction.editReply({
        content:
          '❌ An error occurred while sending your counter offer. Please try again.',
      });
    }
  }
}

/**
 * Handle cancel offer action
 * Dismisses the confirmation message
 */
export async function handleCancelOfferAction(
  interaction: ButtonInteraction
): Promise<void> {
  try {
    await interaction.update({
      content: '❌ Action cancelled.',
      embeds: [],
      components: [],
    });
  } catch (error) {
    console.error('Error in handleCancelOfferAction:', error);
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
  var counterOfferCache: Map<string, string> | undefined;
}
