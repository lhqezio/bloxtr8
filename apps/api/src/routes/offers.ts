import { prisma } from '@bloxtr8/database';
import { Router, type Router as ExpressRouter } from 'express';

import { GameVerificationService } from '../lib/asset-verification.js';
import { isDebugMode } from '../lib/env-validation.js';
import { emitOfferEvent, OfferEventType } from '../lib/events.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  counterOfferSchema,
  createOfferSchema,
  offerActionSchema,
} from '../schemas/index.js';

const router: ExpressRouter = Router();
const gameVerificationService = new GameVerificationService(prisma);

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

    // Validate that buyer is not the seller
    if (buyerId === listing.userId) {
      const debugMode = isDebugMode();
      if (debugMode) {
        console.warn(
          `🔧 DEBUG MODE: Allowing user ${buyerId} to offer on their own listing ${listingId}`
        );
      } else {
        throw new AppError('Cannot offer on your own listing', 400);
      }
    }

    // Validate listing has verified Roblox snapshot
    const verifiedSnapshot = await prisma.robloxSnapshot.findFirst({
      where: {
        listingId,
        verifiedOwnership: true,
      },
    });

    if (!verifiedSnapshot) {
      throw new AppError(
        'Listing must have a verified Roblox asset to accept offers',
        400
      );
    }

    // Validate buyer has linked Roblox account (TIER_1+)
    const buyer = await prisma.user.findUnique({
      where: { id: buyerId },
      select: { kycTier: true },
    });

    if (!buyer) {
      throw new AppError('Buyer not found', 404);
    }

    if (buyer.kycTier === 'TIER_0') {
      throw new AppError(
        'Must link Roblox account to make offers. Use /link command in Discord.',
        400
      );
    }

    // Validate offer amount <= listing price
    // Note: This prevents offers above asking price. Remove this check if you want to allow
    // buyers to offer more than the listing price (e.g., in competitive bidding scenarios)
    // Compare as BigInt to avoid precision loss
    const listingPriceBigInt =
      typeof listing.price === 'bigint' ? listing.price : BigInt(listing.price);
    if (amount > listingPriceBigInt) {
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

    // Create audit log
    await prisma.auditLog.create({
      data: {
        action: 'OFFER_CREATED',
        userId: buyerId,
        details: {
          offerId: offer.id,
          listingId,
          amount: amount.toString(),
          conditions,
        },
      },
    });

    // Emit event for Discord notification
    emitOfferEvent({
      type: OfferEventType.CREATED,
      offerId: offer.id,
      listingId,
      buyerId,
      sellerId: listing.userId,
      amount,
      conditions: conditions || undefined,
      timestamp: new Date(),
    });

    // Return offer id
    res.status(201).json({
      id: offer.id,
    });
  } catch (error) {
    next(error);
  }
});

