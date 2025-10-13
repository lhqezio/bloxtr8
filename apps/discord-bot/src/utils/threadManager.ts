import { setTimeout } from 'timers';

import {
  type Guild,
  type TextChannel,
  type PublicThreadChannel,
  ChannelType,
  ThreadAutoArchiveDuration,
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
 * Listing data structure for thread creation
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
 * Generate thread name for a listing
 */
export function generateThreadName(listing: ListingData): string {
  const price = formatPrice(listing.price);
  const statusEmoji =
    listing.status === 'ACTIVE'
      ? '🟢'
      : listing.status === 'SOLD'
        ? '🔴'
        : '⚪';
  const verifiedEmoji = listing.user.kycVerified ? '✅' : '⚠️';

  // Discord thread name limit is 50 characters (not 100!)
  const maxLength = 50;

  // Calculate space needed for fixed elements
  // Format: "🟢Title - $Price|✅" (emojis + formatting)
  const statusEmojiLength = statusEmoji.length; // 2
  const verifiedEmojiLength = verifiedEmoji.length; // 2
  const separatorLength = ' - $'.length + '|'.length; // 5 (not 7!)
  const priceLength = price.length; // variable, e.g., "15.00" = 5, "1.5k" = 4, "150k" = 4

  // Reserve space for all fixed elements
  const reservedSpace =
    statusEmojiLength + verifiedEmojiLength + separatorLength + priceLength;

  // Available space for title (leave 3 chars for "..." if needed)
  const maxTitleLength = maxLength - reservedSpace - 3;

  let title = listing.title;
  if (title.length > maxTitleLength) {
    title = `${title.substring(0, maxTitleLength - 3)}...`;
  }

  const threadName = `${statusEmoji}${title} - $${price}|${verifiedEmoji}`;

  // Final safety check - ensure we never exceed 50 chars
  if (threadName.length > 50) {
    const overBy = threadName.length - 50;
    title = `${title.substring(0, title.length - overBy - 3)}...`;
    return `${statusEmoji}${title} - $${price}|${verifiedEmoji}`;
  }

  return threadName;
}

/**
 * Create rich embed for listing thread
 */
export function createListingEmbed(listing: ListingData): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`🎮 ${listing.title}`)
    .setDescription(listing.summary)
    .setColor(getStatusColor(listing.status))
    .addFields(
      {
        name: '💰 Price',
        value: `$${formatPrice(listing.price)}`,
        inline: true,
      },
      {
        name: '📂 Category',
        value: listing.category,
        inline: true,
      },
      {
        name: '📊 Status',
        value: `${getStatusEmoji(listing.status)} ${listing.status}`,
        inline: true,
      },
      {
        name: '👤 Seller',
        value: listing.user.name || 'Anonymous',
        inline: true,
      },
      {
        name: '✅ Verification',
        value: getVerificationBadge(
          listing.user.kycTier,
          listing.user.kycVerified
        ),
        inline: true,
      },
      {
        name: '🌐 Visibility',
        value:
          listing.visibility === 'PUBLIC'
            ? '🌍 All Servers'
            : '🔒 This Server Only',
        inline: true,
      }
    )
    .setTimestamp(listing.createdAt);

  // Add Roblox game data if available
  if (listing.robloxSnapshots && listing.robloxSnapshots.length > 0) {
    const snapshot = listing.robloxSnapshots[0];

    if (snapshot && snapshot.thumbnailUrl) {
      embed.setThumbnail(snapshot.thumbnailUrl);
    }

    if (snapshot && snapshot.gameName) {
      embed.addFields({
        name: '🎮 Game Information',
        value: `**Name:** ${snapshot.gameName}
**Ownership:** ${snapshot.verifiedOwnership ? '✅ Verified' : '❌ Not Verified'}
${snapshot.playerCount ? `**Players:** ${snapshot.playerCount.toLocaleString()}` : ''}
${snapshot.visits ? `**Visits:** ${snapshot.visits.toLocaleString()}` : ''}`,
        inline: false,
      });
    }
  }

  embed.setFooter({
    text: `Listing ID: ${listing.id} • Created on Bloxtr8`,
  });

  return embed;
}

/**
 * Create action buttons for listing thread
 */
export function createListingButtons(
  listingId: string
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`make_offer_${listingId}`)
      .setLabel('💸 Make Offer')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`view_details_${listingId}`)
      .setLabel('🔍 View Details')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setLabel('🌐 View on Web')
      .setStyle(ButtonStyle.Link)
      .setURL(`https://bloxtr8.com/listings/${listingId}`),
    new ButtonBuilder()
      .setCustomId(`watch_listing_${listingId}`)
      .setLabel('👁️ Watch')
      .setStyle(ButtonStyle.Secondary)
  );
}

/**
 * Create a listing thread in the appropriate price-range channel
 */
