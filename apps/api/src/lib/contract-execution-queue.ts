import { prisma } from '@bloxtr8/database';

/**
 * Create a contract execution job in the database
 * This will be processed by the contract execution processor
 */
export async function createExecutionJob(contractId: string): Promise<string> {
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
  } catch (error: any) {
    // Handle duplicate key error gracefully (P2002 is Prisma's unique constraint violation code)
    if (error.code === 'P2002') {
      console.log(
        `[Contract Execution Queue] Execution job already exists for contract ${contractId}`
      );
      // Find and return existing job
      const existingJob = await prisma.contractExecutionJob.findFirst({
        where: { contractId },
      });
      return existingJob!.id;
    }

    console.error(
      `[Contract Execution Queue] Failed to create execution job for contract ${contractId}:`,
      error
    );
    throw error;
  }
}
