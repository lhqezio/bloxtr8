import { PrismaClient } from '@bloxtr8/database';
import { Router, type Router as ExpressRouter } from 'express';
import rateLimit from 'express-rate-limit';

import {
  validateDiscordUser,
  validateOAuthState,
} from '../lib/discord-verification.js';
import { validateRobloxOAuth } from '../lib/roblox-oauth.js';
import { AppError } from '../middleware/errorHandler.js';

const router: ExpressRouter = Router();
const prisma = new PrismaClient();

router.get('/users/account/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const info = await prisma.user.findUnique({
      where: { id },
    });

    if (!info) {
      throw new AppError('User not found', 404);
    }

    res.status(200).json(info);
  } catch (error) {
    console.error(error);
    next(error);
  }
});
// User verification endpoints
router.get('/users/verify/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string' || id.trim() === '') {
      throw new AppError(
        'Account ID is required and must be a non-empty string',
        400
      );
    }

    const user = await prisma.user.findFirst({
      where: {
        accounts: {
          some: {
            accountId: id,
            providerId: 'discord',
          },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        kycVerified: true,
        kycTier: true,
        accounts: {
          where: {
            providerId: 'discord',
          },
          select: {
            accountId: true,
          },
        },
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    res.status(200).json(user);
  } catch (error) {
    console.error(error);
    next(error);
  }
});

// Account listing endpoint for Discord bot verify command
router.get('/users/accounts/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string' || id.trim() === '') {
      throw new AppError(
        'Account ID is required and must be a non-empty string',
        400
      );
    }

    const user = await prisma.user.findFirst({
      where: {
        accounts: {
          some: {
            accountId: id,
          },
        },
      },
    });

    if (!user) {
      // Return empty array if user not found
      return res.status(200).json([]);
    }

    const accounts = await prisma.account.findMany({
      where: {
        userId: user.id,
      },
      select: {
        accountId: true,
        providerId: true,
      },
    });

    res.status(200).json(accounts);
  } catch (error) {
    console.error(error);
    next(error);
  }
});

