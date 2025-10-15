import { setTimeout } from 'timers';

import {
  type Guild,
  type TextChannel,
  type Message,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';

import {
  getPriceRangeChannel,
  formatPrice,
  validateBotPermissions,
} from './marketplace.js';

/**
 * Listing data structure for message creation
 */
export interface ListingData {
  id: string;
  title: string;
  summary: string;
  price: string; // BigInt serialized as string
  category: string;
  status: string;
  visibility: string;
  userId: string;
  guildId?: string;
  user: {
    name?: string;
    kycTier?: string;
    kycVerified?: boolean;
  };
  robloxSnapshots?: Array<{
    gameName: string;
    gameDescription?: string;
    thumbnailUrl?: string;
    playerCount?: number;
    visits?: number;
    verifiedOwnership: boolean;
  }>;
  createdAt: Date;
}

/**
 * Create rich embed for listing message
 */
export function createListingEmbed(listing: ListingData): EmbedBuilder {
  const price = formatPrice(listing.price);
  const statusEmoji = getStatusEmoji(listing.status);
  const verificationBadge = getVerificationBadge(
    listing.user.kycTier,
    listing.user.kycVerified
  );

  // Create a beautiful, modern embed with better visual hierarchy
  const embed = new EmbedBuilder()
    .setTitle(`🎮 ${listing.title}`)
    .setDescription(`**${listing.summary}**`)
    .setColor(getStatusColor(listing.status))
    .setTimestamp(listing.createdAt);

  // Add Roblox game thumbnail if available
  if (listing.robloxSnapshots && listing.robloxSnapshots.length > 0) {
    const snapshot = listing.robloxSnapshots[0];
    if (snapshot && snapshot.thumbnailUrl) {
      embed.setThumbnail(snapshot.thumbnailUrl);
    }
  }

  // Main information section with better formatting
  embed.addFields(
    {
      name: '💰 **Price**',
      value: `**$${price}**`,
      inline: true,
    },
    {
      name: '📂 **Category**',
      value: listing.category,
      inline: true,
    },
    {
      name: '📊 **Status**',
      value: `${statusEmoji} **${listing.status}**`,
      inline: true,
    }
  );

  // Seller and verification section
  embed.addFields(
    {
      name: '👤 **Seller**',
      value: `**${listing.user.name || 'Anonymous'}**`,
      inline: true,
    },
    {
      name: '🛡️ **Verification**',
      value: verificationBadge,
      inline: true,
    },
    {
      name: '🌐 **Visibility**',
      value:
        listing.visibility === 'PUBLIC'
          ? '🌍 **All Servers**'
          : '🔒 **This Server Only**',
      inline: true,
    }
  );

  // Enhanced game information section
  if (listing.robloxSnapshots && listing.robloxSnapshots.length > 0) {
    const snapshot = listing.robloxSnapshots[0];
    if (snapshot && snapshot.gameName) {
      const gameStats = [];
      if (snapshot.playerCount) {
        gameStats.push(
          `👥 **${snapshot.playerCount.toLocaleString()}** playing`
        );
      }
      if (snapshot.visits) {
        gameStats.push(`📈 **${snapshot.visits.toLocaleString()}** visits`);
      }

      embed.addFields({
        name: '🎮 **Game Information**',
        value: `**${snapshot.gameName}**\n${snapshot.verifiedOwnership ? '✅ **Verified Ownership**' : '❌ **Not Verified**'}\n${gameStats.join(' • ')}`,
        inline: false,
      });
    }
  }

  // Enhanced footer with better branding
  embed.setFooter({
    text: `🆔 ${listing.id} • 🛡️ Bloxtr8 • Secure Trading Platform`,
    iconURL:
      'https://cdn.discordapp.com/attachments/1234567890/1234567890/bloxtr8-logo.png',
  });

  return embed;
}

/**
 * Create action buttons for listing message
 */
export function createListingButtons(
  listingId: string,
  isSold: boolean = false
): ActionRowBuilder<ButtonBuilder> {
  const buttons = new ActionRowBuilder<ButtonBuilder>();

  if (isSold) {
    // For sold listings, only show "View on Web" button
    buttons.addComponents(
      new ButtonBuilder()
        .setLabel('🌐 View on Web')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://bloxtr8.com/listings/${listingId}`)
    );
  } else {
    // For active listings, show all buttons
    buttons.addComponents(
      new ButtonBuilder()
        .setCustomId(`make_offer_${listingId}`)
        .setLabel('💸 Make Offer')
        .setStyle(ButtonStyle.Success)
        .setEmoji('💰'),
      new ButtonBuilder()
        .setCustomId(`view_details_${listingId}`)
        .setLabel('View Details')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🔍'),
      new ButtonBuilder()
        .setLabel('🌐 View on Web')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://bloxtr8.com/listings/${listingId}`),
      new ButtonBuilder()
        .setCustomId(`watch_listing_${listingId}`)
        .setLabel('Watch')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('👁️')
    );
  }

  return buttons;
}

/**
 * Create a listing message in the appropriate price-range channel
 */
export async function createListingMessage(
  listing: ListingData,
  guild: Guild,
  maxRetries: number = 3
): Promise<Message | null> {
  let lastError: Error | null = null;

  // Validate bot permissions first
  const permissions = validateBotPermissions(guild);
  if (!permissions.hasChannelCreate) {
    console.error(
      `Bot lacks message creation permissions in guild ${guild.id}: ${permissions.missingPermissions.join(', ')}`
    );
    return null;
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Get the appropriate channel for this price range
      const channel = await getPriceRangeChannel(listing.price, guild);

      if (!channel) {
        console.error(
          `No price range channel found for price ${listing.price} in guild ${guild.id}`
        );
        return null;
      }

      console.log(
        `Creating message for listing ${listing.id} in channel ${channel.name} (attempt ${attempt}/${maxRetries})`
      );

      // Post the listing embed
      const embed = createListingEmbed(listing);
      const buttons = createListingButtons(listing.id);

      const message = await channel.send({
        content: `**New ${listing.visibility === 'PUBLIC' ? 'Global' : 'Private'} Listing**`,
        embeds: [embed],
        components: [buttons],
      });

      console.log(
        `Created message ${message.id} for listing ${listing.id} in channel ${channel.name}`
      );

      return message;
    } catch (error) {
      lastError = error as Error;
      console.error(
        `Failed to create listing message for ${listing.id} (attempt ${attempt}/${maxRetries}):`,
        error
      );

      // Check if it's a rate limit error - wait longer before retry
      if (error instanceof Error && error.message.includes('rate limit')) {
        const retryDelay = Math.min(5000 * attempt, 30000); // Max 30 seconds
        console.log(`Rate limited, waiting ${retryDelay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      } else if (attempt < maxRetries) {
        // For other errors, wait 1 second before retry
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  console.error(
    `Failed to create listing message for ${listing.id} after ${maxRetries} attempts. Last error:`,
    lastError
  );
  return null;
}

/**
 * Update listing message when listing changes
 */
export async function updateListingMessage(
  messageId: string,
  channelId: string,
  guild: Guild,
  listing: ListingData
): Promise<boolean> {
  try {
    // Fetch the channel
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || channel.type !== 0) {
      // 0 = GUILD_TEXT
      console.warn(`Channel ${channelId} not found or not a text channel`);
      return false;
    }

    // Fetch the message
    const message = await (channel as TextChannel).messages
      .fetch(messageId)
      .catch(() => null);
    if (!message) {
      console.warn(`Message ${messageId} not found in channel ${channelId}`);
      return false;
    }

    // Update the message content
    const embed = createListingEmbed(listing);
    const buttons = createListingButtons(listing.id, listing.status === 'SOLD');

    await message.edit({
      content: `**${listing.status === 'SOLD' ? 'SOLD' : listing.visibility === 'PUBLIC' ? 'Global' : 'Private'} Listing**`,
      embeds: [embed],
      components: [buttons],
    });

    console.log(`Updated message ${messageId} for listing ${listing.id}`);
    return true;
  } catch (error) {
    console.error(`Failed to update message ${messageId}:`, error);
    return false;
  }
}

/**
 * Mark listing as sold (update message to show sold status)
 */
export async function markListingAsSold(
  messageId: string,
  channelId: string,
  guild: Guild,
  listing: ListingData
): Promise<boolean> {
  try {
    // Fetch the channel
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || channel.type !== 0) {
      // 0 = GUILD_TEXT
      console.warn(`Channel ${channelId} not found or not a text channel`);
      return false;
    }

    // Fetch the message
    const message = await (channel as TextChannel).messages
      .fetch(messageId)
      .catch(() => null);
    if (!message) {
      console.warn(`Message ${messageId} not found in channel ${channelId}`);
      return false;
    }

    // Update the message to show sold status
    const embed = createListingEmbed(listing);
    const buttons = createListingButtons(listing.id, true); // true = isSold

    await message.edit({
      content: `**SOLD Listing**`,
      embeds: [embed],
      components: [buttons],
    });

    console.log(
      `Marked message ${messageId} as sold for listing ${listing.id}`
    );
    return true;
  } catch (error) {
    console.error(`Failed to mark message ${messageId} as sold:`, error);
    return false;
  }
}

/**
 * Delete listing message
 */
export async function deleteListingMessage(
  messageId: string,
  channelId: string,
  guild: Guild,
  reason: string
): Promise<boolean> {
  try {
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || channel.type !== 0) {
      // 0 = GUILD_TEXT
      return false;
    }

    const message = await (channel as TextChannel).messages
      .fetch(messageId)
      .catch(() => null);
    if (!message) {
      return false;
    }

    await message.delete();
    console.log(`Deleted message ${messageId}: ${reason}`);
    return true;
  } catch (error) {
    console.error(`Failed to delete message ${messageId}:`, error);
    return false;
  }
}

/**
 * Find listing message by listing ID in a channel
 */
export async function findListingMessageByListingId(
  channel: TextChannel,
  listingId: string,
  botUserId: string
): Promise<Message | null> {
  try {
    // Fetch recent messages (last 100) to find the listing
    const messages = await channel.messages.fetch({ limit: 100 });

    for (const [, message] of messages) {
      // Only check messages from the bot
      if (message.author.id !== botUserId) continue;

      // Check if message has embeds and footer contains the listing ID
      if (message.embeds.length > 0) {
        const embed = message.embeds[0];
        if (embed && embed.footer?.text?.includes(listingId)) {
          return message;
        }
      }
    }

    return null;
  } catch (error) {
    console.error(`Failed to find listing message for ${listingId}:`, error);
    return null;
  }
}

/**
 * Get all bot messages in a channel that contain listing embeds
 */
export async function getAllListingMessages(
  channel: TextChannel,
  botUserId: string
): Promise<Array<{ message: Message; listingId: string | null }>> {
  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const listingMessages: Array<{
      message: Message;
      listingId: string | null;
    }> = [];

    for (const [, message] of messages) {
      // Only check messages from the bot
      if (message.author.id !== botUserId) continue;

      // Check if message has embeds and footer contains a listing ID
      if (message.embeds.length > 0) {
        const embed = message.embeds[0];
        if (embed) {
          const footerText = embed.footer?.text || '';

          // Extract listing ID from footer (format: "🆔 {listingId} • 🛡️ Bloxtr8 • Secure Trading Platform")
          const listingIdMatch = footerText.match(/🆔\s+([a-zA-Z0-9_-]+)/);
          const listingId = listingIdMatch ? listingIdMatch[1] : null;

          if (listingId) {
            listingMessages.push({ message, listingId });
          }
        }
      }
    }

    return listingMessages;
  } catch (error) {
    console.error(
      `Failed to get listing messages from channel ${channel.id}:`,
      error
    );
    return [];
  }
}

// Helper functions

function getStatusColor(status: string): number {
  switch (status) {
    case 'ACTIVE':
      return 0x00d4aa; // Modern teal (matches Bloxtr8 brand)
    case 'SOLD':
      return 0xef4444; // Modern red
    case 'CANCELLED':
      return 0xf59e0b; // Modern amber
    default:
      return 0x6366f1; // Modern indigo
  }
}

function getStatusEmoji(status: string): string {
  switch (status) {
    case 'ACTIVE':
      return '🟢';
    case 'SOLD':
      return '🔴';
    case 'CANCELLED':
      return '🟡';
    case 'INACTIVE':
      return '⚪';
    default:
      return '⚫';
  }
}

function getVerificationBadge(kycTier?: string, kycVerified?: boolean): string {
  if (kycVerified) {
    return '✅ **Fully Verified**';
  }

  switch (kycTier) {
    case 'TIER_2':
      return '💎 **Premium Verified**';
    case 'TIER_1':
      return '🟢 **Roblox Linked**';
    case 'TIER_0':
    default:
      return '⚠️ **Unverified**';
  }
}
