import { PrismaClient } from '@bloxtr8/database';
import { createPresignedPutUrl, createPresignedGetUrl } from '@bloxtr8/storage';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';

import { AppError } from '../middleware/errorHandler.js';

const router: ExpressRouter = Router();
const prisma = new PrismaClient();

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

    const user = await prisma.user.findUnique({
      where: { discordId },
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

// Zod schema for listing creation
const createListingSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(255, 'Title must be less than 255 characters'),
  summary: z
    .string()
    .min(1, 'Summary is required')
    .max(1000, 'Summary must be less than 1000 characters'),
  price: z.number().int().positive('Price must be a positive integer'),
  category: z
    .string()
    .min(1, 'Category is required')
    .max(100, 'Category must be less than 100 characters'),
  sellerId: z.string().min(1, 'Seller ID is required'),
  guildId: z.string().optional(),
});

// Create listing endpoint
router.post('/listings', async (req, res, next) => {
  try {
    // Validate payload with zod
    const validationResult = createListingSchema.safeParse(req.body);

    if (!validationResult.success) {
      const errors = validationResult.error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
      }));

      throw new AppError(
        `Validation failed: ${errors.map(e => `${e.field}: ${e.message}`).join(', ')}`,
        400
      );
    }

    const { title, summary, price, category, sellerId, guildId } =
      validationResult.data;

    // Look up guild by discordId if guildId is provided
    let internalGuildId = null;
    if (guildId) {
      const guild = await prisma.guild.findUnique({
        where: { discordId: guildId },
        select: { id: true },
      });

      if (!guild) {
        return res.status(400).json({
          message: 'Invalid guild ID provided',
        });
      }

      internalGuildId = guild.id;
    }

    // Insert listing with sellerId
    const listing = await prisma.listing.create({
      data: {
        title,
        summary,
        price,
        category,
        userId: sellerId,
        guildId: internalGuildId,
      },
    });

    // Return listing id
    res.status(201).json({
      id: listing.id,
    });
  } catch (error) {
    next(error);
  }
});

// Get listing by ID endpoint
router.get('/listings/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validate ID parameter
    if (!id || typeof id !== 'string' || id.trim() === '') {
      throw new AppError(
        'Listing ID is required and must be a non-empty string',
        400
      );
    }

    // Query listing by ID
    const listing = await prisma.listing.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        summary: true,
        price: true,
        category: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        userId: true,
        guildId: true,
      },
    });

    // Return 404 if listing not found
    if (!listing) {
      throw new AppError('Listing not found', 404);
    }

    // Return listing data
    res.status(200).json(listing);
  } catch (error) {
    next(error);
  }
});

// PDF upload endpoint - returns presigned PUT URL
router.post('/contracts/:id/upload', async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string' || id.trim() === '') {
      throw new AppError(
        'Contract ID is required and must be a non-empty string',
        400
      );
    }

    const key = `contracts/${id}.pdf`;
    const presignedUrl = await createPresignedPutUrl(key);

    res.json({
      uploadUrl: presignedUrl,
      key,
      expiresIn: 900, // 15 minutes
    });
  } catch (error) {
    next(error);
  }
});

// PDF download endpoint - returns presigned GET URL
router.get('/contracts/:id/pdf', async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string' || id.trim() === '') {
      throw new AppError(
        'Contract ID is required and must be a non-empty string',
        400
      );
    }

    const key = `contracts/${id}.pdf`;
    const presignedUrl = await createPresignedGetUrl(key);

    res.json({
      downloadUrl: presignedUrl,
      key,
      expiresIn: 3600, // 1 hour
    });
  } catch (error) {
    next(error);
  }
});

export default router;
