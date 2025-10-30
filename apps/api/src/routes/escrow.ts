import { prisma } from '@bloxtr8/database';
import { Router, type Router as ExpressRouter } from 'express';

import { isDebugMode } from '../lib/env-validation.js';
import { AppError } from '../middleware/errorHandler.js';
import { serializeBigInt } from '../utils/bigint.js';

const router: ExpressRouter = Router();

// Mark delivery complete endpoint
router.post('/escrow/:id/mark-delivered', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { userId, title, description } = req.body;

    if (!userId) {
      throw new AppError('User ID is required', 400);
    }

    if (!title) {
      throw new AppError('Title is required', 400);
    }

    const escrow = await prisma.escrow.findUnique({
      where: { id },
      include: {
        offer: {
          include: {
            seller: true,
            buyer: true,
            listing: true,
          },
        },
        contract: true,
        deliveries: true,
      },
    });

    if (!escrow) {
      throw new AppError('Escrow not found', 404);
    }

    if (userId !== escrow.offer.sellerId) {
      throw new AppError('Only the seller can mark delivery as complete', 403);
    }

    if (escrow.status !== 'FUNDS_HELD') {
      throw new AppError('Escrow must be FUNDS_HELD to mark delivery', 400);
    }

    if (escrow.deliveries.length > 0) {
      throw new AppError('Delivery already marked', 400);
    }

    const result = await prisma.$transaction(async tx => {
      const updatedEscrow = await tx.escrow.update({
        where: { id },
        data: { status: 'DELIVERED' },
      });

      const delivery = await tx.delivery.create({
        data: {
          title,
          description: description || null,
          status: 'DELIVERED',
          deliveredAt: new Date(),
          listingId: escrow.offer.listingId,
          offerId: escrow.offerId,
          contractId: escrow.contractId,
          escrowId: id,
          deliveredBy: userId,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'DELIVERY_MARKED',
          details: {
            escrowId: id,
            deliveryId: delivery.id,
            userId,
            title: title,
            description,
          },
          escrowId: id,
        },
      });

      return { updatedEscrow, delivery };
    });

    res.json({
      success: true,
      escrow: serializeBigInt(result.updatedEscrow),
      delivery: serializeBigInt(result.delivery),
    });
  } catch (error) {
    next(error);
  }
});

// Confirm delivery endpoint
router.post('/escrow/:id/confirm-delivery', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    if (!userId) {
      throw new AppError('User ID is required', 400);
    }

    const escrow = await prisma.escrow.findUnique({
      where: { id },
      include: {
        offer: {
          include: {
            seller: true,
            buyer: true,
          },
        },
        deliveries: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        stripeEscrow: true,
        stablecoinEscrow: true,
      },
    });

    if (!escrow) {
      throw new AppError('Escrow not found', 404);
    }

    if (userId !== escrow.offer.buyerId) {
      throw new AppError('Only buyer can confirm', 403);
    }

    if (escrow.status !== 'DELIVERED') {
      throw new AppError('Escrow must be DELIVERED', 400);
    }

    if (escrow.deliveries.length === 0) {
      throw new AppError('No delivery found', 400);
    }

    const debugMode = isDebugMode();
    const sameUser = escrow.offer.buyerId === escrow.offer.sellerId;

    let transferId = null;

    if (escrow.rail === 'STRIPE' && escrow.stripeEscrow) {
      transferId = debugMode ? `tr_test_${escrow.id}` : null;
    } else if (escrow.rail === 'USDC_BASE' && escrow.stablecoinEscrow) {
      transferId = debugMode ? `0x_test_${escrow.id}` : null;
    }

    const result = await prisma.$transaction(async tx => {
      const updatedEscrow = await tx.escrow.update({
        where: { id },
        data: { status: 'RELEASED' },
      });

      const delivery = escrow.deliveries[0];
      if (delivery) {
        await tx.delivery.update({
          where: { id: delivery.id },
          data: { status: 'CONFIRMED' },
        });
      }

      if (transferId) {
        if (escrow.rail === 'STRIPE' && escrow.stripeEscrow) {
          await tx.stripeEscrow.update({
            where: { id: escrow.stripeEscrow.id },
            data: { transferId },
          });
        } else if (escrow.rail === 'USDC_BASE' && escrow.stablecoinEscrow) {
          await tx.stablecoinEscrow.update({
            where: { id: escrow.stablecoinEscrow.id },
            data: { releaseTx: transferId },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          action: 'DELIVERY_CONFIRMED',
          details: {
            escrowId: id,
            userId,
            transferId,
          },
          escrowId: id,
        },
      });

      return { updatedEscrow, transferId };
    });

    res.json({
      success: true,
      escrow: serializeBigInt(result.updatedEscrow),
      transferId: result.transferId,
    });
  } catch (error) {
    next(error);
  }
});

