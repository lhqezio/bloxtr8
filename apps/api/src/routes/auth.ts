import { Router, type Router as ExpressRouter } from 'express';

import {
  generateOAuthState,
  validateOAuthState,
} from '../lib/discord-verification.js';
import { validateRobloxOAuth } from '../lib/roblox-oauth.js';
import { AppError } from '../middleware/errorHandler.js';

const router: ExpressRouter = Router();

// Roblox OAuth URL generation endpoint
router.post('/roblox/url', async (req, res, _next) => {
  try {
    const { redirectUri, discordId, token } = req.body;

    console.info('Generating OAuth URL', {
      discordId,
      hasRedirectUri: !!redirectUri,
      hasToken: !!token,
    });

    if (!redirectUri) {
      throw new AppError('Redirect URI is required', 400);
    }

    let validatedDiscordId = discordId;

    // If token is provided, validate it instead of requiring discordId
    if (token) {
      const { prisma } = await import('@bloxtr8/database');

      const linkToken = await prisma.linkToken.findUnique({
        where: { token },
      });

      if (!linkToken) {
        throw new AppError('Invalid or expired token', 404);
      }

      if (linkToken.expiresAt < new Date()) {
        await prisma.linkToken.delete({ where: { id: linkToken.id } });
        throw new AppError('Token has expired', 410);
      }

      if (linkToken.used) {
        throw new AppError('Token has already been used', 410);
      }

      // Use the Discord ID from the token
      validatedDiscordId = linkToken.discordId;
      console.info('Validated token for Discord ID', {
        discordId: validatedDiscordId,
      });
    } else if (!discordId) {
      throw new AppError('Discord ID or token is required', 400);
    }

    const clientId = process.env.ROBLOX_CLIENT_ID;
    if (!clientId) {
      console.error('ROBLOX_CLIENT_ID not found in environment variables');
      throw new AppError('Roblox OAuth not configured', 500);
    }

    // Generate secure state parameter server-side (stored in database)
    const stateDiscordId = token ? validatedDiscordId : discordId;
    const state = await generateOAuthState(stateDiscordId);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid',
    });

    params.append('state', state);

    const authUrl = `https://apis.roblox.com/oauth/v1/authorize?${params.toString()}`;

    console.info('Generated OAuth URL', { discordId, hasState: !!state });

    res.status(200).json({
      success: true,
      authUrl,
    });
  } catch (error) {
    console.error('Error generating OAuth URL:', error);
    _next(error);
  }
});

