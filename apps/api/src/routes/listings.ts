import { prisma } from '@bloxtr8/database';
import { Router, type Router as ExpressRouter } from 'express';

import { AppError } from '../middleware/errorHandler.js';
import { createListingSchema } from '../schemas/index.js';
import { serializeBigInt } from '../utils/bigint.js';

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

    const {
      title,
      summary,
      price,
      category,
      sellerId,
      guildId,
      visibility,
      messageId,
      channelId,
      priceRange,
    } = validationResult.data;

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

    // Insert listing with sellerId and message info
    const listing = await prisma.listing.create({
      data: {
        title,
        summary,
        price,
        category,
        userId: sellerId,
        guildId: internalGuildId,
        visibility: visibility || 'PUBLIC',
        messageId: messageId || null,
        channelId: channelId || null,
        priceRange: priceRange || null,
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
    const visibility = req.query.visibility as string;
    const priceRange = req.query.priceRange as string;
    const guildId = req.query.guildId as string;

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
    if (priceRange) {
      whereClause.priceRange = priceRange;
    }

    // Handle visibility filtering
    // If no guildId provided, only show PUBLIC listings
    // If guildId provided, show PUBLIC + PRIVATE listings from that guild
    if (guildId) {
      // Find guild's internal ID
      const guild = await prisma.guild.findUnique({
        where: { discordId: guildId },
        select: { id: true },
      });

      if (guild) {
        whereClause.OR = [
          { visibility: 'PUBLIC' },
          { AND: [{ visibility: 'PRIVATE' }, { guildId: guild.id }] },
        ];
      } else {
        // Guild not found, only show PUBLIC
        whereClause.visibility = 'PUBLIC';
      }
    } else if (visibility) {
      whereClause.visibility = visibility;
    } else {
      // Default: only show PUBLIC listings
      whereClause.visibility = 'PUBLIC';
    }

    // Calculate skip for pagination
    const skip = (page - 1) * limit;

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
          visibility: true,
          messageId: true,
          channelId: true,
          priceRange: true,
          createdAt: true,
          updatedAt: true,
          userId: true,
          guildId: true,
          user: {
            select: {
              name: true,
              kycTier: true,
              kycVerified: true,
            },
          },
          guild: {
            select: {
              name: true,
              discordId: true,
            },
          },
          robloxSnapshots: {
            select: {
              gameName: true,
              gameDescription: true,
              thumbnailUrl: true,
              playerCount: true,
              visits: true,
              verifiedOwnership: true,
            },
            take: 1, // Only get the first snapshot
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      prisma.listing.count({ where: whereClause }),
    ]);

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);
    const hasPrev = page > 1;
    const hasNext = page < totalPages;

    // Return paginated results with BigInt serialization
    res.status(200).json(
      serializeBigInt({
        listings,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasPrev,
          hasNext,
        },
      })
    );
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
        visibility: true,
        messageId: true,
        channelId: true,
        priceRange: true,
        createdAt: true,
        updatedAt: true,
        userId: true,
        guildId: true,
        user: {
          select: {
            name: true,
            kycTier: true,
            kycVerified: true,
          },
        },
        guild: {
          select: {
            name: true,
            discordId: true,
          },
        },
        robloxSnapshots: {
          select: {
            gameName: true,
            gameDescription: true,
            thumbnailUrl: true,
            playerCount: true,
            visits: true,
            verifiedOwnership: true,
          },
        },
      },
    });

    // Return 404 if listing not found
    if (!listing) {
      throw new AppError('Listing not found', 404);
    }

    // Return listing data with BigInt serialization
    res.status(200).json(serializeBigInt(listing));
  } catch (error) {
    next(error);
  }
});

// Update listing message information
router.patch('/listings/:id/message', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { messageId, channelId, priceRange } = req.body;

    // Validate ID parameter
    if (!id || typeof id !== 'string' || id.trim() === '') {
      throw new AppError(
        'Listing ID is required and must be a non-empty string',
        400
      );
    }

    // Check if listing exists
    const listing = await prisma.listing.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!listing) {
      throw new AppError('Listing not found', 404);
    }

    // Update message information
    await prisma.listing.update({
      where: { id },
      data: {
        messageId: messageId || null,
        channelId: channelId || null,
        priceRange: priceRange || null,
        updatedAt: new Date(),
      },
    });

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
