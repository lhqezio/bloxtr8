import { createHash } from 'crypto';

import type { PrismaClient } from '@bloxtr8/database';

/**
 * Normalizes a date to an ISO 8601 string for consistent hashing
 */
function normalizeTimestamp(timestamp: Date | string): string {
  if (timestamp instanceof Date) {
    return timestamp.toISOString();
  }
  return timestamp;
}

/**
 * Generates a deterministic event ID for commands using SHA-256 hashing.
 *
 * Formula: sha256(escrow_id \0 command_type \0 actor_id \0 timestamp)
 * Uses null byte (\0) as delimiter to prevent collisions when input values contain other characters.
 *
 * @param escrowId - The escrow ID
 * @param commandType - The command type (e.g., 'MarkDelivered', 'ReleaseFunds')
 * @param actorId - The user ID of the actor performing the command
 * @param timestamp - The timestamp (Date or ISO 8601 string)
 * @returns A 64-character hexadecimal SHA-256 hash
 *
 * @example
 * ```typescript
 * const eventId = generateCommandEventId(
 *   'escrow_123',
 *   'MarkDelivered',
 *   'user_456',
 *   new Date()
 * );
 * ```
 */
export function generateCommandEventId(
  escrowId: string,
  commandType: string,
  actorId: string,
  timestamp: Date | string
): string {
  const normalizedTimestamp = normalizeTimestamp(timestamp);
  // Use null byte delimiter to prevent collisions when input values contain '|'
  const input = `${escrowId}\0${commandType}\0${actorId}\0${normalizedTimestamp}`;
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Generates a deterministic event ID for events using SHA-256 hashing.
 *
 * Formula: sha256(escrow_id \0 event_type \0 business_state_hash \0 occurred_at)
 * Uses null byte (\0) as delimiter to prevent collisions when input values contain other characters.
 *
 * @param escrowId - The escrow ID
 * @param eventType - The event type (e.g., 'ESCROW_CREATED', 'FUNDS_HELD')
 * @param businessStateHash - A hash of relevant business state fields (provided by caller)
 * @param occurredAt - The timestamp when the event occurred (Date or ISO 8601 string)
 * @returns A 64-character hexadecimal SHA-256 hash
 *
 * @example
 * ```typescript
 * // First, generate business state hash from relevant fields
 * const businessState = JSON.stringify({ amount: 10000, currency: 'USD', status: 'FUNDS_HELD' });
 * const businessStateHash = createHash('sha256').update(businessState).digest('hex');
 *
 * // Then generate event ID
 * const eventId = generateEventId(
 *   'escrow_123',
 *   'EscrowFundsHeld',
 *   businessStateHash,
 *   new Date()
 * );
 * ```
 */
export function generateEventId(
  escrowId: string,
  eventType: string,
  businessStateHash: string,
  occurredAt: Date | string
): string {
  const normalizedOccurredAt = normalizeTimestamp(occurredAt);
  // Use null byte delimiter to prevent collisions when input values contain '|'
  const input = `${escrowId}\0${eventType}\0${businessStateHash}\0${normalizedOccurredAt}`;
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Checks if an event ID already exists in the specified table (idempotency check).
 *
 * @param prisma - Prisma client instance
 * @param tableName - The table name to check ('webhookEvent' or 'escrowEvent')
 * @param eventId - The event ID to check
 * @returns `true` if the event already exists (already processed), `false` otherwise
 *
 * @example
 * ```typescript
 * const isDuplicate = await checkEventIdempotency(prisma, 'webhookEvent', eventId);
 * if (isDuplicate) {
 *   return; // Event already processed
 * }
 * ```
 */
export async function checkEventIdempotency(
  prisma: PrismaClient,
  tableName: 'webhookEvent' | 'escrowEvent',
  eventId: string
): Promise<boolean> {
  if (tableName === 'webhookEvent') {
    const existing = await prisma.webhookEvent.findUnique({
      where: { eventId },
      select: { id: true },
    });
    return existing !== null;
  }

  // For escrowEvent, check if eventId exists in the payload JSON field
  // Note: EscrowEvent schema doesn't currently have a dedicated eventId field,
  // so we check the payload JSON. For better performance, consider adding
  // an eventId field to the EscrowEvent schema with a unique constraint.
  // Using raw query for reliable JSON path filtering across databases
  const result = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM escrow_events
    WHERE payload->>'event_id' = ${eventId}
    LIMIT 1
  `;
  return result.length > 0;
}

/**
 * Checks if a webhook event ID already exists (idempotency check for webhook events).
 *
 * @param prisma - Prisma client instance
 * @param eventId - The webhook event ID to check
 * @returns `true` if the event already exists (already processed), `false` otherwise
 *
 * @example
 * ```typescript
 * const isDuplicate = await checkWebhookEventIdempotency(prisma, webhookEventId);
 * if (isDuplicate) {
 *   return res.json({ received: true, status: 'duplicate' });
 * }
 * ```
 */
export async function checkWebhookEventIdempotency(
  prisma: PrismaClient,
  eventId: string
): Promise<boolean> {
  return checkEventIdempotency(prisma, 'webhookEvent', eventId);
}

/**
 * Checks if an escrow event ID already exists (idempotency check for escrow events).
 *
 * This function checks the payload JSON field for the eventId. For better performance,
 * consider adding a dedicated eventId field to the EscrowEvent schema with a unique constraint.
 *
 * @param prisma - Prisma client instance
 * @param eventId - The escrow event ID to check
 * @returns `true` if the event already exists (already processed), `false` otherwise
 *
 * @example
 * ```typescript
 * const isDuplicate = await checkEscrowEventIdempotency(prisma, escrowEventId);
 * if (isDuplicate) {
 *   return; // Event already processed
 * }
 * ```
 */
export async function checkEscrowEventIdempotency(
  prisma: PrismaClient,
  eventId: string
): Promise<boolean> {
  return checkEventIdempotency(prisma, 'escrowEvent', eventId);
}
