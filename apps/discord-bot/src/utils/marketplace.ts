import {
  type Guild,
  type TextChannel,
  ChannelType,
  PermissionFlagsBits,
  type CategoryChannel,
} from 'discord.js';

/**
 * Price range configuration for marketplace channels
 */
export interface PriceRange {
  range: string;
  min: number;
  max: number;
  emoji: string;
  description: string;
}

export const PRICE_RANGES: PriceRange[] = [
  {
    range: '1k-5k',
    min: 100000, // $1,000 in cents
    max: 500000, // $5,000 in cents
    emoji: '📈',
    description: '$1,000 - $5,000 deals',
  },
  {
    range: '5k-25k',
    min: 500000, // $5,000 in cents
    max: 2500000, // $25,000 in cents
    emoji: '💰',
    description: '$5,000 - $25,000 deals',
  },
  {
    range: '25k-100k',
    min: 2500000, // $25,000 in cents
    max: 10000000, // $100,000 in cents
    emoji: '💎',
    description: '$25,000 - $100,000 deals',
  },
  {
    range: '100k+',
    min: 10000000, // $100,000 in cents
    max: Infinity,
    emoji: '👑',
    description: '$100,000+ premium deals',
  },
];

/**
 * Get the appropriate price range for a listing price
 */
export function getPriceRangeForPrice(priceInCents: number): PriceRange {
  for (const range of PRICE_RANGES) {
    if (priceInCents >= range.min && priceInCents < range.max) {
      return range;
    }
  }
  // Default to highest range
  const lastRange = PRICE_RANGES[PRICE_RANGES.length - 1];
  if (!lastRange) {
    throw new Error('No price ranges defined');
  }
  return lastRange;
}

/**
 * Format price in dollars
 */
export function formatPrice(priceInCents: number): string {
  const dollars = priceInCents / 100;
  if (dollars >= 1000000) {
    return `${(dollars / 1000000).toFixed(2)}M`;
  } else if (dollars >= 1000) {
    return `${(dollars / 1000).toFixed(0)}k`;
  }
  return dollars.toFixed(2);
}

/**
 * Setup marketplace channels for a guild
 * Creates a category and price-range channels
 */
export async function setupMarketplaceChannels(
  guild: Guild
): Promise<Map<string, TextChannel>> {
  console.log(`Setting up marketplace for guild: ${guild.name} (${guild.id})`);

  const channels = new Map<string, TextChannel>();

  try {
    // Create or find marketplace category
    let category: CategoryChannel | null = null;
    const existingCategory = guild.channels.cache.find(
      (ch) => ch.type === ChannelType.GuildCategory && ch.name === '🏪 MARKETPLACE'
    ) as CategoryChannel | undefined;

    if (existingCategory) {
      category = existingCategory;
      console.log(`Found existing marketplace category: ${category.id}`);
    } else {
      category = await guild.channels.create({
        name: '🏪 MARKETPLACE',
        type: ChannelType.GuildCategory,
        position: 0,
        permissionOverwrites: [
          {
            id: guild.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
            deny: [PermissionFlagsBits.SendMessages], // Only bot can create threads
          },
        ],
      });
      console.log(`Created marketplace category: ${category.id}`);
    }

    // Create price range channels
    for (const priceRange of PRICE_RANGES) {
      const channelName = `${priceRange.emoji}-marketplace-${priceRange.range}`;

      // Check if channel already exists
      const existingChannel = guild.channels.cache.find(
        (ch) => ch.type === ChannelType.GuildText && ch.name === channelName
      ) as TextChannel | undefined;

      if (existingChannel) {
        channels.set(priceRange.range, existingChannel);
        console.log(
          `Found existing channel for ${priceRange.range}: ${existingChannel.id}`
        );
        continue;
      }

      // Create new channel
      const channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: category.id,
        topic: `${priceRange.description} | High-value game trading marketplace`,
        permissionOverwrites: [
          {
            id: guild.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
            deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.CreatePublicThreads],
          },
        ],
      });

      channels.set(priceRange.range, channel);
      console.log(`Created channel for ${priceRange.range}: ${channel.id}`);

      // Add a welcome message
      await channel.send({
        embeds: [
          {
            title: `${priceRange.emoji} Welcome to ${priceRange.description}`,
            description:
              '**This is the Bloxtr8 high-value game marketplace.**\n\n' +
              '✨ Each listing appears as its own thread with:\n' +
              '• 🎮 Rich game information and screenshots\n' +
              '• ✅ Verified ownership proof\n' +
              '• 💬 Direct communication with sellers\n' +
              '• 🔒 Secure escrow and contract integration\n\n' +
              '**How to create a listing:**\n' +
              'Use `/listing create` to post your verified game for sale\n\n' +
              '**Browse listings:**\n' +
              'Check the threads below or use `/listing view` for filters',
            color: 0x5865f2,
            timestamp: new Date().toISOString(),
            footer: {
              text: 'Bloxtr8 Marketplace • Professional Game Trading',
            },
          },
        ],
      });
    }

    console.log(
      `Successfully set up ${channels.size} marketplace channels for guild ${guild.name}`
    );
    return channels;
  } catch (error) {
    console.error(`Failed to setup marketplace channels for guild ${guild.id}:`, error);
    throw error;
  }
}

/**
 * Get the channel for a specific price range in a guild
 */
export async function getPriceRangeChannel(
  priceInCents: number,
  guild: Guild
): Promise<TextChannel | null> {
  const priceRange = getPriceRangeForPrice(priceInCents);
  const channelName = `${priceRange.emoji}-marketplace-${priceRange.range}`;

  const channel = guild.channels.cache.find(
    (ch) => ch.type === ChannelType.GuildText && ch.name === channelName
  ) as TextChannel | undefined;

  return channel || null;
}

/**
 * Clean up marketplace channels when bot leaves guild
 */
export async function cleanupMarketplaceChannels(guild: Guild): Promise<void> {
  console.log(`Cleaning up marketplace for guild: ${guild.name} (${guild.id})`);

  try {
    // Find marketplace category
    const category = guild.channels.cache.find(
      (ch) => ch.type === ChannelType.GuildCategory && ch.name === '🏪 MARKETPLACE'
    ) as CategoryChannel | undefined;

    if (!category) {
      console.log('No marketplace category found, nothing to clean up');
      return;
    }

    // Archive all threads in marketplace channels
    const marketplaceChannels = guild.channels.cache.filter(
      (ch) => ch.type === ChannelType.GuildText && ch.parentId === category.id
    );

    for (const [, channel] of marketplaceChannels) {
      const textChannel = channel as TextChannel;
      const threads = await textChannel.threads.fetchActive();

      for (const [, thread] of threads.threads) {
        await thread.setArchived(true, 'Bot leaving guild');
        console.log(`Archived thread: ${thread.name}`);
      }
    }

    console.log(`Successfully cleaned up marketplace for guild ${guild.name}`);
  } catch (error) {
    console.error(`Failed to cleanup marketplace for guild ${guild.id}:`, error);
  }
}

/**
 * Update channel name with active listing count
 */
export async function updateChannelListingCount(
  channel: TextChannel,
  count: number
): Promise<void> {
  try {
    const priceRange = PRICE_RANGES.find((r) => channel.name.includes(r.range));
    if (!priceRange) return;

    const newName = `${priceRange.emoji}-marketplace-${priceRange.range}-${count}`;

    // Only update if name changed
    if (channel.name !== newName) {
      await channel.setName(newName);
      console.log(`Updated channel name to ${newName}`);
    }
  } catch (error) {
    console.error(`Failed to update channel listing count:`, error);
  }
}

