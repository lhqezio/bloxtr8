import type { Escrow } from '@bloxtr8/database';

import { TransitionValidator } from '../transition-validator.js';
import type { Guard, TransitionContext } from '../types.js';

/**
 * Guard that validates the current state allows the transition
 */
export const statePreconditionGuard: Guard = (
  context: TransitionContext,
  escrow: Escrow
): { allowed: boolean; reason?: string } => {
  // Check if current state matches
  if (escrow.status !== context.currentState) {
    return {
      allowed: false,
      reason: `Escrow is in state ${escrow.status}, expected ${context.currentState}`,
    };
  }

  // Check if transition is valid
  if (
    !TransitionValidator.isValidTransition(
      context.currentState,
      context.targetState
    )
  ) {
    return {
      allowed: false,
      reason: `Invalid transition from ${context.currentState} to ${context.targetState}`,
    };
  }

  return { allowed: true };
};
