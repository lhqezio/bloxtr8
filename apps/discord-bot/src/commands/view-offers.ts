import { EmbedBuilder, type ButtonInteraction } from 'discord.js';

import { getOffersForListing, getListing } from '../utils/apiClient.js';
import { formatPrice } from '../utils/marketplace.js';
import { verify } from '../utils/userVerification.js';

/**
 * Handle "View Offers" button click
 * Shows all offers for a listing (owner only)
 */
export async function handleViewOffersButton(
  interaction: ButtonInteraction
): Promise<void> {
  try {
    // Extract listing ID from button customId (format: view_offers_${listingId})
    const listingId = interaction.customId.replace('view_offers_', '');

    if (!listingId) {
      await interaction.reply({
        content: '❌ Invalid listing ID. Please try again.',
        ephemeral: true,
      });
      return;
    }

    // Defer reply as API calls might take time
    await interaction.deferReply({ ephemeral: true });

    // Verify user
    const verifyResult = await verify(interaction.user.id);

    if (!verifyResult.success) {
      await interaction.editReply({
        content:
          '❌ You must sign up first. Use `/signup` command to get started.',
      });
      return;
    }

    const userData = Array.isArray(verifyResult.data)
      ? null
      : verifyResult.data;

    if (!userData) {
      await interaction.editReply({
        content:
          '❌ Could not retrieve your user information. Please try again.',
      });
      return;
    }

    // Fetch listing to verify ownership
    const listingResult = await getListing(listingId);

    if (!listingResult.success) {
      await interaction.editReply({
        content: `❌ Could not fetch listing details: ${listingResult.error.message}`,
      });
      return;
    }

    const listing = listingResult.data;

    // Check if user is the listing owner
    if (listing.userId !== userData.user.id) {
      await interaction.editReply({
        content: '❌ You can only view offers for your own listings.',
      });
      return;
    }

    // Fetch offers for the listing
    const offersResult = await getOffersForListing(listingId);

    if (!offersResult.success) {
      await interaction.editReply({
        content: `❌ Could not fetch offers: ${offersResult.error.message}`,
      });
      return;
    }

    const { offers, count } = offersResult.data;

    // Create offers embed
    const embed = new EmbedBuilder()
      .setTitle(`📋 Offers for "${listing.title}"`)
      .setDescription(
        count === 0
          ? '**No offers yet**\n\nCheck back later when buyers make offers on your listing.'
          : `**${count} offer${count === 1 ? '' : 's'} found**`
      )
      .setColor(0x00d4aa)
      .addFields({
        name: '💰 Listing Price',
        value: formatPrice(listing.price),
        inline: true,
      })
      .setFooter({
        text: 'Bloxtr8 - Secure Trading',
      })
      .setTimestamp();

    // Add offer details if any
    if (count > 0) {
      // Sort offers by status and amount (PENDING first, then by amount descending)
      const sortedOffers = offers.sort((a, b) => {
        // PENDING offers first
        if (a.status === 'PENDING' && b.status !== 'PENDING') return -1;
        if (a.status !== 'PENDING' && b.status === 'PENDING') return 1;

        // Then sort by amount descending
        const amountA = BigInt(a.amount);
        const amountB = BigInt(b.amount);
        if (amountA > amountB) return -1;
        if (amountA < amountB) return 1;
        return 0;
      });

      // Show up to 10 offers in embed
      const offersToShow = sortedOffers.slice(0, 10);

      for (const offer of offersToShow) {
        const statusEmoji = getOfferStatusEmoji(offer.status);
        const offerAmount = formatPrice(offer.amount);
        const listingPrice = BigInt(listing.price);
        const offerAmountBigInt = BigInt(offer.amount);
        const percentage = Number((offerAmountBigInt * 100n) / listingPrice);

        const verificationBadge = getVerificationBadge(
          offer.buyer.kycTier,
          offer.buyer.kycVerified
        );

        let fieldValue = `${statusEmoji} **${offer.status}**\n💸 **${offerAmount}** (${percentage}% of asking)\n👤 ${offer.buyer.name} ${verificationBadge}\n📅 ${new Date(offer.createdAt).toLocaleDateString()}`;

        if (offer.conditions) {
          fieldValue += `\n📝 *${offer.conditions.substring(0, 50)}${offer.conditions.length > 50 ? '...' : ''}*`;
        }

        embed.addFields({
          name: `Offer ${offer.id.substring(0, 8)}`,
          value: fieldValue,
          inline: false,
        });
      }

      // If more than 10 offers, add a note
      if (count > 10) {
        embed.addFields({
          name: 'ℹ️ More Offers Available',
          value: `Showing 10 of ${count} offers. Visit the web app to view all offers.`,
          inline: false,
        });
      }
    }

    await interaction.editReply({
      embeds: [embed],
    });
  } catch (error) {
    console.error('Error in handleViewOffersButton:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content:
          '❌ An error occurred while fetching offers. Please try again.',
        ephemeral: true,
      });
    } else {
      await interaction.editReply({
        content:
          '❌ An error occurred while fetching offers. Please try again.',
      });
    }
  }
}

/**
 * Get emoji for offer status
 */
function getOfferStatusEmoji(status: string): string {
  switch (status) {
    case 'PENDING':
      return '🟡';
    case 'ACCEPTED':
      return '✅';
    case 'DECLINED':
      return '❌';
    case 'COUNTERED':
      return '🔄';
    case 'EXPIRED':
      return '⏰';
    default:
      return '⚪';
  }
}

/**
 * Get verification badge for user
 */
function getVerificationBadge(kycTier: string, kycVerified: boolean): string {
  if (kycVerified) {
    return '✅';
  }

  switch (kycTier) {
    case 'TIER_2':
      return '💎';
    case 'TIER_1':
      return '🟢';
    case 'TIER_0':
    default:
      return '⚠️';
  }
}

