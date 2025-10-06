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

// Get all listings endpoint with pagination and filtering
router.get('/listings', async (req, res, next) => {
  try {
    // Parse query parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50); // Max 50 per page
    const status = req.query.status as string;
    const category = req.query.category as string;
    const userId = req.query.userId as string;

    // Validate pagination parameters
    if (page < 1) {
      throw new AppError('Page must be a positive integer', 400);
    }
    if (limit < 1 || limit > 50) {
      throw new AppError('Limit must be between 1 and 50', 400);
    }

    // Build where clause for filtering
    const whereClause: any = {};
    if (status) {
      whereClause.status = status;
    }
    if (category) {
      whereClause.category = category;
    }
    if (userId) {
      whereClause.userId = userId;
    }

    // Query listings with pagination
    const [listings, total] = await Promise.all([
      prisma.listing.findMany({
        where: whereClause,
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
          user: {
            select: {
              name: true,
              email: true,
            },
          },
          guild: {
            select: {
              name: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.listing.count({ where: whereClause }),
    ]);

    // Calculate pagination info
    const totalPages = Math.ceil(total / limit);

    // Return listings with pagination metadata
    res.status(200).json({
      listings,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
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
