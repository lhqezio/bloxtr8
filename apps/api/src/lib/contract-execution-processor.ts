import { prisma } from '@bloxtr8/database';
import cron from 'node-cron';

import { executeContract } from './contract-execution.js';

/**
 * Exponential backoff retry intervals in minutes
 */
const RETRY_DELAYS = [0, 1, 5, 15]; // 0min, 1min, 5min, 15min

/**
 * Calculate next retry time based on attempt number
 */
function calculateNextRetryTime(attempts: number): Date {
  const index = Math.min(attempts, RETRY_DELAYS.length - 1);
  const delayMinutes = RETRY_DELAYS[index] ?? 15;
  return new Date(Date.now() + delayMinutes * 60 * 1000);
}

/**
 * Process a single contract execution job
 */
async function processExecutionJob(jobId: string): Promise<void> {
  const job = await prisma.contractExecutionJob.findUnique({
    where: { id: jobId },
  });

  if (!job) {
    console.error(`[Contract Execution Processor] Job ${jobId} not found`);
    return;
  }

  // Skip if job is already completed or failed
  if (job.status === 'COMPLETED' || job.status === 'FAILED') {
    return;
  }

  // Skip if it's not time to retry yet
  if (job.nextRetryAt && new Date() < job.nextRetryAt) {
    return;
  }

  try {
    console.log(
      `[Contract Execution Processor] Processing job ${jobId} for contract ${job.contractId} (attempt ${job.attempts + 1}/${job.maxAttempts})`
    );

    // Mark job as processing
    await prisma.contractExecutionJob.update({
      where: { id: jobId },
      data: {
        status: 'PROCESSING',
        processingStartedAt: new Date(),
      },
    });

    // Execute the contract
    const executionResult = await executeContract(job.contractId);

    if (executionResult.success) {
      // Success! Mark job as completed and update contract status
      await prisma.contractExecutionJob.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          processingStartedAt: null,
        },
      });

      await prisma.contract.update({
        where: { id: job.contractId },
        data: { status: 'EXECUTED' },
      });

      console.log(
        `[Contract Execution Processor] Job ${jobId} completed successfully. Escrow ${executionResult.escrowId} created.`
      );
    } else {
      // Execution failed - handle retry logic
      const nextAttempt = job.attempts + 1;

      if (nextAttempt >= job.maxAttempts) {
        // Max attempts reached - mark job as failed
        await prisma.contractExecutionJob.update({
          where: { id: jobId },
          data: {
            status: 'FAILED',
            lastError: executionResult.error || 'Unknown error',
            completedAt: new Date(),
            processingStartedAt: null,
          },
        });

        await prisma.contract.update({
          where: { id: job.contractId },
          data: { status: 'EXECUTION_FAILED' },
        });

        console.error(
          `[Contract Execution Processor] Job ${jobId} failed after ${nextAttempt} attempts: ${executionResult.error}`
        );
      } else {
        // Schedule retry
        const nextRetryAt = calculateNextRetryTime(nextAttempt);

        await prisma.contractExecutionJob.update({
          where: {
            id: jobId,
          },
          data: {
            status: 'PENDING',
            attempts: nextAttempt,
            lastError: executionResult.error || 'Unknown error',
            nextRetryAt,
            processingStartedAt: null,
          },
        });

        console.log(
          `[Contract Execution Processor] Job ${jobId} failed (attempt ${nextAttempt}/${job.maxAttempts}). Next retry at ${nextRetryAt.toISOString()}`
        );
      }
    }
  } catch (error) {
    // Unexpected error during execution
    const nextAttempt = job.attempts + 1;
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    if (nextAttempt >= job.maxAttempts) {
      // Max attempts reached
      await prisma.contractExecutionJob.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          lastError: errorMessage,
          completedAt: new Date(),
          processingStartedAt: null,
        },
      });

      await prisma.contract.update({
        where: { id: job.contractId },
        data: { status: 'EXECUTION_FAILED' },
      });

      console.error(
        `[Contract Execution Processor] Job ${jobId} failed after ${nextAttempt} attempts with error:`,
        error
      );
    } else {
      // Schedule retry
      const nextRetryAt = calculateNextRetryTime(nextAttempt);

      await prisma.contractExecutionJob.update({
        where: { id: jobId },
        data: {
          status: 'PENDING',
          attempts: nextAttempt,
          lastError: errorMessage,
          nextRetryAt,
          processingStartedAt: null,
        },
      });

      console.log(
        `[Contract Execution Processor] Job ${jobId} errored (attempt ${nextAttempt}/${job.maxAttempts}). Next retry at ${nextRetryAt.toISOString()}`,
        error
      );
    }
  }
}

/**
 * Background job to process contract execution jobs
 * Runs every 1 minute to check for pending jobs
 */
export function initializeContractExecutionProcessor(): void {
  // Run every minute: * * * * *
  cron.schedule('* * * * *', async () => {
    try {
      console.log('[Contract Execution Processor] Running job check...');

      // Find all PENDING or PROCESSING jobs that are due for execution
      const now = new Date();
      const PROCESSING_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
      const timeoutThreshold = new Date(now.getTime() - PROCESSING_TIMEOUT_MS);

      const pendingJobs = await prisma.contractExecutionJob.findMany({
        where: {
          OR: [
            // Normal PENDING jobs ready for retry
            {
              status: 'PENDING',
              OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
            },
            // Stuck PROCESSING jobs (timeout exceeded)
            {
              status: 'PROCESSING',
              processingStartedAt: { lte: timeoutThreshold },
            },
          ],
        },
        select: {
          id: true,
        },
        orderBy: {
          createdAt: 'asc', // Process oldest jobs first
        },
        take: 10, // Process max 10 jobs per minute to avoid overwhelming the system
      });

      if (pendingJobs.length === 0) {
        console.log('[Contract Execution Processor] No pending jobs found');
        return;
      }

      console.log(
        `[Contract Execution Processor] Found ${pendingJobs.length} pending job(s)`
      );

      // Process each job
      for (const job of pendingJobs) {
        await processExecutionJob(job.id);
      }

      console.log(
        `[Contract Execution Processor] Completed processing ${pendingJobs.length} job(s)`
      );
    } catch (error) {
      console.error(
        '[Contract Execution Processor] Error during job check:',
        error
      );
    }
  });

  console.log(
    '[Contract Execution Processor] Initialized - running every 1 minute'
  );
}

/**
 * Manually trigger job processing (useful for testing)
 */
export async function manuallyProcessJobs(): Promise<{
  processed: number;
  jobIds: string[];
}> {
  const now = new Date();
  const PROCESSING_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  const timeoutThreshold = new Date(now.getTime() - PROCESSING_TIMEOUT_MS);

  const pendingJobs = await prisma.contractExecutionJob.findMany({
    where: {
      OR: [
        // Normal PENDING jobs ready for retry
        {
          status: 'PENDING',
          OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
        },
        // Stuck PROCESSING jobs (timeout exceeded)
        {
          status: 'PROCESSING',
          processingStartedAt: { lte: timeoutThreshold },
        },
      ],
    },
    select: {
      id: true,
    },
  });

  for (const job of pendingJobs) {
    await processExecutionJob(job.id);
  }

  return { processed: pendingJobs.length, jobIds: pendingJobs.map(j => j.id) };
}