router.post('/users/ensure', async (req, res, next) => {
  try {
    const { discordId, username } = req.body;

    if (!discordId || !username) {
      throw new AppError('Discord ID and username are required', 400);
    }

    // Try to find existing user by Discord account relation
    let user = await prisma.user.findFirst({
      where: {
        accounts: {
          some: {
            accountId: discordId,
            providerId: 'discord',
          },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        kycVerified: true,
        kycTier: true,
        accounts: {
          where: {
            providerId: 'discord',
          },
          select: {
            accountId: true,
          },
        },
      },
    });

    // Create user if they don't exist at all
    if (!user) {
      // Use transaction to ensure both user and account are created atomically
      const result = await prisma.$transaction(async tx => {
        // Create user with placeholder email
        const newUser = await tx.user.create({
          data: {
            name: username,
            email: `${discordId}@discord.example`, // Placeholder email for Discord users
            kycVerified: false, // Default to unverified
            kycTier: 'TIER_1', // Default tier
          },
          select: {
            id: true,
            name: true,
            email: true,
            kycVerified: true,
            kycTier: true,
          },
        });

        // Create linked Discord account record
        await tx.account.create({
          data: {
            id: `discord_${discordId}`,
            accountId: discordId,
            providerId: 'discord',
            userId: newUser.id,
          },
        });

        return {
          ...newUser,
          accounts: [{ accountId: discordId }],
        };
      });

      user = result;
    }

    res.status(200).json(user);
  } catch (error) {
    next(error);
  }
});

// Account linking endpoint
router.post('/users/link-account', async (req, res, next) => {
  try {
    const { userId, providerId, accountId } = req.body;

    if (!userId || !providerId || !accountId) {
      throw new AppError(
        'User ID, provider ID, and account ID are required',
        400
      );
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Check if account is already linked
    const existingAccount = await prisma.account.findFirst({
      where: {
        userId,
        providerId,
        accountId,
      },
    });

    if (existingAccount) {
      return res.status(200).json({
        success: true,
        message: 'Account already linked',
        account: existingAccount,
      });
    }

    // Create new account link
    const newAccount = await prisma.account.create({
      data: {
        id: `${providerId}_${accountId}`,
        accountId,
        providerId,
        userId,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Account linked successfully',
      account: newAccount,
    });
  } catch (error) {
    console.error('Error linking account:', error);
    next(error);
  }
});

// Get user's linked accounts
router.get('/users/:userId/accounts', async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      throw new AppError('User ID is required', 400);
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        accounts: {
          select: {
            id: true,
            accountId: true,
            providerId: true,
            createdAt: true,
          },
        },
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    res.status(200).json({
      success: true,
      accounts: user.accounts,
    });
  } catch (error) {
    console.error('Error fetching user accounts:', error);
    next(error);
  }
});

// Rate limiting for account linking
const linkAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 linking attempts per windowMs
  message: 'Too many account linking attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Handle Roblox OAuth callback for Discord users with proper validation
router.post(
  '/users/link-roblox-discord',
  linkAccountLimiter,
  async (req, res, next) => {
    try {
      const { discordId, oauthCode, state, redirectUri } = req.body;

      if (!discordId || !oauthCode || !state || !redirectUri) {
        throw new AppError(
          'Discord ID, OAuth code, state, and redirect URI are required',
          400
        );
      }

      // Validate state parameter to prevent CSRF
      if (!validateOAuthState(state, discordId)) {
        throw new AppError('Invalid or expired state parameter', 400);
      }

      // Verify Discord user exists
      console.log('Validating Discord user:', discordId);
      const discordUserExists = await validateDiscordUser(discordId);
      if (!discordUserExists) {
        console.log('Discord user validation failed for:', discordId);
        throw new AppError('Discord user not found or invalid', 404);
      }

      // Validate OAuth code with Roblox API and get real Roblox user ID
      console.log(
        'Validating Roblox OAuth code:',
        oauthCode,
        'with redirect URI:',
        redirectUri
      );
      const robloxUserId = await validateRobloxOAuth(oauthCode, redirectUri);
      console.log('Roblox user ID obtained:', robloxUserId);

      // Find the user by Discord account
      const user = await prisma.user.findFirst({
        where: {
          accounts: {
            some: {
              accountId: discordId,
              providerId: 'discord',
            },
          },
        },
      });

      if (!user) {
        throw new AppError('User not found', 404);
      }

      // Check if Roblox account is already linked
      const existingRobloxAccount = await prisma.account.findFirst({
        where: {
          userId: user.id,
          providerId: 'roblox',
        },
      });

      if (existingRobloxAccount) {
        return res.status(200).json({
          success: true,
          message: 'Roblox account already linked',
          account: existingRobloxAccount,
        });
      }

      // Create Roblox account link with verified user ID
      const robloxAccount = await prisma.account.create({
        data: {
          id: `roblox_${robloxUserId}`,
          accountId: robloxUserId,
          providerId: 'roblox',
          userId: user.id,
        },
      });

      res.status(201).json({
        success: true,
        message: 'Roblox account linked successfully',
        account: robloxAccount,
      });
    } catch (error) {
      console.error('Error linking Roblox account for Discord user:', error);
      next(error);
    }
  }
);

// Generate Roblox OAuth URL
router.post('/users/roblox-oauth-url', async (req, res, next) => {
  try {
    const { redirectUri, state } = req.body;

    console.log('Generating OAuth URL with:', { redirectUri, state });

    if (!redirectUri) {
      throw new AppError('Redirect URI is required', 400);
    }

    const clientId = process.env.ROBLOX_CLIENT_ID;
    if (!clientId) {
      console.error('ROBLOX_CLIENT_ID not found in environment variables');
      throw new AppError('Roblox OAuth not configured', 500);
    }

    console.log('Using client ID:', clientId);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid',
    });

    if (state) {
      params.append('state', state);
    }

    const authUrl = `https://authorize.roblox.com/v1/authorize?${params.toString()}`;

    console.log('Generated OAuth URL:', authUrl);

    res.status(200).json({
      success: true,
      authUrl,
      debug: {
        clientId,
        redirectUri,
        hasState: !!state,
      },
    });
  } catch (error) {
    console.error('Error generating OAuth URL:', error);
    next(error);
  }
});

// Test endpoint to debug OAuth flow
router.post('/users/test-oauth', async (req, res, _next) => {
  try {
    const { discordId, oauthCode, state, redirectUri } = req.body;

    console.log('Test OAuth request received:', {
      discordId,
      oauthCode: oauthCode ? 'present' : 'missing',
      state,
      redirectUri,
    });

    // Test state validation
    const stateValid = validateOAuthState(state, discordId);
    console.log('State validation result:', stateValid);

    // Test Discord user validation
    const discordValid = await validateDiscordUser(discordId);
    console.log('Discord validation result:', discordValid);

    res.status(200).json({
      success: true,
      message: 'Test completed',
      results: {
        stateValid,
        discordValid,
        hasOAuthCode: !!oauthCode,
        hasRedirectUri: !!redirectUri,
      },
    });
  } catch (error) {
    console.error('Test OAuth error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
