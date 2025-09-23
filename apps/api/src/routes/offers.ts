import { PrismaClient } from '@bloxtr8/database';
import { Router, type Router as ExpressRouter } from 'express';

import { AppError } from '../middleware/errorHandler.js';
import { createOfferSchema } from '../schemas/index.js';

const router: ExpressRouter = Router();
const prisma = new PrismaClient();

// Create offer endpoint
router.post('/offers', async (req, res, next) => {
  try {
    // Validate payload with zod
    const validationResult = createOfferSchema.safeParse(req.body);

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

    const { listingId, buyerId, amount, conditions, expiry } =
      validationResult.data;

    // First, validate that the listing exists and is active
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        status: true,
        price: true,
        userId: true, // seller ID
      },
    });

    if (!listing) {
      throw new AppError('Listing not found', 404);
    }

    // Cannot offer on closed/sold listings
    if (listing.status !== 'ACTIVE') {
      throw new AppError('Cannot offer on closed listing', 400);
    }

    // Optional: Validate that buyer is not the seller
    if (buyerId === listing.userId) {
      throw new AppError('Cannot offer on your own listing', 400);
    }

    // Optional: Validate offer amount <= listing price (as per requirements)
    // This is optional according to the requirements, but we'll implement it
    if (amount > listing.price) {
      throw new AppError('Offer amount cannot exceed listing price', 400);
    }

    // Set default expiry to 7 days from now if not provided
    const expiryDate = expiry
      ? new Date(expiry)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Create the offer
    const offer = await prisma.offer.create({
      data: {
        listingId,
        buyerId,
        sellerId: listing.userId,
        amount,
        conditions: conditions || null,
        expiry: expiryDate,
        status: 'PENDING',
      },
    });

    // Return offer id
    res.status(201).json({
      id: offer.id,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
