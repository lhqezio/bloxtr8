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

  // Clean up any expired OAuth states for this user
  await prisma.linkToken.deleteMany({
    where: {
      discordId,
      purpose: 'oauth_state',
      expiresAt: {
        lt: new Date(),
      },
    },
  });

  // Store the new state
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

  // Look up the state in the database
  const linkToken = await prisma.linkToken.findUnique({
    where: {
      token: state,
    },
  });

  if (!linkToken) {
    console.warn('OAuth state not found in database', { state });
    return null;
  }

  // Check if state has the correct purpose
  if (linkToken.purpose !== 'oauth_state') {
    console.warn('OAuth state has incorrect purpose', {
      state,
      purpose: linkToken.purpose,
    });
    return null;
  }

  // Check if state has expired
  if (linkToken.expiresAt < new Date()) {
    console.warn('OAuth state expired', {
      state,
      expiresAt: linkToken.expiresAt,
    });
    // Clean up expired state
    await prisma.linkToken.delete({ where: { id: linkToken.id } });
    return null;
  }

  // Check if state has already been used
  if (linkToken.used) {
    console.warn('OAuth state already used', { state });
    return null;
  }

  // Mark state as used to prevent replay attacks
  await prisma.linkToken.update({
    where: { id: linkToken.id },
    data: { used: true },
  });

  return linkToken.discordId;
}
