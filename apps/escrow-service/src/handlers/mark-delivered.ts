import { createHash } from 'crypto';

import type { PrismaClient, Escrow } from '@bloxtr8/database';
import {
  EscrowDeliveredSchema,
  type MarkDelivered,
} from '@bloxtr8/protobuf-schemas';
import {
  generateEventId,
  createEscrowEventIdempotent,
  checkCommandIdempotency,
  storeCommandIdempotency,
} from '@bloxtr8/shared';
import { create, toBinary } from '@bufbuild/protobuf';

import { EscrowRepository } from '../repositories/escrow-repository.js';
import { OutboxRepository } from '../repositories/outbox-repository.js';
import { EscrowStateMachine } from '../state-machine/index.js';

/**
 * Error thrown when command validation fails
 */
export class MarkDeliveredValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MarkDeliveredValidationError';
  }
}

/**
 * Error thrown when command with same eventId was already processed successfully
 */
export class CommandAlreadyProcessedError extends Error {
  constructor(public readonly eventId: string) {
    super(
      `Command with eventId ${eventId} has already been processed successfully`
    );
    this.name = 'CommandAlreadyProcessedError';
  }
}

/**
 * Error thrown when command with same eventId is currently being processed
 */
export class CommandInProgressError extends Error {
  constructor(public readonly eventId: string) {
    super(`Command with eventId ${eventId} is currently being processed`);
    this.name = 'CommandInProgressError';
  }
}

/**
 * Error thrown when command with same eventId previously failed
 */
export class CommandPreviouslyFailedError extends Error {
  constructor(
    public readonly eventId: string,
    public readonly previousError: string
  ) {
    super(
      `Command with eventId ${eventId} previously failed: ${previousError}`
    );
    this.name = 'CommandPreviouslyFailedError';
  }
}

/**
 * Handles MarkDelivered command
 *
 * @param command - MarkDelivered protobuf command
 * @param prisma - Prisma client
 * @returns Promise that resolves when handler completes
 */
