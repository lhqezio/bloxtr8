import { prisma } from '@bloxtr8/database';
import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';

import { emitOfferEvent, OfferEventType } from './events.js';

let expiryTask: ScheduledTask | null = null;

/**
 * Background job to automatically expire offers that have passed their expiry date
 * Runs every 5 minutes to check for expired offers
 * @returns The scheduled task for potential cleanup
 */
export function initializeOfferExpiryJob(): ScheduledTask {
  // Run every 5 minutes: */5 * * * *
  expiryTask = cron.schedule('*/5 * * * *', async () => {
    try {
      console.log('[Offer Expiry] Running expiry check...');

      // Find all PENDING or COUNTERED offers that have expired
      const expiredOffers = await prisma.offer.findMany({
        where: {
          status: {
            in: ['PENDING', 'COUNTERED'],
          },
          expiry: {
            lt: new Date(),
          },
        },
        select: {
          id: true,
          listingId: true,
          buyerId: true,
          sellerId: true,
          amount: true,
          status: true,
          expiry: true,
        },
      });

      if (expiredOffers.length === 0) {
        console.log('[Offer Expiry] No expired offers found');
        return;
      }

      console.log(
        `[Offer Expiry] Found ${expiredOffers.length} expired offer(s)`
      );

      // Update all expired offers to EXPIRED status
      const offerIds = expiredOffers.map((offer: { id: string }) => offer.id);
      await prisma.offer.updateMany({
        where: {
          id: {
            in: offerIds,
          },
        },
        data: {
          status: 'EXPIRED',
        },
      });

      // Create audit logs for each expired offer
      await prisma.auditLog.createMany({
        data: expiredOffers.map(
          (offer: {
            id: string;
            listingId: string;
            buyerId: string;
            sellerId: string;
            amount: bigint;
            status: string;
            expiry: Date;
          }) => ({
            action: 'OFFER_EXPIRED',
            userId: null, // System action
            details: {
              offerId: offer.id,
              listingId: offer.listingId,
              buyerId: offer.buyerId,
              sellerId: offer.sellerId,
              amount: offer.amount.toString(),
              previousStatus: offer.status,
              expiry: offer.expiry.toISOString(),
              autoExpired: true,
            },
          })
        ),
      });

      // Emit expiry events for Discord notifications
      for (const offer of expiredOffers) {
        emitOfferEvent({
          type: OfferEventType.EXPIRED,
          offerId: offer.id,
          listingId: offer.listingId,
          buyerId: offer.buyerId,
          sellerId: offer.sellerId,
          amount: offer.amount,
          timestamp: new Date(),
        });
      }

      console.log(
        `[Offer Expiry] Successfully expired ${expiredOffers.length} offer(s)`
      );
    } catch (error) {
      console.error('[Offer Expiry] Error during expiry check:', error);
    }
  });

  console.log('[Offer Expiry] Job initialized - running every 5 minutes');
  return expiryTask;
}

/**
 * Stop the offer expiry job
 */
export function stopOfferExpiryJob(): void {
  if (expiryTask) {
    expiryTask.stop();
    console.log('[Offer Expiry] Job stopped');
  }
}

/**
 * Manually trigger expiry check (useful for testing or manual cleanup)
 */
export async function manuallyExpireOffers(): Promise<{
  expired: number;
  offerIds: string[];
}> {
  const expiredOffers = await prisma.offer.findMany({
    where: {
      status: {
        in: ['PENDING', 'COUNTERED'],
      },
      expiry: {
        lt: new Date(),
      },
    },
    select: {
      id: true,
      listingId: true,
      buyerId: true,
      sellerId: true,
      amount: true,
      status: true,
      expiry: true,
    },
  });

  if (expiredOffers.length === 0) {
    return { expired: 0, offerIds: [] };
  }

  const offerIds = expiredOffers.map((offer: { id: string }) => offer.id);

  await prisma.offer.updateMany({
    where: {
      id: {
        in: offerIds,
      },
    },
    data: {
      status: 'EXPIRED',
    },
  });

  // Create audit logs
  await prisma.auditLog.createMany({
    data: expiredOffers.map(
      (offer: {
        id: string;
        listingId: string;
        buyerId: string;
        sellerId: string;
        amount: bigint;
        status: string;
        expiry: Date;
      }) => ({
        action: 'OFFER_EXPIRED',
        userId: null,
        details: {
          offerId: offer.id,
          listingId: offer.listingId,
          buyerId: offer.buyerId,
          sellerId: offer.sellerId,
          amount: offer.amount.toString(),
          previousStatus: offer.status,
          expiry: offer.expiry.toISOString(),
          manualExpiry: true,
        },
      })
    ),
  });

  // Emit events
  for (const offer of expiredOffers) {
    emitOfferEvent({
      type: OfferEventType.EXPIRED,
      offerId: offer.id,
      listingId: offer.listingId,
      buyerId: offer.buyerId,
      sellerId: offer.sellerId,
      amount: offer.amount,
      timestamp: new Date(),
    });
  }

  return { expired: expiredOffers.length, offerIds };
}
