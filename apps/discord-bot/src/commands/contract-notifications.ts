import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Client,
} from 'discord.js';

import { formatPrice } from '../utils/marketplace.js';

interface ContractNotificationData {
  contractId: string;
  userId: string; // Internal user ID (not Discord ID)
  discordUserId: string;
  role: 'buyer' | 'seller';
  listing: {
    title: string;
    price: string;
    category: string;
  };
  counterparty: {
    name: string;
  };
  robloxAsset?: {
    gameName: string;
    verifiedOwnership: boolean;
  };
}

/**
 * Send contract signing notification via DM
 */
export async function sendContractSigningNotification(
  client: Client,
  data: ContractNotificationData
): Promise<boolean> {
  try {
    // Fetch Discord user
    const user = await client.users.fetch(data.discordUserId);
    if (!user) {
      console.error(`User ${data.discordUserId} not found`);
      return false;
    }

    // Create notification embed
    const embed = new EmbedBuilder()
      .setTitle('📄 Contract Ready for Signature')
      .setDescription(
        `A digital contract has been generated for your ${data.role === 'buyer' ? 'purchase' : 'sale'} and requires your signature.`
      )
      .setColor(0x00d4aa)
      .addFields(
        {
          name: '📦 Asset',
          value: data.listing.title,
          inline: true,
        },
        {
          name: '💰 Price',
          value: formatPrice(data.listing.price),
          inline: true,
        },
        {
          name: '📂 Category',
          value: data.listing.category,
          inline: true,
        },
        {
          name: data.role === 'buyer' ? '👤 Seller' : '👤 Buyer',
          value: data.counterparty.name,
          inline: false,
        }
      );

    // Add Roblox asset info if available
    if (data.robloxAsset) {
      embed.addFields({
        name: '🎮 Roblox Game',
        value: `${data.robloxAsset.gameName}${data.robloxAsset.verifiedOwnership ? ' ✅' : ''}`,
        inline: false,
      });
    }

    embed.addFields(
      {
        name: '⚠️ Important',
        value:
          'By signing this contract, you agree to the terms and conditions. Please review the full contract carefully before signing.',
        inline: false,
      },
      {
        name: "📋 What's Next?",
        value:
          data.role === 'buyer'
            ? '1. Review and sign the contract\n2. Fund the escrow within 48 hours\n3. Confirm delivery after receiving the asset'
            : '1. Review and sign the contract\n2. Transfer the asset to the buyer\n3. Receive payment after delivery confirmation',
        inline: false,
      }
    );

    embed.setFooter({
      text: 'Bloxtr8 - Secure Roblox Asset Trading',
      iconURL:
        'https://cdn.discordapp.com/attachments/1234567890/1234567890/bloxtr8-logo.png',
    });
    embed.setTimestamp();

    // Create action buttons
    const quickSignButton = new ButtonBuilder()
      .setCustomId(`sign_contract_${data.contractId}`)
      .setLabel('✍️ Quick Sign')
      .setStyle(ButtonStyle.Primary);

    const reviewButton = new ButtonBuilder()
      .setCustomId(`review_contract_${data.contractId}`)
      .setLabel('📄 Review Full Contract')
      .setStyle(ButtonStyle.Secondary);

    const webSignButton = new ButtonBuilder()
      .setCustomId(`web_sign_contract_${data.contractId}`)
      .setLabel('🌐 Sign on Web')
      .setStyle(ButtonStyle.Secondary);

    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      quickSignButton,
      reviewButton,
      webSignButton
    );

    // Send DM
    await user.send({
      embeds: [embed],
      components: [buttonRow],
    });

    console.log(
      `Contract signing notification sent to user ${data.discordUserId}`
    );
    return true;
  } catch (error) {
    console.error('Error sending contract signing notification:', error);
    return false;
  }
}

/**
 * Send contract execution notification (after both parties sign)
 */
export async function sendContractExecutedNotification(
  client: Client,
  data: {
    discordUserId: string;
    contractId: string;
    role: 'buyer' | 'seller';
    listing: {
      title: string;
      price: string;
    };
  }
): Promise<boolean> {
  try {
    const user = await client.users.fetch(data.discordUserId);
    if (!user) {
      return false;
    }

    const embed = new EmbedBuilder()
      .setTitle('✅ Contract Fully Executed')
      .setDescription(
        'Both parties have signed the contract. The transaction is now in progress.'
      )
      .setColor(0x10b981)
      .addFields(
        {
          name: '📦 Asset',
          value: data.listing.title,
          inline: true,
        },
        {
          name: '💰 Price',
          value: formatPrice(data.listing.price),
          inline: true,
        },
        {
          name: '📋 Next Steps',
          value:
            data.role === 'buyer'
              ? '• Fund the escrow within 48 hours\n• Wait for seller to deliver\n• Confirm receipt when delivered'
              : '• Wait for buyer to fund escrow\n• Deliver the asset to buyer\n• Funds will be released after confirmation',
          inline: false,
        }
      )
      .setFooter({
        text: `Contract ID: ${data.contractId}`,
      })
      .setTimestamp();

    await user.send({ embeds: [embed] });

    return true;
  } catch (error) {
    console.error('Error sending contract executed notification:', error);
    return false;
  }
}

/**
 * Create contract summary embed
 */
export function createContractSummaryEmbed(contractData: {
  contractId: string;
  status: string;
  listing: {
    title: string;
    price: string;
    category: string;
  };
  buyer: {
    name: string;
    signed: boolean;
  };
  seller: {
    name: string;
    signed: boolean;
  };
  robloxAsset?: {
    gameName: string;
    verifiedOwnership: boolean;
  };
}): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('📄 Contract Summary')
    .setDescription(`Contract ID: \`${contractData.contractId}\``)
    .setColor(
      contractData.status === 'EXECUTED'
        ? 0x10b981
        : contractData.status === 'EXECUTION_FAILED'
          ? 0xef4444
          : contractData.status === 'VOID'
            ? 0x6b7280
            : 0xfbbf24
    )
    .addFields(
      {
        name: '📦 Asset',
        value: contractData.listing.title,
        inline: true,
      },
      {
        name: '💰 Price',
        value: formatPrice(contractData.listing.price),
        inline: true,
      },
      {
        name: '📂 Category',
        value: contractData.listing.category,
        inline: true,
      },
      {
        name: '👤 Seller',
        value: `${contractData.seller.name} ${contractData.seller.signed ? '✅ Signed' : '⏳ Pending'}`,
        inline: true,
      },
      {
        name: '👤 Buyer',
        value: `${contractData.buyer.name} ${contractData.buyer.signed ? '✅ Signed' : '⏳ Pending'}`,
        inline: true,
      },
      {
        name: '📊 Status',
        value:
          contractData.status === 'EXECUTED'
            ? '✅ Executed'
            : contractData.status === 'EXECUTION_FAILED'
              ? '❌ Execution Failed'
              : contractData.status === 'VOID'
                ? '❌ Void'
                : '⏳ Pending Signatures',
        inline: true,
      }
    );

  if (contractData.robloxAsset) {
    embed.addFields({
      name: '🎮 Roblox Game',
      value: `${contractData.robloxAsset.gameName}${contractData.robloxAsset.verifiedOwnership ? ' ✅ Verified' : ''}`,
      inline: false,
    });
  }

  return embed;
}
