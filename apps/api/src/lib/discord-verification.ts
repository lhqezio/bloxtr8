import { randomBytes } from 'crypto';

import { config } from '@dotenvx/dotenvx';

config();

interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar?: string;
}

/**
 * Verify Discord bot token and get user information
 */
export async function verifyDiscordUser(
  discordId: string
): Promise<DiscordUser | null> {
  const botToken = process.env.DISCORD_BOT_TOKEN;

  if (!botToken) {
    throw new Error('Discord bot token not configured');
  }

  try {
    const response = await fetch(
      `https://discord.com/api/v10/users/${discordId}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bot ${botToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return null; // User not found
      }
      throw new Error(`Discord API error: ${response.status}`);
    }

    return response.json() as Promise<DiscordUser>;
  } catch (error) {
    console.error('Error verifying Discord user:', error);
    throw new Error('Failed to verify Discord user');
  }
}

/**
 * Verify that a Discord user exists and is valid
 */
export async function validateDiscordUser(discordId: string): Promise<boolean> {
  try {
    const user = await verifyDiscordUser(discordId);
    return user !== null;
  } catch (error) {
    console.error('Error validating Discord user:', error);
    return false;
  }
}

/**
 * Generate a secure state parameter for OAuth flow
 */
export function generateOAuthState(discordId: string): string {
  const timestamp = Date.now();
  // Use crypto.randomBytes for cryptographically secure random values
  const random = randomBytes(16).toString('hex');
  return `discord_${discordId}_${timestamp}_${random}`;
}

/**
 * Validate OAuth state parameter with expiration check
 */
export function validateOAuthState(
  state: string | undefined,
  discordId: string | undefined
): boolean {
  if (!state || !discordId) {
    return false;
  }

  // Check if state starts with the expected prefix
  if (!state.startsWith(`discord_${discordId}_`)) {
    return false;
  }

  // Extract timestamp from state
  const parts = state.split('_');
  if (parts.length < 4) {
    return false;
  }

  const timestamp = parseInt(parts[2] || '0', 10);
  if (isNaN(timestamp)) {
    return false;
  }

  // Check if state is not older than 10 minutes
  const now = Date.now();
  const maxAge = 10 * 60 * 1000; // 10 minutes
  if (now - timestamp > maxAge) {
    console.warn('OAuth state expired', { discordId, timestamp, now, maxAge });
    return false;
  }

  return true;
}
