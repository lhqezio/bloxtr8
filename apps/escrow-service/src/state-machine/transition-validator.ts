import type { EscrowStatus } from '@bloxtr8/database';

import { InvalidTransitionError } from './errors.js';
import type { TransitionContext } from './types.js';

/**
 * Map of valid state transitions
 * Based on documentation/architecture/escrow/state-machine.md
 */
const VALID_TRANSITIONS: Record<EscrowStatus, EscrowStatus[]> = {
  AWAIT_FUNDS: ['FUNDS_HELD', 'CANCELLED'],
  FUNDS_HELD: ['DELIVERED', 'REFUNDED', 'DISPUTED'],
  DELIVERED: ['RELEASED', 'DISPUTED', 'REFUNDED'],
  DISPUTED: ['RELEASED', 'REFUNDED'],
  RELEASED: [], // Terminal state
  REFUNDED: [], // Terminal state
  CANCELLED: [], // Terminal state
};

/**
 * Validates state transitions according to the state machine specification
 */
export class TransitionValidator {
  /**
   * Checks if a transition from current state to target state is valid
   *
   * @param currentState - Current escrow state
   * @param targetState - Target escrow state
   * @returns True if transition is valid, false otherwise
   */
  static isValidTransition(
    currentState: EscrowStatus,
    targetState: EscrowStatus
  ): boolean {
    // Same state is not a transition
    if (currentState === targetState) {
      return false;
    }

    const allowedTransitions = VALID_TRANSITIONS[currentState];
    return allowedTransitions.includes(targetState);
  }

  /**
   * Validates a transition and throws an error if invalid
   *
   * @param context - Transition context
   * @throws InvalidTransitionError if transition is invalid
   */
  static validateTransition(context: TransitionContext): void {
    if (!this.isValidTransition(context.currentState, context.targetState)) {
      throw new InvalidTransitionError(
        context.currentState,
        context.targetState,
        context.escrowId
      );
    }
  }

  /**
   * Gets all valid transitions from a given state
   *
   * @param state - Current state
   * @returns Array of valid target states
   */
  static getValidTransitions(state: EscrowStatus): EscrowStatus[] {
    return VALID_TRANSITIONS[state] ?? [];
  }

  /**
   * Checks if a state is terminal (no transitions allowed)
   *
   * @param state - State to check
   * @returns True if state is terminal
   */
  static isTerminalState(state: EscrowStatus): boolean {
    return VALID_TRANSITIONS[state].length === 0;
  }
}
