import {
  type User,
  type MessageCreateOptions,
  EmbedBuilder,
  type ActionRowBuilder,
  type ButtonBuilder,
  DiscordAPIError,
} from 'discord.js';

export interface DMSendResult {
  success: boolean;
  error?: string;
  fallbackUsed?: boolean;
}

/**
 * Sends a DM to a user with fallback handling for common errors
 * @param user - Discord user to send DM to
 * @param content - Message content to send
 * @returns Result indicating success/failure and any error details
 */
export async function sendDM(
  user: User,
  content: MessageCreateOptions
): Promise<DMSendResult> {
  try {
    await user.send(content);
    return { success: true };
  } catch (error) {
    console.error(`Failed to send DM to user ${user.id}:`, error);

    // Handle specific Discord API errors
    if (error instanceof DiscordAPIError) {
      switch (error.code) {
        case 50007: // Cannot send messages to this user
          return {
            success: false,
            error: 'User has DMs disabled or blocked the bot',
            fallbackUsed: false,
          };
        case 50001: // Missing access
          return {
            success: false,
            error: 'Bot does not have access to send DMs to this user',
            fallbackUsed: false,
          };
        case 50013: // Missing permissions
          return {
            success: false,
            error: 'Bot lacks permissions to send DMs',
            fallbackUsed: false,
          };
        default:
          return {
            success: false,
            error: `Discord API error: ${error.message}`,
            fallbackUsed: false,
          };
      }
    }

    // Handle other errors
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      fallbackUsed: false,
    };
  }
}

/**
 * Sends a DM with an embed and optional buttons
 * @param user - Discord user to send DM to
 * @param embed - Embed to send
 * @param components - Optional action rows with buttons
 * @returns Result indicating success/failure
 */
export async function sendDMWithEmbed(
  user: User,
  embed: EmbedBuilder,
  components?: ActionRowBuilder<ButtonBuilder>[]
): Promise<DMSendResult> {
  const content: MessageCreateOptions = {
    embeds: [embed],
  };

  if (components) {
    content.components = components;
  }

  return sendDM(user, content);
}

/**
 * Creates a fallback message for when DMs fail
 * @param originalCommand - The command that was attempted
 * @param user - Discord user
 * @returns Embed with instructions to enable DMs
 */
export function createDMDisabledEmbed(
  originalCommand: string,
  user: User
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle('📩 DMs Required')
    .setDescription(
      `**I couldn't send you a DM for the \`${originalCommand}\` command**`
    )
    .setThumbnail(user.displayAvatarURL())
    .addFields(
      {
        name: '🔧 Quick Fix',
        value: 'Enable DMs from server members and try again',
        inline: false,
      },
      {
        name: '📋 Steps',
        value:
          '1. Go to **User Settings** → **Privacy & Safety**\n2. Enable **"Allow direct messages from server members"**\n3. Run the command again',
        inline: false,
      },
      {
        name: '🔄 Alternative',
        value: `Run \`/${originalCommand}\` again after enabling DMs`,
        inline: false,
      }
    )
    .setFooter({
      text: 'DMs are required for secure account setup',
      iconURL: user.displayAvatarURL(),
    })
    .setTimestamp();
}