export async function createListingThread(
  listing: ListingData,
  guild: Guild,
  maxRetries: number = 3
): Promise<PublicThreadChannel<boolean> | null> {
  let lastError: Error | null = null;

  // Validate bot permissions first
  const permissions = validateBotPermissions(guild);
  if (!permissions.hasThreadCreate) {
    console.error(
      `Bot lacks thread creation permissions in guild ${guild.id}: ${permissions.missingPermissions.join(', ')}`
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

      // Create the thread
      const threadName = generateThreadName(listing);
      const createdThread = await channel.threads.create({
        name: threadName,
        type: ChannelType.PublicThread,
        autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
        reason: `New listing: ${listing.title}`,
      });

      // Type guard to ensure we have a public thread
      if (createdThread.type !== ChannelType.PublicThread) {
        console.error(
          `Created thread is not a public thread: ${createdThread.type}`
        );
        return null;
      }

      const thread = createdThread as PublicThreadChannel<boolean>;

      console.log(
        `Created thread ${thread.id} for listing ${listing.id} in channel ${channel.name} (attempt ${attempt}/${maxRetries})`
      );

      // Post the listing embed
      const embed = createListingEmbed(listing);
      const buttons = createListingButtons(listing.id);

      await thread.send({
        content: `**New ${listing.visibility === 'PUBLIC' ? 'Global' : 'Private'} Listing**`,
        embeds: [embed],
        components: [buttons],
      });

      // Pin the first message
      const messages = await thread.messages.fetch({ limit: 1 });
      const firstMessage = messages.first();
      if (firstMessage) {
        await firstMessage.pin();
      }

      return thread;
    } catch (error) {
      lastError = error as Error;
      console.error(
        `Failed to create listing thread for ${listing.id} (attempt ${attempt}/${maxRetries}):`,
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
    `Failed to create listing thread for ${listing.id} after ${maxRetries} attempts. Last error:`,
    lastError
  );
  return null;
}

/**
 * Update listing thread when listing changes
 */
export async function updateListingThread(
  threadId: string,
  channelId: string,
  guild: Guild,
  listing: ListingData
): Promise<boolean> {
  try {
    // Fetch the channel
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !('threads' in channel)) {
      console.warn(`Channel ${channelId} not found or doesn't support threads`);
      return false;
    }

    // Fetch the thread
    const thread = await (channel as TextChannel).threads
      .fetch(threadId)
      .catch(() => null);
    if (!thread) {
      console.warn(`Thread ${threadId} not found in channel ${channelId}`);
      return false;
    }

    // Update thread name if listing changed
    const newThreadName = generateThreadName(listing);
    if (thread.name !== newThreadName) {
      await thread.setName(newThreadName);
    }

    // Archive thread if listing is no longer active
    if (listing.status !== 'ACTIVE' && !thread.archived) {
      await thread.setArchived(true, `Listing ${listing.status.toLowerCase()}`);
      console.log(
        `Archived thread ${threadId} for ${listing.status} listing ${listing.id}`
      );
      return true;
    }

    // Update the thread's first message (embed)
    const messages = await thread.messages.fetch({ limit: 1 });
    const firstMessage = messages.first();

    if (firstMessage && firstMessage.author.id === guild.client.user?.id) {
      const embed = createListingEmbed(listing);
      const buttons = createListingButtons(listing.id);

      await firstMessage.edit({
        embeds: [embed],
        components: [buttons],
      });

      console.log(`Updated thread ${threadId} for listing ${listing.id}`);
    }

    return true;
  } catch (error) {
    console.error(`Failed to update thread ${threadId}:`, error);
    return false;
  }
}

/**
 * Archive listing thread
 */
export async function archiveListingThread(
  threadId: string,
  channelId: string,
  guild: Guild,
  reason: string
): Promise<boolean> {
  try {
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !('threads' in channel)) {
      return false;
    }

    const thread = await (channel as TextChannel).threads
      .fetch(threadId)
      .catch(() => null);
    if (!thread) {
      return false;
    }

    if (!thread.archived) {
      await thread.setArchived(true, reason);
      console.log(`Archived thread ${threadId}: ${reason}`);
    }

    return true;
  } catch (error) {
    console.error(`Failed to archive thread ${threadId}:`, error);
    return false;
  }
}

// Helper functions

function getStatusColor(status: string): number {
  switch (status) {
    case 'ACTIVE':
      return 0x00ff88; // Green
    case 'SOLD':
      return 0xff6b6b; // Red
    case 'CANCELLED':
      return 0xffa500; // Orange
    default:
      return 0x5865f2; // Discord blurple
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
    return '✅ Verified Seller';
  }

  switch (kycTier) {
    case 'TIER_2':
      return '✅ Premium Verified';
    case 'TIER_1':
      return '🟢 Roblox Linked';
    case 'TIER_0':
    default:
      return '⚠️ Unverified';
  }
}
