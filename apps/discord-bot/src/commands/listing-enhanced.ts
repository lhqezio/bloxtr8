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

import { createListing, updateListingMessage } from '../utils/apiClient.js';
import { getApiBaseUrl } from '../utils/apiClient.js';
import { getPriceRangeForPrice } from '../utils/marketplace.js';
import {
  createListingMessage,
  type ListingData,
} from '../utils/messageManager.js';
import { verifyUserForListing } from '../utils/userVerification.js';
import { checkUserExists } from '../utils/userVerification.js';

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

// Helper function to construct proper Roblox game URL
function getRobloxGameUrl(placeId?: string): string {
  // Check if placeId is valid (not null, undefined, empty string, or "undefined")
  if (
    placeId &&
    placeId !== '' &&
    placeId !== 'undefined' &&
    placeId !== 'null'
  ) {
    return `https://www.roblox.com/games/${placeId}`;
  }

  // If no valid placeId, we cannot construct a proper Roblox URL
  // Return a generic Roblox games page since gameDetails.id is a universe ID
  return 'https://www.roblox.com/games/';
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
    // Defer reply immediately to prevent timeout
    await interaction.deferReply({ ephemeral: true });

    // Clear any old verification cache for this user
    const discordId = interaction.user.id;
    verificationCache.delete(discordId);

    // Check if user exists in database (don't create if they don't exist)
    const userResult = await checkUserExists(interaction.user.id);

    if (!userResult.user) {
      const errorEmbed = new EmbedBuilder()
        .setColor(0xef4444)
        .setTitle('❌ Account Required')
        .setDescription('**You must sign up before creating listings**')
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields({
          name: '🔧 Quick Fix',
          value: 'Use `/signup` to create your account first',
        })
        .setFooter({
          text: 'Need help? Contact support',
          iconURL: interaction.user.displayAvatarURL(),
        })
        .setTimestamp();

      await interaction.editReply({
        embeds: [errorEmbed],
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

      await interaction.editReply({
        embeds: [embed],
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

      await interaction.editReply({
        embeds: [embed],
      });
      return;
    }

    // Fetch user's experiences (interaction already deferred above)

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
      .setColor(0x00d4aa) // Modern teal
      .setTitle('🎮 Select Experience to List')
      .setDescription(
        `**✨ Choose from your ${experiences.length} public experiences**\n\n*Select the game you want to create a listing for.*`
      )
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields({
        name: '📋 **What happens next?**',
        value:
          '1. **Select your experience** from the dropdown\n2. **Verify ownership** automatically\n3. **Create your listing** with details',
      })
      .setFooter({
        text: `🛡️ Bloxtr8 • Showing ${experiencesToShow.length} of ${experiences.length} experiences`,
        iconURL:
          'https://cdn.discordapp.com/attachments/1234567890/1234567890/bloxtr8-logo.png',
      })
      .setTimestamp();

    await interaction.editReply({
      embeds: [embed],
      components: [row],
    });
  } catch (error) {
    console.error('Error handling listing create with verification:', error);

    try {
      await interaction.editReply({
        content:
          '❌ An error occurred while processing your request. Please try again later.',
      });
    } catch {
      // Fallback if edit fails
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
    // Defer update immediately to prevent timeout
    await interaction.deferUpdate();

    const selectedExperienceId = interaction.values[0];
    const discordId = interaction.user.id;

    // Get user's Roblox account
    const userResult = await checkUserExists(discordId);
    const robloxAccount = userResult.user?.accounts?.find(
      acc => (acc as { providerId?: string }).providerId === 'roblox'
    );

    if (!userResult.user) {
      return interaction.editReply({
        content:
          '❌ You must sign up first. Use `/signup` to create your account.',
        components: [],
      });
    }

    if (!robloxAccount) {
      return interaction.editReply({
        content:
          '❌ You must link your Roblox account first to verify game ownership.',
        components: [],
      });
    }

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
      .setDescription(
        `**🎮 ${gameDetails.name}**\n\n✨ *Your ownership has been verified and you can now create a listing for this game.*`
      )
      .addFields(
        {
          name: '👑 **Ownership Type**',
          value: `**${ownershipType || 'Owner'}**`,
          inline: true,
        },
        {
          name: '👥 **Player Count**',
          value: `**${(gameDetails.playing || 0).toLocaleString()}** playing`,
          inline: true,
        },
        {
          name: '📈 **Total Visits**',
          value: `**${(gameDetails.visits || 0).toLocaleString()}**`,
          inline: true,
        },
        {
          name: '👤 **Creator**',
          value: `**${gameDetails.creator?.name || 'Unknown'}**`,
          inline: true,
        },
        {
          name: '🎯 **Genre**',
          value: `**${gameDetails.genre || 'Unknown'}**`,
          inline: true,
        }
      )
      .setThumbnail(
        gameDetails.thumbnailUrl ||
          `https://thumbnails.roblox.com/v1/games/icons?gameIds=${selectedExperienceId}&size=420x420&format=Png`
      )
      .setColor(0x00d4aa) // Modern teal
      .setFooter({
        text: '🛡️ Bloxtr8 • Verified Asset Ownership',
        iconURL:
          'https://cdn.discordapp.com/attachments/1234567890/1234567890/bloxtr8-logo.png',
      })
      .setTimestamp();

    // Create beautiful action buttons
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('create_listing_with_game')
        .setLabel('Create Game Listing')
        .setStyle(ButtonStyle.Success)
        .setEmoji('📋'),
      new ButtonBuilder()
        .setCustomId('cancel_listing_creation')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('❌')
    );

    await interaction.editReply({
      content: '🎉 Game ownership verified! You can now create your listing.',
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
    // Defer reply immediately to prevent timeout
    await interaction.deferReply({ ephemeral: true });

    const gameId = interaction.fields.getTextInputValue('game_id');
    const discordId = interaction.user.id;

    // Get user's Roblox account
    const userResult = await checkUserExists(discordId);
    const robloxAccount = userResult.user?.accounts?.find(
      acc => (acc as { providerId?: string }).providerId === 'roblox'
    );

    if (!userResult.user) {
      return interaction.editReply({
        content:
          '❌ You must sign up first. Use `/signup` to create your account.',
      });
    }

    if (!robloxAccount) {
      return interaction.editReply({
        content:
          '❌ You must link your Roblox account first to verify game ownership.',
      });
    }

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
    // Defer reply immediately to prevent timeout
    await interaction.deferReply({ ephemeral: true });

    // Get cached verification data for game details
    const discordId = interaction.user.id;
    const cachedData = getCacheEntry(discordId);

    if (!cachedData) {
      await interaction.editReply({
        content:
          '❌ Verification data not found. Please verify your game again.',
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
      await interaction.editReply({
        content: '❌ Please enter a valid price greater than $0.00.',
      });
      return;
    }

    // Convert dollars to cents for storage
    const price = Math.round(priceDollars * 100);

    // Get user info
    const userResult = await checkUserExists(interaction.user.id);

    if (!userResult.user) {
      await interaction.editReply({
        content:
          '❌ You must sign up first. Use `/signup` to create your account.',
      });
      return;
    }

    // Determine visibility (PUBLIC by default for now)
    // TODO: Add visibility selection UI in future update
    const visibility = 'PUBLIC';

    // Determine price range for channel routing
    const priceRange = getPriceRangeForPrice(price);

    // Create listing via API
    const apiResult = await createListing({
      title,
      summary,
      price,
      category,
      sellerId: userResult.user.id,
      guildId: interaction.guildId || undefined,
      visibility,
      priceRange: priceRange.range,
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

    // Create Discord message for the listing
    let messageId: string | undefined;
    let channelId: string | undefined;

    if (interaction.guild) {
      try {
        const listingData: ListingData = {
          id: apiResult.data.id,
          title,
          summary,
          price: price.toString(), // Convert to string for BigInt serialization
          category,
          status: 'ACTIVE',
          visibility,
          userId: userResult.user.id,
          guildId: interaction.guildId || undefined,
          user: {
            name: interaction.user.username,
            kycTier: userResult.user.kycTier,
            kycVerified: userResult.user.kycVerified,
          },
          robloxSnapshots: [
            {
              gameName: cachedData.gameDetails.name,
              gameDescription: cachedData.gameDetails.description,
              thumbnailUrl: cachedData.gameDetails.thumbnailUrl,
              playerCount: cachedData.gameDetails.playing,
              visits: cachedData.gameDetails.visits,
              verifiedOwnership: true,
            },
          ],
          createdAt: new Date(),
        };

        const message = await createListingMessage(
          listingData,
          interaction.guild,
          3
        );

        if (message) {
          messageId = message.id;
          channelId = message.channel.id;

          // Update listing with message information
          await updateListingMessage(apiResult.data.id, {
            messageId,
            channelId,
            priceRange: priceRange.range,
          });

          console.log(
            `Created message ${messageId} for listing ${apiResult.data.id}`
          );
        }
      } catch (error) {
        console.error('Failed to create listing message:', error);

        // Log specific error types for debugging
        if (error instanceof Error) {
          if (error.message.includes('Missing Permissions')) {
            console.error(
              'Bot lacks permissions to send messages in this channel'
            );
          } else if (error.message.includes('rate limit')) {
            console.error('Rate limited while creating message');
          } else if (error.message.includes('channel')) {
            console.error('Channel not found or inaccessible');
          }
        }

        // Message creation failed, but listing is still saved
        // The success message already handles this case appropriately
      }
    }

    // Clear cached data
    verificationCache.delete(discordId);

    // Success - show listing created message with beautiful design
    let embedDescription: string;
    let embedTitle: string;

    if (messageId) {
      embedDescription =
        '**🎉 Your verified asset listing is now live in the marketplace!**\n\n✨ *Your listing is visible to the community and ready for offers.*';
      embedTitle = '🎉 Verified Asset Listing Created!';
    } else {
      embedDescription =
        '**✅ Your verified asset listing has been created!**\n\n⚠️ *Note: Message creation failed - listing is saved but not visible in Discord channels.*';
      embedTitle = '⚠️ Listing Created (Limited)';
    }

    const embed = new EmbedBuilder()
      .setColor(messageId ? 0x00d4aa : 0xf59e0b) // Modern teal if message created, amber if not
      .setTitle(embedTitle)
      .setDescription(embedDescription)
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields(
        {
          name: '📋 **Listing Details**',
          value: `**${title}**\n💰 **$${(price / 100).toFixed(2)}** • 📂 **${category}**`,
          inline: true,
        },
        {
          name: '🆔 **Listing ID**',
          value: `\`${apiResult.data.id}\``,
          inline: true,
        },
        {
          name: '✅ **Verification**',
          value: '🛡️ **Asset ownership verified**',
          inline: true,
        },
        {
          name: '🌐 **Visibility**',
          value:
            visibility === 'PUBLIC'
              ? '🌍 **All Servers**'
              : '🔒 **This Server Only**',
          inline: true,
        },
        {
          name: '💰 **Price Range**',
          value: `${priceRange.emoji} **${priceRange.description}**`,
          inline: true,
        },
        {
          name: '🎮 **Game Link**',
          value: `[🎯 Open on Roblox](${getRobloxGameUrl(cachedData.placeId)})`,
          inline: false,
        }
      );

    // Add message link if available
    if (messageId && channelId) {
      embed.addFields({
        name: '💬 Marketplace Message',
        value: `<#${channelId}> • [Jump to Message](https://discord.com/channels/${interaction.guildId}/${channelId}/${messageId})`,
        inline: false,
      });
    }

    embed.setTimestamp().setFooter({
      text: `🛡️ Bloxtr8 • Created by ${interaction.user.username} • Secure Trading Platform`,
      iconURL:
        'https://cdn.discordapp.com/attachments/1234567890/1234567890/bloxtr8-logo.png',
    });

    // Create beautiful action buttons
    const buttons = new ActionRowBuilder<ButtonBuilder>();

    buttons.addComponents(
      new ButtonBuilder()
        .setLabel('🎮 Open Game on Roblox')
        .setStyle(ButtonStyle.Link)
        .setURL(getRobloxGameUrl(cachedData.placeId))
    );

    // Add message link button if available
    if (messageId && channelId && interaction.guildId) {
      buttons.addComponents(
        new ButtonBuilder()
          .setLabel('💬 View Message')
          .setStyle(ButtonStyle.Link)
          .setURL(
            `https://discord.com/channels/${interaction.guildId}/${channelId}/${messageId}`
          )
      );
    }

    // Add web view button
    buttons.addComponents(
      new ButtonBuilder()
        .setLabel('🌐 View on Web')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://bloxtr8.com/listings/${apiResult.data.id}`)
    );

    const gameButton = buttons;

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
