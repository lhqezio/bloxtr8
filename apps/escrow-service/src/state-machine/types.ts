import type { EscrowStatus, Escrow } from '@bloxtr8/database';
import type { Prisma } from '@bloxtr8/database';

/**
 * Context information for a state transition
 */
export interface TransitionContext {
  /** The escrow ID */
  escrowId: string;
  /** Current state of the escrow */
  currentState: EscrowStatus;
  /** Target state for the transition */
  targetState: EscrowStatus;
  /** ID of the actor performing the transition */
  actorId: string;
  /** Unique event ID for idempotency */
  eventId: string;
  /** Optional metadata for the transition */
  metadata?: Prisma.InputJsonValue;
  /** Optional reason for the transition */
  reason?: string;
}

/**
 * Result of a guard check
 */
export interface GuardResult {
  /** Whether the guard allows the transition */
  allowed: boolean;
  /** Reason for allowing or denying the transition */
  reason?: string;
}

/**
 * Result of a state transition
 */
export interface TransitionResult {
  /** Whether the transition was successful */
  success: boolean;
  /** The updated escrow after transition */
  escrow: Escrow;
  /** Error message if transition failed */
  error?: string;
}

/**
 * Type for guard functions
 */
export type Guard = (
  // eslint-disable-next-line no-unused-vars
  context: TransitionContext,
  // eslint-disable-next-line no-unused-vars
  escrow: Escrow
) => Promise<GuardResult> | GuardResult;

/**
 * Action type that determines authorization requirements
 */
export type TransitionAction =
  | 'MarkDelivered'
  | 'ReleaseFunds'
  | 'RaiseDispute'
  | 'ResolveDispute'
  | 'CancelEscrow'
  | 'PaymentSucceeded'
  | 'RefundSucceeded'
  | 'TransferSucceeded';
