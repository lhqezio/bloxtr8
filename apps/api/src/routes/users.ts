import { PrismaClient } from '@bloxtr8/database';
import { Router, type Router as ExpressRouter } from 'express';

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
          },
        },
      },
      select: {
        id: true,
        discordId: true,
        username: true,
        kycVerified: true,
        kycTier: true,
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

    // Try to find existing user by Discord account relation first
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
        discordId: true,
        username: true,
        kycVerified: true,
        kycTier: true,
      },
    });

    // If not found via account relation, try direct discordId lookup
    // This handles existing users without account records
    if (!user) {
      user = await prisma.user.findUnique({
        where: {
          discordId,
        },
        select: {
          id: true,
          discordId: true,
          username: true,
          kycVerified: true,
          kycTier: true,
        },
      });

      // If user exists but has no account record, create the account record
      if (user) {
        await prisma.account.create({
          data: {
            id: `discord_${discordId}`,
            accountId: discordId,
            providerId: 'discord',
            userId: user.id,
          },
        });
      }
    }

    // Create user if they don't exist at all
    if (!user) {
      // Use transaction to ensure both user and account are created atomically
      const result = await prisma.$transaction(async tx => {
        // Create user with placeholder email
        const newUser = await tx.user.create({
          data: {
            discordId,
            username,
            email: `${discordId}@discord.example`, // Placeholder email for Discord users
            kycVerified: false, // Default to unverified
            kycTier: 'TIER_1', // Default tier
          },
          select: {
            id: true,
            discordId: true,
            username: true,
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

        return newUser;
      });

      user = result;
    }

    res.status(200).json(user);
  } catch (error) {
    next(error);
  }
});

export default router;
