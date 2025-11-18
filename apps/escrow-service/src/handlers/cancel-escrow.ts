import { createHash } from 'crypto';

import type { PrismaClient, Escrow } from '@bloxtr8/database';
import {
  EscrowCancelledSchema,
  type CancelEscrow,
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
export class CancelEscrowValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CancelEscrowValidationError';
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
 * Handles CancelEscrow command
 *
 * @param command - CancelEscrow protobuf command
 * @param prisma - Prisma client
 * @returns Promise that resolves when handler completes
 */
export async function handleCancelEscrow(
  command: CancelEscrow,
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
      // Before failing, check if escrow is actually in CANCELLED state AND EscrowCancelled event exists (defense in depth)
      // This handles the edge case where transaction succeeded but marking as 'completed' failed
      const existingEscrow = await prisma.escrow.findUnique({
        where: { id: command.escrowId },
      });
      if (existingEscrow?.status === 'CANCELLED') {
        // Check if EscrowCancelled event exists - if not, the event was lost and we need to recreate it
        const escrowCancelledEvent = await prisma.escrowEvent.findFirst({
          where: {
            escrowId: command.escrowId,
            eventType: 'EscrowCancelled',
          },
        });

        if (escrowCancelledEvent) {
          // Escrow is CANCELLED and event exists - the command actually succeeded, just failed to mark as completed
          // Update status to completed and return successfully
          await storeCommandIdempotency(prisma, command.eventId, {
            commandType: 'CancelEscrow',
            escrowId: command.escrowId,
            status: 'completed',
            result: { escrowId: existingEscrow.id },
          });
          return;
        }
        // Escrow is CANCELLED but event doesn't exist - this indicates an inconsistent state
        // With the fix in place (single transaction), this shouldn't occur going forward
        // This error alerts operators to manually fix any existing inconsistent states
        throw new CancelEscrowValidationError(
          `Escrow ${command.escrowId} is in CANCELLED state but EscrowCancelled event is missing. This indicates a previous transaction boundary bug. Manual intervention required.`
        );
      }
      // Escrow is not CANCELLED - command genuinely failed
      throw new CommandPreviouslyFailedError(
        command.eventId,
        existingCommand.error || 'Unknown error'
      );
    }
    if (existingCommand.status === 'pending') {
      // Before throwing, check if escrow is actually in CANCELLED state AND EscrowCancelled event exists (defense in depth)
      // This handles the edge case where transaction succeeded but process crashed
      // before marking as 'completed', leaving status stuck at 'pending'
      const existingEscrow = await prisma.escrow.findUnique({
        where: { id: command.escrowId },
      });
      if (existingEscrow?.status === 'CANCELLED') {
        // Check if EscrowCancelled event exists - if not, the event was lost and we need to recreate it
        const escrowCancelledEvent = await prisma.escrowEvent.findFirst({
          where: {
            escrowId: command.escrowId,
            eventType: 'EscrowCancelled',
          },
        });

        if (escrowCancelledEvent) {
          // Escrow is CANCELLED and event exists - the command actually succeeded, just failed to mark as completed
          // Update status to completed and return successfully (idempotent recovery)
          await storeCommandIdempotency(prisma, command.eventId, {
            commandType: 'CancelEscrow',
            escrowId: command.escrowId,
            status: 'completed',
            result: { escrowId: existingEscrow.id },
          });
          return;
        }
        // Escrow is CANCELLED but event doesn't exist - this is the bug scenario
        // We'll fall through to retry the command, but the state machine will reject it because escrow is already CANCELLED
        // So we need to handle this case differently - we should recreate the event without changing state
        // For now, let's throw an error indicating the inconsistent state
        throw new CancelEscrowValidationError(
          `Escrow ${command.escrowId} is in CANCELLED state but EscrowCancelled event is missing. Manual intervention required.`
        );
      }
      // Escrow is not CANCELLED - command genuinely in progress (concurrent processing)
      throw new CommandInProgressError(command.eventId);
    }
  }

  // Mark command as pending before starting processing
  await storeCommandIdempotency(prisma, command.eventId, {
    commandType: 'CancelEscrow',
    escrowId: command.escrowId,
    status: 'pending',
  });

  // Declare variables at function scope for use after transaction
  let escrowCancelledEventId: string;

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
      throw new CancelEscrowValidationError(
        `Escrow with id ${command.escrowId} not found`
      );
    }

    // Handle actor_id: for TIMEOUT, actor_id may be empty, use 'system'
    // For manual cancellations, actor_id should be provided
    const actorId =
      command.reason === 'TIMEOUT' &&
      (!command.actorId || command.actorId.trim() === '')
        ? 'system'
        : command.actorId;

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

    // Generate deterministic event ID for EscrowCancelled event
    const occurredAt = new Date().toISOString();

    // Generate business state hash for EscrowCancelled event
    // Includes all relevant business state fields that define the cancellation
    const escrowCancelledBusinessState = JSON.stringify({
      escrowId: command.escrowId,
      reason: command.reason,
      actorId,
      status: 'CANCELLED',
    });
    const escrowCancelledBusinessStateHash = createHash('sha256')
      .update(escrowCancelledBusinessState)
      .digest('hex');

    escrowCancelledEventId = generateEventId(
      command.escrowId,
      'EscrowCancelled',
      escrowCancelledBusinessStateHash,
      occurredAt
    );

    // Generate event ID for state transition (used by state machine)
    // This is separate from the EscrowCancelled event ID
    const transitionEventId = generateEventId(
      command.escrowId,
      'CANCELLED',
      escrowCancelledBusinessStateHash,
      occurredAt
    );

    // Prepare state transition (validation and guards - read-only operations)
    // This performs validation and authorization checks before entering the transaction
    // It validates that:
    // - Actor is buyer, seller, or system (via createActorAuthorizationGuard)
    // - Current state is AWAIT_FUNDS (state precondition guard)
    // - Transition AWAIT_FUNDS -> CANCELLED is valid
    const transitionContext = await stateMachine.prepareTransition(
      command.escrowId,
      'CANCELLED',
      actorId,
      transitionEventId,
      'CancelEscrow',
      undefined,
      command.reason
    );

    // Execute state transition and event creation in a single atomic transaction
    // This ensures that if any operation fails, everything rolls back together
    await prisma.$transaction(async tx => {
      const txOutboxRepository = outboxRepository.withTransaction(tx);

      // Execute state transition within the transaction
      // This updates escrow status and creates the state transition EscrowEvent
      const transitionResult =
        await stateMachine.executeTransitionInTransaction(
          transitionContext,
          tx
        );

      // Create EscrowCancelled event (protobuf message)
      const escrowCancelledEvent = create(EscrowCancelledSchema, {
        escrowId: command.escrowId,
        reason: command.reason,
        actorId: command.reason === 'TIMEOUT' ? '' : actorId, // Empty string for TIMEOUT
        eventId: escrowCancelledEventId,
        occurredAt,
        causationId: command.eventId, // CancelEscrow command ID
        version: command.version || 'v1',
      });

      // Create EscrowEvent record for audit trail and idempotency (atomic)
      await createEscrowEventIdempotent(tx, {
        escrowId: command.escrowId,
        eventType: 'EscrowCancelled',
        payload: {
          eventId: escrowCancelledEventId,
          escrowId: command.escrowId,
          reason: command.reason,
          actorId: command.reason === 'TIMEOUT' ? '' : actorId,
          occurredAt,
          causationId: command.eventId,
        },
        version: transitionResult.escrow.version,
      });

      // Create Outbox record for Kafka publishing
      await txOutboxRepository.create({
        aggregateId: command.escrowId,
        eventType: 'EscrowCancelled',
        payload: Buffer.from(
          toBinary(EscrowCancelledSchema, escrowCancelledEvent)
        ),
        version: transitionResult.escrow.version,
      });
    });

    // Mark command as completed after successful transaction
    await storeCommandIdempotency(prisma, command.eventId, {
      commandType: 'CancelEscrow',
      escrowId: command.escrowId,
      status: 'completed',
      result: { escrowId: command.escrowId },
    });
  } catch (error) {
    // Mark command as failed on error
    await storeCommandIdempotency(prisma, command.eventId, {
      commandType: 'CancelEscrow',
      escrowId: command.escrowId,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Validates CancelEscrow command
 *
 * @param command - CancelEscrow command to validate
 * @throws CancelEscrowValidationError if validation fails
 */
function validateCommand(command: CancelEscrow): void {
  if (!command.escrowId || command.escrowId.trim() === '') {
    throw new CancelEscrowValidationError('escrow_id is required');
  }

  if (!command.eventId || command.eventId.trim() === '') {
    throw new CancelEscrowValidationError('event_id is required');
  }

  if (!command.reason || command.reason.trim() === '') {
    throw new CancelEscrowValidationError('reason is required');
  }

  const validReasons = [
    'TIMEOUT',
    'BUYER_CANCELLED',
    'SELLER_CANCELLED',
    'ADMIN',
  ];
  if (!validReasons.includes(command.reason)) {
    throw new CancelEscrowValidationError(
      `reason must be one of: ${validReasons.join(', ')}, got: ${command.reason}`
    );
  }

  // For manual cancellations (not TIMEOUT), actor_id is required
  if (command.reason !== 'TIMEOUT') {
    if (!command.actorId || command.actorId.trim() === '') {
      throw new CancelEscrowValidationError(
        'actor_id is required for manual cancellations'
      );
    }
  }
}
