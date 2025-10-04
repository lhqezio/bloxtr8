import fetch from 'node-fetch';

import type { ApiError } from './apiClient.ts';

export interface UserVerificationResult {
  isVerified: boolean;
  user?: {
    id: string;
    name: string | null;
    email: string;
    kycVerified: boolean;
    kycTier: 'TIER_0' | 'TIER_1' | 'TIER_2';
    accounts: Account[];
  };
  error?: string;
}

export interface Account {
  accountId: string;
  providerId: string;
}

export interface VerifyResponse {
  user: {
    id: string;
    name: string;
    email: string;
    kycVerified: boolean;
    kycTier: 'TIER_0' | 'TIER_1' | 'TIER_2';
  };
  accounts: Account[];
  discordUserInfo: {
    id: string;
    username: string;
    discriminator: string;
    avatar: string | null;
    display_name: string | null;
  } | null;
  robloxUserInfo: {
    id: number;
    name: string;
    displayName: string;
    description: string;
    created: string;
    isBanned: boolean;
  } | null;
}

export async function verify(
  discord_id: string
): Promise<
  | { success: true; data: VerifyResponse | Account[] }
  | { success: false; error: ApiError }
> {
  const apiBaseUrl: string = getApiBaseUrl();
  try {
    const response = await fetch(
      `${apiBaseUrl}/api/users/accounts/${discord_id}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        // Add timeout to prevent hanging requests
        signal: AbortSignal.timeout(5000), // 5 second timeout
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const responseData = (await response.json()) as VerifyResponse | Account[];

    // Handle empty array response (no user found) - legacy format
    if (Array.isArray(responseData) && responseData.length === 0) {
      return { success: true, data: [] };
    }

    // Handle legacy array format
    if (Array.isArray(responseData)) {
      return {
        success: true,
        data: responseData,
      };
    }

    // Handle new detailed response format
    return {
      success: true,
      data: responseData as VerifyResponse,
    };
  } catch (error) {
    console.error('Error verify user:', error);
    return {
      success: false,
      error: {
        message: 'Network error occurred while verifying user',
      },
    };
  }
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
        // Add timeout to prevent hanging requests
        signal: AbortSignal.timeout(5000), // 5 second timeout
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
      name: string | null;
      email: string;
      kycVerified: boolean;
      kycTier: 'TIER_0' | 'TIER_1' | 'TIER_2';
      accounts: Account[];
    };

    // Allow TIER_1+ users to create listings (partial verification)
    if (userData.kycTier === 'TIER_0') {
      return {
        isVerified: false,
        user: userData,
        error:
          'Account verification required. Please complete account setup and link your Roblox account to create listings.',
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
 * Checks if a user exists in the database without creating them
 * This is used for commands that require an existing user
 */
export async function checkUserExists(
  discordId: string
): Promise<UserVerificationResult> {
  try {
    const apiBaseUrl = getApiBaseUrl();
    const response = await fetch(
      `${apiBaseUrl}/api/users/accounts/${discordId}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        // Add timeout to prevent hanging requests
        signal: AbortSignal.timeout(5000), // 5 second timeout
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return {
          isVerified: false,
          user: undefined,
          error: 'User not found. Please sign up first.',
        };
      }
      return {
        isVerified: false,
        user: undefined,
        error: 'Failed to check user account. Please try again later.',
      };
    }

    const responseData = (await response.json()) as VerifyResponse | Account[];

    // Handle empty array response (no user found)
    if (Array.isArray(responseData) && responseData.length === 0) {
      return {
        isVerified: false,
        user: undefined,
        error: 'User not found. Please sign up first.',
      };
    }

    // Handle legacy array format - non-empty arrays contain valid account data
    if (Array.isArray(responseData)) {
      // For legacy format, we can't determine KYC status, so assume not verified
      // but the user exists (they have accounts)
      return {
        isVerified: false,
        user: {
          id: '', // Not available in legacy format
          name: null,
          email: '', // Not available in legacy format
          kycVerified: false, // Assume not verified for legacy format
          kycTier: 'TIER_0',
          accounts: responseData,
        },
        error:
          'Account verification required. Please complete account setup to access all features.',
      };
    }

    // Handle new detailed response format
    const userData = responseData as VerifyResponse;
    return {
      isVerified: userData.user.kycVerified,
      user: {
        id: userData.user.id,
        name: userData.user.name,
        email: userData.user.email,
        kycVerified: userData.user.kycVerified,
        kycTier: userData.user.kycTier,
        accounts: userData.accounts,
      },
    };
  } catch (error) {
    console.error('Error checking user existence:', error);
    return {
      isVerified: false,
      user: undefined,
      error: 'Network error occurred while checking user account.',
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
      // Add timeout to prevent hanging requests
      signal: AbortSignal.timeout(5000), // 5 second timeout
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
      name: string | null;
      email: string;
      kycVerified: boolean;
      kycTier: 'TIER_0' | 'TIER_1' | 'TIER_2';
      accounts: Account[];
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
 * Checks if a user has a specific provider account linked
 */
export async function checkProviderAccount(
  discordId: string,
  providerId: 'roblox' | 'discord'
): Promise<boolean> {
  try {
    const apiBaseUrl = getApiBaseUrl();
    const response = await fetch(
      `${apiBaseUrl}/api/users/accounts/${discordId}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        // Add timeout to prevent hanging requests
        signal: AbortSignal.timeout(5000), // 5 second timeout
      }
    );

    if (!response.ok) {
      return false;
    }

    const responseData = (await response.json()) as Account[] | VerifyResponse;

    // Handle empty array response (no user found)
    if (Array.isArray(responseData)) {
      return (
        responseData.length > 0 &&
        responseData.some(account => account.providerId === providerId)
      );
    }

    // Handle VerifyResponse object (user found)
    const accounts = responseData.accounts || [];
    return accounts.some(
      (account: Account) => account.providerId === providerId
    );
  } catch (error) {
    console.error('Error checking provider account:', error);
    return false;
  }
}

/**
 * Gets the base URL for API calls
 */
function getApiBaseUrl(): string {
  const value = process.env.API_BASE_URL;
  // Return default if undefined or empty string
  return value !== undefined && value !== '' ? value : 'http://localhost:3000';
}
