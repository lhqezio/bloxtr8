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

// DO NOT CREATE A DISCORD USER IMPLICITLY, THE USER HAS TO HAVE A BLOXTR8 ACCOUNT FIRST
// GET /api/users/accounts/:id instead ( The method above ) to see if a user already exist with said Discord id
// router.post('/users/ensure', async (req, res, next) => {
//   try {
//     const { discordId, username } = req.body;

//     if (!discordId || !username) {
//       throw new AppError('Discord ID and username are required', 400);
//     }

//     // Try to find existing user by Discord account relation
//     let user = await prisma.user.findFirst({
//       where: {
//         accounts: {
//           some: {
//             accountId: discordId,
//             providerId: 'discord',
//           },
//         },
//       },
//       select: {
//         id: true,
//         name: true,
//         email: true,
//         kycVerified: true,
//         kycTier: true,
//         accounts: {
//           where: {
//             providerId: 'discord',
//           },
//           select: {
//             accountId: true,
//           },
//         },
//       },
//     });

//     // Create user if they don't exist at all
//     if (!user) {
//       // Use transaction to ensure both user and account are created atomically
//       const result = await prisma.$transaction(async tx => {
//         // Create user with placeholder email
//         const newUser = await tx.user.create({
//           data: {
//             name: username,
//             email: `${discordId}@discord.example`, // Placeholder email for Discord users
//             kycVerified: false, // Default to unverified
//             kycTier: 'TIER_1', // Default tier
//           },
//           select: {
//             id: true,
//             name: true,
//             email: true,
//             kycVerified: true,
//             kycTier: true,
//           },
//         });

//         // Create linked Discord account record
//         await tx.account.create({
//           data: {
//             id: `discord_${discordId}`,
//             accountId: discordId,
//             providerId: 'discord',
//             userId: newUser.id,
//           },
//         });

//         return {
//           ...newUser,
//           accounts: [{ accountId: discordId }],
//         };
//       });

//       user = result;
//     }

//     res.status(200).json(user);
//   } catch (error) {
//     next(error);
//   }
// });



// Test endpoint to debug OAuth flow

export default router;
