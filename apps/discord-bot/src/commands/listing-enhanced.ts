import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';

import { createListing } from '../utils/apiClient.js';
import { getApiBaseUrl } from '../utils/apiClient.js';
import { verifyUserForListing } from '../utils/userVerification.js';
import { ensureUserExists } from '../utils/userVerification.js';

// ✅ In-memory cache with TTL, size limits, and cleanup
// FEATURES:
// - TTL: Entries expire after 15 minutes - users must re-verify after expiration
// - Size limits: Maximum 1000 entries with LRU eviction
// - Cleanup: Automatic cleanup every 5 minutes
// - Not persistent: Cache data lost on bot restart (users must re-verify)
//
// SECURITY:
// - No automatic cache recovery to prevent wrong game data in listings
// - Users must explicitly verify the game they want to list
//
// NOTE for Production:
// - Consider Redis for persistence and multi-instance cache coordination
// - Bot communicates via API layer, never calls database directly
interface GameDetails {
  id: string;
  name: string;
  description?: string;
  creator?: { name: string; id: number; type: string };
  visits?: number;
  playing?: number;
  genre?: string;
  thumbnailUrl?: string;
}

interface RobloxExperience {
  id: string;
  name: string;
  description?: string;
  creator: {
    id: number;
    name: string;
    type: string;
  };
  created: string;
  updated: string;
  visits: number;
  playing: number;
  maxPlayers: number;
  genre: string;
  thumbnailUrl?: string;
  universeId: number;
  placeId?: string;
}

interface CacheEntry {
  verificationId: string;
  gameDetails: GameDetails;
  placeId?: string;
  timestamp: number;
  lastAccessed: number;
}

// Cache configuration
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_CACHE_SIZE = 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const verificationCache = new Map<string, CacheEntry>();

// Cleanup function to remove expired entries
function cleanupExpiredEntries(): void {
  const now = Date.now();
  let removedCount = 0;

  for (const [key, entry] of verificationCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      verificationCache.delete(key);
      removedCount++;
    }
  }

  if (removedCount > 0) {
    console.log(
      `[Cache Cleanup] Removed ${removedCount} expired entries. Cache size: ${verificationCache.size}`
    );
  }
}

// LRU eviction - remove oldest accessed entry when cache is full
function evictLRUEntry(): void {
  let oldestKey: string | null = null;
  let oldestTime = Infinity;

  for (const [key, entry] of verificationCache.entries()) {
    if (entry.lastAccessed < oldestTime) {
      oldestTime = entry.lastAccessed;
      oldestKey = key;
    }
  }

  if (oldestKey) {
    verificationCache.delete(oldestKey);
    console.log(
      `[Cache LRU] Evicted entry for key: ${oldestKey}. Cache size: ${verificationCache.size}`
    );
  }
}

// Helper to set cache entry with size check
function setCacheEntry(
  key: string,
  value: { verificationId: string; gameDetails: GameDetails; placeId?: string }
): void {
  const isUpdate = verificationCache.has(key);

  // Check if we need to evict before adding or updating
  // For new entries: evict if at max size
  // For updates at max size: also evict to maintain LRU policy
  if (verificationCache.size >= MAX_CACHE_SIZE && !isUpdate) {
    evictLRUEntry();
  }

  const now = Date.now();
  verificationCache.set(key, {
    ...value,
    timestamp: now,
    lastAccessed: now,
  });
}

// Helper to get cache entry with TTL check and access time update
function getCacheEntry(key: string): {
  verificationId: string;
  gameDetails: GameDetails;
  placeId?: string;
} | null {
  const entry = verificationCache.get(key);

  if (!entry) {
    return null;
  }

  const now = Date.now();

  // Check if entry has expired
  if (now - entry.timestamp > CACHE_TTL_MS) {
    verificationCache.delete(key);
    console.log(`[Cache TTL] Expired entry for key: ${key}`);
    return null;
  }

  // Update last accessed time for LRU
  entry.lastAccessed = now;

  return {
    verificationId: entry.verificationId,
    gameDetails: entry.gameDetails,
    placeId: entry.placeId,
  };
}

