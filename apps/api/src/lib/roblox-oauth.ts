import { config } from '@dotenvx/dotenvx';

config();

interface RobloxTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

interface RobloxUserInfo {
  sub: string; // Roblox user ID
  name: string;
  preferred_username: string;
  picture?: string;
}

/**
 * Exchange OAuth authorization code for access token
 */
export async function exchangeCodeForToken(
  code: string,
  redirectUri: string
): Promise<RobloxTokenResponse> {
  const clientId = process.env.ROBLOX_CLIENT_ID;
  const clientSecret = process.env.ROBLOX_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Roblox OAuth credentials not configured');
  }

  const tokenUrl = 'https://apis.roblox.com/oauth/v1/token';

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to exchange code for token: ${response.status} ${errorText}`
    );
  }

  return response.json() as Promise<RobloxTokenResponse>;
}

/**
 * Get user information from Roblox using access token
 */
export async function getRobloxUserInfo(
  accessToken: string
): Promise<RobloxUserInfo> {
  const userInfoUrl = 'https://apis.roblox.com/oauth/v1/userinfo';

  const response = await fetch(userInfoUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get user info: ${response.status} ${errorText}`);
  }

  return response.json() as Promise<RobloxUserInfo>;
}

/**
 * Validate OAuth code and get Roblox user ID
 */
export async function validateRobloxOAuth(
  code: string,
  redirectUri: string
): Promise<string> {
  try {
    // Exchange code for access token
    const tokenResponse = await exchangeCodeForToken(code, redirectUri);

    // Get user info using access token
    const userInfo = await getRobloxUserInfo(tokenResponse.access_token);

    // Return the Roblox user ID
    return userInfo.sub;
  } catch (error) {
    console.error('Error validating Roblox OAuth:', error);
    throw new Error('Failed to validate Roblox OAuth code');
  }
}
