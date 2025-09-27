import { type ChatInputCommandInteraction } from 'discord.js';

import { buildVerificationEmbeds } from '../utils/embeds.js';
import { verify } from '../utils/userVerification.js';

export async function handleVerify(interaction: ChatInputCommandInteraction) {
  const id = interaction.options.getString('id') || interaction.user.id;
  const result = await verify(id);
  
  if (result.success) {
    const { embeds } = buildVerificationEmbeds(result.data);
    await interaction.reply({
      embeds,
      ephemeral: true,
    });
  } else {
    await interaction.reply({
      content: `❌ Verification failed: ${result.error.message}`,
      ephemeral: true,
    });
  }
}
