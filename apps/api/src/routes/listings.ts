import { prisma } from '@bloxtr8/database';
import { Router, type Router as ExpressRouter } from 'express';

import { AppError } from '../middleware/errorHandler.js';
import { createListingSchema } from '../schemas/index.js';

const router: ExpressRouter = Router();

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

    // Guild validation is optional - don't require guild for listings
    let internalGuildId = null;
    if (guildId) {
      const guild = await prisma.guild.findUnique({
        where: { discordId: guildId },
        select: { id: true },
      });

      // If guild exists, use it; otherwise just skip guild association
      if (guild) {
        internalGuildId = guild.id;
      }
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

export default router;
