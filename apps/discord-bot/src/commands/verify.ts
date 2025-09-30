import { type ChatInputCommandInteraction } from 'discord.js';

import { buildVerificationEmbeds } from '../utils/embeds.js';
import { verify } from '../utils/userVerification.js';

export async function handleVerify(interaction: ChatInputCommandInteraction) {
  try {
    // Defer the reply immediately to extend the timeout to 15 minutes
    await interaction.deferReply({ ephemeral: true });

    const id = interaction.options.getString('id') || interaction.user.id;
    const result = await verify(id);

    if (result.success) {
      const { embeds } = buildVerificationEmbeds(result.data);
      await interaction.editReply({
        embeds,
      });
    } else {
      await interaction.editReply({
        content: `❌ Verification failed: ${result.error.message}`,
      });
    }
  } catch (error) {
    console.error('Error handling verify:', error);

    // Try to edit the reply if it was deferred, otherwise send a follow-up
    try {
      await interaction.editReply({
        content:
          '❌ An error occurred while verifying. Please try again later.',
      });
    } catch {
      // If edit fails, try to send a follow-up message
      try {
        await interaction.followUp({
          content:
            '❌ An error occurred while verifying. Please try again later.',
          ephemeral: true,
        });
      } catch (followUpError) {
        console.error('Failed to send error message:', followUpError);
      }
    }
  }
}
