import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';

import { fetchListings, type FetchListingsRequest } from '../utils/apiClient.js';

// Cache for pagination state (in production, consider using Redis)
const paginationCache = new Map<string, {
  page: number;
  filters: FetchListingsRequest;
  totalPages: number;
  expiresAt: number;
}>();

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Handles the /listing view command
 */
export async function handleListingView(interaction: ChatInputCommandInteraction) {
  try {
    // Get command options
    const category = interaction.options.getString('category');
    const status = interaction.options.getString('status') || 'ACTIVE';

    // Build filters
    const filters: FetchListingsRequest = {
      page: 1,
      limit: 10,
      status,
      category: category || undefined,
    };

    // Fetch listings from API
    const response = await fetchListings(filters);

    if (!response.success) {
      const errorEmbed = new EmbedBuilder()
        .setColor(0xff6b6b)
        .setTitle('⚠️ Connection Error')
        .setDescription(
          'Unable to fetch listings from the marketplace.\n\n' +
          '**This might be due to:**\n' +
          '• Temporary server issues\n' +
          '• Network connectivity problems\n' +
          '• High server load\n\n' +
          'Please try again in a few moments.'
        )
        .setThumbnail('https://cdn.discordapp.com/emojis/1234567890123456789.png')
        .setFooter({
          text: 'Bloxtr8 Marketplace • Try /listing view again',
          iconURL: 'https://cdn.discordapp.com/emojis/1234567890123456789.png'
        })
        .setTimestamp();

      return interaction.reply({
        embeds: [errorEmbed],
        ephemeral: true,
      });
    }

    const { listings, pagination } = response.data;

    if (listings.length === 0) {
      const emptyEmbed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('🔍 No Listings Found')
        .setDescription(
          'No listings match your current filters.\n\n' +
          '**Try:**\n' +
          '• Removing filters to see all listings\n' +
          '• Checking different categories\n' +
          '• Using `/listing create` to add your own listing'
        )
        .setThumbnail('https://cdn.discordapp.com/emojis/1234567890123456789.png')
        .setFooter({
          text: 'Bloxtr8 Marketplace • Use /listing view to browse again',
          iconURL: 'https://cdn.discordapp.com/emojis/1234567890123456789.png'
        })
        .setTimestamp();

      return interaction.reply({
        embeds: [emptyEmbed],
        ephemeral: true,
      });
    }

    // Cache pagination state
    const cacheKey = `${interaction.user.id}_${interaction.id}`;
    paginationCache.set(cacheKey, {
      page: pagination.page,
      filters,
      totalPages: pagination.totalPages,
      expiresAt: Date.now() + CACHE_TTL,
    });

    // Create embed with listings
    const embed = createListingsEmbed(listings, pagination, filters);

    // Create pagination buttons if needed
    const components = createPaginationComponents(pagination, cacheKey);

    await interaction.reply({
      embeds: [embed],
      components,
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error in handleListingView:', error);
    
    const errorEmbed = new EmbedBuilder()
      .setColor(0xff6b6b)
      .setTitle('💥 Unexpected Error')
      .setDescription(
        'Something went wrong while loading listings.\n\n' +
        '**Our team has been notified.**\n' +
        'Please try again in a few moments.'
      )
      .setThumbnail('https://cdn.discordapp.com/emojis/1234567890123456789.png')
      .setFooter({
        text: 'Bloxtr8 Marketplace • Error ID: ' + Date.now(),
        iconURL: 'https://cdn.discordapp.com/emojis/1234567890123456789.png'
      })
      .setTimestamp();

    await interaction.reply({
      embeds: [errorEmbed],
      ephemeral: true,
    });
  }
}

/**
 * Handles pagination button interactions
 */
export async function handleListingPagination(interaction: ButtonInteraction) {
  try {
    const [action, cacheKey] = interaction.customId.split('_');
    
    if (!cacheKey) {
      return interaction.reply({
        content: '❌ Invalid pagination request.',
        ephemeral: true,
      });
    }

    // Get cached pagination state
    const cached = paginationCache.get(cacheKey);
    if (!cached || cached.expiresAt < Date.now()) {
      const expiredEmbed = new EmbedBuilder()
        .setColor(0xffa500)
        .setTitle('⏰ Session Expired')
        .setDescription(
          'Your browsing session has expired.\n\n' +
          '**To continue browsing:**\n' +
          '• Run `/listing view` again\n' +
          '• Your filters will be reset\n' +
          '• You\'ll start from page 1'
        )
        .setThumbnail('https://cdn.discordapp.com/emojis/1234567890123456789.png')
        .setFooter({
          text: 'Bloxtr8 Marketplace • Sessions expire after 5 minutes',
          iconURL: 'https://cdn.discordapp.com/emojis/1234567890123456789.png'
        })
        .setTimestamp();

      return interaction.reply({
        embeds: [expiredEmbed],
        ephemeral: true,
      });
    }

    // Calculate new page
    let newPage = cached.page;
    if (action === 'listings_prev') {
      newPage = Math.max(1, cached.page - 1);
    } else if (action === 'listings_next') {
      newPage = Math.min(cached.totalPages, cached.page + 1);
    }

    // Update cache
    cached.page = newPage;
    paginationCache.set(cacheKey, cached);

    // Fetch new page
    const filters = { ...cached.filters, page: newPage };
    const response = await fetchListings(filters);

    if (!response.success) {
      const errorEmbed = new EmbedBuilder()
        .setColor(0xff6b6b)
        .setTitle('⚠️ Navigation Error')
        .setDescription(
          'Unable to load the next page.\n\n' +
          '**Please try:**\n' +
          '• Clicking the button again\n' +
          '• Running `/listing view` to restart\n' +
          '• Checking your internet connection'
        )
        .setThumbnail('https://cdn.discordapp.com/emojis/1234567890123456789.png')
        .setFooter({
          text: 'Bloxtr8 Marketplace • Try again in a moment',
          iconURL: 'https://cdn.discordapp.com/emojis/1234567890123456789.png'
        })
        .setTimestamp();

      return interaction.reply({
        embeds: [errorEmbed],
        ephemeral: true,
      });
    }

    const { listings, pagination } = response.data;

    // Create new embed and components
    const embed = createListingsEmbed(listings, pagination, filters);
    const components = createPaginationComponents(pagination, cacheKey);

    await interaction.update({
      embeds: [embed],
      components,
    });
  } catch (error) {
    console.error('Error in handleListingPagination:', error);
    
    const errorEmbed = new EmbedBuilder()
      .setColor(0xff6b6b)
      .setTitle('💥 Navigation Error')
      .setDescription(
        'Something went wrong while navigating.\n\n' +
        '**Please try:**\n' +
        '• Running `/listing view` to restart\n' +
        '• Waiting a moment and trying again'
      )
      .setThumbnail('https://cdn.discordapp.com/emojis/1234567890123456789.png')
      .setFooter({
        text: 'Bloxtr8 Marketplace • Error ID: ' + Date.now(),
        iconURL: 'https://cdn.discordapp.com/emojis/1234567890123456789.png'
      })
      .setTimestamp();

    await interaction.reply({
      embeds: [errorEmbed],
      ephemeral: true,
    });
  }
}

/**
 * Creates a rich embed displaying listings with modern UI design
 */
function createListingsEmbed(
  listings: any[],
  pagination: any,
  filters: FetchListingsRequest
): EmbedBuilder {
  // Determine embed color based on status filter
  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'ACTIVE': return 0x00ff88; // Green
      case 'SOLD': return 0xff6b6b; // Red
      case 'CANCELLED': return 0xffa500; // Orange
      default: return 0x5865f2; // Discord blurple
    }
  };

  const embed = new EmbedBuilder()
    .setColor(getStatusColor(filters.status))
    .setTitle('🎮 Bloxtr8 Marketplace')
    .setDescription(
      `**${listings.length}** listings found${pagination.total > listings.length ? ` of **${pagination.total}** total` : ''}` +
      (filters.category ? ` • Category: **${filters.category}**` : '') +
      (filters.status ? ` • Status: **${filters.status}**` : '')
    )
    .setThumbnail('https://cdn.discordapp.com/emojis/1234567890123456789.png') // Add a marketplace icon
    .setTimestamp();

  // Add listings as rich fields with better formatting
  listings.slice(0, 8).forEach((listing, index) => {
    const price = `$${(listing.price / 100).toFixed(2)}`;
    const sellerName = listing.user.name || 'Anonymous Seller';
    const guildName = listing.guild?.name;
    const date = new Date(listing.createdAt);
    const timeAgo = getTimeAgo(date);
    
    // Truncate title if too long
    const title = listing.title.length > 40 ? listing.title.substring(0, 37) + '...' : listing.title;
    
    // Create status indicator
    const statusEmoji = getStatusEmoji(listing.status);
    
    // Format the value with better visual hierarchy
    let value = `**${price}** • ${statusEmoji} ${listing.status}\n`;
    value += `📂 ${listing.category} • 👤 ${sellerName}\n`;
    if (guildName) {
      value += `🏰 ${guildName} • `;
    }
    value += `🕒 ${timeAgo}`;

    embed.addFields({
      name: `${getNumberEmoji(index + 1)} ${title}`,
      value: value,
      inline: false,
    });
  });

  // Add footer with pagination and additional info
  let footerText = `Page ${pagination.page}/${pagination.totalPages}`;
  if (pagination.total > 0) {
    footerText += ` • ${pagination.total} total listings`;
  }
  footerText += ' • Use buttons to navigate';

  embed.setFooter({
    text: footerText,
    iconURL: 'https://cdn.discordapp.com/emojis/1234567890123456789.png'
  });

  return embed;
}

