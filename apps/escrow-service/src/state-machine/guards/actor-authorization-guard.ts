import type { Escrow } from '@bloxtr8/database';

import type { Guard, TransitionContext, TransitionAction } from '../types.js';

/**
 * Authorization requirements for different transition actions
 */
const ACTION_AUTHORIZATION: Record<
  TransitionAction,
  {
    allowedRoles: ('buyer' | 'seller' | 'admin' | 'system')[];
    description: string;
  }
> = {
  MarkDelivered: {
    allowedRoles: ['seller'],
    description: 'Only seller can mark delivery',
  },
  ReleaseFunds: {
    allowedRoles: ['buyer', 'system'],
    description: 'Buyer or system can release funds',
  },
  RaiseDispute: {
    allowedRoles: ['buyer', 'seller'],
    description: 'Buyer or seller can raise dispute',
  },
  ResolveDispute: {
    allowedRoles: ['admin'],
    description: 'Only admin can resolve dispute',
  },
  CancelEscrow: {
    allowedRoles: ['buyer', 'seller', 'system'],
    description: 'Buyer, seller, or system can cancel',
  },
  PaymentSucceeded: {
    allowedRoles: ['system'],
    description: 'Only system can process payment success',
  },
  RefundSucceeded: {
    allowedRoles: ['system'],
    description: 'Only system can process refund success',
  },
  TransferSucceeded: {
    allowedRoles: ['system'],
    description: 'Only system can process transfer success',
  },
};

/**
 * Creates an actor authorization guard
 *
 * @param action - The transition action being performed
 * @param getBuyerId - Function to get buyer ID from escrow
 * @param getSellerId - Function to get seller ID from escrow
 * @param isAdmin - Function to check if actor is admin
 * @returns Guard function
 */
export const createActorAuthorizationGuard = (
  action: TransitionAction,
  // eslint-disable-next-line no-unused-vars
  getBuyerId: (escrow: Escrow) => string | null,
  // eslint-disable-next-line no-unused-vars
  getSellerId: (escrow: Escrow) => string | null,
  // eslint-disable-next-line no-unused-vars
  isAdmin: (actorId: string) => boolean | Promise<boolean> = () => false
): Guard => {
  return async (
    context: TransitionContext,
    escrow: Escrow
  ): Promise<{ allowed: boolean; reason?: string }> => {
    const auth = ACTION_AUTHORIZATION[action];
    if (!auth) {
      return {
        allowed: false,
        reason: `Unknown action: ${action}`,
      };
    }

    const actorId = context.actorId;
    const buyerId = getBuyerId(escrow);
    const sellerId = getSellerId(escrow);
    const actorIsAdmin = await isAdmin(actorId);

    // Check if actor matches any allowed role
    const isBuyer = buyerId === actorId;
    const isSeller = sellerId === actorId;
    const isSystem = actorId === 'system' || actorId.startsWith('system:');

    const allowed =
      (auth.allowedRoles.includes('buyer') && isBuyer) ||
      (auth.allowedRoles.includes('seller') && isSeller) ||
      (auth.allowedRoles.includes('admin') && actorIsAdmin) ||
      (auth.allowedRoles.includes('system') && isSystem);

    if (!allowed) {
      return {
        allowed: false,
        reason: `${auth.description}. Actor ${actorId} is not authorized for action ${action}`,
      };
    }

    return { allowed: true };
  };
};
