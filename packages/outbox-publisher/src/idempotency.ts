import { prisma } from '@bloxtr8/database';

import { OutboxPublishError } from './errors.js';
import type { OutboxEvent } from './types.js';

/**
 * Transaction client type for Prisma transactions
 * This is the type of the parameter passed to the transaction callback
 */
type TransactionClient = Parameters<
  Parameters<typeof prisma.$transaction>[0]
>[0];

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
 * Get a single unpublished event for processing within a transaction
 * Uses FOR UPDATE SKIP LOCKED to prevent concurrent processing
 * This must be called within a transaction to hold the lock
 */
export async function getUnpublishedEventInTransaction(
  tx: TransactionClient
): Promise<OutboxEvent | null> {
  // PostgreSQL-specific: FOR UPDATE SKIP LOCKED prevents concurrent processing
  // of the same events by multiple publisher instances
  // The lock is held until the transaction commits
  const events = await tx.$queryRaw<OutboxEvent[]>`
    SELECT *
    FROM outbox
    WHERE published_at IS NULL
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  `;

  return events[0] || null;
}

/**
 * Mark an event as published within a transaction
 */
export async function markAsPublishedInTransaction(
  tx: TransactionClient,
  eventId: string
): Promise<boolean> {
  try {
    const result = await tx.outbox.updateMany({
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
 * NOTE: This function does NOT use transactions and locks are released immediately.
 * For proper concurrency protection, use processEventsInTransaction instead.
 * This function is kept for backward compatibility but should be avoided.
 */
export async function getUnpublishedEvents(
  batchSize: number
): Promise<OutboxEvent[]> {
  // PostgreSQL-specific: FOR UPDATE SKIP LOCKED prevents concurrent processing
  // of the same events by multiple publisher instances
  // WARNING: Without a transaction, locks are released immediately after query returns
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
