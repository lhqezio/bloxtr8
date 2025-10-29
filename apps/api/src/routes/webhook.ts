// apps/api/src/routes/webhooks.ts
import crypto from 'crypto';

import { prisma } from '@bloxtr8/database';
import { Router, type Router as ExpressRouter } from 'express';

import { AppError } from '../middleware/errorHandler.js';

const router: ExpressRouter = Router();

// Verify webhook signature
function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}

/**
 * Escrow status update webhook
 * POST /api/webhooks/escrow-status
 */
router.post('/escrow-status', async (req, res, next) => {
  try {
    const signature = req.headers['x-escrow-signature'] as string;
    const webhookSecret = process.env.ESCROW_WEBHOOK_SECRET;

    if (!webhookSecret) {
      throw new AppError('Webhook secret not configured', 500);
    }

    // Verify webhook signature
    const payload = JSON.stringify(req.body);
    if (!verifyWebhookSignature(payload, signature, webhookSecret)) {
      throw new AppError('Invalid webhook signature', 401);
    }

    const { escrowId, status, paymentIntentId, transferId, refundId, reason } = req.body;

    // Use transaction to ensure atomicity
    await prisma.$transaction(async (tx) => {
      // Update escrow status in database
      await tx.escrow.update({
        where: { id: escrowId },
        data: { 
          status,
          updatedAt: new Date(),
        },
      });

      // Update rail-specific records if needed
      if (paymentIntentId) {
        await tx.stripeEscrow.updateMany({
          where: { escrowId },
          data: { 
            paymentIntentId,
            lastWebhookAt: new Date(),
          },
        });
      }

      if (transferId) {
        await tx.stripeEscrow.updateMany({
          where: { escrowId },
          data: { 
            transferId,
            lastWebhookAt: new Date(),
          },
        });
      }

      if (refundId) {
        await tx.stripeEscrow.updateMany({
          where: { escrowId },
          data: { 
            refundId,
            lastWebhookAt: new Date(),
          },
        });
      }

      // Update contract status if escrow is completed
      if (status === 'RELEASED' || status === 'REFUNDED' || status === 'CANCELLED') {
        await tx.contract.updateMany({
          where: { 
            escrows: {
              some: { id: escrowId }
            }
          },
          data: { 
            status: status === 'RELEASED' ? 'EXECUTED' : 'EXECUTION_FAILED',
            updatedAt: new Date(),
          },
        });
      }

      // Create audit log
      await tx.auditLog.create({
        data: {
          action: 'ESCROW_STATUS_UPDATED',
          details: {
            escrowId,
            status,
            paymentIntentId,
            transferId,
            refundId,
            reason,
            source: 'escrow_server_webhook',
          },
          escrowId,
        },
      });

      console.log(`Successfully synchronized escrow ${escrowId} status to ${status}`);
    });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * Manual escrow status synchronization endpoint
 * POST /api/webhooks/sync-escrow-status
 */
router.post('/sync-escrow-status', async (req, res, next) => {
  try {
    const { escrowId } = req.body;

    if (!escrowId) {
      throw new AppError('Escrow ID is required', 400);
    }

    // Fetch escrow from escrow server
    const escrowClient = new (await import('../lib/escrow-client.js')).EscrowClient();
    const escrowData = await escrowClient.getEscrowStatus(escrowId);

    if (!escrowData.success) {
      throw new AppError('Failed to fetch escrow status from escrow server', 404);
    }

    const escrow = escrowData.data;

    // Update local database with escrow server data
    await prisma.$transaction(async (tx) => {
      await tx.escrow.update({
        where: { id: escrowId },
        data: {
          status: escrow.status,
          updatedAt: new Date(),
        },
      });

      // Update rail-specific data
      if (escrow.stripeEscrow) {
        await tx.stripeEscrow.upsert({
          where: { escrowId },
          update: {
            paymentIntentId: escrow.stripeEscrow.paymentIntentId,
            transferId: escrow.stripeEscrow.transferId,
            refundId: escrow.stripeEscrow.refundId,
            amountCaptured: escrow.stripeEscrow.amountCaptured,
            currency: escrow.stripeEscrow.currency,
            lastWebhookAt: new Date(),
          },
          create: {
            escrowId,
            paymentIntentId: escrow.stripeEscrow.paymentIntentId,
            transferId: escrow.stripeEscrow.transferId,
            refundId: escrow.stripeEscrow.refundId,
            amountCaptured: escrow.stripeEscrow.amountCaptured,
            currency: escrow.stripeEscrow.currency,
            lastWebhookAt: new Date(),
          },
        });
      }

      // Create audit log
      await tx.auditLog.create({
        data: {
          action: 'ESCROW_STATUS_SYNC',
          details: {
            escrowId,
            status: escrow.status,
            source: 'manual_sync',
          },
          escrowId,
        },
      });
    });

    res.json({ 
      success: true, 
      message: `Escrow ${escrowId} status synchronized to ${escrow.status}` 
    });
  } catch (error) {
    next(error);
  }
});

export default router;