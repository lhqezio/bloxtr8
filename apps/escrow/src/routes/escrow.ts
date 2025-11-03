import { prisma } from '@bloxtr8/database';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';

import { EscrowService } from '../lib/escrow-service.js';
import { AppError } from '../middleware/errorHandler.js';

const router: ExpressRouter = Router();

// Validation schemas
const createEscrowSchema = z.object({
  offerId: z.string(),
  contractId: z.string(),
  rail: z.enum(['STRIPE', 'USDC_BASE']),
  amount: z.string().transform(BigInt),
  currency: z.enum(['USD', 'USDC']),
  buyerId: z.string(),
  sellerId: z.string(),
  sellerStripeAccountId: z.string().optional(),
  buyerFee: z.number().optional(),
  sellerFee: z.number().optional(),
});

const transitionStateSchema = z.object({
  newStatus: z.enum([
    'AWAIT_FUNDS',
    'FUNDS_HELD',
    'DELIVERED',
    'RELEASED',
    'DISPUTED',
    'REFUNDED',
    'CANCELLED',
  ]),
  reason: z.string().optional(),
});

/**
 * Create a new escrow
 * POST /api/escrow
 */
router.post('/', async (req, res) => {
  try {
    const params = createEscrowSchema.parse(req.body);

    const result = await EscrowService.createEscrow(params);

    res.json({
      success: true,
      data: {
        escrowId: result.escrow.id,
        clientSecret: result.clientSecret,
        paymentIntentId: result.paymentIntentId,
        status: result.escrow.status,
      },
    });
  } catch (error) {
    console.error('Error creating escrow:', error);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(
      error instanceof Error ? error.message : 'Unknown error',
      400
    );
  }
});

/**
 * Get escrow details
 * GET /api/escrow/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const escrow = await prisma.escrow.findUnique({
      where: { id },
      include: {
        offer: true,
        contract: true,
        stripeEscrow: true,
        stablecoinEscrow: true,
        auditLogs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!escrow) {
      throw new AppError('Escrow not found', 404);
    }

    res.json({
      success: true,
      data: escrow,
    });
  } catch (error) {
    console.error('Error fetching escrow:', error);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Internal server error', 500);
  }
});

/**
 * Transition escrow state
 * POST /api/escrow/:id/transition
 */
router.post('/:id/transition', async (req, res) => {
  try {
    const { id } = req.params;
    const { newStatus, reason } = transitionStateSchema.parse(req.body);
    const userId = req.headers['x-user-id'] as string; // In real app, get from auth middleware

    if (!userId) {
      throw new AppError('User ID required', 401);
    }

    const updatedEscrow = await EscrowService.transitionState(
      id,
      newStatus,
      userId,
      reason
    );

    res.json({
      success: true,
      data: updatedEscrow,
    });
  } catch (error) {
    console.error('Error transitioning escrow:', error);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(
      error instanceof Error ? error.message : 'Unknown error',
      400
    );
  }
});

/**
 * Release funds to seller
 * POST /api/escrow/:id/release
 */
router.post('/:id/release', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.headers['x-user-id'] as string;

    if (!userId) {
      throw new AppError('User ID required', 401);
    }

    const transfer = await EscrowService.releaseFunds(id, userId);

    res.json({
      success: true,
      data: {
        transferId: transfer.id,
        amount: transfer.amount,
        currency: transfer.currency,
      },
    });
  } catch (error) {
    console.error('Error releasing funds:', error);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(
      error instanceof Error ? error.message : 'Unknown error',
      400
    );
  }
});

/**
 * Refund buyer
 * POST /api/escrow/:id/refund
 */
router.post('/:id/refund', async (req, res) => {
  try {
    const { id } = req.params;
    const { refundAmount } = req.body;
    const userId = req.headers['x-user-id'] as string;

    if (!userId) {
      throw new AppError('User ID required', 401);
    }

    const refund = await EscrowService.refundBuyer(id, userId, refundAmount);

    res.json({
      success: true,
      data: {
        refundId: refund.id,
        amount: refund.amount,
        currency: refund.currency,
      },
    });
  } catch (error) {
    console.error('Error refunding buyer:', error);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(
      error instanceof Error ? error.message : 'Unknown error',
      400
    );
  }
});

export default router;
