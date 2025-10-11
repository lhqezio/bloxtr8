import {
  type Guild,
  type TextChannel,
  ChannelType,
  PermissionFlagsBits,
  type CategoryChannel,
} from 'discord.js';

/**
 * Validate that the bot has required permissions for marketplace operations
 */
export function validateBotPermissions(guild: Guild): {
  hasChannelCreate: boolean;
  hasThreadCreate: boolean;
  hasChannelManage: boolean;
  missingPermissions: string[];
} {
  const botMember = guild.members.me;
  if (!botMember) {
    return {
      hasChannelCreate: false,
      hasThreadCreate: false,
      hasChannelManage: false,
      missingPermissions: ['Bot is not in guild'],
    };
  }

  const permissions = botMember.permissions;
  const missingPermissions: string[] = [];

  const hasChannelCreate = permissions.has(PermissionFlagsBits.ManageChannels);
  if (!hasChannelCreate) {
    missingPermissions.push('Manage Channels (to create marketplace channels)');
  }

  const hasThreadCreate =
    permissions.has(PermissionFlagsBits.CreatePublicThreads) ||
    permissions.has(PermissionFlagsBits.CreatePrivateThreads);
  if (!hasThreadCreate) {
    missingPermissions.push(
      'Create Public/Private Threads (to create listing threads)'
    );
  }

  const hasChannelManage = permissions.has(PermissionFlagsBits.ManageChannels);
  // This is the same as hasChannelCreate, but keeping for clarity

  return {
    hasChannelCreate,
    hasThreadCreate,
    hasChannelManage,
    missingPermissions,
  };
}

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
    range: 'under-5k',
    min: 0, // $0 in cents
    max: 500000, // $5,000 in cents
    emoji: '💚',
    description: 'Under $5,000 deals',
  },
  {
    range: '5k-20k',
    min: 500000, // $5,000 in cents
    max: 2000000, // $20,000 in cents
    emoji: '💰',
    description: '$5,000 - $20,000 deals',
  },
  {
    range: '20k-100k',
    min: 2000000, // $20,000 in cents
    max: 10000000, // $100,000 in cents
    emoji: '💎',
    description: '$20,000 - $100,000 deals',
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
  // Default to lowest range for prices below minimum, highest for prices above maximum
  const firstRange = PRICE_RANGES[0];
  if (!firstRange) {
    throw new Error('No price ranges defined');
  }
  if (priceInCents < firstRange.min) {
    return firstRange;
  }
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
  console.log(`Setting up bloxtr8 for guild: ${guild.name} (${guild.id})`);

  // Validate bot permissions first
  const permissions = validateBotPermissions(guild);
  if (!permissions.hasChannelCreate) {
    const errorMsg = `Bot lacks required permissions for bloxtr8 setup: ${permissions.missingPermissions.join(', ')}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  const channels = new Map<string, TextChannel>();

  try {
    // Create or find bloxtr8 category
    let category: CategoryChannel | null = null;
    const existingCategory = guild.channels.cache.find(
      ch => ch.type === ChannelType.GuildCategory && ch.name === '🏪 BLOXTR8'
    ) as CategoryChannel | undefined;

    if (existingCategory) {
      category = existingCategory;
    } else {
      category = await guild.channels.create({
        name: '🏪 BLOXTR8',
        type: ChannelType.GuildCategory,
        position: 0,
        permissionOverwrites: [
          {
            id: guild.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.ReadMessageHistory,
            ],
            deny: [PermissionFlagsBits.SendMessages], // Only bot can create threads
          },
        ],
      });
    }

    // Create price range channels
    for (const priceRange of PRICE_RANGES) {
      const channelName = `${priceRange.emoji}-bloxtr8-${priceRange.range}`;

      // Check if channel already exists
      // Note: Discord sanitizes channel names, so we need to check with both the original
      // and the sanitized version (e.g., "100k+" becomes "100k")
      const existingChannel = guild.channels.cache.find(ch => {
        if (ch.type !== ChannelType.GuildText) return false;
        // Check exact match first
        if (ch.name === channelName) return true;
        // Check if it matches the range pattern (handles Discord's name sanitization)
        return ch.name.includes(
          `bloxtr8-${priceRange.range.replace(/\+/g, '')}`
        );
      }) as TextChannel | undefined;

      if (existingChannel) {
        channels.set(priceRange.range, existingChannel);
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
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.ReadMessageHistory,
            ],
            deny: [
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.CreatePublicThreads,
            ],
          },
        ],
      });

      channels.set(priceRange.range, channel);

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
      `Successfully set up ${channels.size} bloxtr8 channels for guild ${guild.name}`
    );
    return channels;
  } catch (error) {
    console.error(
      `Failed to setup bloxtr8 channels for guild ${guild.id}:`,
      error
    );
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
  const channelName = `${priceRange.emoji}-bloxtr8-${priceRange.range}`;

  // First try to find in cache
  // Note: Discord sanitizes channel names, so we need to check with both the original
  // and the sanitized version (e.g., "100k+" becomes "100k")
  let channel = guild.channels.cache.find(ch => {
    if (ch.type !== ChannelType.GuildText) return false;
    // Check exact match first
    if (ch.name === channelName) return true;
    // Check if it matches the range pattern (handles Discord's name sanitization)
    return ch.name.includes(`bloxtr8-${priceRange.range.replace(/\+/g, '')}`);
  }) as TextChannel | undefined;

  // If not found in cache, fetch from Discord API
  if (!channel) {
    try {
      await guild.channels.fetch();

      // Try again after fetching with sanitization check
      channel = guild.channels.cache.find(ch => {
        if (ch.type !== ChannelType.GuildText) return false;
        // Check exact match first
        if (ch.name === channelName) return true;
        // Check if it matches the range pattern (handles Discord's name sanitization)
        return ch.name.includes(
          `bloxtr8-${priceRange.range.replace(/\+/g, '')}`
        );
      }) as TextChannel | undefined;

      if (!channel) {
        console.warn(
          `Channel ${channelName} not found for price ${priceInCents}`
        );
      }
    } catch (error) {
      console.error(
        `Failed to fetch channels from Discord API for guild ${guild.id}:`,
        error
      );
      // Continue with null return
    }
  }

  return channel || null;
}

/**
 * Clean up marketplace channels when bot leaves guild
 */
export async function cleanupMarketplaceChannels(guild: Guild): Promise<void> {
  console.log(`Cleaning up bloxtr8 for guild: ${guild.name} (${guild.id})`);

  try {
    // Find bloxtr8 category
    const category = guild.channels.cache.find(
      ch => ch.type === ChannelType.GuildCategory && ch.name === '🏪 BLOXTR8'
    ) as CategoryChannel | undefined;

    if (!category) {
      return;
    }

    // Archive all threads in bloxtr8 channels
    const bloxtr8Channels = guild.channels.cache.filter(
      ch => ch.type === ChannelType.GuildText && ch.parentId === category.id
    );

    for (const [, channel] of bloxtr8Channels) {
      const textChannel = channel as TextChannel;
      const threads = await textChannel.threads.fetchActive();

      for (const [, thread] of threads.threads) {
        await thread.setArchived(true, 'Bot leaving guild');
      }
    }

    console.log(`Successfully cleaned up bloxtr8 for guild ${guild.name}`);
  } catch (error) {
    console.error(`Failed to cleanup bloxtr8 for guild ${guild.id}:`, error);
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
    const priceRange = PRICE_RANGES.find(r => channel.name.includes(r.range));
    if (!priceRange) return;

    const newName = `${priceRange.emoji}-marketplace-${priceRange.range}-${count}`;

    // Only update if name changed
    if (channel.name !== newName) {
      await channel.setName(newName);
    }
  } catch (error) {
    console.error(`Failed to update channel listing count:`, error);
  }
}
