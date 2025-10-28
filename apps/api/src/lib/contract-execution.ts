import { prisma } from '@bloxtr8/database';
import type { EscrowInitResponse, PaymentInit } from '@bloxtr8/types';

import { isDebugMode } from '../lib/env-validation.js';

/**
 * Handle contract execution when both parties have signed
 * This is triggered after a signature is added and both parties have signed
 * @param tx - Optional transaction client. If provided, all operations run within that transaction.
 */
export async function executeContract(
  contractId: string,
  tx?: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
): Promise<{
  success: boolean;
  escrowId?: string;
  error?: string;
}> {
  const db = tx || prisma;

  try {
    // Fetch contract with all related data
    const contract = await db.contract.findUnique({
      where: { id: contractId },
      include: {
        offer: {
          include: {
            buyer: true,
            seller: true,
            listing: true,
          },
        },
        signatures: true,
        escrows: true, // Include escrows to check for existing ones
      },
    });

    if (!contract) {
      return {
        success: false,
        error: 'Contract not found',
      };
    }

    // Verify both parties have signed
    const buyerSignature = contract.signatures.find(
      sig => sig.userId === contract.offer.buyerId
    );
    const sellerSignature = contract.signatures.find(
      sig => sig.userId === contract.offer.sellerId
    );

    if (!buyerSignature || !sellerSignature) {
      return {
        success: false,
        error: 'Both parties must sign before contract execution',
      };
    }

    // Check if contract is already executed
    if (contract.status === 'EXECUTED') {
      // Check if escrow already exists
      const existingEscrow = await db.escrow.findFirst({
        where: { contractId: contract.id },
      });

      // If contract is EXECUTED but no escrow exists, this is an inconsistent state
      if (!existingEscrow) {
        console.error(
          `Contract ${contractId} is marked as EXECUTED but has no escrow. This indicates a previous execution failure.`
        );
        return {
          success: false,
          error:
            'Contract is marked as executed but has no escrow. This indicates a previous execution failure.',
        };
      }

      return {
        success: true,
        escrowId: existingEscrow.id,
      };
    }

    // Check if escrows already exist (from previous failed execution)
    // These should have been cleaned up, but handle gracefully if not
    if (contract.escrows.length > 0) {
      console.warn(
        `Contract ${contractId} has existing escrows. This might indicate a previous partial execution.`
      );

      try {
        // Clean up existing escrows
        for (const escrow of contract.escrows) {
          // Delete rail-specific escrow records first
          if (escrow.rail === 'STRIPE') {
            await db.stripeEscrow.deleteMany({
              where: { escrowId: escrow.id },
            });
          } else if (escrow.rail === 'USDC_BASE') {
            await db.stablecoinEscrow.deleteMany({
              where: { escrowId: escrow.id },
            });
          }

          // Delete milestone escrows if any
          await db.milestoneEscrow.deleteMany({
            where: { escrowId: escrow.id },
          });

          // Delete the escrow
          await db.escrow.delete({
            where: { id: escrow.id },
          });

          console.log(`Cleaned up escrow ${escrow.id} before new execution`);
        }
      } catch (cleanupError) {
        console.error(`Failed to cleanup escrows:`, cleanupError);
        return {
          success: false,
          error:
            'Failed to clean up existing escrows from previous execution attempt',
        };
      }
    }

    // Check if debug mode
    const debugMode = isDebugMode();
    const sameUser = contract.offer.buyerId === contract.offer.sellerId;

    if (debugMode && sameUser) {
      console.warn(
        `🔧 DEBUG MODE: Skipping real payment processing for contract ${contractId}`
      );
    }

    // Determine escrow rail based on amount
    // Stripe for amounts ≤ $10,000, USDC on Base for > $10,000
    const amountInDollars = Number(contract.offer.amount) / 100;
    const escrowRail = amountInDollars <= 10000 ? 'STRIPE' : 'USDC_BASE';

    // Create escrow
    const escrow = await db.escrow.create({
      data: {
        offerId: contract.offer.id,
        contractId: contract.id,
        rail: escrowRail,
        amount: contract.offer.amount,
        currency: contract.offer.currency,
        // In debug mode with same user, skip AWAIT_FUNDS and go directly to FUNDS_HELD
        status: debugMode && sameUser ? 'FUNDS_HELD' : 'AWAIT_FUNDS',
      },
    });

    // Create rail-specific escrow record
    if (escrowRail === 'STRIPE') {
      const paymentIntentId = debugMode
        ? `pi_debug_test_${escrow.id}`
        : `pi_placeholder_${escrow.id}`;

      if (debugMode) {
        console.warn(
          `🔧 DEBUG MODE: Using mock Stripe Payment Intent ID: ${paymentIntentId}`
        );
      }

      await db.stripeEscrow.create({
        data: {
          escrowId: escrow.id,
          paymentIntentId,
        },
      });
    } else {
      const depositAddr = debugMode
        ? `0x_debug_test_${escrow.id}`
        : `0x_placeholder_${escrow.id}`;

      if (debugMode) {
        console.warn(
          `🔧 DEBUG MODE: Using mock USDC deposit address: ${depositAddr}`
        );
      }

      await db.stablecoinEscrow.create({
        data: {
          escrowId: escrow.id,
          chain: 'BASE',
          depositAddr,
          mintAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
        },
      });
    }

    // Create audit log entry
    await db.auditLog.create({
      data: {
        action: 'CONTRACT_EXECUTED',
        details: {
          contractId: contract.id,
          offerId: contract.offer.id,
          escrowId: escrow.id,
          escrowRail,
          amount: contract.offer.amount.toString(),
          buyerId: contract.offer.buyerId,
          sellerId: contract.offer.sellerId,
          debugMode: debugMode && sameUser ? true : undefined,
          sameUser: sameUser ? true : undefined,
        },
        escrowId: escrow.id,
      },
    });

    console.log(
      `Contract ${contractId} executed successfully. Escrow ${escrow.id} created.`
    );

    return {
      success: true,
      escrowId: escrow.id,
    };
  } catch (error) {
    console.error('Error executing contract:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check if contract is ready for execution
 */
export async function isContractReadyForExecution(
  contractId: string
): Promise<boolean> {
  try {
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        offer: true,
        signatures: true,
      },
    });

    if (!contract) {
      return false;
    }

    // Check if both parties have signed
    const buyerSigned = contract.signatures.some(
      sig => sig.userId === contract.offer.buyerId
    );
    const sellerSigned = contract.signatures.some(
      sig => sig.userId === contract.offer.sellerId
    );

    return buyerSigned && sellerSigned;
  } catch (error) {
    console.error('Error checking contract execution readiness:', error);
    return false;
  }
}

