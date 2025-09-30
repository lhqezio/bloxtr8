import { EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';

export async function handlePing(interaction: ChatInputCommandInteraction) {
  const startTime = Date.now();
  await interaction.reply({ content: '🏓 Pinging...' });
  const latency = Date.now() - startTime;

  const pingEmbed = new EmbedBuilder()
    .setColor(0x00d4aa)
    .setTitle('🏓 Pong!')
    .setDescription('**Bot Status: Online**')
    .addFields(
      {
        name: '⚡ Speed',
        value: `${latency}ms`,
        inline: true,
      },
      {
        name: '🟢 Status',
        value: 'All systems go',
        inline: true,
      }
    )
    .setFooter({
      text: 'Bloxtr8 Bot',
      iconURL: interaction.user.displayAvatarURL(),
    })
    .setTimestamp();

  await interaction.editReply({
    content: '',
    embeds: [pingEmbed],
  });
}
// comment for last push
