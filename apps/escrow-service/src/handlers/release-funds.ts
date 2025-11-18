import { createHash } from 'crypto';

import type { PrismaClient, Escrow } from '@bloxtr8/database';
import type { KafkaProducer } from '@bloxtr8/kafka-client';
import {
  EscrowReleasedSchema,
  TransferToSellerSchema,
  type ReleaseFunds,
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
export class ReleaseFundsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReleaseFundsValidationError';
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
 * Handles ReleaseFunds command
 *
 * @param command - ReleaseFunds protobuf command
 * @param prisma - Prisma client
 * @param producer - Kafka producer for emitting commands
 * @returns Promise that resolves when handler completes
 */
export async function handleReleaseFunds(
  command: ReleaseFunds,
  prisma: PrismaClient,
  producer: KafkaProducer
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
      // Before failing, check if escrow is actually in RELEASED state AND EscrowReleased event exists (defense in depth)
      // This handles the edge case where transaction succeeded but marking as 'completed' failed
      const existingEscrow = await prisma.escrow.findUnique({
        where: { id: command.escrowId },
      });
      if (existingEscrow?.status === 'RELEASED') {
        // Check if EscrowReleased event exists - if not, the event was lost and we need to recreate it
        const escrowReleasedEvent = await prisma.escrowEvent.findFirst({
          where: {
            escrowId: command.escrowId,
            eventType: 'EscrowReleased',
          },
        });

        if (escrowReleasedEvent) {
          // Escrow is RELEASED and event exists - the command actually succeeded, just failed to mark as completed
          // Update status to completed and return successfully
          await storeCommandIdempotency(prisma, command.eventId, {
            commandType: 'ReleaseFunds',
            escrowId: command.escrowId,
            status: 'completed',
            result: { escrowId: existingEscrow.id },
          });
          return;
        }
        // Escrow is RELEASED but event doesn't exist - this indicates an inconsistent state
        // With the fix in place (single transaction), this shouldn't occur going forward
        // This error alerts operators to manually fix any existing inconsistent states
        throw new ReleaseFundsValidationError(
          `Escrow ${command.escrowId} is in RELEASED state but EscrowReleased event is missing. This indicates a previous transaction boundary bug. Manual intervention required.`
        );
      }
      // Escrow is not RELEASED - command genuinely failed
      throw new CommandPreviouslyFailedError(
        command.eventId,
        existingCommand.error || 'Unknown error'
      );
    }
    if (existingCommand.status === 'pending') {
      // Before throwing, check if escrow is actually in RELEASED state AND EscrowReleased event exists (defense in depth)
      // This handles the edge case where transaction succeeded but process crashed
      // before marking as 'completed', leaving status stuck at 'pending'
      const existingEscrow = await prisma.escrow.findUnique({
        where: { id: command.escrowId },
      });
      if (existingEscrow?.status === 'RELEASED') {
        // Check if EscrowReleased event exists - if not, the event was lost and we need to recreate it
        const escrowReleasedEvent = await prisma.escrowEvent.findFirst({
          where: {
            escrowId: command.escrowId,
            eventType: 'EscrowReleased',
          },
        });

        if (escrowReleasedEvent) {
          // Escrow is RELEASED and event exists - the command actually succeeded, just failed to mark as completed
          // Update status to completed and return successfully (idempotent recovery)
          await storeCommandIdempotency(prisma, command.eventId, {
            commandType: 'ReleaseFunds',
            escrowId: command.escrowId,
            status: 'completed',
            result: { escrowId: existingEscrow.id },
          });
          return;
        }
        // Escrow is RELEASED but event doesn't exist - this is the bug scenario
        // We'll fall through to retry the command, but the state machine will reject it because escrow is already RELEASED
        // So we need to handle this case differently - we should recreate the event without changing state
        // For now, let's throw an error indicating the inconsistent state
        throw new ReleaseFundsValidationError(
          `Escrow ${command.escrowId} is in RELEASED state but EscrowReleased event is missing. Manual intervention required.`
        );
      }
      // Escrow is not RELEASED - command genuinely in progress (concurrent processing)
      throw new CommandInProgressError(command.eventId);
    }
  }

  // Mark command as pending before starting processing
  await storeCommandIdempotency(prisma, command.eventId, {
    commandType: 'ReleaseFunds',
    escrowId: command.escrowId,
    status: 'pending',
  });

  // Declare variables at function scope for use after transaction
  let escrowReleasedEventId: string;
  let sellerAccountId: string;
  let provider: string;

  try {
    const escrowRepository = new EscrowRepository(prisma);
    const outboxRepository = new OutboxRepository(prisma);

    // Fetch escrow with offer relation to get buyer/seller IDs and rail-specific data
    const escrow = (await escrowRepository.findById(command.escrowId, {
      offer: {
        select: {
          buyerId: true,
          sellerId: true,
          seller: {
            select: {
              stripeAccountId: true,
            },
          },
        },
      },
      stripeEscrow: {
        select: {
          id: true,
        },
      },
      stablecoinEscrow: {
        select: {
          custodianSellerWalletId: true,
        },
      },
    })) as
      | (Escrow & {
          offer?: {
            buyerId: string;
            sellerId: string;
            seller?: { stripeAccountId: string | null };
          };
          stripeEscrow?: { id: string } | null;
          stablecoinEscrow?: { custodianSellerWalletId: string | null } | null;
        })
      | null;

    if (!escrow) {
      throw new ReleaseFundsValidationError(
        `Escrow with id ${command.escrowId} not found`
      );
    }

    // Determine provider and seller account ID based on rail
    if (escrow.rail === 'STRIPE') {
      provider = 'stripe';
      if (!escrow.offer?.seller?.stripeAccountId) {
        throw new ReleaseFundsValidationError(
          `Seller ${escrow.offer?.sellerId} does not have a Stripe account for escrow ${command.escrowId}`
        );
      }
      sellerAccountId = escrow.offer.seller.stripeAccountId;
    } else if (escrow.rail === 'USDC_BASE') {
      provider = 'custodian';
      if (!escrow.stablecoinEscrow?.custodianSellerWalletId) {
        throw new ReleaseFundsValidationError(
          `Escrow ${command.escrowId} does not have a custodian seller wallet ID`
        );
      }
      sellerAccountId = escrow.stablecoinEscrow.custodianSellerWalletId;
    } else {
      throw new ReleaseFundsValidationError(
        `Unknown rail type: ${escrow.rail}`
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

    // Generate deterministic event ID for EscrowReleased event
    const occurredAt = new Date().toISOString();

    // Generate business state hash for EscrowReleased event
    // Includes all relevant business state fields that define the release
    const escrowReleasedBusinessState = JSON.stringify({
      escrowId: command.escrowId,
      actorId: command.actorId,
      status: 'RELEASED',
      provider,
    });
    const escrowReleasedBusinessStateHash = createHash('sha256')
      .update(escrowReleasedBusinessState)
      .digest('hex');

    escrowReleasedEventId = generateEventId(
      command.escrowId,
      'EscrowReleased',
      escrowReleasedBusinessStateHash,
      occurredAt
    );

    // Generate event ID for state transition (used by state machine)
    // This is separate from the EscrowReleased event ID
    const transitionEventId = generateEventId(
      command.escrowId,
      'RELEASED',
      escrowReleasedBusinessStateHash,
      occurredAt
    );

    // Prepare state transition (validation and guards - read-only operations)
    // This performs validation and authorization checks before entering the transaction
    // It validates that:
    // - Actor is buyer (via createActorAuthorizationGuard)
    // - Current state is DELIVERED (state precondition guard)
    // - Transition DELIVERED -> RELEASED is valid
    const transitionContext = await stateMachine.prepareTransition(
      command.escrowId,
      'RELEASED',
      command.actorId,
      transitionEventId,
      'ReleaseFunds'
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

      // Create EscrowReleased event (protobuf message)
      // Note: transfer_id will be set later when TransferSucceeded event is received
      const escrowReleasedEvent = create(EscrowReleasedSchema, {
        escrowId: command.escrowId,
        provider,
        transferId: '', // Will be populated when transfer completes
        eventId: escrowReleasedEventId,
        occurredAt,
        causationId: command.eventId, // ReleaseFunds command ID
        version: command.version || 'v1',
      });

      // Create EscrowEvent record for audit trail and idempotency (atomic)
      await createEscrowEventIdempotent(tx, {
        escrowId: command.escrowId,
        eventType: 'EscrowReleased',
        payload: {
          eventId: escrowReleasedEventId,
          escrowId: command.escrowId,
          provider,
          transferId: '', // Will be populated when transfer completes
          occurredAt,
          causationId: command.eventId,
        },
        version: transitionResult.escrow.version,
      });

      // Create Outbox record for Kafka publishing
      await txOutboxRepository.create({
        aggregateId: command.escrowId,
        eventType: 'EscrowReleased',
        payload: Buffer.from(
          toBinary(EscrowReleasedSchema, escrowReleasedEvent)
        ),
        version: transitionResult.escrow.version,
      });
    });

    // Mark command as completed after successful transaction
    await storeCommandIdempotency(prisma, command.eventId, {
      commandType: 'ReleaseFunds',
      escrowId: command.escrowId,
      status: 'completed',
      result: { escrowId: command.escrowId },
    });
  } catch (error) {
    // Mark command as failed on error
    await storeCommandIdempotency(prisma, command.eventId, {
      commandType: 'ReleaseFunds',
      escrowId: command.escrowId,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  // Emit TransferToSeller command after transaction commits and command is marked complete
  // This is outside the try-catch to prevent producer failures from marking the command as failed
  // If producer.send() fails, the escrow is still successfully released and the command remains 'completed'
  try {
    const transferToSellerCommand = create(TransferToSellerSchema, {
      escrowId: command.escrowId,
      sellerAccountId,
      provider: provider as 'stripe' | 'custodian',
      traceId: command.traceId,
      causationId: escrowReleasedEventId, // Use EscrowReleased event ID as causation
      correlationId: command.correlationId,
      version: command.version || 'v1',
    });

    await producer.send('payments.commands.v1', {
      key: command.escrowId,
      value: Buffer.from(
        toBinary(TransferToSellerSchema, transferToSellerCommand)
      ),
      headers: {
        'content-type': 'application/protobuf',
        'trace-id': command.traceId,
        'correlation-id': command.correlationId,
      },
    });
  } catch (error) {
    // Log producer error but don't fail the command - escrow is already released
    // The payment service will need to handle missing transfer commands via reconciliation
    console.error('Failed to send TransferToSeller command', {
      escrowId: command.escrowId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    // Note: Consider implementing a retry mechanism or dead letter queue for failed producer sends
  }
}

/**
 * Validates ReleaseFunds command
 *
 * @param command - ReleaseFunds command to validate
 * @throws ReleaseFundsValidationError if validation fails
 */
function validateCommand(command: ReleaseFunds): void {
  if (!command.escrowId || command.escrowId.trim() === '') {
    throw new ReleaseFundsValidationError('escrow_id is required');
  }

  if (!command.actorId || command.actorId.trim() === '') {
    throw new ReleaseFundsValidationError('actor_id is required');
  }

  if (!command.eventId || command.eventId.trim() === '') {
    throw new ReleaseFundsValidationError('event_id is required');
  }
}
