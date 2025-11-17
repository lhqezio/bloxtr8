import type { Escrow } from '@bloxtr8/database';

import type { Guard, TransitionContext } from '../types.js';

/**
 * Business rules guard that validates business-specific conditions
 */
export const businessRulesGuard: Guard = (
  context: TransitionContext,
  // eslint-disable-next-line no-unused-vars
  _escrow: Escrow
): { allowed: boolean; reason?: string } => {
  // Transition-specific business rules

  // AWAIT_FUNDS -> FUNDS_HELD: Payment must be confirmed
  if (
    context.currentState === 'AWAIT_FUNDS' &&
    context.targetState === 'FUNDS_HELD'
  ) {
    // This guard assumes payment confirmation is handled elsewhere
    // Additional validation can be added here if needed
    return { allowed: true };
  }

  // FUNDS_HELD -> DELIVERED: No specific business rules beyond authorization
  if (
    context.currentState === 'FUNDS_HELD' &&
    context.targetState === 'DELIVERED'
  ) {
    return { allowed: true };
  }

  // DELIVERED -> RELEASED: Can be auto-released or buyer confirmed
  if (
    context.currentState === 'DELIVERED' &&
    context.targetState === 'RELEASED'
  ) {
    return { allowed: true };
  }

  // FUNDS_HELD -> REFUNDED: Refund reason should be provided
  if (
    context.currentState === 'FUNDS_HELD' &&
    context.targetState === 'REFUNDED'
  ) {
    // Refund reason validation can be added here
    return { allowed: true };
  }

  // DISPUTED -> RELEASED/REFUNDED: Resolution must favor appropriate party
  if (
    context.currentState === 'DISPUTED' &&
    (context.targetState === 'RELEASED' || context.targetState === 'REFUNDED')
  ) {
    // Dispute resolution validation can be added here
    return { allowed: true };
  }

  // Default: allow if no specific rules apply
  return { allowed: true };
};
