import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';

import { createListing } from '../utils/apiClient.js';
import { getApiBaseUrl } from '../utils/apiClient.js';
import { verifyUserForListing } from '../utils/userVerification.js';
import { ensureUserExists } from '../utils/userVerification.js';

// ⚠️ WARNING: In-memory cache for verification data
// LIMITATIONS:
// - No TTL: Data never expires, leading to memory leaks
// - No size limits: Cache can grow indefinitely
// - Not persistent: Data lost on bot restart
// - Not shared: Each bot instance has its own cache
//
// TODO for Production:
// - Replace with Redis for persistence and TTL support
// - Implement LRU eviction policy
// - Add size limits
// - Share cache across bot instances
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

const verificationCache = new Map<
  string,
  { verificationId: string; gameDetails: GameDetails }
>();

export async function handleListingCreateWithVerification(
  interaction: ChatInputCommandInteraction
) {
  try {
    // Defer the reply immediately to extend the timeout to 15 minutes
    await interaction.deferReply({ ephemeral: true });

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
        .setTitle('🔒 Verification Required')
        .setDescription('**Complete KYC to create listings**')
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields(
          {
            name: '📋 What is KYC?',
            value: 'Identity verification for safe trading',
            inline: true,
          },
          {
            name: '⏱️ Processing',
            value: '1-3 business days',
            inline: true,
          },
          {
            name: '🌐 Get Started',
            value: 'Visit our web app to verify',
            inline: true,
          }
        )
        .setFooter({
          text: 'Protects you and other traders',
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
      (acc: any) => acc.providerId === 'roblox'
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

    // Show game verification modal
    const gameVerificationModal = new ModalBuilder()
      .setCustomId('game_verification_modal')
      .setTitle('Game Ownership Verification');

    const gameIdInput = new TextInputBuilder()
      .setCustomId('game_id')
      .setLabel('Roblox Game ID')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter the Roblox game ID you want to list')
      .setRequired(true);

    gameVerificationModal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(gameIdInput)
    );

    await interaction.showModal(gameVerificationModal);
  } catch (error) {
    console.error('Error handling listing create with verification:', error);

    // Try to edit the reply if it was deferred, otherwise send a follow-up
    try {
      await interaction.editReply({
        content:
          '❌ An error occurred while processing your request. Please try again later.',
      });
    } catch {
      // If edit fails, try to send a follow-up message
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
      (acc: any) => acc.providerId === 'roblox'
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
    const embed = new EmbedBuilder()
      .setTitle('✅ Game Ownership Verified')
      .setDescription(`**${gameDetails.name}**`)
      .addFields(
        { name: 'Ownership Type', value: ownershipType, inline: true },
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
    verificationCache.set(discordId, {
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
    const cachedData = verificationCache.get(discordId);

    if (!cachedData) {
      return interaction.reply({
        content: '❌ Game verification data not found. Please start over.',
        ephemeral: true,
      });
    }

    // Show the listing creation modal
    const modal = new ModalBuilder()
      .setCustomId('listing_create_with_game_modal')
      .setTitle('Create Game Listing');

    // Title input
    const titleInput = new TextInputBuilder()
      .setCustomId('listing_title')
      .setLabel('Listing Title')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter a descriptive title for your listing')
      .setRequired(true)
      .setMaxLength(255);

    // Summary input
    const summaryInput = new TextInputBuilder()
      .setCustomId('listing_summary')
      .setLabel('Description')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Describe what you are selling in detail')
      .setRequired(true)
      .setMaxLength(1000);

    // Price input
    const priceInput = new TextInputBuilder()
      .setCustomId('listing_price')
      .setLabel('Price (in cents)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter price in cents (e.g., 1000 for $10.00)')
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
    // Extract form data
    const title = interaction.fields.getTextInputValue('listing_title');
    const summary = interaction.fields.getTextInputValue('listing_summary');
    const priceText = interaction.fields.getTextInputValue('listing_price');
    const category = interaction.fields.getTextInputValue('listing_category');

    // Validate price
    const price = parseInt(priceText, 10);
    if (isNaN(price) || price <= 0) {
      await interaction.reply({
        content: '❌ Invalid price. Please enter a positive number in cents.',
        ephemeral: true,
      });
      return;
    }

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

    // Get cached verification data
    const discordId = interaction.user.id;
    const cachedData = verificationCache.get(discordId);

    if (!cachedData) {
      await interaction.reply({
        content: '❌ Asset verification data not found. Please start over.',
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
          assetId: cachedData.gameDetails.id,
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
          name: '🔗 View',
          value: `[Open Listing](${getApiBaseUrl()}/api/listings/${apiResult.data.id})`,
          inline: false,
        }
      )
      .setTimestamp()
      .setFooter({
        text: `Created by ${interaction.user.username}`,
        iconURL: interaction.user.displayAvatarURL(),
      });

    await interaction.editReply({
      content: '',
      embeds: [embed],
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
