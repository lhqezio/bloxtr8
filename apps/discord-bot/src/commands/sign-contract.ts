import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';

import {
  getContract,
  signContract,
  generateContractSignToken,
} from '../utils/apiClient.js';
import { verify } from '../utils/userVerification.js';
import { createContractSummaryEmbed } from './contract-notifications.js';

/**
 * Handle quick sign button click
 */
export async function handleQuickSignButton(
  interaction: ButtonInteraction
): Promise<void> {
  try {
    const contractId = interaction.customId.replace('sign_contract_', '');

    if (!contractId) {
      await interaction.reply({
        content: '❌ Invalid contract ID',
        ephemeral: true,
      });
      return;
    }

    // Defer reply as we'll fetch contract details
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

    // Fetch contract details
    const contractResult = await getContract(contractId);
    if (!contractResult.success) {
      await interaction.editReply({
        content: `❌ Could not fetch contract: ${contractResult.error.message}`,
      });
      return;
    }

    const contract = contractResult.data;

    // Check if user is authorized
    if (
      userData.user.id !== contract.offer.buyerId &&
      userData.user.id !== contract.offer.sellerId
    ) {
      await interaction.editReply({
        content: '❌ You are not authorized to sign this contract.',
      });
      return;
    }

    // Check if already signed
    const userSignature = contract.signatures?.find(
      (sig: any) => sig.userId === userData.user.id
    );

    if (userSignature) {
      await interaction.editReply({
        content: '✅ You have already signed this contract.',
      });
      return;
    }

    // Create confirmation modal
    const modal = new ModalBuilder()
      .setCustomId(`confirm_sign_${contractId}`)
      .setTitle('Confirm Contract Signature');

    const confirmInput = new TextInputBuilder()
      .setCustomId('confirmation')
      .setLabel('Type "I AGREE" to sign this contract')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('I AGREE')
      .setRequired(true)
      .setMinLength(7)
      .setMaxLength(7);

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(
      confirmInput
    );
    modal.addComponents(row);

    await interaction.showModal(modal);
  } catch (error) {
    console.error('Error in handleQuickSignButton:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ An error occurred. Please try again.',
        ephemeral: true,
      });
    }
  }
}

/**
 * Handle contract signature confirmation modal
 */
