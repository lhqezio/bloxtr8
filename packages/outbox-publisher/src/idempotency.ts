import { prisma } from '@bloxtr8/database';

import { OutboxPublishError } from './errors.js';
import type { OutboxEvent } from './types.js';

/**
 * Check if an event has already been published
 */
export async function checkAlreadyPublished(eventId: string): Promise<boolean> {
  const event = await prisma.outbox.findUnique({
    where: { id: eventId },
    select: { publishedAt: true },
  });

  return event?.publishedAt !== null;
}

/**
 * Atomically mark an event as published
 * Uses optimistic locking to prevent duplicate publishing
 */
export async function markAsPublished(eventId: string): Promise<boolean> {
  try {
    const result = await prisma.outbox.updateMany({
      where: {
        id: eventId,
        publishedAt: null, // Only update if not already published
      },
      data: {
        publishedAt: new Date(),
      },
    });

    // If no rows were updated, the event was already published
    return result.count > 0;
  } catch (error) {
    throw new OutboxPublishError(
      `Failed to mark event as published: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined,
      { eventId }
    );
  }
}

/**
 * Get unpublished events for processing
 * Uses FOR UPDATE SKIP LOCKED to prevent concurrent processing
 */
export async function getUnpublishedEvents(
  batchSize: number
): Promise<OutboxEvent[]> {
  // PostgreSQL-specific: FOR UPDATE SKIP LOCKED prevents concurrent processing
  // of the same events by multiple publisher instances
  const events = await prisma.$queryRaw<OutboxEvent[]>`
    SELECT *
    FROM outbox
    WHERE published_at IS NULL
    ORDER BY created_at ASC
    LIMIT ${batchSize}
    FOR UPDATE SKIP LOCKED
  `;

  return events;
}
