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
 * Generate a secure state parameter for OAuth flow and store it server-side
 * @returns The state token to be sent to OAuth provider
 */
export async function generateOAuthState(discordId: string): Promise<string> {
  // Use crypto.randomBytes for cryptographically secure random state
  const state = randomBytes(32).toString('hex');

  // Store state in database with 10-minute expiration
  const { prisma } = await import('@bloxtr8/database');

  // Store the new state
  // Note: We don't delete existing states here to avoid race conditions in concurrent OAuth flows.
  // Security is maintained through expiration checks and the 'used' flag in validateOAuthState.
  await prisma.linkToken.create({
    data: {
      token: state,
      discordId,
      purpose: 'oauth_state',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      used: false,
    },
  });

  return state;
}

/**
 * Validate OAuth state parameter and retrieve the associated Discord ID
 * @returns The Discord ID associated with the state, or null if invalid
 */
export async function validateOAuthState(
  state: string | undefined
): Promise<string | null> {
  if (!state) {
    return null;
  }

  const { prisma } = await import('@bloxtr8/database');

  // Use a single atomic operation to find and update the state atomically
  // This eliminates the TOCTOU race condition by checking all conditions
  // and marking as used in a single database operation
  const updateResult = await prisma.linkToken.updateMany({
    where: {
      token: state,
      purpose: 'oauth_state',
      used: false, // Only update if still unused
      expiresAt: {
        gt: new Date(), // Only update if not expired
      },
    },
    data: { used: true },
  });

  // If no rows were updated, the state is invalid (not found, expired, already used, or wrong purpose)
  if (updateResult.count === 0) {
    // Log the specific reason for debugging (but don't expose internal details)
    const linkToken = await prisma.linkToken.findUnique({
      where: { token: state },
    });

    if (!linkToken) {
      console.warn('OAuth state not found in database', { state });
    } else if (linkToken.purpose !== 'oauth_state') {
      console.warn('OAuth state has incorrect purpose', {
        state,
        purpose: linkToken.purpose,
      });
    } else if (linkToken.expiresAt < new Date()) {
      console.warn('OAuth state expired', {
        state,
        expiresAt: linkToken.expiresAt,
      });
      // Clean up expired state
      await prisma.linkToken.delete({ where: { id: linkToken.id } });
    } else if (linkToken.used) {
      console.warn('OAuth state already used', { state });
    }

    return null;
  }

  // Fetch the Discord ID from the updated token
  const updatedToken = await prisma.linkToken.findUnique({
    where: { token: state },
    select: { discordId: true },
  });

  return updatedToken?.discordId || null;
}
