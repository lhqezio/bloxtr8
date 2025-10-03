import crypto from 'crypto';

import { prisma } from '@bloxtr8/database';
import { Router, type Router as ExpressRouter } from 'express';

import { RobloxApiClient } from '../lib/roblox-api.js';
import { AppError } from '../middleware/errorHandler.js';

const router: ExpressRouter = Router();

// Get user account by ID
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
          select: {
            accountId: true,
            providerId: true,
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

    // Try to get Discord user info from Discord API
    let discordUserInfo = null;
    try {
      const discordResponse = await fetch(
        `https://discord.com/api/v10/users/${id}`,
        {
          headers: {
            Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
          },
        }
      );

      if (discordResponse.ok) {
        discordUserInfo = await discordResponse.json();
      }
    } catch (discordError) {
      console.warn('Failed to fetch Discord user info:', discordError);
    }

    // Try to get Roblox user info if Roblox account is linked
    let robloxUserInfo = null;
    const robloxAccount = accounts.find(acc => acc.providerId === 'roblox');
    if (robloxAccount) {
      try {
        const robloxResponse = await fetch(
          `https://users.roblox.com/v1/users/${robloxAccount.accountId}`
        );
        if (robloxResponse.ok) {
          robloxUserInfo = await robloxResponse.json();
        }
      } catch (robloxError) {
        console.warn('Failed to fetch Roblox user info:', robloxError);
      }
    }

    const response = {
      user,
      accounts,
      discordUserInfo,
      robloxUserInfo,
    };

    res.status(200).json(response);
  } catch (error) {
    console.error(error);
    next(error);
  }
});

