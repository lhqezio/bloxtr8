import type { Escrow } from '@bloxtr8/database';

import { GuardViolationError } from '../errors.js';
import type { Guard, TransitionContext } from '../types.js';

/**
 * Executes all guards and aggregates results
 */
export class GuardExecutor {
  /**
   * Executes all guards and throws if any guard fails
   *
   * @param guards - Array of guard functions to execute
   * @param context - Transition context
   * @param escrow - Escrow entity
   * @throws GuardViolationError if any guard fails
   */
  static async executeGuards(
    guards: Guard[],
    context: TransitionContext,
    escrow: Escrow
  ): Promise<void> {
    const results = await Promise.all(
      guards.map(async (guard, index) => {
        const result = await guard(context, escrow);
        return {
          index,
          guardName: guard.name || `Guard${index}`,
          result,
        };
      })
    );

    // Find first failing guard
    const failedGuard = results.find(r => !r.result.allowed);
    if (failedGuard) {
      throw new GuardViolationError(
        failedGuard.guardName,
        failedGuard.result.reason || 'Guard check failed',
        context.escrowId
      );
    }
  }

  /**
   * Executes guards and returns results without throwing
   *
   * @param guards - Array of guard functions to execute
   * @param context - Transition context
   * @param escrow - Escrow entity
   * @returns Array of guard results
   */
  static async checkGuards(
    guards: Guard[],
    context: TransitionContext,
    escrow: Escrow
  ): Promise<
    Array<{ guardName: string; result: { allowed: boolean; reason?: string } }>
  > {
    const results = await Promise.all(
      guards.map(async (guard, index) => {
        const result = await guard(context, escrow);
        return {
          guardName: guard.name || `Guard${index}`,
          result,
        };
      })
    );

    return results;
  }
}
