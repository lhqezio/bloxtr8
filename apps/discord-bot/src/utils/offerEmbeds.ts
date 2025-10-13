import { EmbedBuilder } from 'discord.js';

interface OfferEventData {
  offerId: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  amount: bigint | string;
  conditions?: string;
  counterOfferId?: string;
  timestamp: Date;
}

interface ListingData {
  title: string;
  price: bigint | string;
  threadId?: string;
}

interface UserData {
  id: string;
  name?: string;
}

/**
 * Format currency amount (in cents) to USD
 */
function formatCurrency(amountCents: bigint | string): string {
  const cents =
    typeof amountCents === 'bigint' ? amountCents : BigInt(amountCents);
  const dollars = Number(cents) / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(dollars);
}

/**
 * Build embed for new offer created
 */
export function buildOfferCreatedEmbed(
  event: OfferEventData,
  listing: ListingData,
  buyer: UserData
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('🤝 New Offer Received')
    .setColor(0x3b82f6) // Blue
    .setDescription(`**${listing.title}**`)
    .addFields(
      {
        name: '💰 Offer Amount',
        value: formatCurrency(event.amount),
        inline: true,
      },
      {
        name: '📋 Listing Price',
        value: formatCurrency(listing.price),
        inline: true,
      },
      {
        name: '👤 Buyer',
        value: buyer.name || 'Unknown',
        inline: true,
      }
    )
    .setTimestamp(event.timestamp)
    .setFooter({
      text: 'Use /offer command to respond',
      iconURL:
        'https://cdn.discordapp.com/attachments/1234567890/1234567890/bloxtr8-logo.png',
    });

  if (event.conditions) {
    embed.addFields({
      name: '📝 Conditions',
      value: event.conditions,
    });
  }

  return embed;
}

/**
 * Build embed for offer accepted
 */
export function buildOfferAcceptedEmbed(
  event: OfferEventData,
  listing: ListingData,
  buyer: UserData,
  seller: UserData
): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('✅ Offer Accepted!')
    .setColor(0x10b981) // Green
    .setDescription(`**${listing.title}**`)
    .addFields(
      {
        name: '💰 Accepted Amount',
        value: formatCurrency(event.amount),
        inline: true,
      },
      {
        name: '👤 Buyer',
        value: buyer.name || 'Unknown',
        inline: true,
      },
      {
        name: '👤 Seller',
        value: seller.name || 'Unknown',
        inline: true,
      },
      {
        name: '📋 Next Steps',
        value:
          '1. Contract will be generated\n2. Escrow will be set up\n3. Asset transfer will be coordinated',
      }
    )
    .setTimestamp(event.timestamp)
    .setFooter({
      text: 'Bloxtr8 - Secure Roblox Trading',
      iconURL:
        'https://cdn.discordapp.com/attachments/1234567890/1234567890/bloxtr8-logo.png',
    });
}

/**
 * Build embed for offer declined
 */
export function buildOfferDeclinedEmbed(
  event: OfferEventData,
  listing: ListingData,
  buyer: UserData
): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('❌ Offer Declined')
    .setColor(0xef4444) // Red
    .setDescription(`**${listing.title}**`)
    .addFields(
      {
        name: '💰 Declined Amount',
        value: formatCurrency(event.amount),
        inline: true,
      },
      {
        name: '👤 Buyer',
        value: buyer.name || 'Unknown',
        inline: true,
      },
      {
        name: '💡 What\'s Next?',
        value: 'You can make a new offer or browse other listings.',
      }
    )
    .setTimestamp(event.timestamp)
    .setFooter({
      text: 'Bloxtr8 - Secure Roblox Trading',
      iconURL:
        'https://cdn.discordapp.com/attachments/1234567890/1234567890/bloxtr8-logo.png',
    });
}

/**
 * Build embed for counter offer
 */
export function buildCounterOfferEmbed(
  event: OfferEventData,
  originalAmount: bigint | string,
  listing: ListingData,
  buyer: UserData,
  seller: UserData
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('🔄 Counter Offer Received')
    .setColor(0xf59e0b) // Amber
    .setDescription(`**${listing.title}**`)
    .addFields(
      {
        name: '💰 Original Offer',
        value: formatCurrency(originalAmount),
        inline: true,
      },
      {
        name: '💰 Counter Offer',
        value: formatCurrency(event.amount),
        inline: true,
      },
      {
        name: '\u200B',
        value: '\u200B',
        inline: true,
      },
      {
        name: '👤 Original Buyer',
        value: buyer.name || 'Unknown',
        inline: true,
      },
      {
        name: '👤 Seller (Counter)',
        value: seller.name || 'Unknown',
        inline: true,
      },
      {
        name: '\u200B',
        value: '\u200B',
        inline: true,
      }
    )
    .setTimestamp(event.timestamp)
    .setFooter({
      text: 'Review and respond to counter offer',
      iconURL:
        'https://cdn.discordapp.com/attachments/1234567890/1234567890/bloxtr8-logo.png',
    });

  if (event.conditions) {
    embed.addFields({
      name: '📝 New Conditions',
      value: event.conditions,
    });
  }

  return embed;
}

