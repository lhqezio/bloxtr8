import type { PrismaClient } from '@bloxtr8/database';
import type { Escrow } from '@bloxtr8/database';

import type { Guard, TransitionContext } from '../types.js';

/**
 * Creates an idempotency guard that checks if an event has already been processed
 *
 * @param prisma - Prisma client instance
 * @returns Guard function
 */
export const createIdempotencyGuard = (prisma: PrismaClient): Guard => {
  return async (
    context: TransitionContext,
    // eslint-disable-next-line no-unused-vars
    _escrow: Escrow
  ): Promise<{ allowed: boolean; reason?: string }> => {
    // Check if event with this eventId already exists for this escrow
    // We check all events for the escrow regardless of eventType to ensure eventId uniqueness across all transitions
    const existingEvents = await prisma.escrowEvent.findMany({
      where: {
        escrowId: context.escrowId,
      },
    });

    // Check if any existing event has the same eventId in its payload
    for (const event of existingEvents) {
      const payload = event.payload as { eventId?: string };
      if (payload?.eventId === context.eventId) {
        return {
          allowed: false,
          reason: `Event with id ${context.eventId} has already been processed`,
        };
      }
    }

    return { allowed: true };
  };
};
