import { createHash } from 'crypto';

import { type prisma } from '@bloxtr8/database';
import type { PrismaClient } from '@bloxtr8/database';

// Type for Prisma transaction client (the parameter type of $transaction callback)
type TransactionClient = Parameters<
  Parameters<typeof prisma.$transaction>[0]
>[0];

/**
 * ID Generation Strategy Documentation
 *
 * This module handles idempotency for DOMAIN EVENTS (not commands).
 *
 * **Commands vs Domain Events:**
 *
 * 1. **Commands** (e.g., CreateEscrow, MarkDelivered):
 *    - Use `eventId` PROVIDED by sender (API Gateway) in protobuf message
 *    - Stored in `CommandIdempotency` table for command-level deduplication
 *    - See `command-idempotency.ts` for command idempotency utilities
 *    - Rationale: Sender generates ID to enable safe retries across network failures
 *
 * 2. **Domain Events** (e.g., EscrowCreated, EscrowAwaitFunds):
 *    - Use `generateEventId()` to generate DETERMINISTIC IDs based on business state
 *    - Stored in `EscrowEvent` table payload for event idempotency
 *    - Rationale: Deterministic generation ensures same business state = same event ID,
 *      enabling idempotent event processing and event sourcing replay
 *
 * **Why Different Approaches?**
 *
 * - Commands: External retry safety - API Gateway can retry with same eventId
 * - Events: Internal consistency - Same business state always produces same event ID
 *
 * @see {@link ../command-idempotency.ts} for command-level idempotency
 */

/**
 * Normalizes a date to an ISO 8601 string for consistent hashing.
 * Parses string inputs to Date and converts back to ISO format to ensure
 * consistent normalization regardless of input format (e.g., with/without
 * milliseconds, different timezone notations, or non-ISO formats).
 */