export async function handleMarkDelivered(
  command: MarkDelivered,
  prisma: PrismaClient
): Promise<void> {
  // Validate command (including eventId)
  validateCommand(command);

  // Check command-level idempotency using eventId
  const existingCommand = await checkCommandIdempotency(
    prisma,
    command.eventId
  );

  if (existingCommand) {
    if (existingCommand.status === 'completed') {
      // Command already processed successfully - idempotent success
      return;
    }
    if (existingCommand.status === 'failed') {
      // Before failing, check if escrow is actually in DELIVERED state AND EscrowDelivered event exists (defense in depth)
      // This handles the edge case where transaction succeeded but marking as 'completed' failed
      const existingEscrow = await prisma.escrow.findUnique({
        where: { id: command.escrowId },
      });
      if (existingEscrow?.status === 'DELIVERED') {
        // Check if EscrowDelivered event exists - if not, the event was lost and we need to recreate it
        const escrowDeliveredEvent = await prisma.escrowEvent.findFirst({
          where: {
            escrowId: command.escrowId,
            eventType: 'EscrowDelivered',
          },
        });

        if (escrowDeliveredEvent) {
          // Escrow is DELIVERED and event exists - the command actually succeeded, just failed to mark as completed
          // Update status to completed and return successfully
          await storeCommandIdempotency(prisma, command.eventId, {
            commandType: 'MarkDelivered',
            escrowId: command.escrowId,
            status: 'completed',
            result: { escrowId: existingEscrow.id },
          });
          return;
        }
        // Escrow is DELIVERED but event doesn't exist - this indicates an inconsistent state
        // With the fix in place (single transaction), this shouldn't occur going forward
        // This error alerts operators to manually fix any existing inconsistent states
        throw new MarkDeliveredValidationError(
          `Escrow ${command.escrowId} is in DELIVERED state but EscrowDelivered event is missing. This indicates a previous transaction boundary bug. Manual intervention required.`
        );
      }
      // Escrow is not DELIVERED - command genuinely failed
      throw new CommandPreviouslyFailedError(
        command.eventId,
        existingCommand.error || 'Unknown error'
      );
    }
    if (existingCommand.status === 'pending') {
      // Before throwing, check if escrow is actually in DELIVERED state AND EscrowDelivered event exists (defense in depth)
      // This handles the edge case where transaction succeeded but process crashed
      // before marking as 'completed', leaving status stuck at 'pending'
      const existingEscrow = await prisma.escrow.findUnique({
        where: { id: command.escrowId },
      });
      if (existingEscrow?.status === 'DELIVERED') {
        // Check if EscrowDelivered event exists - if not, the event was lost and we need to recreate it
        const escrowDeliveredEvent = await prisma.escrowEvent.findFirst({
          where: {
            escrowId: command.escrowId,
            eventType: 'EscrowDelivered',
          },
        });

        if (escrowDeliveredEvent) {
          // Escrow is DELIVERED and event exists - the command actually succeeded, just failed to mark as completed
          // Update status to completed and return successfully (idempotent recovery)
          await storeCommandIdempotency(prisma, command.eventId, {
            commandType: 'MarkDelivered',
            escrowId: command.escrowId,
            status: 'completed',
            result: { escrowId: existingEscrow.id },
          });
          return;
        }
        // Escrow is DELIVERED but event doesn't exist - this is the bug scenario
        // We'll fall through to retry the command, which will recreate the event
        // But first, we need to rollback the escrow status since the transaction will fail
        // Actually, we can't rollback here - the state transition already happened
        // The best we can do is let it retry, but the state machine will reject it because escrow is already DELIVERED
        // So we need to handle this case differently - we should recreate the event without changing state
        // For now, let's throw an error indicating the inconsistent state
        throw new MarkDeliveredValidationError(
          `Escrow ${command.escrowId} is in DELIVERED state but EscrowDelivered event is missing. Manual intervention required.`
        );
      }
      // Escrow is not DELIVERED - command genuinely in progress (concurrent processing)
      throw new CommandInProgressError(command.eventId);
    }
  }

  // Mark command as pending before starting processing
  await storeCommandIdempotency(prisma, command.eventId, {
    commandType: 'MarkDelivered',
    escrowId: command.escrowId,
    status: 'pending',
  });

  // Declare variables at function scope for use after transaction
  let escrowDeliveredEventId: string;

  try {
    const escrowRepository = new EscrowRepository(prisma);
    const outboxRepository = new OutboxRepository(prisma);

    // Fetch escrow with offer relation to get buyer/seller IDs
    const escrow = (await escrowRepository.findById(command.escrowId, {
      offer: {
        select: {
          buyerId: true,
          sellerId: true,
        },
      },
    })) as
      | (Escrow & {
          offer?: { buyerId: string; sellerId: string };
        })
      | null;

    if (!escrow) {
      throw new MarkDeliveredValidationError(
        `Escrow with id ${command.escrowId} not found`
      );
    }

    // Initialize state machine with buyer/seller ID extractors
    const stateMachine = new EscrowStateMachine(prisma, {
      getBuyerId: (e: Escrow) => {
        const escrowWithOffer = e as Escrow & {
          offer?: { buyerId: string; sellerId: string };
        };
        return escrowWithOffer.offer?.buyerId ?? null;
      },
      getSellerId: (e: Escrow) => {
        const escrowWithOffer = e as Escrow & {
          offer?: { buyerId: string; sellerId: string };
        };
        return escrowWithOffer.offer?.sellerId ?? null;
      },
    });

    // Generate deterministic event ID for EscrowDelivered event
    const occurredAt = new Date().toISOString();

    // Generate business state hash for EscrowDelivered event
    // Includes all relevant business state fields that define the delivery
    const escrowDeliveredBusinessState = JSON.stringify({
      escrowId: command.escrowId,
      actorId: command.actorId,
      status: 'DELIVERED',
    });
    const escrowDeliveredBusinessStateHash = createHash('sha256')
      .update(escrowDeliveredBusinessState)
      .digest('hex');

    escrowDeliveredEventId = generateEventId(
      command.escrowId,
      'EscrowDelivered',
      escrowDeliveredBusinessStateHash,
      occurredAt
    );

    // Generate event ID for state transition (used by state machine)
    // This is separate from the EscrowDelivered event ID
    const transitionEventId = generateEventId(
      command.escrowId,
      'DELIVERED',
      escrowDeliveredBusinessStateHash,
      occurredAt
    );

    // Prepare state transition (validation and guards - read-only operations)
    // This performs validation and authorization checks before entering the transaction
    const transitionContext = await stateMachine.prepareTransition(
      command.escrowId,
      'DELIVERED',
      command.actorId,
      transitionEventId,
      'MarkDelivered'
    );

    // Execute state transition and event creation in a single atomic transaction
    // This ensures that if any operation fails, everything rolls back together
    await prisma.$transaction(async tx => {
      const txOutboxRepository = outboxRepository.withTransaction(tx);

      // Execute state transition within the transaction
      // This updates escrow status and creates the state transition EscrowEvent
      await stateMachine.executeTransitionInTransaction(transitionContext, tx);

      // Create EscrowDelivered event (protobuf message)
      const escrowDeliveredEvent = create(EscrowDeliveredSchema, {
        escrowId: command.escrowId,
        actorId: command.actorId,
        eventId: escrowDeliveredEventId,
        occurredAt,
        causationId: command.eventId, // MarkDelivered command ID
        version: command.version || 'v1',
      });

      // Create EscrowEvent record for audit trail and idempotency (atomic)
      await createEscrowEventIdempotent(tx, {
        escrowId: command.escrowId,
        eventType: 'EscrowDelivered',
        payload: {
          eventId: escrowDeliveredEventId,
          escrowId: command.escrowId,
          actorId: command.actorId,
          occurredAt,
          causationId: command.eventId,
        },
        version: 1,
      });

      // Create Outbox record for Kafka publishing
      await txOutboxRepository.create({
        aggregateId: command.escrowId,
        eventType: 'EscrowDelivered',
        payload: Buffer.from(
          toBinary(EscrowDeliveredSchema, escrowDeliveredEvent)
        ),
        version: 1,
      });
    });

    // Mark command as completed after successful transaction
    await storeCommandIdempotency(prisma, command.eventId, {
      commandType: 'MarkDelivered',
      escrowId: command.escrowId,
      status: 'completed',
      result: { escrowId: command.escrowId },
    });
  } catch (error) {
    // Mark command as failed on error
    await storeCommandIdempotency(prisma, command.eventId, {
      commandType: 'MarkDelivered',
      escrowId: command.escrowId,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Validates MarkDelivered command
 *
 * @param command - MarkDelivered command to validate
 * @throws MarkDeliveredValidationError if validation fails
 */
function validateCommand(command: MarkDelivered): void {
  if (!command.escrowId || command.escrowId.trim() === '') {
    throw new MarkDeliveredValidationError('escrow_id is required');
  }

  if (!command.actorId || command.actorId.trim() === '') {
    throw new MarkDeliveredValidationError('actor_id is required');
  }

  if (!command.eventId || command.eventId.trim() === '') {
    throw new MarkDeliveredValidationError('event_id is required');
  }
}
