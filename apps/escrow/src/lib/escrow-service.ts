import { prisma } from '@bloxtr8/database';
import type Stripe from 'stripe';

import { AppError } from '../middleware/errorHandler.js';

import { stripe } from './stripe.js';

export type EscrowStatus =
  | 'AWAIT_FUNDS'
  | 'FUNDS_HELD'
  | 'DELIVERED'
  | 'RELEASED'
  | 'DISPUTED'
  | 'REFUNDED'
  | 'CANCELLED';

export type EscrowRail = 'STRIPE' | 'USDC_BASE';

export interface CreateEscrowParams {
  offerId: string;
  contractId: string;
  rail: EscrowRail;
  amount: bigint;
  currency: 'USD' | 'USDC';
  buyerId: string;
  sellerId: string;
  sellerStripeAccountId?: string;
  buyerFee?: number;
  sellerFee?: number;
}

export interface EscrowStateTransition {
  from: EscrowStatus;
  to: EscrowStatus;
  reason?: string;
  userId: string;
}

export interface EscrowMetadata {
  buyerFee?: number;
  sellerFee?: number;
  sellerStripeAccountId?: string;
}

export class EscrowService {
  private static readonly VALID_TRANSITIONS: Record<
    EscrowStatus,
    readonly EscrowStatus[]
  > = {
    AWAIT_FUNDS: ['FUNDS_HELD', 'CANCELLED'],
    FUNDS_HELD: ['DELIVERED', 'DISPUTED', 'REFUNDED'],
    DELIVERED: ['RELEASED', 'DISPUTED', 'REFUNDED'],
    DISPUTED: ['RELEASED', 'REFUNDED'],
    RELEASED: [], // Terminal state
    REFUNDED: [], // Terminal state
    CANCELLED: [], // Terminal state
  };