function normalizeTimestamp(timestamp: Date | string): string {
  if (timestamp instanceof Date) {
    return timestamp.toISOString();
  }
  // Parse string to Date and convert back to ISO format for consistent normalization
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp format: ${timestamp}`);
  }
  return date.toISOString();
}

/**
 * Generates a deterministic event ID for events using SHA-256 hashing.
 *
 * Formula: sha256(length_bytes(escrow_id) || escrow_id_bytes || length_bytes(event_type) || event_type_bytes || length_bytes(business_state_hash) || business_state_hash_bytes || length_bytes(occurred_at) || occurred_at_bytes)
 * Uses length-prefixed encoding with byte-level precision to prevent collisions when input values contain null bytes.
 * Each field is prefixed with its byte length (as a 32-bit big-endian integer) followed by the field bytes.
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

  // Convert all fields to UTF-8 byte buffers
  const escrowIdBytes = Buffer.from(escrowId, 'utf8');
  const eventTypeBytes = Buffer.from(eventType, 'utf8');
  const businessStateHashBytes = Buffer.from(businessStateHash, 'utf8');
  const occurredAtBytes = Buffer.from(normalizedOccurredAt, 'utf8');

  // Create length buffers (32-bit big-endian unsigned integers)
  const escrowIdLength = Buffer.allocUnsafe(4);
  escrowIdLength.writeUInt32BE(escrowIdBytes.length, 0);

  const eventTypeLength = Buffer.allocUnsafe(4);
  eventTypeLength.writeUInt32BE(eventTypeBytes.length, 0);

  const businessStateHashLength = Buffer.allocUnsafe(4);
  businessStateHashLength.writeUInt32BE(businessStateHashBytes.length, 0);

  const occurredAtLength = Buffer.allocUnsafe(4);
  occurredAtLength.writeUInt32BE(occurredAtBytes.length, 0);

  // Concatenate all buffers: length1 || field1 || length2 || field2 || length3 || field3 || length4 || field4
  const input = Buffer.concat([
    escrowIdLength,
    escrowIdBytes,
    eventTypeLength,
    eventTypeBytes,
    businessStateHashLength,
    businessStateHashBytes,
    occurredAtLength,
    occurredAtBytes,
  ]);

  return createHash('sha256').update(input).digest('hex');
}

/**
 * Checks if an event ID already exists in the specified table (idempotency check).
 *
 * For 'escrowEvent', this function checks the payload JSON field for the eventId.
 * It checks both 'event_id' (snake_case) and 'eventId' (camelCase) to handle
 * different naming conventions. **IMPORTANT**: For escrow events, the event ID
 * must be stored in the payload when creating the event for idempotency to work.
 *
 * For 'escrowEvent', the escrowId parameter is required since event IDs are scoped
 * per escrow (they include escrowId in their generation).
 *
 * @param prisma - Prisma client instance
 * @param tableName - The table name to check ('webhookEvent' or 'escrowEvent')
 * @param eventId - The event ID to check
 * @param escrowId - Required when tableName is 'escrowEvent', the escrow ID to scope the check to
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
  eventId: string,
  escrowId?: string
): Promise<boolean> {
  if (tableName === 'webhookEvent') {
    const existing = await prisma.webhookEvent.findUnique({
      where: { eventId },
      select: { id: true },
    });
    return existing !== null;
  }

  // For escrowEvent, escrowId is required since event IDs are scoped per escrow
  if (!escrowId) {
    throw new Error(
      'escrowId is required when checking escrowEvent idempotency'
    );
  }

  // For escrowEvent, check if eventId exists in the payload JSON field
  // Note: EscrowEvent schema doesn't currently have a dedicated eventId field,
  // so we check the payload JSON. For better performance, consider adding
  // an eventId field to the EscrowEvent schema with a unique constraint.
  // Using raw query for reliable JSON path filtering across databases
  // Check both 'event_id' (snake_case) and 'eventId' (camelCase) to handle
  // different naming conventions that callers might use
  // Filter by escrowId to scope the check to the specific escrow
  const result = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM escrow_events
    WHERE "escrowId" = ${escrowId}
      AND (payload->>'event_id' = ${eventId} OR payload->>'eventId' = ${eventId})
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
 * This function checks the payload JSON field for the eventId. It checks both
 * 'event_id' (snake_case) and 'eventId' (camelCase) to handle different naming conventions.
 *
 * **WARNING**: This function has a race condition when used with separate create operations.
 * Use `createEscrowEventIdempotent` instead for atomic check-and-create operations.
 *
 * **IMPORTANT**: For idempotency to work correctly, callers MUST store the event ID
 * in the EscrowEvent payload when creating the event. The event ID should be stored
 * as either 'event_id' or 'eventId' in the payload JSON.
 *
 * The check is scoped to the specific escrowId since event IDs are generated with
 * escrowId as an input parameter, making them scoped per escrow.
 *
 * For better performance, consider adding a dedicated eventId field to the EscrowEvent
 * schema with a unique constraint.
 *
 * @param prisma - Prisma client instance
 * @param eventId - The escrow event ID to check
 * @param escrowId - The escrow ID to scope the check to
 * @returns `true` if the event already exists (already processed), `false` otherwise
 *
 * @example
 * ```typescript
 * // Generate event ID
 * const eventId = generateEventId(escrowId, eventType, businessStateHash, occurredAt);
 *
 * // Check idempotency BEFORE creating the event
 * const isDuplicate = await checkEscrowEventIdempotency(prisma, eventId, escrowId);
 * if (isDuplicate) {
 *   return; // Event already processed
 * }
 *
 * // Create event with event ID in payload
 * await prisma.escrowEvent.create({
 *   data: {
 *     escrowId,
 *     eventType: 'ESCROW_CREATED',
 *     payload: {
 *       eventId, // or event_id - both work
 *       // ... other payload fields
 *     },
 *   },
 * });
 * ```
 */
export async function checkEscrowEventIdempotency(
  prisma: PrismaClient,
  eventId: string,
  escrowId: string
): Promise<boolean> {
  return checkEventIdempotency(prisma, 'escrowEvent', eventId, escrowId);
}

/**
 * Creates an escrow event atomically with idempotency protection.
 *
 * This function prevents race conditions by performing the check and create operations
 * atomically within a transaction with row-level locking. If an event with the same
 * eventId already exists, it returns the existing event instead of creating a duplicate.
 *
 * The function locks the escrow row using SELECT FOR UPDATE to prevent concurrent
 * modifications, then checks for an existing event with the same eventId in the payload.
 * If found, it returns the existing event. Otherwise, it creates a new event.
 *
 * **IMPORTANT**: The eventId MUST be included in the payload object as either 'eventId'
 * or 'event_id' for idempotency to work correctly.
 *
 * @param prisma - Prisma client instance (can be a transaction client)
 * @param data - The escrow event data
 * @param data.escrowId - The escrow ID
 * @param data.eventType - The event type (e.g., 'ESCROW_CREATED', 'FUNDS_HELD')
 * @param data.payload - The event payload (MUST include eventId or event_id)
 * @param data.version - Optional event version (defaults to 1)
 * @returns The created or existing escrow event
 *
 * @example
 * ```typescript
 * // Generate event ID
 * const eventId = generateEventId(escrowId, eventType, businessStateHash, occurredAt);
 *
 * // Atomically create event with idempotency protection
 * const event = await createEscrowEventIdempotent(prisma, {
 *   escrowId,
 *   eventType: 'ESCROW_CREATED',
 *   payload: {
 *     eventId, // Must be included for idempotency
 *     amount: 10000,
 *     currency: 'USD',
 *   },
 * });
 * ```
 */
export async function createEscrowEventIdempotent(
  prisma: PrismaClient | TransactionClient,
  data: {
    escrowId: string;
    eventType: string;
    payload: Record<string, unknown> & { eventId?: string; event_id?: string };
    version?: number;
  }
): Promise<{
  id: string;
  escrowId: string;
  eventType: string;
  payload: unknown;
  createdAt: Date;
  version: number;
}> {
  // Extract eventId from payload (support both camelCase and snake_case)
  const eventId = data.payload.eventId || data.payload.event_id;
  if (!eventId) {
    throw new Error(
      'eventId must be included in payload as either "eventId" or "event_id" for idempotency protection'
    );
  }

  // Helper function to perform the check and create logic
  // This type works for both regular PrismaClient and transaction clients
  const performCheckAndCreate = async (
    tx: TransactionClient | PrismaClient
  ) => {
    // Lock the escrow row to prevent concurrent modifications
    // This ensures that only one transaction can check/create events for this escrow at a time
    const escrow = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM escrows WHERE id = ${data.escrowId} FOR UPDATE
    `;

    if (escrow.length === 0) {
      throw new Error(`Escrow with id ${data.escrowId} not found`);
    }

    // Check if event already exists (within the locked transaction)
    const existing = await tx.$queryRaw<
      Array<{
        id: string;
        escrowId: string;
        eventType: string;
        payload: unknown;
        createdAt: Date;
        version: number;
      }>
    >`
      SELECT id, "escrowId", "eventType", payload, "createdAt", version
      FROM escrow_events
      WHERE "escrowId" = ${data.escrowId}
        AND (payload->>'eventId' = ${eventId} OR payload->>'event_id' = ${eventId})
      LIMIT 1
    `;

    if (existing.length > 0) {
      // Event already exists, return it
      const existingEvent = existing[0];
      if (!existingEvent) {
        throw new Error(
          'Unexpected error: existing event array not empty but first element is undefined'
        );
      }
      return existingEvent;
    }

    // Event doesn't exist, create it
    // Cast payload to satisfy Prisma's InputJsonValue type requirement
    const created = await tx.escrowEvent.create({
      data: {
        escrowId: data.escrowId,
        eventType: data.eventType,
        payload: data.payload as any,
        version: data.version ?? 1,
      },
    });

    return {
      id: created.id,
      escrowId: created.escrowId,
      eventType: created.eventType,
      payload: created.payload,
      createdAt: created.createdAt,
      version: created.version,
    };
  };

  // Check if we're already in a transaction (transaction clients don't have $transaction)
  // Use type guard to check if prisma has $transaction method
  if ('$transaction' in prisma && typeof prisma.$transaction === 'function') {
    // Not in a transaction, wrap in $transaction
    return prisma.$transaction(performCheckAndCreate);
  } else {
    // Already in a transaction, use the client directly
    return performCheckAndCreate(prisma);
  }
}
