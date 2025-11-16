/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-unused-vars */
import { prisma } from '@bloxtr8/database';
import type { Currency } from '@bloxtr8/database';
import type {
  CreatePaymentIntent,
  PaymentIntentCreated,
  TransferToSeller,
  TransferSucceeded,
  InitiateRefund,
  RefundSucceeded,
  CancelPayment,
  PaymentFailed,
} from '@bloxtr8/protobuf-schemas';
import Stripe from 'stripe';

let _stripe: Stripe | null = null;
let _applicationFeeRate: number | null = null;

function getApplicationFeeRate(): number {
  if (_applicationFeeRate === null) {
    const rawApplicationFee = process.env.BLOXTR8_FEE_STRIPE
      ? parseFloat(process.env.BLOXTR8_FEE_STRIPE)
      : 2.9;

    if (Number.isNaN(rawApplicationFee) || rawApplicationFee < 0) {
      throw new Error('Invalid BLOXTR8_FEE_STRIPE value');
    }

    _applicationFeeRate =
      rawApplicationFee > 1 ? rawApplicationFee / 100 : rawApplicationFee;
  }
  return _applicationFeeRate;
}
export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not set');
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2025-10-29.clover',
      typescript: true,
    });
  }
  return _stripe;
}

// Lazy-initialized Stripe client proxy
// Initializes only when first accessed, allowing intuitive usage like stripe.paymentIntents.create()
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return getStripe()[prop as keyof Stripe];
  },
});

// Stripe Connect configuration
export const STRIPE_CONNECT_CONFIG = {
  // Use Express Connect accounts for sellers
  accountType: 'express' as const,
  // Enable manual payouts to control when sellers can withdraw funds
  manualPayouts: true,
  // Enable KYC verification for connected accounts
  kycVerification: true,
} as const;

export async function handleCreatePaymentIntent(
  command: CreatePaymentIntent
): Promise<PaymentIntentCreated> {
  const { escrowId, amountCents, currency, causationId, version } = command;
  const paymentAmount = Number(amountCents);
  const buyerFee = Math.round(paymentAmount * getApplicationFeeRate());
  const sellerTransferAmount = paymentAmount - buyerFee;

  if (sellerTransferAmount < 0) {
    throw new Error(
      `Calculated Stripe application fee (${buyerFee}) exceeds payment amount (${paymentAmount})`
    );
  }
  const escrow = await prisma.escrow.findUnique({
    where: { id: escrowId },
    include: {
      offer: {
        include: {
          seller: true,
        },
      },
    },
  });
  if (!escrow) {
    throw new Error(`Escrow ${escrowId} not found`);
  }
  if (!escrow?.offer?.seller?.stripeAccountId) {
    throw new Error(
      `Seller ${escrow?.offer?.sellerId} does not have a Stripe account`
    );
  }
  const paymentIntent = await stripe.paymentIntents.create({
    amount: paymentAmount,
    currency,
    application_fee_amount: buyerFee,
    transfer_data: {
      amount: sellerTransferAmount,
      destination: escrow.offer.seller.stripeAccountId,
    },
    metadata: {
      escrowId,
      offerId: escrow.offerId,
      contractId: escrow.contractId,
    },
  });
  const clientSecret = paymentIntent.client_secret;
  if (!clientSecret) {
    throw new Error(
      `Stripe did not return a client_secret for payment intent ${paymentIntent.id}`
    );
  }
  await prisma.$transaction(async tx => {
    await tx.paymentArtifact.create({
      data: {
        escrowId,
        provider: 'stripe',
        providerPaymentId: paymentIntent.id,
        kind: 'INTENT',
        amount: Number(amountCents),
        currency: currency as Currency,
        createdAt: new Date(paymentIntent.created * 1000).toISOString(),
      },
    });
    // TODO: Uncomment this when we have a way to serialize the message
    // await tx.outbox.create({
    //     data: {
    //         aggregateId: escrowId,
    //         eventType: 'PaymentIntentCreated',
    //         payload: serializeMessage(PaymentIntentCreated, {
    //             escrowId,
    //             provider: 'stripe',
    //             providerPaymentId: paymentIntent.id,
    //             clientSecret,
    //             depositAddress: '',
    //             eventId: paymentIntent.id,
    //             occurredAt: new Date(paymentIntent.created * 1000).toISOString(),
    //         }),
    //     },
    // });
  });
  return {
    $typeName: 'bloxtr8.payments.events.v1.PaymentIntentCreated',
    escrowId,
    provider: 'stripe',
    providerPaymentId: paymentIntent.id,
    clientSecret,
    depositAddress: '',
    eventId: paymentIntent.id,
    occurredAt: new Date(paymentIntent.created * 1000).toISOString(),
    causationId,
    version,
  };
}
export async function handleTransferToSeller(
  command: TransferToSeller
): Promise<TransferSucceeded> {
  const { escrowId, sellerAccountId, provider, causationId, version } = command;
  throw new Error('to be implement');
}
export async function handleInitiateRefund(
  command: InitiateRefund
): Promise<RefundSucceeded> {
  throw new Error('to be implement');
}
export async function handleCancelPayment(
  command: CancelPayment
): Promise<PaymentFailed> {
  throw new Error('to be implement');
}
