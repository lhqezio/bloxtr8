import type { Guild, Client } from 'discord.js';
import { fetchListings, updateListingThread, type ListingResponse } from './apiClient.js';
import { createListingThread, type ListingData } from './threadManager.js';

/**
 * Sync all public listings to a guild
 * Creates threads for listings that don't have one yet
 */
export async function syncPublicListingsToGuild(guild: Guild): Promise<void> {
  console.log(`Starting listing sync for guild: ${guild.name} (${guild.id})`);

  try {
    let page = 1;
    let hasMore = true;
    let totalSynced = 0;
    let threadsCreated = 0;

    while (hasMore) {
      // Fetch public listings
      const result = await fetchListings({
        page,
        limit: 50,
        status: 'ACTIVE',
        visibility: 'PUBLIC',
      });

      if (!result.success) {
        console.error('Failed to fetch listings:', result.error);
        break;
      }

      const { listings, pagination } = result.data;

      // Process each listing
      for (const listing of listings) {
        try {
          // Skip if thread already exists
          if (listing.threadId) {
            console.log(
              `Listing ${listing.id} already has thread ${listing.threadId}, skipping`
            );
            continue;
          }

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

          // Create thread for this listing
          const thread = await createListingThread(listingData, guild);

          if (thread) {
            threadsCreated++;

            // Update listing with thread information
            await updateListingThread(listing.id, {
              threadId: thread.id,
              channelId: thread.parentId || undefined,
              priceRange: listing.priceRange || undefined,
            });

            console.log(
              `Created thread ${thread.id} for listing ${listing.id} in guild ${guild.id}`
            );
          }

          // Rate limiting: wait 2 seconds between thread creation
          // Discord allows 50 threads per 10 minutes = ~1 per 12 seconds
          // We'll be more conservative with 2 seconds
          await new Promise((resolve) => setTimeout(resolve, 2000));
        } catch (error) {
          console.error(`Failed to sync listing ${listing.id}:`, error);
          // Continue with next listing
        }
      }

      totalSynced += listings.length;
      hasMore = pagination.hasNext;
      page++;

      console.log(
        `Synced page ${pagination.page}/${pagination.totalPages} (${totalSynced}/${pagination.total} listings, ${threadsCreated} threads created)`
      );

      // Rate limiting between pages
      if (hasMore) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    console.log(
      `Listing sync complete for guild ${guild.name}: ${threadsCreated} threads created out of ${totalSynced} listings`
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
export async function syncPublicListingsToAllGuilds(client: Client): Promise<void> {
  console.log('Starting global listing sync across all guilds');

  const guilds = client.guilds.cache;
  console.log(`Found ${guilds.size} guilds to sync`);

  let successCount = 0;
  let failCount = 0;

  for (const [guildId, guild] of guilds) {
    try {
      console.log(`\nSyncing guild ${successCount + failCount + 1}/${guilds.size}: ${guild.name}`);
      await syncPublicListingsToGuild(guild);
      successCount++;
    } catch (error) {
      console.error(`Failed to sync guild ${guildId} (${guild.name}):`, error);
      failCount++;
    }

    // Wait between guilds to avoid rate limits
    await new Promise((resolve) => setTimeout(resolve, 5000));
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
      // Skip the guild where the listing was created (thread already exists there)
      if (listing.threadId && listing.guildId && guildId === listing.guildId) {
        console.log(`Skipping origin guild ${guildId}`);
        continue;
      }

      const thread = await createListingThread(listingData, guild);

      if (thread) {
        successCount++;
        console.log(`Created thread in guild ${guildId}: ${thread.id}`);
      }

      // Rate limiting
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`Failed to create thread in guild ${guildId}:`, error);
      failCount++;
    }
  }

  console.log(
    `Listing ${listing.id} synced to ${successCount} guilds, ${failCount} failed`
  );
}

/**
 * Clean up threads for a deleted or cancelled listing across all guilds
 */
export async function cleanupListingThreads(
  client: Client,
  listingId: string
): Promise<void> {
  console.log(`Cleaning up threads for listing ${listingId}`);

  // Fetch the listing to get thread information
  const result = await fetchListings({
    page: 1,
    limit: 1,
    // Note: This would need an endpoint to fetch by listing ID
    // For now, we'll handle this differently
  });

  // TODO: Implement thread cleanup across guilds
  // This would require tracking which guilds have threads for each listing
  console.log('Thread cleanup not yet fully implemented');
}

