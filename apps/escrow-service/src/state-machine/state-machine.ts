import type {
  PrismaClient,
  Escrow,
  EscrowStatus,
  Prisma,
} from '@bloxtr8/database';

import {
  EscrowRepository,
  EscrowNotFoundError,
} from '../repositories/escrow-repository.js';

import { createActorAuthorizationGuard } from './guards/actor-authorization-guard.js';
import { GuardExecutor } from './guards/guard-executor.js';
import {
  statePreconditionGuard,
  createIdempotencyGuard,
  businessRulesGuard,
} from './guards/index.js';
import { TransitionExecutor } from './transition-executor.js';
import { TransitionValidator } from './transition-validator.js';
import type {
  Guard,
  TransitionContext,
  TransitionResult,
  TransitionAction,
} from './types.js';

/**
 * Options for configuring the state machine
 */
export interface EscrowStateMachineOptions {
  /** Function to get buyer ID from escrow */
  // eslint-disable-next-line no-unused-vars
  getBuyerId: (escrow: Escrow) => string | null;
  /** Function to get seller ID from escrow */
  // eslint-disable-next-line no-unused-vars
  getSellerId: (escrow: Escrow) => string | null;
  /** Function to check if actor is admin */
  // eslint-disable-next-line no-unused-vars
  isAdmin?: (actorId: string) => boolean | Promise<boolean>;
  /** Additional custom guards */
  customGuards?: Guard[];
}

/**
 * Main state machine class that orchestrates validation, guard checking, and execution
 */
export class EscrowStateMachine {
  private readonly escrowRepository: EscrowRepository;
  private readonly transitionExecutor: TransitionExecutor;
  // eslint-disable-next-line no-unused-vars
  private readonly getBuyerId: (escrow: Escrow) => string | null;
  // eslint-disable-next-line no-unused-vars
  private readonly getSellerId: (escrow: Escrow) => string | null;
  // eslint-disable-next-line no-unused-vars
  private readonly isAdmin: (actorId: string) => boolean | Promise<boolean>;
  private readonly customGuards: Guard[];

  constructor(
    private readonly prisma: PrismaClient,
    options: EscrowStateMachineOptions
  ) {
    this.escrowRepository = new EscrowRepository(prisma);
    this.transitionExecutor = new TransitionExecutor(prisma);
    this.getBuyerId = options.getBuyerId;
    this.getSellerId = options.getSellerId;
    this.isAdmin = options.isAdmin ?? (() => false);
    this.customGuards = options.customGuards ?? [];
  }

  /**
   * Transitions an escrow from current state to target state
   *
   * @param escrowId - ID of the escrow
   * @param targetState - Target state to transition to
   * @param actorId - ID of the actor performing the transition
   * @param eventId - Unique event ID for idempotency
   * @param action - Action type for authorization
   * @param metadata - Optional metadata
   * @param reason - Optional reason for transition
   * @returns Transition result with updated escrow
   */
  async transition(
    escrowId: string,
    targetState: EscrowStatus,
    actorId: string,
    eventId: string,
    action: TransitionAction,
    metadata?: unknown,
    reason?: string
  ): Promise<TransitionResult> {
    // Fetch escrow with offer relation to get buyer/seller IDs
    const escrow = (await this.escrowRepository.findById(escrowId, {
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
      throw new EscrowNotFoundError(escrowId);
    }

    const currentState = escrow.status;

    // Create transition context
    const context: TransitionContext = {
      escrowId,
      currentState,
      targetState,
      actorId,
      eventId,
      metadata: metadata as Prisma.InputJsonValue,
      reason,
    };

    // Step 1: Validate transition
    TransitionValidator.validateTransition(context);

    // Step 2: Build guard list
    const guards: Guard[] = [
      // State precondition guard
      statePreconditionGuard,
      // Idempotency guard
      createIdempotencyGuard(this.prisma),
      // Actor authorization guard
      createActorAuthorizationGuard(
        action,
        this.getBuyerId,
        this.getSellerId,
        this.isAdmin
      ),
      // Business rules guard
      businessRulesGuard,
      // Custom guards
      ...this.customGuards,
    ];

    // Step 3: Execute guards
    await GuardExecutor.executeGuards(guards, context, escrow);

    // Step 4: Execute transition
    return await this.transitionExecutor.executeTransition(context);
  }

  /**
   * Checks if a transition is valid without executing it
   *
   * @param escrowId - ID of the escrow
   * @param targetState - Target state to check
   * @param actorId - ID of the actor
   * @param action - Action type for authorization
   * @returns True if transition would be valid
   */
  async canTransition(
    escrowId: string,
    targetState: EscrowStatus,
    actorId: string,
    action: TransitionAction
  ): Promise<{ allowed: boolean; reason?: string }> {
    try {
      const escrow = (await this.escrowRepository.findById(escrowId, {
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
        return { allowed: false, reason: 'Escrow not found' };
      }

      const context: TransitionContext = {
        escrowId,
        currentState: escrow.status,
        targetState,
        actorId,
        eventId: 'check-only', // Dummy event ID for validation
      };

      // Validate transition
      if (
        !TransitionValidator.isValidTransition(
          context.currentState,
          targetState
        )
      ) {
        return {
          allowed: false,
          reason: `Invalid transition from ${context.currentState} to ${targetState}`,
        };
      }

      // Check guards (without idempotency check since this is just a check)
      const guards: Guard[] = [
        statePreconditionGuard,
        createActorAuthorizationGuard(
          action,
          this.getBuyerId,
          this.getSellerId,
          this.isAdmin
        ),
        businessRulesGuard,
        ...this.customGuards,
      ];

      const results = await GuardExecutor.checkGuards(guards, context, escrow);
      const failedGuard = results.find(r => !r.result.allowed);

      if (failedGuard) {
        return {
          allowed: false,
          reason: failedGuard.result.reason,
        };
      }

      return { allowed: true };
    } catch (error) {
      return {
        allowed: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Gets all valid transitions from the current state of an escrow
   *
   * @param escrowId - ID of the escrow
   * @returns Array of valid target states
   */
  async getValidTransitions(escrowId: string): Promise<EscrowStatus[]> {
    const escrow = await this.escrowRepository.findByIdOrThrow(escrowId);
    return TransitionValidator.getValidTransitions(escrow.status);
  }
}
