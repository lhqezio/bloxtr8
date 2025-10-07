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
import { getPriceRangeChannel, formatPrice } from './marketplace.js';

/**
 * Listing data structure for thread creation
 */
export interface ListingData {
  id: string;
  title: string;
  summary: string;
  price: number;
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
  const statusEmoji = listing.status === 'ACTIVE' ? '🟢' : listing.status === 'SOLD' ? '🔴' : '⚪';
  const verifiedEmoji = listing.user.kycVerified ? '✅' : '⚠️';

  // Truncate title if too long (Discord thread name limit is 100 chars)
  let title = listing.title;
  if (title.length > 40) {
    title = title.substring(0, 37) + '...';
  }

  return `${statusEmoji} ${title} - $${price} | ${verifiedEmoji}`;
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
        value: `$${(listing.price / 100).toFixed(2)}`,
        inline: true,
      },
      {
        name: '📂 Category',
        value: listing.category,
        inline: true,
      },
      {
        name: '📊 Status',
        value: getStatusEmoji(listing.status) + ' ' + listing.status,
        inline: true,
      },
      {
        name: '👤 Seller',
        value: listing.user.name || 'Anonymous',
        inline: true,
      },
      {
        name: '✅ Verification',
        value: getVerificationBadge(listing.user.kycTier, listing.user.kycVerified),
        inline: true,
      },
      {
        name: '🌐 Visibility',
        value: listing.visibility === 'PUBLIC' ? '🌍 All Servers' : '🔒 This Server Only',
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
        value:
          `**Name:** ${snapshot.gameName}\n` +
          `**Ownership:** ${snapshot.verifiedOwnership ? '✅ Verified' : '❌ Not Verified'}\n` +
          (snapshot.playerCount ? `**Players:** ${snapshot.playerCount.toLocaleString()}\n` : '') +
          (snapshot.visits ? `**Visits:** ${snapshot.visits.toLocaleString()}\n` : ''),
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
export function createListingButtons(listingId: string): ActionRowBuilder<ButtonBuilder> {
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
  guild: Guild
): Promise<PublicThreadChannel<boolean> | null> {
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
      console.error(`Created thread is not a public thread: ${createdThread.type}`);
      return null;
    }

    const thread = createdThread as PublicThreadChannel<boolean>;

    console.log(
      `Created thread ${thread.id} for listing ${listing.id} in channel ${channel.name}`
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
    console.error(`Failed to create listing thread for ${listing.id}:`, error);
    return null;
  }
}

/**
 * Update listing thread when listing changes
 */
export async function updateListingThread(
  threadId: string,
  listing: ListingData,
  guild: Guild
): Promise<void> {
  try {
    // Find the thread
    const allChannels = guild.channels.cache.filter(
      (ch) => ch.type === ChannelType.GuildText
    );

    let thread: PublicThreadChannel<boolean> | null = null;

    for (const [, channel] of allChannels) {
      const textChannel = channel as TextChannel;
      const threads = await textChannel.threads.fetchActive();
      const foundThread = threads.threads.get(threadId);

      if (foundThread && foundThread.type === ChannelType.PublicThread) {
        thread = foundThread as PublicThreadChannel<boolean>;
        break;
      }
    }

    if (!thread) {
      console.error(`Thread ${threadId} not found in guild ${guild.id}`);
      return;
    }

    // Update thread name
    const newName = generateThreadName(listing);
    if (thread.name !== newName) {
      await thread.setName(newName);
    }

    // Post update message
    const updateEmbed = new EmbedBuilder()
      .setTitle('📢 Listing Updated')
      .setDescription('This listing has been updated. See details below.')
      .setColor(0xffa500)
      .addFields(
        {
          name: '💰 Current Price',
          value: `$${(listing.price / 100).toFixed(2)}`,
          inline: true,
        },
        {
          name: '📊 Status',
          value: getStatusEmoji(listing.status) + ' ' + listing.status,
          inline: true,
        }
      )
      .setTimestamp();

    await thread.send({ embeds: [updateEmbed] });

    // Archive thread if listing is sold or cancelled
    if (listing.status === 'SOLD' || listing.status === 'CANCELLED') {
      await thread.setArchived(true, `Listing ${listing.status.toLowerCase()}`);
    }
  } catch (error) {
    console.error(`Failed to update thread ${threadId}:`, error);
  }
}

/**
 * Archive listing thread
 */
export async function archiveListingThread(
  threadId: string,
  guild: Guild,
  reason: string
): Promise<void> {
  try {
    const allChannels = guild.channels.cache.filter(
      (ch) => ch.type === ChannelType.GuildText
    );

    for (const [, channel] of allChannels) {
      const textChannel = channel as TextChannel;
      const threads = await textChannel.threads.fetchActive();
      const thread = threads.threads.get(threadId);

      if (thread) {
        await thread.setArchived(true, reason);
        console.log(`Archived thread ${threadId}: ${reason}`);
        return;
      }
    }
  } catch (error) {
    console.error(`Failed to archive thread ${threadId}:`, error);
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

