import { prisma } from '@bloxtr8/database';

import { executeContract } from './contract-execution.js';

/**
 * Queue contract execution to run asynchronously
 * This prevents blocking the user's signature request
 */
export async function queueContractExecution(
  contractId: string
): Promise<void> {
  // Use setTimeout to execute in the next iteration of the event loop
  // This ensures the HTTP response is sent before execution starts
  setTimeout(async () => {
    try {
      console.log(
        `[Contract Execution Queue] Starting async execution for contract ${contractId}`
      );

      const executionResult = await executeContract(contractId);

      if (executionResult.success) {
        // Update contract status to EXECUTED
        await prisma.contract.update({
          where: { id: contractId },
          data: {
            status: 'EXECUTED',
          },
        });

        console.log(
          `[Contract Execution Queue] Contract ${contractId} executed successfully. Escrow ${executionResult.escrowId} created.`
        );
      } else {
        // Update contract status to EXECUTION_FAILED
        await prisma.contract.update({
          where: { id: contractId },
          data: {
            status: 'EXECUTION_FAILED',
          },
        });

        console.error(
          `[Contract Execution Queue] Failed to execute contract ${contractId}:`,
          executionResult.error
        );
      }
    } catch (error) {
      // Handle unexpected errors during contract execution
      await prisma.contract.update({
        where: { id: contractId },
        data: {
          status: 'EXECUTION_FAILED',
        },
      });

      console.error(
        `[Contract Execution Queue] Error executing contract ${contractId}:`,
        error
      );
    }
  }, 0);
}

/**
 * Check if contract execution is in progress (PENDING_SIGNATURE with both signatures)
 */
export async function shouldTriggerExecution(
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

    // Only trigger if status is PENDING_SIGNATURE
    if (contract.status !== 'PENDING_SIGNATURE') {
      return false;
    }

    // Check if both parties have signed
    const buyerSignature = contract.signatures.find(
      sig => sig.userId === contract.offer.buyerId
    );
    const sellerSignature = contract.signatures.find(
      sig => sig.userId === contract.offer.sellerId
    );

    return Boolean(buyerSignature && sellerSignature);
  } catch (error) {
    console.error(
      'Error checking if contract should trigger execution:',
      error
    );
    return false;
  }
}
