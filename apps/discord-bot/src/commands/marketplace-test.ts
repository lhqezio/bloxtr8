import {
  type ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
} from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('marketplace-test')
  .setDescription('Test marketplace setup command');

export async function execute(interaction: ChatInputCommandInteraction) {
  try {
    console.log('Marketplace test command executed');

    const embed = new EmbedBuilder()
      .setTitle('🧪 Marketplace Test')
      .setDescription('This is a test command to verify the bot is working.')
      .setColor('#00ff00')
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });

    console.log('Marketplace test command completed successfully');
  } catch (error) {
    console.error('Error in marketplace-test command:', error);

    if (!interaction.replied) {
      await interaction.reply({
        content: 'Test command failed.',
        ephemeral: true,
      });
    }
  }
}
