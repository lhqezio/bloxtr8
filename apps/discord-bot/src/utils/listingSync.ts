import { setTimeout } from 'timers';

import type { Guild, Client, TextChannel } from 'discord.js';

import {
  fetchListings,
  updateListingMessage as updateListingMessageAPI,
  type ListingResponse,
} from './apiClient.js';
import { getPriceRangeChannel } from './marketplace.js';
import {
  createListingMessage,
  updateListingMessage,
  markListingAsSold,
  deleteListingMessage,
  getAllListingMessages,
  findListingMessageByListingId,
  type ListingData,
} from './messageManager.js';

/**
 * Sync all public listings to a guild
 * Creates messages for listings that don't have one yet and cleans up orphaned messages
 */
export async function syncPublicListingsToGuild(guild: Guild): Promise<void> {
  console.log(`Starting listing sync for guild: ${guild.name} (${guild.id})`);

  try {
    let page = 1;
    let hasMore = true;
    let totalSynced = 0;
    let messagesCreated = 0;
    let messagesUpdated = 0;
    let messagesDeleted = 0;
    let messagesMarkedSold = 0;

    // First, collect all listings from database
    const allListings: ListingResponse[] = [];
    while (hasMore) {
      const result = await fetchListings({
        page,
        limit: 50,
        visibility: 'PUBLIC',
      });

      if (!result.success) {
        console.error('Failed to fetch listings:', result.error);
        break;
      }

      allListings.push(...result.data.listings);
      hasMore = result.data.pagination.hasNext;
      page++;
    }

    console.log(`Found ${allListings.length} public listings in database`);

    // Get all price-range channels in this guild
    const priceRangeChannels: TextChannel[] = [];
    const category = guild.channels.cache.find(
      ch => ch.type === 4 && ch.name === '🏪 BLOXTR8' // 4 = GUILD_CATEGORY
    );

    if (category) {
      const channels = guild.channels.cache.filter(
        ch => ch.type === 0 && ch.parentId === category.id // 0 = GUILD_TEXT
      );
      priceRangeChannels.push(
        ...(Array.from(channels.values()) as TextChannel[])
      );
    }

    console.log(`Found ${priceRangeChannels.length} price-range channels`);

    // Clean up orphaned messages first
    const botUserId = guild.client.user?.id;
    if (botUserId) {
      for (const channel of priceRangeChannels) {
        try {
          const listingMessages = await getAllListingMessages(
            channel,
            botUserId
          );

          for (const { message, listingId } of listingMessages) {
            if (!listingId) continue;

            // Find this listing in our database
            const dbListing = allListings.find(l => l.id === listingId);

            if (!dbListing) {
              // Listing doesn't exist in database - delete message
              await deleteListingMessage(
                message.id,
                channel.id,
                guild,
                'Listing no longer exists in database'
              );
              messagesDeleted++;
              console.log(`Deleted orphaned message for listing ${listingId}`);
            } else if (
              dbListing.status === 'CANCELLED' ||
              dbListing.status === 'INACTIVE'
            ) {
              // Listing is cancelled/inactive - delete message
              await deleteListingMessage(
                message.id,
                channel.id,
                guild,
                `Listing ${dbListing.status.toLowerCase()}`
              );
              messagesDeleted++;
              console.log(
                `Deleted message for ${dbListing.status} listing ${listingId}`
              );
            } else if (dbListing.messageId !== message.id) {
              // Database has wrong messageId - update it
              await updateListingMessageAPI(listingId, {
                messageId: message.id,
                channelId: channel.id,
                priceRange: dbListing.priceRange || undefined,
              });
              console.log(
                `Updated messageId for listing ${listingId} to ${message.id}`
              );
            }
          }
        } catch (error) {
          console.error(
            `Failed to cleanup orphaned messages in channel ${channel.name}:`,
            error
          );
        }
      }
    }

    // Now process each listing
    for (const listing of allListings) {
      try {
        // Convert API listing to ListingData format
        const listingData: ListingData = {
          id: listing.id,
          title: listing.title,
          summary: listing.summary,
          price: listing.price,
          category: listing.category,
          status: listing.status,
          visibility: listing.visibility,
          userId: listing.userId,
          guildId: listing.guildId,
          user: listing.user,
          robloxSnapshots: listing.robloxSnapshots,
          createdAt: new Date(listing.createdAt),
        };

        // Get the appropriate channel for this listing
        const channel = await getPriceRangeChannel(listing.price, guild);
        if (!channel) {
          console.warn(
            `No price range channel found for listing ${listing.id}`
          );
          continue;
        }

        // Check if message exists in Discord
        let messageExists = false;
        if (listing.messageId && listing.channelId) {
          try {
            const message = await channel.messages
              .fetch(listing.messageId)
              .catch(() => null);
            messageExists = !!message;
          } catch {
            messageExists = false;
          }
        }

        // Handle different listing statuses
        if (listing.status === 'SOLD') {
          if (messageExists && listing.messageId && listing.channelId) {
            // Mark as sold
            await markListingAsSold(
              listing.messageId,
              listing.channelId,
              guild,
              listingData
            );
            messagesMarkedSold++;
          } else if (!messageExists) {
            // Create new message and mark as sold
            const message = await createListingMessage(listingData, guild, 2);
            if (message) {
              await markListingAsSold(
                message.id,
                channel.id,
                guild,
                listingData
              );
              await updateListingMessageAPI(listing.id, {
                messageId: message.id,
                channelId: channel.id,
                priceRange: listing.priceRange || undefined,
              });
              messagesCreated++;
            }
          }
        } else if (listing.status === 'ACTIVE') {
          if (messageExists && listing.messageId && listing.channelId) {
            // Update existing message
            await updateListingMessage(
              listing.messageId,
              listing.channelId,
              guild,
              listingData
            );
            messagesUpdated++;
          } else {
            // Create new message
            const message = await createListingMessage(listingData, guild, 2);
            if (message) {
              await updateListingMessageAPI(listing.id, {
                messageId: message.id,
                channelId: channel.id,
                priceRange: listing.priceRange || undefined,
              });
              messagesCreated++;
            }
          }
        }
        // For CANCELLED/INACTIVE listings, we already handled deletion in cleanup phase

        // Rate limiting: wait 1 second between operations
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Failed to sync listing ${listing.id}:`, error);
        // Continue with next listing
      }
    }

    totalSynced = allListings.length;

    console.log(
      `Listing sync complete for guild ${guild.name}: ` +
        `${messagesCreated} created, ${messagesUpdated} updated, ${messagesMarkedSold} marked sold, ${messagesDeleted} deleted out of ${totalSynced} listings`
    );
  } catch (error) {
    console.error(`Failed to sync listings to guild ${guild.id}:`, error);
    throw error;
  }
}

/**
 * Sync all public listings across all guilds the bot is in
 * Useful for initial setup or after system maintenance
 */
export async function syncPublicListingsToAllGuilds(
  client: Client
): Promise<void> {
  console.log('Starting global listing sync across all guilds');

  const guilds = client.guilds.cache;
  console.log(`Found ${guilds.size} guilds to sync`);

  let successCount = 0;
  let failCount = 0;

  for (const [guildId, guild] of guilds) {
    try {
      console.log(
        `\nSyncing guild ${successCount + failCount + 1}/${guilds.size}: ${guild.name}`
      );
      await syncPublicListingsToGuild(guild);
      successCount++;
    } catch (error) {
      console.error(`Failed to sync guild ${guildId} (${guild.name}):`, error);
      failCount++;
    }

    // Wait between guilds to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  console.log(
    `\nGlobal listing sync complete: ${successCount} guilds synced, ${failCount} failed`
  );
}

/**
 * Sync a specific listing to all guilds (when a new public listing is created)
 */
export async function syncListingToAllGuilds(
  client: Client,
  listing: ListingResponse
): Promise<void> {
  // Only sync public listings
  if (listing.visibility !== 'PUBLIC') {
    console.log(`Listing ${listing.id} is private, skipping cross-guild sync`);
    return;
  }

  console.log(`Syncing listing ${listing.id} to all guilds`);

  const guilds = client.guilds.cache;
  const listingData: ListingData = {
    id: listing.id,
    title: listing.title,
    summary: listing.summary,
    price: listing.price,
    category: listing.category,
    status: listing.status,
    visibility: listing.visibility,
    userId: listing.userId,
    guildId: listing.guildId,
    user: listing.user,
    robloxSnapshots: listing.robloxSnapshots,
    createdAt: new Date(listing.createdAt),
  };

  let successCount = 0;
  let failCount = 0;

  for (const [guildId, guild] of guilds) {
    try {
      // Skip the guild where the listing was created (message already exists there)
      if (listing.messageId && listing.guildId && guildId === listing.guildId) {
        console.log(`Skipping origin guild ${guildId}`);
        continue;
      }

      const message = await createListingMessage(listingData, guild, 2);

      if (message) {
        successCount++;
        console.log(`Created message in guild ${guildId}: ${message.id}`);
      }

      // Rate limiting: wait 1 second between cross-guild message creation
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Failed to create message in guild ${guildId}:`, error);
      failCount++;
    }
  }

  console.log(
    `Listing ${listing.id} synced to ${successCount} guilds, ${failCount} failed`
  );
}

