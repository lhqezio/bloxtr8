import {
  type Client,
  type EmbedBuilder,
  EmbedBuilder as DiscordEmbedBuilder,
} from 'discord.js';

export type OfferStatus = 'ACCEPTED' | 'DECLINED' | 'COUNTERED';

export interface OfferCleanupData {
  offerId: string;
  listingTitle: string;
  amount: string;
  buyerName?: string;
  sellerName?: string;
  timestamp: Date;
}

/**
 * Edit a DM notification message to show final status and remove buttons
 */
export async function editOfferNotificationMessage(
  client: Client,
  discordId: string,
  messageId: string,
  status: OfferStatus,
  offerData: OfferCleanupData
): Promise<void> {
  try {
    const user = await client.users.fetch(discordId);
    if (!user) {
      console.warn(`User ${discordId} not found for message cleanup`);
      return;
    }

    const dmChannel = await user.createDM();
    const message = await dmChannel.messages.fetch(messageId);
    
    if (!message) {
      console.warn(`Message ${messageId} not found for user ${discordId}`);
      return;
    }

    // Create updated embed with final status
    const finalEmbed = createFinalStatusEmbed(status, offerData);
    
    await message.edit({
      content: getStatusMessage(status, offerData.listingTitle),
      embeds: [finalEmbed],
      components: [], // Remove all buttons
    });

    console.log(`Successfully updated offer notification message ${messageId} for user ${discordId} to status ${status}`);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      if (error.code === 10008) {
        console.warn(`Message ${messageId} no longer exists for user ${discordId}`);
      } else if (error.code === 50013) {
        console.warn(`Missing permissions to edit message ${messageId} for user ${discordId}`);
      } else {
        console.error(`Failed to edit offer notification message ${messageId} for user ${discordId}:`, error);
      }
    } else {
      console.error(`Failed to edit offer notification message ${messageId} for user ${discordId}:`, error);
    }
  }
}

/**
 * Update a listing thread message to show final status
 */
export async function updateListingThreadMessage(
  client: Client,
  threadId: string,
  messageId: string,
  status: OfferStatus,
  offerData: OfferCleanupData
): Promise<void> {
  try {
    const thread = await client.channels.fetch(threadId);
    if (!thread || !thread.isThread()) {
      console.warn(`Thread ${threadId} not found for message cleanup`);
      return;
    }

    const message = await thread.messages.fetch(messageId);
    if (!message) {
      console.warn(`Message ${messageId} not found in thread ${threadId}`);
      return;
    }

    // Create updated embed with final status
    const finalEmbed = createFinalStatusEmbed(status, offerData);
    
    await message.edit({
      embeds: [finalEmbed],
      components: [], // Remove all buttons
    });

    console.log(`Successfully updated thread message ${messageId} in thread ${threadId} to status ${status}`);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      if (error.code === 10008) {
        console.warn(`Message ${messageId} no longer exists in thread ${threadId}`);
      } else if (error.code === 50013) {
        console.warn(`Missing permissions to edit message ${messageId} in thread ${threadId}`);
      } else {
        console.error(`Failed to update thread message ${messageId} in thread ${threadId}:`, error);
      }
    } else {
      console.error(`Failed to update thread message ${messageId} in thread ${threadId}:`, error);
    }
  }
}

/**
 * Create a final status embed showing the resolved offer
 */
function createFinalStatusEmbed(status: OfferStatus, offerData: OfferCleanupData): EmbedBuilder {
  const embed = new DiscordEmbedBuilder()
    .setTitle(getStatusTitle(status))
    .setDescription(`Offer for **${offerData.listingTitle}** has been ${status.toLowerCase()}`)
    .setColor(getStatusColor(status))
    .addFields(
      {
        name: '🆔 Offer ID',
        value: offerData.offerId,
        inline: true,
      },
      {
        name: '💰 Amount',
        value: offerData.amount,
        inline: true,
      },
      {
        name: '📅 Resolved',
        value: offerData.timestamp.toLocaleString(),
        inline: true,
      }
    );

  if (offerData.buyerName) {
    embed.addFields({
      name: '👤 Buyer',
      value: offerData.buyerName,
      inline: true,
    });
  }

  if (offerData.sellerName) {
    embed.addFields({
      name: '🏪 Seller',
      value: offerData.sellerName,
      inline: true,
    });
  }

  embed.setFooter({
    text: 'Bloxtr8 - Secure Trading',
  });

  return embed;
}

/**
 * Get status-specific title
 */
function getStatusTitle(status: OfferStatus): string {
  switch (status) {
    case 'ACCEPTED':
      return '✅ Offer Accepted';
    case 'DECLINED':
      return '❌ Offer Declined';
    case 'COUNTERED':
      return '🔄 Offer Countered';
    default:
      return '📋 Offer Status Updated';
  }
}

/**
 * Get status-specific color
 */
function getStatusColor(status: OfferStatus): number {
  switch (status) {
    case 'ACCEPTED':
      return 0x10b981; // Green
    case 'DECLINED':
      return 0xef4444; // Red
    case 'COUNTERED':
      return 0xf59e0b; // Orange
    default:
      return 0x6b7280; // Gray
  }
}

/**
 * Get status-specific message
 */
function getStatusMessage(status: OfferStatus, listingTitle: string): string {
  switch (status) {
    case 'ACCEPTED':
      return `🎉 Your offer for "${listingTitle}" has been accepted! Contract generation will begin shortly.`;
    case 'DECLINED':
      return `😔 Your offer for "${listingTitle}" was declined. You can make a new offer if the listing is still available.`;
    case 'COUNTERED':
      return `🤝 The seller sent a counter offer for "${listingTitle}". Check your notifications for details.`;
    default:
      return `📋 Offer status updated for "${listingTitle}".`;
  }
}