/**
 * Get contract execution status
 */
export async function getContractExecutionStatus(contractId: string): Promise<{
  success: boolean;
  status?: {
    contractStatus: string;
    buyerSigned: boolean;
    sellerSigned: boolean;
    escrowCreated: boolean;
    escrowId?: string;
  };
  error?: string;
}> {
  try {
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        offer: true,
        signatures: true,
        escrows: true,
      },
    });

    if (!contract) {
      return {
        success: false,
        error: 'Contract not found',
      };
    }

    const buyerSigned = contract.signatures.some(
      sig => sig.userId === contract.offer.buyerId
    );
    const sellerSigned = contract.signatures.some(
      sig => sig.userId === contract.offer.sellerId
    );
    const escrowCreated = contract.escrows.length > 0;

    return {
      success: true,
      status: {
        contractStatus: contract.status,
        buyerSigned,
        sellerSigned,
        escrowCreated,
        escrowId: contract.escrows[0]?.id,
      },
    };
  } catch (error) {
    console.error('Error getting contract execution status:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get escrow payment initialization data for a given escrow ID
 * Returns the payment init payload based on the escrow's rail
 */
export async function getEscrowPaymentInit(
  escrowId: string
): Promise<EscrowInitResponse | null> {
  try {
    const escrow = await prisma.escrow.findUnique({
      where: { id: escrowId },
      include: {
        stripeEscrow: true,
        stablecoinEscrow: true,
      },
    });

    if (!escrow) {
      return null;
    }

    let paymentInit: PaymentInit;

    if (escrow.rail === 'STRIPE') {
      if (!escrow.stripeEscrow) {
        return null;
      }

      paymentInit = {
        rail: 'STRIPE',
        paymentIntentId: escrow.stripeEscrow.paymentIntentId,
        clientSecret: `test_client_secret_${escrow.stripeEscrow.paymentIntentId}`,
      };
    } else {
      // USDC_BASE
      if (!escrow.stablecoinEscrow) {
        return null;
      }

      paymentInit = {
        rail: 'USDC_BASE',
        depositAddr: escrow.stablecoinEscrow.depositAddr,
        qr: `usdc:${escrow.stablecoinEscrow.depositAddr}`,
      };
    }

    return {
      escrowId: escrow.id,
      rail: escrow.rail,
      status: escrow.status,
      amount: escrow.amount.toString(),
      currency: escrow.currency,
      paymentInit,
    };
  } catch (error) {
    console.error('Error getting escrow payment init:', error);
    return null;
  }
}
