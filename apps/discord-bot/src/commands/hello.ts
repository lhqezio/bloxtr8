import { EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';

export async function handleHello(interaction: ChatInputCommandInteraction) {
  const provided = interaction.options.getString('name');
  const targetName =
    provided || interaction.user.displayName || interaction.user.username;

  const helloEmbed = new EmbedBuilder()
    .setColor(0x00d4aa)
    .setTitle('👋 Welcome to Bloxtr8!')
    .setDescription(`**Hello ${targetName}!** Ready to trade Roblox items safely?`)
    .setThumbnail(interaction.user.displayAvatarURL())
    .addFields(
      {
        name: '🚀 Get Started',
        value: '`/signup` - Create account',
        inline: true,
      },
      {
        name: '🔗 Link Accounts',
        value: '`/linkrblx` - Connect Roblox',
        inline: true,
      },
      {
        name: '📊 Check Status',
        value: '`/verify` - View profile',
        inline: true,
      }
    )
    .setFooter({
      text: 'Secure • Fast • Trusted',
      iconURL: interaction.user.displayAvatarURL(),
    })
    .setTimestamp();

  await interaction.reply({
    embeds: [helloEmbed],
    ephemeral: true,
  });
}