/**
 * Clean up messages for a deleted or cancelled listing across all guilds
 */
export async function cleanupListingMessages(
  client: Client,
  listingId: string
): Promise<void> {
  console.log(`Cleaning up messages for listing ${listingId}`);

  const guilds = client.guilds.cache;
  let deletedCount = 0;
  let failCount = 0;

  for (const [guildId, guild] of guilds) {
    try {
      // Get all price-range channels in this guild
      const priceRangeChannels: TextChannel[] = [];
      const category = guild.channels.cache.find(
        ch => ch.type === 4 && ch.name === '🏪 BLOXTR8' // 4 = GUILD_CATEGORY
      );

      if (category) {
        const channels = guild.channels.cache.filter(
          ch => ch.type === 0 && ch.parentId === category.id // 0 = GUILD_TEXT
        );
        priceRangeChannels.push(
          ...(Array.from(channels.values()) as TextChannel[])
        );
      }

      // Search for the listing message in each channel
      const botUserId = guild.client.user?.id;
      if (botUserId) {
        for (const channel of priceRangeChannels) {
          const message = await findListingMessageByListingId(
            channel,
            listingId,
            botUserId
          );
          if (message) {
            await deleteListingMessage(
              message.id,
              channel.id,
              guild,
              `Listing ${listingId} deleted/cancelled`
            );
            deletedCount++;
            console.log(
              `Deleted message for listing ${listingId} in guild ${guildId}`
            );
            break; // Found and deleted, no need to check other channels
          }
        }
      }
    } catch (error) {
      console.error(
        `Failed to cleanup messages for listing ${listingId} in guild ${guildId}:`,
        error
      );
      failCount++;
    }
  }

  console.log(
    `Message cleanup complete for listing ${listingId}: ${deletedCount} deleted, ${failCount} failed`
  );
}