// Generate link token for Discord user
router.post('/users/link-token', async (req, res, next) => {
  try {
    const { discordId, purpose = 'roblox_link' } = req.body;

    if (!discordId) {
      throw new AppError('Discord ID is required', 400);
    }

    // Check if user exists
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
      throw new AppError('User not found. Please sign up first.', 404);
    }

    // Clean up any existing tokens for this user and purpose
    await prisma.linkToken.deleteMany({
      where: {
        discordId: String(discordId),
        purpose,
      },
    });

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Create token
    const linkToken = await prisma.linkToken.create({
      data: {
        token,
        discordId: String(discordId),
        purpose,
        expiresAt,
      },
    });

    res.status(201).json({
      success: true,
      token: linkToken.token,
      expiresAt: linkToken.expiresAt,
      expiresIn: 15 * 60, // 15 minutes in seconds
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
});

// Validate and consume link token
router.get('/users/link-token/:token', async (req, res, next) => {
  try {
    const { token } = req.params;

    if (!token) {
      throw new AppError('Token is required', 400);
    }

    // Find token
    const linkToken = await prisma.linkToken.findUnique({
      where: { token },
    });

    if (!linkToken) {
      throw new AppError('Invalid or expired token', 404);
    }

    // Check if token is expired
    if (linkToken.expiresAt < new Date()) {
      // Clean up expired token
      await prisma.linkToken.delete({
        where: { id: linkToken.id },
      });
      throw new AppError('Token has expired', 410);
    }

    // Check if token is already used
    if (linkToken.used) {
      throw new AppError('Token has already been used', 410);
    }

    // Get user data
    const user = await prisma.user.findFirst({
      where: {
        accounts: {
          some: {
            accountId: linkToken.discordId,
            providerId: 'discord',
          },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        accounts: {
          select: {
            accountId: true,
            providerId: true,
          },
        },
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    res.status(200).json({
      success: true,
      token: linkToken.token,
      discordId: linkToken.discordId,
      purpose: linkToken.purpose,
      expiresAt: linkToken.expiresAt,
      user,
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
});

// Mark token as used
router.post('/users/link-token/:token/use', async (req, res, next) => {
  try {
    const { token } = req.params;

    if (!token) {
      throw new AppError('Token is required', 400);
    }

    // Find and update token
    const linkToken = await prisma.linkToken.update({
      where: { token },
      data: { used: true },
    });

    if (!linkToken) {
      throw new AppError('Token not found', 404);
    }

    res.status(200).json({
      success: true,
      message: 'Token marked as used',
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
});

// Ensure user exists (create if not)
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
          select: {
            accountId: true,
            providerId: true,
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
            kycTier: 'TIER_0', // Default tier - no Roblox account linked yet
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

        // Fetch all accounts for the new user to include any existing Roblox accounts
        const allAccounts = await tx.account.findMany({
          where: { userId: newUser.id },
          select: {
            accountId: true,
            providerId: true,
          },
        });

        return {
          ...newUser,
          accounts: allAccounts,
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

    // Create new account link and upgrade tier atomically
    // All checks now happen inside transaction to prevent race conditions
    const result = await prisma.$transaction(async tx => {
      // Check if account is already linked to this user (inside transaction)
      const existingAccount = await tx.account.findFirst({
        where: {
          userId,
          providerId,
          accountId,
        },
      });

      if (existingAccount) {
        // Even if account is already linked, check if user needs tier upgrade
        // This fixes cases where users were stuck at TIER_0
        if (providerId === 'roblox') {
          const currentUser = await tx.user.findUnique({
            where: { id: userId },
            select: { kycTier: true },
          });

          if (currentUser?.kycTier === 'TIER_0') {
            await tx.user.update({
              where: { id: userId },
              data: { kycTier: 'TIER_1' },
            });
            console.info(
              'Upgraded user KYC tier from TIER_0 to TIER_1 (existing account)',
              {
                userId,
                providerId,
              }
            );
          }
        }

        // Fetch updated user information to include in response
        const updatedUser = await tx.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            name: true,
            email: true,
            kycVerified: true,
            kycTier: true,
          },
        });

        return {
          account: existingAccount,
          user: updatedUser,
          alreadyLinked: true,
        };
      }

      // Check if account is linked to a different user (inside transaction)
      if (providerId === 'roblox') {
        const existingRobloxUser = await tx.user.findFirst({
          where: {
            accounts: {
              some: {
                accountId,
                providerId: 'roblox',
              },
            },
          },
          select: { id: true },
        });

        if (existingRobloxUser && existingRobloxUser.id !== userId) {
          console.warn('Roblox account linked to different user', {
            userId,
            accountId,
          });
          // Throw error to signal conflict
          throw new AppError(
            'Roblox account is already linked to another user',
            409
          );
        }
      }

      // Create the account link
      const account = await tx.account.create({
        data: {
          id: `${providerId}_${accountId}`,
          accountId,
          providerId,
          userId,
        },
      });

      // Check tier inside transaction to avoid race condition
      if (providerId === 'roblox') {
        const currentUser = await tx.user.findUnique({
          where: { id: userId },
          select: { kycTier: true },
        });

        // Automatically upgrade user from TIER_0 to TIER_1 when they link Roblox account
        if (currentUser?.kycTier === 'TIER_0') {
          await tx.user.update({
            where: { id: userId },
            data: { kycTier: 'TIER_1' },
          });
          console.info('Upgraded user KYC tier from TIER_0 to TIER_1', {
            userId,
            providerId,
          });
        }
      }

      // Fetch updated user information to include in response
      const updatedUser = await tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          kycVerified: true,
          kycTier: true,
        },
      });

      return { account, user: updatedUser, alreadyLinked: false };
    });

    // Return appropriate status and message based on whether account was already linked
    res.status(result.alreadyLinked ? 200 : 201).json({
      success: true,
      message: result.alreadyLinked
        ? 'Account already linked'
        : 'Account linked successfully',
      account: result.account,
      user: result.user,
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

// Get user's Roblox experiences
router.get('/users/:userId/experiences', async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      throw new AppError('User ID is required', 400);
    }

    // Find user and their Roblox account
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        accounts: {
          where: { providerId: 'roblox' },
          select: {
            accountId: true,
            providerId: true,
          },
        },
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    const robloxAccount = user.accounts.find(
      acc => acc.providerId === 'roblox'
    );
    if (!robloxAccount) {
      throw new AppError('User has no linked Roblox account', 400);
    }

    // Initialize Roblox API client
    const robloxApi = new RobloxApiClient({
      clientId: process.env.ROBLOX_CLIENT_ID || '',
      clientSecret: process.env.ROBLOX_CLIENT_SECRET || '',
      baseUrl: 'https://apis.roblox.com',
      rateLimitDelay: 1000,
    });

    // Fetch user's experiences
    const experiences = await robloxApi.getUserExperiences(
      robloxAccount.accountId
    );

    res.status(200).json({
      success: true,
      experiences,
    });
  } catch (error) {
    console.error('Error fetching user experiences:', error);
    next(error);
  }
});

export default router;