// Accept offer endpoint
router.patch('/offers/:id/accept', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validate userId from request body
    const validationResult = offerActionSchema.safeParse(req.body);
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

    const { userId } = validationResult.data;

    // Get offer with listing details
    const offer = await prisma.offer.findUnique({
      where: { id },
      include: {
        listing: {
          select: {
            id: true,
            userId: true,
            status: true,
          },
        },
      },
    });

    if (!offer) {
      throw new AppError('Offer not found', 404);
    }

    // Verify user is the seller
    if (offer.sellerId !== userId) {
      throw new AppError('Only the seller can accept offers', 403);
    }

    // Cannot accept already processed offers
    if (offer.status !== 'PENDING') {
      throw new AppError(
        `Cannot accept offer with status: ${offer.status}`,
        400
      );
    }

    // Check if offer has expired
    if (offer.expiry < new Date()) {
      await prisma.offer.update({
        where: { id },
        data: { status: 'EXPIRED' },
      });
      throw new AppError('Offer has expired', 400);
    }

    // Verify seller still has linked Roblox account
    const seller = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        accounts: {
          where: { providerId: 'roblox' },
        },
      },
    });

    if (!seller || seller.accounts.length === 0) {
      await prisma.auditLog.create({
        data: {
          action: 'OFFER_ACCEPT_FAILED',
          userId,
          details: {
            offerId: id,
            listingId: offer.listingId,
            reason: 'Seller Roblox account not linked',
          },
        },
      });
      throw new AppError(
        'Seller must have a linked Roblox account to accept offers',
        403
      );
    }

    // Re-verify asset ownership
    const verificationResult =
      await gameVerificationService.reverifyAssetOwnership(offer.listingId);

    if (!verificationResult.verified) {
      throw new AppError(
        verificationResult.error || 'Asset verification failed',
        400
      );
    }

    // Update offer status
    const updatedOffer = await prisma.offer.update({
      where: { id },
      data: { status: 'ACCEPTED' },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        action: 'OFFER_ACCEPTED',
        userId,
        details: {
          offerId: id,
          listingId: offer.listingId,
          buyerId: offer.buyerId,
          amount: offer.amount.toString(),
          verificationResult,
        },
      },
    });

    // Emit event for Discord notification
    emitOfferEvent({
      type: OfferEventType.ACCEPTED,
      offerId: id,
      listingId: offer.listingId,
      buyerId: offer.buyerId,
      sellerId: offer.sellerId,
      amount: offer.amount,
      timestamp: new Date(),
    });

    res.status(200).json({
      success: true,
      offer: {
        id: updatedOffer.id,
        status: updatedOffer.status,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Decline offer endpoint
router.patch('/offers/:id/decline', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validate userId from request body
    const validationResult = offerActionSchema.safeParse(req.body);
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

    const { userId } = validationResult.data;

    // Get offer
    const offer = await prisma.offer.findUnique({
      where: { id },
    });

    if (!offer) {
      throw new AppError('Offer not found', 404);
    }

    // Verify user is the seller
    if (offer.sellerId !== userId) {
      throw new AppError('Only the seller can decline offers', 403);
    }

    // Cannot decline already processed offers
    if (offer.status !== 'PENDING') {
      throw new AppError(
        `Cannot decline offer with status: ${offer.status}`,
        400
      );
    }

    // Update offer status
    const updatedOffer = await prisma.offer.update({
      where: { id },
      data: { status: 'DECLINED' },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        action: 'OFFER_DECLINED',
        userId,
        details: {
          offerId: id,
          listingId: offer.listingId,
          buyerId: offer.buyerId,
          amount: offer.amount.toString(),
        },
      },
    });

    // Emit event for Discord notification
    emitOfferEvent({
      type: OfferEventType.DECLINED,
      offerId: id,
      listingId: offer.listingId,
      buyerId: offer.buyerId,
      sellerId: offer.sellerId,
      amount: offer.amount,
      timestamp: new Date(),
    });

    res.status(200).json({
      success: true,
      offer: {
        id: updatedOffer.id,
        status: updatedOffer.status,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get offers for a listing
router.get('/offers/listing/:listingId', async (req, res, next) => {
  try {
    const { listingId } = req.params;
    const { status } = req.query;

    // Build where clause
    const whereClause: any = { listingId };
    if (status && typeof status === 'string') {
      whereClause.status = status;
    }

    // Get offers with buyer/seller details
    const offers = await prisma.offer.findMany({
      where: whereClause,
      include: {
        buyer: {
          select: {
            id: true,
            name: true,
            kycTier: true,
            kycVerified: true,
          },
        },
        seller: {
          select: {
            id: true,
            name: true,
            kycTier: true,
            kycVerified: true,
          },
        },
        parent: {
          select: {
            id: true,
            amount: true,
            status: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Serialize BigInt to string for JSON response
    const serializedOffers = offers.map(offer => ({
      ...offer,
      amount: offer.amount.toString(),
      parent: offer.parent
        ? {
            ...offer.parent,
            amount: offer.parent.amount.toString(),
          }
        : null,
    }));

    res.status(200).json({
      offers: serializedOffers,
      count: serializedOffers.length,
    });
  } catch (error) {
    next(error);
  }
});

// Counter offer endpoint
router.patch('/offers/:id/counter', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validate request body
    const actionValidation = offerActionSchema.safeParse(req.body);
    if (!actionValidation.success) {
      const errors = actionValidation.error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      throw new AppError(
        `Validation failed: ${errors.map(e => `${e.field}: ${e.message}`).join(', ')}`,
        400
      );
    }

    const counterValidation = counterOfferSchema.safeParse(req.body);
    if (!counterValidation.success) {
      const errors = counterValidation.error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      throw new AppError(
        `Validation failed: ${errors.map(e => `${e.field}: ${e.message}`).join(', ')}`,
        400
      );
    }

    const { userId } = actionValidation.data;
    const { amount, conditions, expiry } = counterValidation.data;

    // Get original offer
    const originalOffer = await prisma.offer.findUnique({
      where: { id },
    });

    if (!originalOffer) {
      throw new AppError('Offer not found', 404);
    }

    // Verify user is the seller (only sellers can counter)
    if (originalOffer.sellerId !== userId) {
      throw new AppError('Only the seller can counter offers', 403);
    }

    // Cannot counter already processed offers
    if (originalOffer.status !== 'PENDING') {
      throw new AppError(
        `Cannot counter offer with status: ${originalOffer.status}`,
        400
      );
    }

    // Check if original offer has expired
    if (originalOffer.expiry < new Date()) {
      await prisma.offer.update({
        where: { id },
        data: { status: 'EXPIRED' },
      });
      throw new AppError('Original offer has expired', 400);
    }

    // Verify buyer (who will receive the counter-offer) still has linked Roblox account and TIER_1+
    const buyer = await prisma.user.findUnique({
      where: { id: originalOffer.buyerId },
      include: {
        accounts: {
          where: { providerId: 'roblox' },
        },
      },
    });

    if (!buyer) {
      throw new AppError('Buyer not found', 404);
    }

    if (buyer.accounts.length === 0) {
      await prisma.auditLog.create({
        data: {
          action: 'OFFER_COUNTER_FAILED',
          userId,
          details: {
            offerId: id,
            listingId: originalOffer.listingId,
            buyerId: originalOffer.buyerId,
            reason: 'Buyer Roblox account not linked',
          },
        },
      });
      throw new AppError(
        'Buyer must have a linked Roblox account to receive counter-offers',
        400
      );
    }

    if (buyer.kycTier === 'TIER_0') {
      await prisma.auditLog.create({
        data: {
          action: 'OFFER_COUNTER_FAILED',
          userId,
          details: {
            offerId: id,
            listingId: originalOffer.listingId,
            buyerId: originalOffer.buyerId,
            reason: 'Buyer KYC tier insufficient (TIER_0)',
          },
        },
      });
      throw new AppError(
        'Buyer must be at least TIER_1 to receive counter-offers',
        400
      );
    }

    // Set counter offer expiry (default 7 days)
    const counterExpiryDate = expiry
      ? new Date(expiry)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Create counter offer with swapped buyer/seller
    const counterOffer = await prisma.offer.create({
      data: {
        listingId: originalOffer.listingId,
        buyerId: originalOffer.sellerId, // Seller becomes buyer in counter
        sellerId: originalOffer.buyerId, // Buyer becomes seller in counter
        amount,
        conditions: conditions || null,
        expiry: counterExpiryDate,
        status: 'PENDING',
        parentId: id, // Link to original offer
      },
    });

    // Update original offer status to COUNTERED
    await prisma.offer.update({
      where: { id },
      data: { status: 'COUNTERED' },
    });

    // Create audit logs
    await prisma.auditLog.createMany({
      data: [
        {
          action: 'OFFER_COUNTERED',
          userId,
          details: {
            originalOfferId: id,
            counterOfferId: counterOffer.id,
            listingId: originalOffer.listingId,
            originalAmount: originalOffer.amount.toString(),
            counterAmount: amount.toString(),
          },
        },
      ],
    });

    // Emit event for Discord notification
    emitOfferEvent({
      type: OfferEventType.COUNTERED,
      offerId: id,
      listingId: originalOffer.listingId,
      buyerId: originalOffer.buyerId,
      sellerId: originalOffer.sellerId,
      amount: originalOffer.amount,
      counterOfferId: counterOffer.id,
      parentOfferId: id,
      conditions: conditions || undefined,
      timestamp: new Date(),
    });

    res.status(201).json({
      success: true,
      originalOffer: {
        id,
        status: 'COUNTERED',
      },
      counterOffer: {
        id: counterOffer.id,
        amount: counterOffer.amount.toString(),
        status: counterOffer.status,
        expiry: counterOffer.expiry,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get recent offer events for Discord bot polling
router.get('/offers/events/recent', async (req, res, next) => {
  try {
    const { since } = req.query;

    // Default to events from last 5 minutes if not specified
    const sinceDate = since
      ? new Date(since as string)
      : new Date(Date.now() - 5 * 60 * 1000);

    // Get recent offers with status changes
    const recentOffers = await prisma.offer.findMany({
      where: {
        updatedAt: {
          gte: sinceDate,
        },
      },
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            price: true,
            messageId: true,
            channelId: true,
          },
        },
        buyer: {
          select: {
            id: true,
            name: true,
            accounts: {
              where: { providerId: 'discord' },
              select: { accountId: true },
            },
          },
        },
        seller: {
          select: {
            id: true,
            name: true,
            accounts: {
              where: { providerId: 'discord' },
              select: { accountId: true },
            },
          },
        },
        parent: {
          select: {
            id: true,
            amount: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      take: 50, // Limit to 50 most recent events
    });

    // Serialize and format for Discord bot
    const events = recentOffers.map(offer => ({
      offerId: offer.id,
      status: offer.status,
      amount: offer.amount.toString(),
      conditions: offer.conditions,
      listingId: offer.listing.id,
      listingTitle: offer.listing.title,
      listingPrice: offer.listing.price.toString(),
      messageId: offer.listing.messageId,
      channelId: offer.listing.channelId,
      buyerId: offer.buyer.id,
      buyerName: offer.buyer.name,
      buyerDiscordId: offer.buyer.accounts[0]?.accountId,
      sellerId: offer.seller.id,
      sellerName: offer.seller.name,
      sellerDiscordId: offer.seller.accounts[0]?.accountId,
      parentOfferId: offer.parentId,
      parentAmount: offer.parent?.amount.toString(),
      createdAt: offer.createdAt,
      updatedAt: offer.updatedAt,
    }));

    res.status(200).json({
      events,
      count: events.length,
      since: sinceDate.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