// Simulate payment endpoint (debug only)
router.post('/escrow/:id/simulate-payment', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    if (!userId) {
      throw new AppError('User ID required', 400);
    }

    if (!isDebugMode()) {
      throw new AppError('Debug mode only', 403);
    }

    const escrow = await prisma.escrow.findUnique({
      where: { id },
      include: {
        offer: true,
        stablecoinEscrow: true,
      },
    });

    if (!escrow) {
      throw new AppError('Escrow not found', 404);
    }

    if (escrow.status !== 'AWAIT_FUNDS') {
      throw new AppError('Must be AWAIT_FUNDS', 400);
    }

    if (userId !== escrow.offer.buyerId && userId !== escrow.offer.sellerId) {
      throw new AppError('Not authorized', 403);
    }

    let depositTx = null;
    if (escrow.rail === 'USDC_BASE' && escrow.stablecoinEscrow) {
      depositTx = `0x_sim_${escrow.id}`;
    }

    const result = await prisma.$transaction(async tx => {
      const updatedEscrow = await tx.escrow.update({
        where: { id },
        data: { status: 'FUNDS_HELD' },
      });

      if (depositTx && escrow.rail === 'USDC_BASE' && escrow.stablecoinEscrow) {
        await tx.stablecoinEscrow.update({
          where: { id: escrow.stablecoinEscrow.id },
          data: { depositTx },
        });
      }

      await tx.auditLog.create({
        data: {
          action: 'PAYMENT_SIMULATED',
          details: { escrowId: id, userId, depositTx },
          escrowId: id,
        },
      });

      return updatedEscrow;
    });

    res.json({
      success: true,
      escrow: serializeBigInt(result),
      debugMode: true,
    });
  } catch (error) {
    next(error);
  }
});

// Get delivery status endpoint
router.get('/escrow/:id/delivery-status', async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.query.userId as string;

    if (!userId) {
      throw new AppError('User ID required', 400);
    }

    const escrow = await prisma.escrow.findUnique({
      where: { id },
      include: {
        offer: {
          include: {
            seller: { select: { id: true, name: true } },
            buyer: { select: { id: true, name: true } },
            listing: { select: { id: true, title: true } },
          },
        },
        deliveries: {
          orderBy: { createdAt: 'desc' },
        },
        stripeEscrow: true,
        stablecoinEscrow: true,
      },
    });

    if (!escrow) {
      throw new AppError('Escrow not found', 404);
    }

    if (userId !== escrow.offer.buyerId && userId !== escrow.offer.sellerId) {
      throw new AppError('Not authorized', 403);
    }

    res.json({
      escrow: serializeBigInt(escrow),
      isBuyer: userId === escrow.offer.buyerId,
      isSeller: userId === escrow.offer.sellerId,
      canMarkDelivered:
        userId === escrow.offer.sellerId && escrow.status === 'FUNDS_HELD',
      canConfirmDelivery:
        userId === escrow.offer.buyerId && escrow.status === 'DELIVERED',
      canSimulatePayment: isDebugMode() && escrow.status === 'AWAIT_FUNDS',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