export async function handleSignConfirmationModal(
  interaction: ModalSubmitInteraction
): Promise<void> {
  try {
    const contractId = interaction.customId.replace('confirm_sign_', '');
    const confirmation =
      interaction.fields.getTextInputValue('confirmation').toUpperCase();

    if (confirmation !== 'I AGREE') {
      await interaction.reply({
        content: '❌ Invalid confirmation. You must type "I AGREE" exactly.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    // Verify user
    const verifyResult = await verify(interaction.user.id);
    if (!verifyResult.success) {
      await interaction.editReply({
        content: '❌ You must sign up first.',
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

    // Sign the contract
    const signResult = await signContract(
      contractId,
      userData.user.id,
      'DISCORD_NATIVE'
    );

    if (!signResult.success) {
      await interaction.editReply({
        content: `❌ Failed to sign contract: ${signResult.error.message}`,
      });
      return;
    }

    // Create success embed
    const embed = new EmbedBuilder()
      .setTitle('✅ Contract Signed Successfully')
      .setDescription(
        'Your digital signature has been recorded and the contract is now legally binding.'
      )
      .setColor(0x10b981)
      .addFields(
        {
          name: '📄 Contract ID',
          value: `\`${contractId}\``,
          inline: false,
        },
        {
          name: '⏰ Signed At',
          value: new Date().toLocaleString(),
          inline: false,
        }
      );

    if (signResult.data.bothPartiesSigned) {
      embed.addFields({
        name: '✅ Contract Executed',
        value:
          'Both parties have now signed. The transaction will proceed to the next phase.',
        inline: false,
      });
      embed.setColor(0x10b981);
    } else {
      embed.addFields({
        name: '⏳ Waiting for Counterparty',
        value: 'Waiting for the other party to sign the contract.',
        inline: false,
      });
      embed.setColor(0xfbbf24);
    }

    embed.setFooter({
      text: 'Bloxtr8 - Secure Roblox Asset Trading',
    });

    await interaction.editReply({
      embeds: [embed],
    });

    // Update the original message to remove buttons if both signed
    if (signResult.data.bothPartiesSigned) {
      try {
        await interaction.message?.edit({
          components: [],
        });
      } catch (error) {
        console.error('Could not update original message:', error);
      }
    }
  } catch (error) {
    console.error('Error in handleSignConfirmationModal:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ An error occurred while signing. Please try again.',
        ephemeral: true,
      });
    }
  }
}

/**
 * Handle review contract button
 */
export async function handleReviewContractButton(
  interaction: ButtonInteraction
): Promise<void> {
  try {
    const contractId = interaction.customId.replace('review_contract_', '');

    await interaction.deferReply({ ephemeral: true });

    // Verify user
    const verifyResult = await verify(interaction.user.id);
    if (!verifyResult.success) {
      await interaction.editReply({
        content: '❌ You must sign up first.',
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

    // Check authorization
    if (
      userData.user.id !== contract.offer.buyerId &&
      userData.user.id !== contract.offer.sellerId
    ) {
      await interaction.editReply({
        content: '❌ You are not authorized to view this contract.',
      });
      return;
    }

    // Get PDF download URL
    const pdfUrl = contract.pdfUrl;

    if (!pdfUrl) {
      await interaction.editReply({
        content: '❌ Contract PDF is not available.',
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('📄 Contract Review')
      .setDescription(
        'Click the button below to download and review the full contract PDF.'
      )
      .setColor(0x00d4aa)
      .addFields(
        {
          name: '📋 Contract ID',
          value: `\`${contractId}\``,
          inline: false,
        },
        {
          name: '⚠️ Important',
          value:
            'Please read the entire contract carefully before signing. Make sure you understand all terms and conditions.',
          inline: false,
        }
      );

    const downloadButton = new ButtonBuilder()
      .setLabel('📥 Download Contract PDF')
      .setStyle(ButtonStyle.Link)
      .setURL(pdfUrl);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      downloadButton
    );

    await interaction.editReply({
      embeds: [embed],
      components: [row],
    });
  } catch (error) {
    console.error('Error in handleReviewContractButton:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ An error occurred. Please try again.',
        ephemeral: true,
      });
    }
  }
}

/**
 * Handle web sign button - generates magic link for web app
 */
export async function handleWebSignButton(
  interaction: ButtonInteraction
): Promise<void> {
  try {
    const contractId = interaction.customId.replace('web_sign_contract_', '');

    await interaction.deferReply({ ephemeral: true });

    // Verify user
    const verifyResult = await verify(interaction.user.id);
    if (!verifyResult.success) {
      await interaction.editReply({
        content: '❌ You must sign up first.',
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

    // Generate sign token
    const tokenResult = await generateContractSignToken(
      contractId,
      userData.user.id
    );

    if (!tokenResult.success) {
      await interaction.editReply({
        content: `❌ Failed to generate sign token: ${tokenResult.error.message}`,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('🌐 Sign Contract on Web')
      .setDescription(
        'Click the button below to open the contract signing page in your browser.'
      )
      .setColor(0x00d4aa)
      .addFields(
        {
          name: '🔒 Secure Link',
          value:
            'This link is valid for 15 minutes and can only be used once.',
          inline: false,
        },
        {
          name: '📋 What to Expect',
          value:
            '• Full contract preview\n• Detailed terms and conditions\n• Secure signature confirmation',
          inline: false,
        }
      );

    const signButton = new ButtonBuilder()
      .setLabel('✍️ Sign on Web')
      .setStyle(ButtonStyle.Link)
      .setURL(tokenResult.data.signUrl);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(signButton);

    await interaction.editReply({
      embeds: [embed],
      components: [row],
    });
  } catch (error) {
    console.error('Error in handleWebSignButton:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ An error occurred. Please try again.',
        ephemeral: true,
      });
    }
  }
}