// Roblox OAuth callback endpoint
router.get('/roblox/callback', async (req, res, _next) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      console.error('Roblox OAuth error:', error);
      return res.redirect(
        `${process.env.WEB_APP_URL || 'http://localhost:5173'}/auth/link/error?error=${encodeURIComponent(error as string)}`
      );
    }

    if (!code || !state) {
      console.error('Missing code or state in Roblox callback');
      return res.redirect(
        `${process.env.WEB_APP_URL || 'http://localhost:5173'}/auth/link/error?error=missing_parameters`
      );
    }

    // Validate the state parameter and retrieve the associated Discord ID
    // This prevents CSRF attacks and eliminates circular dependency
    const discordId = await validateOAuthState(state as string);

    if (!discordId) {
      console.error('Invalid or expired state parameter:', {
        state,
      });
      return res.redirect(
        `${process.env.WEB_APP_URL || 'http://localhost:5173'}/auth/link/error?error=invalid_state`
      );
    }

    // Process the OAuth code immediately in the callback to avoid duplicate processing
    try {
      // Use the same redirectUri pattern that the frontend sends
      // This must match exactly what was used in the initial OAuth request
      // The frontend uses getApiBaseUrl() which returns process.env.VITE_API_BASE_URL or defaults to localhost:3000
      const apiBaseUrl =
        process.env.API_BASE_URL ||
        process.env.VITE_API_BASE_URL ||
        'http://localhost:3000';
      const redirectUri = `${apiBaseUrl}/api/oauth/roblox/callback`;

      console.info('Processing OAuth code in callback', {
        discordId,
        hasCode: !!code,
        redirectUri,
      });

      let robloxUserId: string;
      try {
        robloxUserId = await validateRobloxOAuth(code as string, redirectUri);
        console.info('Successfully validated OAuth code', {
          discordId,
          robloxUserId,
        });
      } catch (oauthError) {
        console.error('OAuth validation failed in callback:', oauthError);

        // Check if it's a code reuse error
        if (
          oauthError instanceof Error &&
          oauthError.message.includes('Authorization code has been used')
        ) {
          const webAppErrorUrl = `${process.env.WEB_APP_URL || 'http://localhost:5173'}/auth/link/error?${new URLSearchParams(
            {
              error: 'oauth_code_used',
              message:
                'OAuth code has already been used. Please try linking your account again.',
              discordId,
            }
          ).toString()}`;
          return res.redirect(webAppErrorUrl);
        }

        const webAppErrorUrl = `${process.env.WEB_APP_URL || 'http://localhost:5173'}/auth/link/error?${new URLSearchParams(
          {
            error: 'oauth_validation_failed',
            message: 'Failed to validate OAuth code',
            discordId,
          }
        ).toString()}`;
        return res.redirect(webAppErrorUrl);
      }

      // Import prisma singleton and link accounts
      const { prisma } = await import('@bloxtr8/database');

      // Find user by Discord ID
      const user = await prisma.user.findFirst({
        where: {
          accounts: {
            some: {
              accountId: String(discordId),
              providerId: 'discord',
            },
          },
        },
      });

      if (!user) {
        console.warn('Discord user not found - user must sign up first', {
          discordId,
        });

        const webAppErrorUrl = `${process.env.WEB_APP_URL || 'http://localhost:5173'}/auth/link/error?${new URLSearchParams(
          {
            error: 'user_not_signed_up',
            message:
              'Discord user not found. Please sign up first using the Discord bot `/signup` command or Discord OAuth on this site.',
            discordId,
          }
        ).toString()}`;
        return res.redirect(webAppErrorUrl);
      }

      // Check if Roblox account is already linked to this user
      const existingRobloxAccount = await prisma.account.findFirst({
        where: {
          userId: user.id,
          providerId: 'roblox',
        },
      });

      if (existingRobloxAccount) {
        console.info('Roblox account already linked', {
          discordId,
          userId: user.id,
        });
        const webAppSuccessUrl = `${process.env.WEB_APP_URL || 'http://localhost:5173'}/auth/link/success?${new URLSearchParams(
          {
            message: 'Roblox account is already linked',
            discordId,
          }
        ).toString()}`;
        return res.redirect(webAppSuccessUrl);
      }

      // Check if Roblox account is linked to a different user
      const existingRobloxUser = await prisma.user.findFirst({
        where: {
          accounts: {
            some: {
              accountId: robloxUserId,
              providerId: 'roblox',
            },
          },
        },
      });

      if (existingRobloxUser && existingRobloxUser.id !== user.id) {
        console.warn('Roblox account linked to different user', {
          discordId,
          robloxUserId,
        });
        const webAppErrorUrl = `${process.env.WEB_APP_URL || 'http://localhost:5173'}/auth/link/error?${new URLSearchParams(
          {
            error: 'account_conflict',
            message: 'Roblox account is already linked to another user',
            discordId,
          }
        ).toString()}`;
        return res.redirect(webAppErrorUrl);
      }

      // Link Roblox account to Discord user
      await prisma.account.create({
        data: {
          id: `roblox_${robloxUserId}`,
          userId: user.id,
          accountId: robloxUserId,
          providerId: 'roblox',
        },
      });

      // Automatically upgrade user from TIER_0 to TIER_1 when they link Roblox account
      if (user.kycTier === 'TIER_0') {
        await prisma.user.update({
          where: { id: user.id },
          data: { kycTier: 'TIER_1' },
        });
        console.info('Upgraded user KYC tier from TIER_0 to TIER_1', {
          userId: user.id,
          discordId,
        });
      }

      console.info('Successfully linked Roblox account', {
        discordId,
        robloxUserId,
        userId: user.id,
      });

      // Clean up any active link tokens and OAuth states for this user
      await prisma.linkToken.deleteMany({
        where: {
          discordId,
          purpose: {
            in: ['roblox_link', 'oauth_state'],
          },
        },
      });

      // Redirect to dedicated success page
      const webAppSuccessUrl = `${process.env.WEB_APP_URL || 'http://localhost:5173'}/auth/link/success?${new URLSearchParams(
        {
          message: 'Roblox account linked successfully!',
          discordId,
        }
      ).toString()}`;
      res.redirect(webAppSuccessUrl);
    } catch (error) {
      console.error('Error processing OAuth in callback:', error);
      const webAppErrorUrl = `${process.env.WEB_APP_URL || 'http://localhost:5173'}/auth/link/error?${new URLSearchParams(
        {
          error: 'callback_error',
          message: 'An error occurred while processing the authentication',
          discordId,
        }
      ).toString()}`;
      res.redirect(webAppErrorUrl);
    }
  } catch (error) {
    console.error('Error in Roblox callback:', error);
    res.redirect(
      `${process.env.WEB_APP_URL || 'http://localhost:5173'}/auth/link/error?error=callback_error`
    );
  }
});

// Roblox account linking endpoint (simplified - most processing now happens in callback)
router.post('/roblox/link', async (req, res, _next) => {
  try {
    // This endpoint is now mainly for backward compatibility
    // The actual linking happens in the callback route
    res.status(200).json({
      success: true,
      message: 'Account linking is handled in the OAuth callback',
    });
  } catch (error) {
    console.error('Error in link endpoint:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Test OAuth endpoint (for development)
router.post('/roblox/test', async (req, res, _next) => {
  try {
    const { discordId, oauthCode, state, redirectUri } = req.body;

    console.info('Test OAuth request', {
      discordId,
      hasOauthCode: !!oauthCode,
      state,
      hasRedirectUri: !!redirectUri,
    });

    res.status(200).json({
      success: true,
      message: 'Test OAuth endpoint reached',
      data: {
        discordId,
        hasOauthCode: !!oauthCode,
        state,
        hasRedirectUri: !!redirectUri,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
