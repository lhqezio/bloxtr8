import type { PrismaClient } from '@bloxtr8/database';
import type { Prisma } from '@bloxtr8/database';

// Type for Prisma transaction client (the parameter type of $transaction callback)
type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * Command-Level Idempotency Utilities
 *
 * **Important:** This module handles COMMAND idempotency, not domain event idempotency.
 *
 * **Command ID Strategy:**
 * - Commands use `eventId` PROVIDED by sender (API Gateway) in protobuf message
 * - The sender generates a unique eventId for each command to enable safe retries
 * - This eventId is stored in `CommandIdempotency` table for deduplication
 *
 * **Domain Event ID Strategy:**
 * - Domain events use DETERMINISTIC ID generation via `generateEventId()` in event-utils.ts
 * - Same business state always produces the same event ID
 * - See `event-utils.ts` for domain event idempotency utilities
 *
 * **Why Different Approaches?**
 * - Commands: External retry safety - sender can retry with same eventId
 * - Events: Internal consistency - deterministic IDs enable event sourcing replay
 */

/**
 * Status of a command idempotency record
 */
export type CommandIdempotencyStatus = 'pending' | 'completed' | 'failed';

/**
 * Record representing command idempotency state
 */
export interface CommandIdempotencyRecord {
  eventId: string;
  commandType: string;
  escrowId?: string | null;
  status: CommandIdempotencyStatus;
  result?: unknown;
  error?: string | null;
  createdAt: Date;
  completedAt?: Date | null;
}

/**
 * Data for storing command idempotency
 */
export interface CommandIdempotencyData {
  commandType: string;
  escrowId?: string | null;
  status: CommandIdempotencyStatus;
  result?: unknown;
  error?: string | null;
}

/**
 * Checks if a command with the given eventId has already been processed.
 *
 * @param prisma - Prisma client instance (can be transaction client)
 * @param eventId - The command event ID to check
 * @returns The idempotency record if exists, null otherwise
 *
 * @example
 * ```typescript
 * const record = await checkCommandIdempotency(prisma, command.eventId);
 * if (record?.status === 'completed') {
 *   return; // Command already processed successfully
 * }
 * ```
 */
export async function checkCommandIdempotency(
  prisma: PrismaClient | TransactionClient,
  eventId: string
): Promise<CommandIdempotencyRecord | null> {
  // Access commandIdempotency model (may need type assertion until types are fully generated)
  const record = await (prisma as any).commandIdempotency.findUnique({
    where: { eventId },
  });

  if (!record) {
    return null;
  }

  return {
    eventId: record.eventId,
    commandType: record.commandType,
    escrowId: record.escrowId,
    status: record.status as CommandIdempotencyStatus,
    result: record.result,
    error: record.error,
    createdAt: record.createdAt,
    completedAt: record.completedAt,
  };
}

/**
 * Stores command idempotency record atomically.
 * Uses upsert to handle race conditions when multiple instances process the same command.
 *
 * @param prisma - Prisma client instance (can be transaction client)
 * @param eventId - The command event ID
 * @param data - Idempotency data to store
 *
 * @example
 * ```typescript
 * // Mark as pending at start
 * await storeCommandIdempotency(tx, command.eventId, {
 *   commandType: 'CreateEscrow',
 *   escrowId: command.escrowId,
 *   status: 'pending',
 * });
 *
 * // Mark as completed after success
 * await storeCommandIdempotency(tx, command.eventId, {
 *   commandType: 'CreateEscrow',
 *   escrowId: command.escrowId,
 *   status: 'completed',
 *   result: { escrowId: escrow.id },
 * });
 * ```
 */
export async function storeCommandIdempotency(
  prisma: PrismaClient | TransactionClient,
  eventId: string,
  data: CommandIdempotencyData
): Promise<void> {
  // Access commandIdempotency model (may need type assertion until types are fully generated)
  await (prisma as any).commandIdempotency.upsert({
    where: { eventId },
    create: {
      eventId,
      commandType: data.commandType,
      escrowId: data.escrowId,
      status: data.status,
      result: data.result as Prisma.JsonValue | undefined,
      error: data.error,
      completedAt: data.status !== 'pending' ? new Date() : null,
    },
    update: {
      status: data.status,
      result: data.result as Prisma.JsonValue | undefined,
      error: data.error,
      completedAt: data.status !== 'pending' ? new Date() : null,
    },
  });
}