/**
 * Get emoji for status
 */
function getStatusEmoji(status: string): string {
  switch (status) {
    case 'ACTIVE': return '🟢';
    case 'SOLD': return '🔴';
    case 'CANCELLED': return '🟡';
    default: return '⚪';
  }
}

/**
 * Get number emoji for listing index
 */
function getNumberEmoji(num: number): string {
  const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
  return emojis[num - 1] || `${num}.`;
}

/**
 * Get human-readable time ago
 */
function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

/**
 * Creates pagination button components with improved styling
 */
function createPaginationComponents(pagination: any, cacheKey: string): ActionRowBuilder<ButtonBuilder>[] {
  if (pagination.totalPages <= 1) {
    return [];
  }

  const components = [
    new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`listings_prev_${cacheKey}`)
          .setLabel('◀️ Previous')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(!pagination.hasPrev),
        new ButtonBuilder()
          .setCustomId(`listings_next_${cacheKey}`)
          .setLabel('Next ▶️')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(!pagination.hasNext)
      ),
  ];

  // Add page indicator button if there are many pages
  if (pagination.totalPages > 2 && components[0]) {
    components[0].addComponents(
      new ButtonBuilder()
        .setCustomId(`listings_page_${cacheKey}`)
        .setLabel(`📄 ${pagination.page}/${pagination.totalPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );
  }

  return components;
}

/**
 * Cleans up expired pagination cache entries
 */
export function cleanupPaginationCache(): void {
  const now = Date.now();
  for (const [key, value] of paginationCache.entries()) {
    if (value.expiresAt < now) {
      paginationCache.delete(key);
    }
  }
}

