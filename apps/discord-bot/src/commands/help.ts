import { EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';

export async function handleHelp(interaction: ChatInputCommandInteraction) {
  const helpEmbed = new EmbedBuilder()
    .setColor(0x00d4aa)
    .setTitle('🆘 Bloxtr8 Bot Help')
    .setDescription('Here are all the available commands:')
    .addFields(
      {
        name: '🚀 Getting Started',
        value:
          '`/signup` - Create your Bloxtr8 account\n`/link` - Link your Roblox account',
        inline: false,
      },
      {
        name: '📊 Account Management',
        value:
          '`/verify [id]` - Check account verification status\n`/ping` - Check bot latency',
        inline: false,
      },
      {
        name: '💼 Trading',
        value: '`/listing create` - Create a verified game ownership listing\n`/listing view` - View all available listings',
        inline: false,
      },
      {
        name: 'ℹ️ Information',
        value: '`/help` - Show this help message',
        inline: false,
      }
    )
    .setFooter({
      text: 'Bloxtr8 - Secure Roblox Trading',
      iconURL: interaction.client.user?.displayAvatarURL(),
    })
    .setTimestamp();

  await interaction.reply({
    embeds: [helpEmbed],
    ephemeral: true,
  });
}