// Start periodic cleanup
const cleanupTimer = globalThis.setInterval(
  cleanupExpiredEntries,
  CLEANUP_INTERVAL_MS
);

// Ensure cleanup timer doesn't prevent process from exiting
if ('unref' in cleanupTimer && typeof cleanupTimer.unref === 'function') {
  cleanupTimer.unref();
}

// Cleanup function to clear timer and cache on module unload/bot shutdown
export function cleanupVerificationCache(): void {
  globalThis.clearInterval(cleanupTimer);
  verificationCache.clear();
  console.log(
    '[Cache Cleanup] Cleared verification cache and stopped cleanup timer'
  );
}

// Function to fetch user's Roblox experiences
async function fetchUserExperiences(
  userId: string
): Promise<RobloxExperience[]> {
  try {
    const response = await fetch(
      `${getApiBaseUrl()}/api/users/${userId}/experiences`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      }
    );

    if (!response.ok) {
      console.error(`Failed to fetch user experiences: ${response.statusText}`);
      return [];
    }

    const data = await response.json();
    return data.experiences || [];
  } catch (error) {
    console.error('Error fetching user experiences:', error);
    return [];
  }
}

export async function handleListingCreateWithVerification(
  interaction: ChatInputCommandInteraction
) {
  try {
    // Clear any old verification cache for this user
    const discordId = interaction.user.id;
    verificationCache.delete(discordId);

    // Check user verification status without deferring (needed for modal)

    // Ensure user exists in database
    const userResult = await ensureUserExists(
      interaction.user.id,
      interaction.user.username
    );

    if (!userResult.user) {
      const errorEmbed = new EmbedBuilder()
        .setColor(0xef4444)
        .setTitle('❌ Account Error')
        .setDescription('**Unable to access your account**')
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields({
          name: '🔧 Quick Fix',
          value: 'Try `/signup` to create a new account',
        })
        .setFooter({
          text: 'Need help? Contact support',
          iconURL: interaction.user.displayAvatarURL(),
        })
        .setTimestamp();

      await interaction.reply({
        embeds: [errorEmbed],
        ephemeral: true,
      });
      return;
    }

    // Check if user is verified
    const verificationResult = await verifyUserForListing(interaction.user.id);

    if (!verificationResult.isVerified) {
      const embed = new EmbedBuilder()
        .setColor(0xf59e0b)
        .setTitle('🔒 Account Setup Required')
        .setDescription('**Complete account setup to create listings**')
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields(
          {
            name: "📋 What's Required?",
            value: 'Link your Roblox account',
            inline:
              !verificationResult.user ||
              verificationResult.user.kycTier === 'TIER_0',
          },
          {
            name: '⚡ Quick Setup',
            value: 'Use `/link` to connect Roblox',
            inline:
              !verificationResult.user ||
              verificationResult.user.kycTier === 'TIER_0',
          },
          {
            name: '🔗 Need Help?',
            value: 'Visit our web app for assistance',
            inline:
              !verificationResult.user ||
              verificationResult.user.kycTier === 'TIER_0',
          }
        );

      // If TIER_0, show specific setup information
      if (verificationResult.user?.kycTier === 'TIER_0') {
        embed.addFields({
          name: '🎯 Next Steps',
          value:
            '1. Link Roblox account with `/link`\n2. Verify asset ownership\n3. Create your listing!',
        });
      }

      embed
        .setFooter({
          text: 'Secure verification protects all traders',
          iconURL: interaction.user.displayAvatarURL(),
        })
        .setTimestamp();

      await interaction.reply({
        embeds: [embed],
        ephemeral: true,
      });
      return;
    }

    // Check if user has linked Roblox account
    const robloxAccount = userResult.user?.accounts?.find(
      acc => (acc as { providerId?: string }).providerId === 'roblox'
    );

    if (!robloxAccount) {
      const embed = new EmbedBuilder()
        .setColor(0xf59e0b)
        .setTitle('🔗 Roblox Account Required')
        .setDescription(
          '**Link your Roblox account to verify asset ownership**'
        )
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields({
          name: '🔧 Quick Fix',
          value: 'Use `/link` to connect your Roblox account',
        })
        .setFooter({
          text: 'Required for asset verification',
          iconURL: interaction.user.displayAvatarURL(),
        })
        .setTimestamp();

      await interaction.reply({
        embeds: [embed],
        ephemeral: true,
      });
      return;
    }

    // Fetch user's experiences
    await interaction.deferReply({ ephemeral: true });

    const experiences = await fetchUserExperiences(userResult.user.id);

    if (experiences.length === 0) {
      const embed = new EmbedBuilder()
        .setColor(0xf59e0b)
        .setTitle('🎮 No Experiences Found')
        .setDescription(
          "**You don't have any public Roblox experiences to list**"
        )
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields({
          name: '💡 What can you do?',
          value: 'Create a public Roblox experience and try again',
        })
        .setFooter({
          text: 'Only public experiences can be listed',
          iconURL: interaction.user.displayAvatarURL(),
        })
        .setTimestamp();

      await interaction.editReply({
        embeds: [embed],
      });
      return;
    }

    // Create dropdown for experience selection
    const experienceSelect = new StringSelectMenuBuilder()
      .setCustomId('experience_selection')
      .setPlaceholder('Select an experience to list')
      .setMinValues(1)
      .setMaxValues(1);

    // Add experiences to dropdown (limit to 25 due to Discord's limit)
    const experiencesToShow = experiences.slice(0, 25);
    for (const experience of experiencesToShow) {
      const option = new StringSelectMenuOptionBuilder()
        .setLabel(experience.name)
        .setDescription(
          `${experience.visits.toLocaleString()} visits • ${experience.genre || 'Unknown genre'}`
        )
        .setValue(experience.id)
        .setEmoji('🎮');

      experienceSelect.addOptions(option);
    }

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      experienceSelect
    );

    const embed = new EmbedBuilder()
      .setColor(0x00d4aa)
      .setTitle('🎮 Select Experience to List')
      .setDescription(
        `**Choose from your ${experiences.length} public experiences**`
      )
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields({
        name: '📋 What happens next?',
        value:
          '1. Select your experience\n2. Verify ownership\n3. Create your listing',
      })
      .setFooter({
        text: `Showing ${experiencesToShow.length} of ${experiences.length} experiences`,
        iconURL: interaction.user.displayAvatarURL(),
      })
      .setTimestamp();

    await interaction.editReply({
      embeds: [embed],
      components: [row],
    });
  } catch (error) {
    console.error('Error handling listing create with verification:', error);

    try {
      await interaction.reply({
        content:
          '❌ An error occurred while processing your request. Please try again later.',
        ephemeral: true,
      });
    } catch {
      // Fallback if reply already sent
      try {
        await interaction.followUp({
          content:
            '❌ An error occurred while processing your request. Please try again later.',
          ephemeral: true,
        });
      } catch (followUpError) {
        console.error('Failed to send error message:', followUpError);
      }
    }
  }
}

