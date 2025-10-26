import { prisma } from '@bloxtr8/database';

/**
 * Create a contract execution job in the database
 * This will be processed by the contract execution processor
 */
export async function createExecutionJob(
  contractId: string
): Promise<string> {
  try {
    const job = await prisma.contractExecutionJob.create({
      data: {
        contractId,
        status: 'PENDING',
        nextRetryAt: new Date(), // Immediate execution
      },
    });

    console.log(
      `[Contract Execution Queue] Created execution job ${job.id} for contract ${contractId}`
    );

    return job.id;
  } catch (error) {
    console.error(
      `[Contract Execution Queue] Failed to create execution job for contract ${contractId}:`,
      error
    );
    throw error;
  }
}
