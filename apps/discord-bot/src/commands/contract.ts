import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';

import { getContract } from '../utils/apiClient.js';
import { verify } from '../utils/userVerification.js';
import { createContractSummaryEmbed } from './contract-notifications.js';

/**
 * Handle /contract view command
 * Allows users to view and download their contracts
 */
export async function handleContractView(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  try {
    const contractId = interaction.options.getString('id', true);

    await interaction.deferReply({ ephemeral: true });

    // Verify user
    const verifyResult = await verify(interaction.user.id);
    if (!verifyResult.success) {
      await interaction.editReply({
        content: '❌ You must sign up first. Use `/signup` command.',
      });
      return;
    }

    const userData = Array.isArray(verifyResult.data)
      ? null
      : verifyResult.data;

    if (!userData) {
      await interaction.editReply({
        content: '❌ Could not retrieve your user information.',
      });
      return;
    }

    // Fetch contract
    const contractResult = await getContract(contractId);
    if (!contractResult.success) {
      await interaction.editReply({
        content: `❌ Could not fetch contract: ${contractResult.error.message}`,
      });
      return;
    }

    const contract = contractResult.data;

    // Check if user is authorized to view this contract
    if (
      userData.user.id !== contract.offer.buyerId &&
      userData.user.id !== contract.offer.sellerId
    ) {
      await interaction.editReply({
        content: '❌ You are not authorized to view this contract.',
      });
      return;
    }

    // Determine user's role
    const role =
      userData.user.id === contract.offer.buyerId ? 'buyer' : 'seller';

    // Check signature status
    const userSignature = contract.signatures?.find(
      (sig: any) => sig.userId === userData.user.id
    );
    const counterpartySignature = contract.signatures?.find(
      (sig: any) =>
        sig.userId ===
        (role === 'buyer' ? contract.offer.sellerId : contract.offer.buyerId)
    );

    // Create contract summary
    const embed = new EmbedBuilder()
      .setTitle('📄 Your Contract')
      .setDescription(`Contract ID: \`${contractId}\``)
      .setColor(contract.status === 'EXECUTED' ? 0x10b981 : 0xfbbf24)
      .addFields(
        {
          name: '📦 Asset',
          value: contract.offer.listing.title,
          inline: true,
        },
        {
          name: '💰 Price',
          value: `$${(Number(contract.offer.amount) / 100).toFixed(2)}`,
          inline: true,
        },
        {
          name: '👤 Your Role',
          value: role.charAt(0).toUpperCase() + role.slice(1),
          inline: true,
        },
        {
          name: '✍️ Your Signature',
          value: userSignature
            ? `✅ Signed on ${new Date(userSignature.signedAt).toLocaleDateString()}`
            : '⏳ Not signed',
          inline: true,
        },
        {
          name: '✍️ Counterparty Signature',
          value: counterpartySignature
            ? `✅ Signed on ${new Date(counterpartySignature.signedAt).toLocaleDateString()}`
            : '⏳ Not signed',
          inline: true,
        },
        {
          name: '📊 Contract Status',
          value:
            contract.status === 'EXECUTED'
              ? '✅ Fully Executed'
              : contract.status === 'VOID'
                ? '❌ Void'
                : '⏳ Pending Signatures',
          inline: true,
        }
      );

    if (contract.robloxAssetData) {
      const robloxData = contract.robloxAssetData as any;
      embed.addFields({
        name: '🎮 Roblox Game',
        value: `${robloxData.gameName}${robloxData.verifiedOwnership ? ' ✅ Verified' : ''}`,
        inline: false,
      });
    }

    // Add buttons
    const buttons: ButtonBuilder[] = [];

    // Download button (always available)
    if (contract.pdfUrl) {
      const downloadButton = new ButtonBuilder()
        .setLabel('📥 Download Contract PDF')
        .setStyle(ButtonStyle.Link)
        .setURL(contract.pdfUrl);
      buttons.push(downloadButton);
    }

    // Sign button (if not signed yet and contract is pending)
    if (!userSignature && contract.status === 'PENDING_SIGNATURE') {
      const signButton = new ButtonBuilder()
        .setCustomId(`sign_contract_${contractId}`)
        .setLabel('✍️ Sign Contract')
        .setStyle(ButtonStyle.Primary);
      buttons.push(signButton);
    }

    const actionRow =
      buttons.length > 0
        ? new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)
        : null;

    await interaction.editReply({
      embeds: [embed],
      components: actionRow ? [actionRow] : [],
    });
  } catch (error) {
    console.error('Error in handleContractView:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ An error occurred. Please try again.',
        ephemeral: true,
      });
    } else {
      await interaction.editReply({
        content: '❌ An error occurred. Please try again.',
      });
    }
  }
}

/**
 * Handle /contract list command
 * Shows user's contracts
 */
export async function handleContractList(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  try {
    await interaction.deferReply({ ephemeral: true });

    await interaction.editReply({
      content:
        '📋 Contract listing feature coming soon! For now, check your DMs for contract notifications or use `/contract view <id>` if you have a contract ID.',
    });
  } catch (error) {
    console.error('Error in handleContractList:', error);
  }
}



