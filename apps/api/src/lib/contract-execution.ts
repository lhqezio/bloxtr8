import { prisma } from '@bloxtr8/database';

/**
 * Handle contract execution when both parties have signed
 * This is triggered after a signature is added and both parties have signed
 */
export async function executeContract(contractId: string): Promise<{
  success: boolean;
  escrowId?: string;
  error?: string;
}> {
  try {
    // Fetch contract with all related data
    const contract = await prisma.contract.findUnique({
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
      const existingEscrow = await prisma.escrow.findFirst({
        where: { contractId: contract.id },
      });

      return {
        success: true,
        escrowId: existingEscrow?.id,
      };
    }

    // Determine escrow rail based on amount
    // Stripe for amounts ≤ $10,000, USDC on Base for > $10,000
    const amountInDollars = Number(contract.offer.amount) / 100;
    const escrowRail = amountInDollars <= 10000 ? 'STRIPE' : 'USDC_BASE';

    // Create escrow
    const escrow = await prisma.escrow.create({
      data: {
        offerId: contract.offer.id,
        contractId: contract.id,
        rail: escrowRail,
        amount: contract.offer.amount,
        currency: contract.offer.currency,
        status: 'AWAIT_FUNDS',
      },
    });

    // Create rail-specific escrow record
    if (escrowRail === 'STRIPE') {
      // Note: Actual Stripe integration would happen here
      // For now, we just create a placeholder record
      await prisma.stripeEscrow.create({
        data: {
          escrowId: escrow.id,
          paymentIntentId: `pi_placeholder_${escrow.id}`, // Would be real Stripe Payment Intent ID
        },
      });
    } else {
      // USDC_BASE - generate deposit address
      // Note: Actual blockchain integration would happen here
      await prisma.stablecoinEscrow.create({
        data: {
          escrowId: escrow.id,
          chain: 'BASE',
          depositAddr: `0x_placeholder_${escrow.id}`, // Would be real blockchain address
        },
      });
    }

    // Create audit log entry
    await prisma.auditLog.create({
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
