import { PrismaClient } from '@bloxtr8/database';
import { Router, type Router as ExpressRouter } from 'express';

import { AppError } from '../middleware/errorHandler.js';

const router: ExpressRouter = Router();
const prisma = new PrismaClient();

router.get('/users/account/:id', async (req, res, next) => {
  try{
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
router.get('/users/verify/:discordId', async (req, res, next) => {
  try {
    const { discordId } = req.params;

    if (
      !discordId ||
      typeof discordId !== 'string' ||
      discordId.trim() === ''
    ) {
      throw new AppError(
        'Discord ID is required and must be a non-empty string',
        400
      );
    }

    const user = await prisma.user.findFirst({
      where: {
        accounts: {
          some: {
            accountId: discordId,
            providerId: "discord",
          }
        }
      }
    });
  

    if (!user) {
      // Return empty array if user not found
      return res.status(204).json([]);
    }
    
    const accounts = await prisma.account.findMany({
      where: {
        userId: user.id,
      },
      select:{
        accountId:true,
        providerId:true,
      }
    });
      
    

    res.status(200).json(accounts);
  } catch (error) {
    console.error(error)
    next(error);
  }
});

router.post('/users/ensure', async (req, res, next) => {
  try {
    const { discordId, username } = req.body;

    if (!discordId || !username) {
      throw new AppError('Discord ID and username are required', 400);
    }

    // Try to find existing user
    let user = await prisma.user.findUnique({
      where: { discordId },
      select: {
        id: true,
        discordId: true,
        username: true,
        kycVerified: true,
        kycTier: true,
      },
    });

    // Create user if they don't exist
    if (!user) {
      user = await prisma.user.create({
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
    }

    res.status(200).json(user);
  } catch (error) {
    next(error);
  }
});



export default router;
