import { prisma } from '@bloxtr8/database';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';

import { isDebugMode } from '../lib/env-validation.js';

const router: ExpressRouter = Router();

// Validation schemas
const createDraftSchema = z.object({
  discordUserId: z.string().min(1),
  listingId: z.string().min(1),
  amount: z.string().regex(/^\d+$/), // BigInt as string
  conditions: z.string().optional(),
  expiresAt: z.string().datetime().optional(), // ISO datetime
});

const getDraftSchema = z.object({
  discordUserId: z.string().min(1),
  listingId: z.string().min(1),
});

/**
 * POST /api/offer-drafts
 * Create or update an offer draft
 */
router.post('/', async (req, res, next) => {
  try {
    const validation = createDraftSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        message: 'Invalid request body',
        errors: validation.error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
        })),
      });
      return;
    }

    const { discordUserId, listingId, amount, conditions, expiresAt } =
      validation.data;

    // Default expiry: 10 minutes from now (or 24 hours in debug mode)
    const debugMode = isDebugMode();
    const expiryMinutes = debugMode ? 24 * 60 : 10; // 24 hours or 10 minutes
    const defaultExpiry = new Date(Date.now() + expiryMinutes * 60 * 1000);
    const expiry = expiresAt ? new Date(expiresAt) : defaultExpiry;

    if (debugMode) {
      console.log(
        `🔧 DEBUG MODE: Offer draft expiry extended to 24 hours for listing ${listingId}`
      );
    }

    // Upsert: create or update existing draft
    const draft = await prisma.offerDraft.upsert({
      where: {
        discordUserId_listingId: {
          discordUserId,
          listingId,
        },
      },
      update: {
        amount: BigInt(amount),
        conditions,
        expiresAt: expiry,
      },
      create: {
        discordUserId,
        listingId,
        amount: BigInt(amount),
        conditions,
        expiresAt: expiry,
      },
    });

    res.status(201).json({
      id: draft.id,
      discordUserId: draft.discordUserId,
      listingId: draft.listingId,
      amount: draft.amount.toString(),
      conditions: draft.conditions,
      expiresAt: draft.expiresAt.toISOString(),
      createdAt: draft.createdAt.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/offer-drafts/:discordUserId/:listingId
 * Get a specific offer draft
 */
router.get('/:discordUserId/:listingId', async (req, res, next) => {
  try {
    const validation = getDraftSchema.safeParse(req.params);

    if (!validation.success) {
      res.status(400).json({
        message: 'Invalid parameters',
        errors: validation.error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
        })),
      });
      return;
    }

    const { discordUserId, listingId } = validation.data;

    const draft = await prisma.offerDraft.findUnique({
      where: {
        discordUserId_listingId: {
          discordUserId,
          listingId,
        },
      },
    });

    if (!draft) {
      res.status(404).json({
        message: 'Offer draft not found',
      });
      return;
    }

    // Check if expired
    if (draft.expiresAt < new Date()) {
      // Clean up expired draft
      await prisma.offerDraft.delete({
        where: {
          id: draft.id,
        },
      });

      res.status(404).json({
        message: 'Offer draft has expired',
      });
      return;
    }

    res.json({
      id: draft.id,
      discordUserId: draft.discordUserId,
      listingId: draft.listingId,
      amount: draft.amount.toString(),
      conditions: draft.conditions,
      expiresAt: draft.expiresAt.toISOString(),
      createdAt: draft.createdAt.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/offer-drafts/:discordUserId/:listingId
 * Delete a specific offer draft
 */
router.delete('/:discordUserId/:listingId', async (req, res, next) => {
  try {
    const validation = getDraftSchema.safeParse(req.params);

    if (!validation.success) {
      res.status(400).json({
        message: 'Invalid parameters',
        errors: validation.error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
        })),
      });
      return;
    }

    const { discordUserId, listingId } = validation.data;

    // Try to delete - no error if not found
    await prisma.offerDraft.deleteMany({
      where: {
        discordUserId,
        listingId,
      },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/offer-drafts/cleanup
 * Clean up all expired drafts (called by scheduled job or manually)
 */
router.delete('/cleanup', async (_req, res, next) => {
  try {
    const result = await prisma.offerDraft.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    res.json({
      message: 'Expired drafts cleaned up',
      count: result.count,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