  /**
   * Create a new escrow with Stripe Connect integration
   */
  static async createEscrow(params: CreateEscrowParams) {
    const {
      offerId,
      contractId,
      rail,
      amount,
      currency,
      buyerId,
      sellerStripeAccountId,
      buyerFee = 0,
      sellerFee = 0,
    } = params;

    return await prisma.$transaction(async tx => {
      // Create the escrow record
      const escrow = await tx.escrow.create({
        data: {
          rail,
          amount,
          currency,
          status: 'AWAIT_FUNDS',
          offerId,
          contractId,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          metadata: {
            buyerFee,
            sellerFee,
            sellerStripeAccountId,
          },
        },
      });

      // Create Stripe-specific escrow if using Stripe rail
      if (rail === 'STRIPE' && sellerStripeAccountId) {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: Number(amount),
          currency: currency.toLowerCase(),
          application_fee_amount: buyerFee,
          transfer_data: {
            destination: sellerStripeAccountId,
          },
          metadata: {
            escrowId: escrow.id,
            offerId,
            contractId,
          },
        });

        await tx.stripeEscrow.create({
          data: {
            escrowId: escrow.id,
            paymentIntentId: paymentIntent.id,
          },
        });

        // Create audit log
        await tx.auditLog.create({
          data: {
            action: 'escrow.created',
            details: {
              escrowId: escrow.id,
              paymentIntentId: paymentIntent.id,
              amount: Number(amount),
              currency,
            },
            userId: buyerId,
            escrowId: escrow.id,
          },
        });

        return {
          escrow,
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
        };
      }

      // For USDC rail, we'll implement later
      throw new Error('USDC rail not implemented yet');
    });
  }

  /**
   * Transition escrow state with optimistic locking
   */
  static async transitionState(
    escrowId: string,
    newStatus: EscrowStatus,
    userId: string,
    reason?: string
  ) {
    return await prisma.$transaction(async tx => {
      // Get current state with optimistic locking
      const current = await tx.escrow.findUnique({
        where: { id: escrowId },
        select: { status: true, version: true },
      });

      if (!current) {
        throw new AppError('Escrow not found', 404);
      }

      // Validate transition
      const validTransitions = this.VALID_TRANSITIONS[current.status];
      if (!validTransitions.includes(newStatus)) {
        throw new AppError(
          `Invalid state transition from ${current.status} to ${newStatus}`,
          400
        );
      }

      // Update with version check
      const updated = await tx.escrow.update({
        where: {
          id: escrowId,
          version: current.version,
        },
        data: {
          status: newStatus,
          version: { increment: 1 },
        },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          action: `escrow.${newStatus.toLowerCase()}`,
          details: {
            escrowId,
            reason,
            previousStatus: current.status,
          },
          userId,
          escrowId,
        },
      });

      return updated;
    });
  }

  /**
   * Handle Stripe webhook for payment confirmation
   */
  static async handleStripeWebhook(event: Stripe.Event) {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;

        // Find escrow by payment intent ID
        const stripeEscrow = await prisma.stripeEscrow.findUnique({
          where: { paymentIntentId: paymentIntent.id },
          include: { escrow: true },
        });

        if (!stripeEscrow) {
          console.warn(
            `No escrow found for payment intent ${paymentIntent.id}`
          );
          return;
        }

        // Update escrow to FUNDS_HELD
        await this.transitionState(
          stripeEscrow.escrow.id,
          'FUNDS_HELD',
          'system',
          'Payment confirmed via Stripe webhook'
        );

        // Update Stripe escrow with captured amount
        await prisma.stripeEscrow.update({
          where: { id: stripeEscrow.id },
          data: {
            amountCaptured: paymentIntent.amount,
            currency: paymentIntent.currency.toUpperCase() as 'USD' | 'USDC',
            lastWebhookAt: new Date(),
          },
        });

        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;

        const stripeEscrow = await prisma.stripeEscrow.findUnique({
          where: { paymentIntentId: paymentIntent.id },
          include: { escrow: true },
        });

        if (stripeEscrow) {
          await this.transitionState(
            stripeEscrow.escrow.id,
            'CANCELLED',
            'system',
            'Payment failed via Stripe webhook'
          );
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  }

  /**
   * Release funds to seller via Stripe Connect
   */
  static async releaseFunds(escrowId: string, operatorUserId: string) {
    const escrow = await prisma.escrow.findUnique({
      where: { id: escrowId },
      include: { stripeEscrow: true },
    });

    if (!escrow || !escrow.stripeEscrow) {
      throw new AppError('Escrow or Stripe escrow not found', 404);
    }

    if (escrow.status !== 'FUNDS_HELD') {
      throw new AppError('Escrow not in FUNDS_HELD status', 400);
    }

    // Get the payment intent to find the charge
    const paymentIntent = await stripe.paymentIntents.retrieve(
      escrow.stripeEscrow.paymentIntentId,
      { expand: ['latest_charge'] }
    );

    if (paymentIntent.status !== 'succeeded') {
      throw new AppError('Payment intent not succeeded', 400);
    }

    const chargeId =
      typeof paymentIntent.latest_charge === 'string'
        ? paymentIntent.latest_charge
        : paymentIntent.latest_charge?.id;
    if (!chargeId) {
      throw new AppError('No charge found for payment intent', 400);
    }

    // Calculate net amount (total - seller fee)
    const metadata = escrow.metadata as EscrowMetadata;
    const sellerFee = metadata?.sellerFee || 0;
    const netAmount = Number(escrow.amount) - sellerFee;

    if (!metadata?.sellerStripeAccountId) {
      throw new AppError('Seller Stripe account ID not found', 400);
    }

    // Create transfer to seller's connected account
    const transfer = await stripe.transfers.create({
      amount: netAmount,
      currency: escrow.currency.toLowerCase(),
      destination: metadata.sellerStripeAccountId,
      source_transaction: chargeId,
      metadata: {
        escrowId: escrow.id,
        sellerFee: sellerFee.toString(),
      },
    });

    // Update escrow status to RELEASED
    await this.transitionState(
      escrowId,
      'RELEASED',
      operatorUserId,
      'Funds released to seller'
    );

    // Update Stripe escrow with transfer ID
    await prisma.stripeEscrow.update({
      where: { id: escrow.stripeEscrow.id },
      data: { transferId: transfer.id },
    });

    return transfer;
  }

  /**
   * Refund buyer via Stripe
   */
  static async refundBuyer(
    escrowId: string,
    operatorUserId: string,
    refundAmount?: number
  ) {
    const escrow = await prisma.escrow.findUnique({
      where: { id: escrowId },
      include: { stripeEscrow: true },
    });

    if (!escrow || !escrow.stripeEscrow) {
      throw new AppError('Escrow or Stripe escrow not found', 404);
    }

    // Get the payment intent to find the charge
    const paymentIntent = await stripe.paymentIntents.retrieve(
      escrow.stripeEscrow.paymentIntentId,
      { expand: ['latest_charge'] }
    );

    const chargeId =
      typeof paymentIntent.latest_charge === 'string'
        ? paymentIntent.latest_charge
        : paymentIntent.latest_charge?.id;
    if (!chargeId) {
      throw new AppError('No charge found for payment intent', 400);
    }

    // Create refund
    const refund = await stripe.refunds.create({
      charge: chargeId,
      amount: refundAmount || Number(escrow.amount),
    });

    // Update escrow status to REFUNDED
    await this.transitionState(
      escrowId,
      'REFUNDED',
      operatorUserId,
      'Buyer refunded'
    );

    // Update Stripe escrow with refund ID
    await prisma.stripeEscrow.update({
      where: { id: escrow.stripeEscrow.id },
      data: { refundId: refund.id },
    });

    return refund;
  }
}
