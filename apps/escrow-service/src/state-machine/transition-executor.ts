import type { PrismaClient, Prisma } from '@bloxtr8/database';

import { EscrowRepository } from '../repositories/escrow-repository.js';

import { TransitionExecutionError } from './errors.js';
import type { TransitionContext, TransitionResult } from './types.js';

/**
 * Executes state transitions atomically in database transactions
 */
export class TransitionExecutor {
  private readonly escrowRepository: EscrowRepository;

  constructor(private readonly prisma: PrismaClient) {
    this.escrowRepository = new EscrowRepository(prisma);
  }

  /**
   * Executes a state transition atomically
   *
   * @param context - Transition context
   * @returns Transition result with updated escrow
   * @throws TransitionExecutionError if execution fails
   */
  async executeTransition(
    context: TransitionContext
  ): Promise<TransitionResult> {
    try {
      return await this.prisma.$transaction(async tx => {
        const txEscrowRepository = this.escrowRepository.withTransaction(tx);

        // Fetch current escrow with version for optimistic locking
        const currentEscrow = await txEscrowRepository.findByIdOrThrow(
          context.escrowId
        );

        // Verify current state matches
        if (currentEscrow.status !== context.currentState) {
          throw new TransitionExecutionError(
            context.escrowId,
            context.targetState,
            new Error(
              `Escrow is in state ${currentEscrow.status}, expected ${context.currentState}`
            )
          );
        }

        // Update escrow status with optimistic locking
        const updatedEscrow = await txEscrowRepository.updateStatus(
          context.escrowId,
          context.targetState,
          currentEscrow.version
        );

        // Check for duplicate eventId inside transaction to prevent race conditions
        // This ensures idempotency even with concurrent requests
        // Check right before creating the event to see any events from concurrent transactions that have committed
        const existingEvents = await tx.escrowEvent.findMany({
          where: {
            escrowId: context.escrowId,
          },
        });

        // Check if any existing event has the same eventId in its payload
        for (const event of existingEvents) {
          const payload = event.payload as { eventId?: string };
          if (payload?.eventId === context.eventId) {
            throw new TransitionExecutionError(
              context.escrowId,
              context.targetState,
              new Error(
                `Event with id ${context.eventId} has already been processed`
              )
            );
          }
        }

        // Create EscrowEvent record for audit trail
        await tx.escrowEvent.create({
          data: {
            escrowId: context.escrowId,
            eventType: context.targetState,
            payload: {
              eventId: context.eventId,
              actorId: context.actorId,
              previousState: context.currentState,
              newState: context.targetState,
              reason: context.reason,
              metadata: context.metadata,
              timestamp: new Date().toISOString(),
            },
            version: updatedEscrow.version,
          },
        });

        return {
          success: true,
          escrow: updatedEscrow,
        };
      });
    } catch (error) {
      if (error instanceof TransitionExecutionError) {
        throw error;
      }

      throw new TransitionExecutionError(
        context.escrowId,
        context.targetState,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Executes a state transition within an existing transaction
   * This allows combining the state transition with other operations atomically
   *
   * @param context - Transition context
   * @param tx - Prisma transaction client
   * @returns Transition result with updated escrow
   * @throws TransitionExecutionError if execution fails
   */
  async executeTransitionInTransaction(
    context: TransitionContext,
    tx: Prisma.TransactionClient
  ): Promise<TransitionResult> {
    try {
      const txEscrowRepository = this.escrowRepository.withTransaction(tx);

      // Fetch current escrow with version for optimistic locking
      const currentEscrow = await txEscrowRepository.findByIdOrThrow(
        context.escrowId
      );

      // Verify current state matches
      if (currentEscrow.status !== context.currentState) {
        throw new TransitionExecutionError(
          context.escrowId,
          context.targetState,
          new Error(
            `Escrow is in state ${currentEscrow.status}, expected ${context.currentState}`
          )
        );
      }

      // Update escrow status with optimistic locking
      const updatedEscrow = await txEscrowRepository.updateStatus(
        context.escrowId,
        context.targetState,
        currentEscrow.version
      );

      // Check for duplicate eventId inside transaction to prevent race conditions
      // This ensures idempotency even with concurrent requests
      // Check right before creating the event to see any events from concurrent transactions that have committed
      const existingEvents = await tx.escrowEvent.findMany({
        where: {
          escrowId: context.escrowId,
        },
      });

      // Check if any existing event has the same eventId in its payload
      for (const event of existingEvents) {
        const payload = event.payload as { eventId?: string };
        if (payload?.eventId === context.eventId) {
          throw new TransitionExecutionError(
            context.escrowId,
            context.targetState,
            new Error(
              `Event with id ${context.eventId} has already been processed`
            )
          );
        }
      }

      // Create EscrowEvent record for audit trail
      await tx.escrowEvent.create({
        data: {
          escrowId: context.escrowId,
          eventType: context.targetState,
          payload: {
            eventId: context.eventId,
            actorId: context.actorId,
            previousState: context.currentState,
            newState: context.targetState,
            reason: context.reason,
            metadata: context.metadata,
            timestamp: new Date().toISOString(),
          },
          version: updatedEscrow.version,
        },
      });

      return {
        success: true,
        escrow: updatedEscrow,
      };
    } catch (error) {
      if (error instanceof TransitionExecutionError) {
        throw error;
      }

      throw new TransitionExecutionError(
        context.escrowId,
        context.targetState,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }
}
