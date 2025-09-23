import fetch from 'node-fetch';

export interface UserVerificationResult {
  isVerified: boolean;
  user?: {
    id: string;
    discordId: string;
    username: string;
    kycVerified: boolean;
    kycTier: 'TIER_1' | 'TIER_2';
  };
  error?: string;
}

/**
 * Verifies if a Discord user is eligible to create listings via API
 * Requirements: User must exist in database and have KYC verification
 */
export async function verifyUserForListing(
  discordId: string
): Promise<UserVerificationResult> {
  try {
    const apiBaseUrl = getApiBaseUrl();
    const response = await fetch(
      `${apiBaseUrl}/api/users/verify/${discordId}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return {
          isVerified: false,
          error: 'User not found. Please complete account registration first.',
        };
      }
      return {
        isVerified: false,
        error: 'Failed to verify user account. Please try again later.',
      };
    }

    const userData = (await response.json()) as {
      id: string;
      discordId: string;
      username: string;
      kycVerified: boolean;
      kycTier: 'TIER_1' | 'TIER_2';
    };

    if (!userData.kycVerified) {
      return {
        isVerified: false,
        user: userData,
        error:
          'Account verification required. Please complete KYC verification to create listings.',
      };
    }

    return {
      isVerified: true,
      user: userData,
    };
  } catch (error) {
    console.error('Error verifying user:', error);
    return {
      isVerified: false,
      error: 'Failed to verify user account. Please try again later.',
    };
  }
}

/**
 * Ensures a user exists in the database via API, creating them if necessary
 * This is called when a Discord user first interacts with the bot
 */
export async function ensureUserExists(
  discordId: string,
  username: string
): Promise<UserVerificationResult> {
  try {
    const apiBaseUrl = getApiBaseUrl();
    const response = await fetch(`${apiBaseUrl}/api/users/ensure`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        discordId,
        username,
      }),
    });

    if (!response.ok) {
      return {
        isVerified: false,
        error:
          'Failed to create or verify user account. Please try again later.',
      };
    }

    const userData = (await response.json()) as {
      id: string;
      discordId: string;
      username: string;
      kycVerified: boolean;
      kycTier: 'TIER_1' | 'TIER_2';
    };

    return {
      isVerified: userData.kycVerified,
      user: userData,
    };
  } catch (error) {
    console.error('Error ensuring user exists:', error);
    return {
      isVerified: false,
      error: 'Failed to create or verify user account. Please try again later.',
    };
  }
}

/**
 * Gets the base URL for API calls
 */
function getApiBaseUrl(): string {
  return process.env.API_BASE_URL || 'http://api:3000';
}