export async function handleExperienceSelection(
  interaction: StringSelectMenuInteraction
) {
  try {
    const selectedExperienceId = interaction.values[0];
    const discordId = interaction.user.id;

    // Get user's Roblox account
    const userResult = await ensureUserExists(
      discordId,
      interaction.user.username
    );
    const robloxAccount = userResult.user?.accounts?.find(
      acc => (acc as { providerId?: string }).providerId === 'roblox'
    );

    if (!robloxAccount) {
      return interaction.reply({
        content:
          '❌ You must link your Roblox account first to verify game ownership.',
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    // Get the selected experience details to find placeId
    const experiences = await fetchUserExperiences(userResult.user!.id);
    const selectedExperience = experiences.find(
      exp => exp.id === selectedExperienceId
    );
    const placeId = selectedExperience?.placeId;

    // Verify game ownership via API

    const verificationResponse = await fetch(
      `${getApiBaseUrl()}/api/asset-verification/verify`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          gameId: selectedExperienceId,
          robloxUserId: robloxAccount.accountId,
          userId: userResult.user!.id,
        }),
      }
    );

    const verificationResult = await verificationResponse.json();

    if (!verificationResult.verified) {
      return interaction.editReply({
        content: `❌ Game verification failed: ${verificationResult.error || 'You do not own or have admin access to this game.'}`,
      });
    }

    // Show game details and proceed to listing creation
    const gameDetails = verificationResult.gameDetails;
    const ownershipType = verificationResult.ownershipType;

    if (!gameDetails) {
      console.error(
        'Missing gameDetails in verification result:',
        verificationResult
      );
      return interaction.editReply({
        content: `❌ Game verification succeeded but game details are missing. Please try again.`,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle('✅ Game Ownership Verified')
      .setDescription(`**${gameDetails.name}**`)
      .addFields(
        {
          name: 'Ownership Type',
          value: ownershipType || 'Owner',
          inline: true,
        },
        {
          name: 'Player Count',
          value: `${gameDetails.playing || 0} playing`,
          inline: true,
        },
        {
          name: 'Total Visits',
          value: `${gameDetails.visits || 0}`,
          inline: true,
        },
        {
          name: 'Creator',
          value: gameDetails.creator?.name || 'Unknown',
          inline: true,
        },
        { name: 'Genre', value: gameDetails.genre || 'Unknown', inline: true }
      )
      .setThumbnail(
        gameDetails.thumbnailUrl ||
          `https://thumbnails.roblox.com/v1/games/icons?gameIds=${selectedExperienceId}&size=420x420&format=Png`
      )
      .setColor('Green');

    // Create buttons for next steps
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('create_listing_with_game')
        .setLabel('Create Game Listing')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('cancel_listing_creation')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.editReply({
      content: 'Game ownership verified! You can now create your listing.',
      embeds: [embed],
      components: [row],
    });

    // Store verification ID for later use in listing creation
    setCacheEntry(discordId, {
      verificationId: verificationResult.verificationId,
      gameDetails,
      placeId,
    });
  } catch (error) {
    console.error('Error handling experience selection:', error);
    await interaction.editReply({
      content:
        '❌ An error occurred during game verification. Please try again later.',
    });
  }
}

export async function handleGameVerificationModalSubmit(
  interaction: ModalSubmitInteraction
) {
  try {
    const gameId = interaction.fields.getTextInputValue('game_id');
    const discordId = interaction.user.id;

    // Get user's Roblox account
    const userResult = await ensureUserExists(
      discordId,
      interaction.user.username
    );
    const robloxAccount = userResult.user?.accounts?.find(
      acc => (acc as { providerId?: string }).providerId === 'roblox'
    );

    if (!robloxAccount) {
      return interaction.reply({
        content:
          '❌ You must link your Roblox account first to verify game ownership.',
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    // Verify game ownership via API
    const verificationResponse = await fetch(
      `${getApiBaseUrl()}/api/asset-verification/verify`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          gameId,
          robloxUserId: robloxAccount.accountId,
          userId: userResult.user!.id,
        }),
      }
    );

    const verificationResult = await verificationResponse.json();

    if (!verificationResult.verified) {
      return interaction.editReply({
        content: `❌ Game verification failed: ${verificationResult.error || 'You do not own or have admin access to this game.'}`,
      });
    }

    // Show game details and proceed to listing creation
    const gameDetails = verificationResult.gameDetails;
    const ownershipType = verificationResult.ownershipType;

    if (!gameDetails) {
      console.error(
        'Missing gameDetails in verification result:',
        verificationResult
      );
      return interaction.editReply({
        content: `❌ Game verification succeeded but game details are missing. Please try again.`,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle('✅ Game Ownership Verified')
      .setDescription(`**${gameDetails.name}**`)
      .addFields(
        {
          name: 'Ownership Type',
          value: ownershipType || 'Owner',
          inline: true,
        },
        {
          name: 'Player Count',
          value: `${gameDetails.playing || 0} playing`,
          inline: true,
        },
        {
          name: 'Total Visits',
          value: `${gameDetails.visits || 0}`,
          inline: true,
        },
        {
          name: 'Creator',
          value: gameDetails.creator?.name || 'Unknown',
          inline: true,
        },
        { name: 'Genre', value: gameDetails.genre || 'Unknown', inline: true }
      )
      .setThumbnail(
        gameDetails.thumbnailUrl ||
          `https://thumbnails.roblox.com/v1/games/icons?gameIds=${gameId}&size=420x420&format=Png`
      )
      .setColor('Green');

    // Create buttons for next steps
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('create_listing_with_game')
        .setLabel('Create Game Listing')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('cancel_listing_creation')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.editReply({
      content: 'Game ownership verified! You can now create your listing.',
      embeds: [embed],
      components: [row],
    });

    // Store verification ID for later use in listing creation
    setCacheEntry(discordId, {
      verificationId: verificationResult.verificationId,
      gameDetails,
    });
  } catch (error) {
    console.error('Error handling game verification modal:', error);
    await interaction.editReply({
      content:
        '❌ An error occurred during game verification. Please try again later.',
    });
  }
}

export async function handleCreateListingWithGameButton(
  interaction: ButtonInteraction
) {
  try {
    const discordId = interaction.user.id;
    const cachedData = getCacheEntry(discordId);

    if (!cachedData) {
      const embed = new EmbedBuilder()
        .setColor(0xf59e0b)
        .setTitle('⏰ Verification Expired')
        .setDescription(
          '**Your game verification has expired. Please verify your game again.**'
        )
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields(
          {
            name: '🔒 Why?',
            value:
              'We need to ensure the listing matches the game you verified',
            inline: true,
          },
          {
            name: '⏱️ Time Limit',
            value: '15 minutes after verification',
            inline: true,
          },
          {
            name: '🔄 Next Step',
            value: 'Use `/listing` to start over',
            inline: true,
          }
        )
        .setFooter({
          text: 'Security measure to prevent incorrect listings',
          iconURL: interaction.user.displayAvatarURL(),
        })
        .setTimestamp();

      return interaction.reply({
        embeds: [embed],
        ephemeral: true,
      });
    }

    // Show the listing creation modal
    const modal = new ModalBuilder()
      .setCustomId('listing_create_with_game_modal')
      .setTitle('Create Game Listing');

    // Title input (pre-populate with game name)
    const titleInput = new TextInputBuilder()
      .setCustomId('listing_title')
      .setLabel('Listing Title')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter a descriptive title for your listing')
      .setRequired(true)
      .setMaxLength(255)
      .setValue(cachedData.gameDetails.name);

    // Summary input (pre-populate with game description)
    const summaryInput = new TextInputBuilder()
      .setCustomId('listing_summary')
      .setLabel('Description')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Describe what you are selling in detail')
      .setRequired(true)
      .setMaxLength(1000)
      .setValue(
        cachedData.gameDetails.description ||
          `Listing for ${cachedData.gameDetails.name}`
      );

    // Price input
    const priceInput = new TextInputBuilder()
      .setCustomId('listing_price')
      .setLabel('Price (in dollars)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter price in dollars (e.g., 10.00)')
      .setRequired(true);

    // Category input
    const categoryInput = new TextInputBuilder()
      .setCustomId('listing_category')
      .setLabel('Category')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g., Game Ownership, Game Admin, etc.')
      .setRequired(true)
      .setMaxLength(100);

    // Add inputs to action rows
    const titleRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
      titleInput
    );
    const summaryRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
      summaryInput
    );
    const priceRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
      priceInput
    );
    const categoryRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
      categoryInput
    );

    modal.addComponents(titleRow, summaryRow, priceRow, categoryRow);

    await interaction.showModal(modal);
  } catch (error) {
    console.error('Error handling create listing button:', error);
    await interaction.reply({
      content: '❌ An error occurred. Please try again.',
      ephemeral: true,
    });
  }
}

export async function handleListingWithGameModalSubmit(
  interaction: ModalSubmitInteraction
) {
  try {
    // Get cached verification data for game details
    const discordId = interaction.user.id;
    const cachedData = getCacheEntry(discordId);

    if (!cachedData) {
      await interaction.reply({
        content:
          '❌ Verification data not found. Please verify your game again.',
        ephemeral: true,
      });
      return;
    }

    // Extract form data
    let title = interaction.fields.getTextInputValue('listing_title');
    let summary = interaction.fields.getTextInputValue('listing_summary');
    const priceText = interaction.fields.getTextInputValue('listing_price');
    const category = interaction.fields.getTextInputValue('listing_category');

    // Use game details as defaults if fields are empty
    if (!title || title.trim() === '') {
      title = cachedData.gameDetails.name;
    }
    if (!summary || summary.trim() === '') {
      summary =
        cachedData.gameDetails.description ||
        `Listing for ${cachedData.gameDetails.name}`;
    }

    // Validate price and convert from dollars to cents
    const priceDollars = parseFloat(priceText);
    if (isNaN(priceDollars) || priceDollars <= 0) {
      await interaction.reply({
        content: '❌ Please enter a valid price greater than $0.00.',
        ephemeral: true,
      });
      return;
    }

    // Convert dollars to cents for storage
    const price = Math.round(priceDollars * 100);

    // Get user info
    const userResult = await ensureUserExists(
      interaction.user.id,
      interaction.user.username
    );

    if (!userResult.user) {
      await interaction.reply({
        content: '❌ Account error. Please try again.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    // Create listing via API
    const apiResult = await createListing({
      title,
      summary,
      price,
      category,
      sellerId: userResult.user.id,
      guildId: interaction.guildId || undefined,
    });

    if (!apiResult.success) {
      const errorMessage = apiResult.error.errors
        ? apiResult.error.errors.map(e => `${e.field}: ${e.message}`).join('\n')
        : apiResult.error.message;

      await interaction.editReply({
        content: `❌ Failed to create listing:\n${errorMessage}`,
      });
      return;
    }

    // Create asset snapshot
    try {
      await fetch(`${getApiBaseUrl()}/api/asset-verification/snapshot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          listingId: apiResult.data.id,
          gameId: cachedData.gameDetails.id,
          verificationId: cachedData.verificationId,
        }),
      });
    } catch (error) {
      console.error('Failed to create asset snapshot:', error);
      // Continue anyway - listing was created successfully
    }

    // Clear cached data
    verificationCache.delete(discordId);

    // Success - show listing created message
    const embed = new EmbedBuilder()
      .setColor(0x00d4aa)
      .setTitle('🎉 Verified Asset Listing Created!')
      .setDescription('**Your verified asset listing is now live!**')
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields(
        {
          name: '📋 Details',
          value: `**${title}**\n$${(price / 100).toFixed(2)} • ${category}`,
          inline: true,
        },
        {
          name: '🆔 ID',
          value: `\`${apiResult.data.id}\``,
          inline: true,
        },
        {
          name: '✅ Verification',
          value: 'Asset ownership verified',
          inline: true,
        },
        {
          name: '🎮 Game',
          value: `[Open on Roblox](https://www.roblox.com/games/${cachedData.placeId !== undefined && cachedData.placeId !== '' ? cachedData.placeId : cachedData.gameDetails.id})`,
          inline: false,
        }
      )
      .setTimestamp()
      .setFooter({
        text: `Created by ${interaction.user.username}`,
        iconURL: interaction.user.displayAvatarURL(),
      });

    // Create button to open Roblox game
    const gameButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel('🎮 Open Game on Roblox')
        .setStyle(ButtonStyle.Link)
        .setURL(
          `https://www.roblox.com/games/${cachedData.placeId !== undefined && cachedData.placeId !== '' ? cachedData.placeId : cachedData.gameDetails.id}`
        )
    );

    await interaction.editReply({
      content: '',
      embeds: [embed],
      components: [gameButton],
    });
  } catch (error) {
    console.error('Error handling listing with asset modal submission:', error);
    await interaction.editReply({
      content:
        '❌ An error occurred while creating your listing. Please try again later.',
    });
  }
}

export async function handleCancelListingCreation(
  interaction: ButtonInteraction
) {
  try {
    // Clear cached data
    const discordId = interaction.user.id;
    verificationCache.delete(discordId);

    await interaction.reply({
      content: '❌ Listing creation cancelled.',
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error handling cancel listing:', error);
    await interaction.reply({
      content: '❌ An error occurred.',
      ephemeral: true,
    });
  }
}
