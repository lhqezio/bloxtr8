import { prisma } from '@bloxtr8/database';

import {
  initializeContractExecutionProcessor,
  stopContractExecutionProcessor,
  manuallyProcessJobs,
} from '../lib/contract-execution-processor.js';
import { executeContract } from '../lib/contract-execution.js';

// Mock the database and dependencies
jest.mock('@bloxtr8/database', () => ({
  prisma: {
    contractExecutionJob: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    contract: {
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('../lib/contract-execution.js', () => ({
  executeContract: jest.fn(),
}));

jest.mock('node-cron', () => ({
  schedule: jest.fn((_cronExpression, _callback) => {
    // Return a mock task object
    return {
      stop: jest.fn(),
      start: jest.fn(),
      destroy: jest.fn(),
    };
  }),
}));

describe('Contract Execution Processor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initializeContractExecutionProcessor', () => {
    it('should initialize and schedule a cron job', () => {
      (prisma.contractExecutionJob.findMany as jest.Mock).mockResolvedValue([]);

      const task = initializeContractExecutionProcessor();

      expect(task).toBeDefined();
      expect(task.stop).toBeDefined();
    });

    it('should process pending jobs when cron runs', async () => {
      const mockJobs = [{ id: 'job-1' }, { id: 'job-2' }];

      (prisma.contractExecutionJob.findMany as jest.Mock).mockResolvedValue(
        mockJobs
      );
      (prisma.contractExecutionJob.findUnique as jest.Mock).mockResolvedValue({
        id: 'job-1',
        contractId: 'contract-1',
        status: 'PENDING',
        attempts: 0,
        maxAttempts: 3,
        nextRetryAt: null,
      });
      (executeContract as jest.Mock).mockResolvedValue({
        success: true,
        escrowId: 'escrow-1',
      });
      (prisma.$transaction as jest.Mock).mockImplementation(async callback => {
        const tx = {
          contract: { update: jest.fn().mockResolvedValue({}) },
        };
        return callback(tx);
      });
      (prisma.contractExecutionJob.update as jest.Mock).mockResolvedValue({});

      const cron = jest.requireMock('node-cron') as {
        schedule: jest.Mock;
      };
      let cronCallback: (() => Promise<void>) | null = null;

      cron.schedule.mockImplementation(
        (_expr: string, callback: () => Promise<void>) => {
          cronCallback = callback;
          return { stop: jest.fn() };
        }
      );

      initializeContractExecutionProcessor();

      // Execute the cron callback
      if (cronCallback) {
        await cronCallback();
      }

      expect(prisma.contractExecutionJob.findMany).toHaveBeenCalled();
    });

    it('should handle no pending jobs', async () => {
      (prisma.contractExecutionJob.findMany as jest.Mock).mockResolvedValue([]);

      const cron = jest.requireMock('node-cron') as {
        schedule: jest.Mock;
      };
      let cronCallback: (() => Promise<void>) | null = null;

      cron.schedule.mockImplementation(
        (_expr: string, callback: () => Promise<void>) => {
          cronCallback = callback;
          return { stop: jest.fn() };
        }
      );

      initializeContractExecutionProcessor();

      if (cronCallback) {
        await cronCallback();
      }

      expect(prisma.contractExecutionJob.findMany).toHaveBeenCalled();
      expect(prisma.contractExecutionJob.findUnique).not.toHaveBeenCalled();
    });

    it('should handle errors during job check', async () => {
      (prisma.contractExecutionJob.findMany as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      const cron = jest.requireMock('node-cron') as {
        schedule: jest.Mock;
      };
      let cronCallback: (() => Promise<void>) | null = null;

      cron.schedule.mockImplementation(
        (_expr: string, callback: () => Promise<void>) => {
          cronCallback = callback;
          return { stop: jest.fn() };
        }
      );

      initializeContractExecutionProcessor();

      if (cronCallback) {
        await cronCallback();
        // Should not throw
      }

      expect(prisma.contractExecutionJob.findMany).toHaveBeenCalled();
    });
  });

  describe('stopContractExecutionProcessor', () => {
    it('should stop the processor task', () => {
      const mockTask = { stop: jest.fn() };
      const cron = jest.requireMock('node-cron') as {
        schedule: jest.Mock;
      };
      cron.schedule.mockReturnValue(mockTask);

      initializeContractExecutionProcessor();
      stopContractExecutionProcessor();

      expect(mockTask.stop).toHaveBeenCalled();
    });

    it('should handle stopping when processor is not initialized', () => {
      // Should not throw
      stopContractExecutionProcessor();
    });
  });

  describe('manuallyProcessJobs', () => {
    it('should process pending jobs manually', async () => {
      const mockJobs = [{ id: 'job-1' }];

      (prisma.contractExecutionJob.findMany as jest.Mock).mockResolvedValue(
        mockJobs
      );
      (prisma.contractExecutionJob.findUnique as jest.Mock).mockResolvedValue({
        id: 'job-1',
        contractId: 'contract-1',
        status: 'PENDING',
        attempts: 0,
        maxAttempts: 3,
        nextRetryAt: null,
      });
      (executeContract as jest.Mock).mockResolvedValue({
        success: true,
        escrowId: 'escrow-1',
      });
      (prisma.$transaction as jest.Mock).mockImplementation(async callback => {
        const tx = {
          contract: { update: jest.fn().mockResolvedValue({}) },
        };
        return callback(tx);
      });
      (prisma.contractExecutionJob.update as jest.Mock).mockResolvedValue({});

      const result = await manuallyProcessJobs();

      expect(result.processed).toBe(1);
      expect(result.jobIds).toEqual(['job-1']);
    });

    it('should handle jobs with execution failure and retry', async () => {
      const mockJobs = [{ id: 'job-1' }];

      (prisma.contractExecutionJob.findMany as jest.Mock).mockResolvedValue(
        mockJobs
      );
      (prisma.contractExecutionJob.findUnique as jest.Mock).mockResolvedValue({
        id: 'job-1',
        contractId: 'contract-1',
        status: 'PENDING',
        attempts: 0,
        maxAttempts: 3,
        nextRetryAt: null,
      });
      (executeContract as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Execution failed',
      });
      (prisma.contractExecutionJob.update as jest.Mock).mockResolvedValue({});

      const result = await manuallyProcessJobs();

      expect(result.processed).toBe(1);
      expect(prisma.contractExecutionJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job-1' },
          data: expect.objectContaining({
            status: 'PENDING',
            attempts: 1,
          }),
        })
      );
    });

    it('should handle jobs that exceed max attempts', async () => {
      const mockJobs = [{ id: 'job-1' }];

      (prisma.contractExecutionJob.findMany as jest.Mock).mockResolvedValue(
        mockJobs
      );
      (prisma.contractExecutionJob.findUnique as jest.Mock).mockResolvedValue({
        id: 'job-1',
        contractId: 'contract-1',
        status: 'PENDING',
        attempts: 2,
        maxAttempts: 3,
        nextRetryAt: null,
      });
      (executeContract as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Execution failed',
      });
      (prisma.$transaction as jest.Mock).mockImplementation(async callback => {
        const tx = {
          contractExecutionJob: {
            update: jest.fn().mockResolvedValue({}),
          },
          contract: {
            update: jest.fn().mockResolvedValue({}),
          },
        };
        return callback(tx);
      });

      await manuallyProcessJobs();

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should handle unexpected errors during processing', async () => {
      const mockJobs = [{ id: 'job-1' }];

      (prisma.contractExecutionJob.findMany as jest.Mock).mockResolvedValue(
        mockJobs
      );
      (prisma.contractExecutionJob.findUnique as jest.Mock).mockResolvedValue({
        id: 'job-1',
        contractId: 'contract-1',
        status: 'PENDING',
        attempts: 0,
        maxAttempts: 3,
        nextRetryAt: null,
      });
      (executeContract as jest.Mock).mockRejectedValue(
        new Error('Unexpected error')
      );
      (prisma.contractExecutionJob.update as jest.Mock).mockResolvedValue({});

      await manuallyProcessJobs();

      expect(prisma.contractExecutionJob.update).toHaveBeenCalled();
    });

    it('should skip jobs that are already completed', async () => {
      const mockJobs = [{ id: 'job-1' }];

      (prisma.contractExecutionJob.findMany as jest.Mock).mockResolvedValue(
        mockJobs
      );
      (prisma.contractExecutionJob.findUnique as jest.Mock).mockResolvedValue({
        id: 'job-1',
        contractId: 'contract-1',
        status: 'COMPLETED',
        attempts: 1,
        maxAttempts: 3,
      });

      await manuallyProcessJobs();

      expect(executeContract).not.toHaveBeenCalled();
    });

    it('should skip jobs that are already failed', async () => {
      const mockJobs = [{ id: 'job-1' }];

      (prisma.contractExecutionJob.findMany as jest.Mock).mockResolvedValue(
        mockJobs
      );
      (prisma.contractExecutionJob.findUnique as jest.Mock).mockResolvedValue({
        id: 'job-1',
        contractId: 'contract-1',
        status: 'FAILED',
        attempts: 3,
        maxAttempts: 3,
      });

      await manuallyProcessJobs();

      expect(executeContract).not.toHaveBeenCalled();
    });

    it('should skip jobs not ready for retry yet', async () => {
      const mockJobs = [{ id: 'job-1' }];
      const futureDate = new Date(Date.now() + 60000); // 1 minute in future

      (prisma.contractExecutionJob.findMany as jest.Mock).mockResolvedValue(
        mockJobs
      );
      (prisma.contractExecutionJob.findUnique as jest.Mock).mockResolvedValue({
        id: 'job-1',
        contractId: 'contract-1',
        status: 'PENDING',
        attempts: 1,
        maxAttempts: 3,
        nextRetryAt: futureDate,
      });

      await manuallyProcessJobs();

      expect(executeContract).not.toHaveBeenCalled();
    });

    it('should handle stuck PROCESSING jobs', async () => {
      const mockJobs = [{ id: 'job-1' }];
      const oldDate = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago

      (prisma.contractExecutionJob.findMany as jest.Mock).mockResolvedValue(
        mockJobs
      );
      (prisma.contractExecutionJob.findUnique as jest.Mock).mockResolvedValue({
        id: 'job-1',
        contractId: 'contract-1',
        status: 'PROCESSING',
        attempts: 0,
        maxAttempts: 3,
        processingStartedAt: oldDate,
      });
      (executeContract as jest.Mock).mockResolvedValue({
        success: true,
        escrowId: 'escrow-1',
      });
      (prisma.$transaction as jest.Mock).mockImplementation(async callback => {
        const tx = {
          contract: { update: jest.fn().mockResolvedValue({}) },
        };
        return callback(tx);
      });
      (prisma.contractExecutionJob.update as jest.Mock).mockResolvedValue({});

      await manuallyProcessJobs();

      expect(executeContract).toHaveBeenCalled();
    });
  });
});
