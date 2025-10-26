import { prisma } from '@bloxtr8/database';

import {
  executeContract,
  isContractReadyForExecution,
  getContractExecutionStatus,
} from '../lib/contract-execution.js';

// Mock the database
jest.mock('@bloxtr8/database', () => ({
  prisma: {
    contract: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    escrow: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    stripeEscrow: {
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    stablecoinEscrow: {
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    milestoneEscrow: {
      deleteMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

describe('Contract Execution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('executeContract', () => {
    it('should return error when contract not found', async () => {
      (prisma.contract.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await executeContract('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Contract not found');
    });

    it('should return error when buyer has not signed', async () => {
      const mockContract = {
        id: 'contract-123',
        status: 'PENDING_SIGNATURE',
        offer: {
          buyerId: 'buyer-123',
          sellerId: 'seller-123',
          amount: BigInt(50000),
          currency: 'USD',
        },
        signatures: [{ userId: 'seller-123' }],
        escrows: [],
      };

      (prisma.contract.findUnique as jest.Mock).mockResolvedValue(mockContract);

      const result = await executeContract('contract-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        'Both parties must sign before contract execution'
      );
    });

    it('should return error when seller has not signed', async () => {
      const mockContract = {
        id: 'contract-123',
        status: 'PENDING_SIGNATURE',
        offer: {
          buyerId: 'buyer-123',
          sellerId: 'seller-123',
          amount: BigInt(50000),
          currency: 'USD',
        },
        signatures: [{ userId: 'buyer-123' }],
        escrows: [],
      };

      (prisma.contract.findUnique as jest.Mock).mockResolvedValue(mockContract);

      const result = await executeContract('contract-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        'Both parties must sign before contract execution'
      );
    });

    it('should return existing escrow when contract is already executed', async () => {
      const mockContract = {
        id: 'contract-123',
        status: 'EXECUTED',
        offer: {
          buyerId: 'buyer-123',
          sellerId: 'seller-123',
          amount: BigInt(50000),
          currency: 'USD',
        },
        signatures: [{ userId: 'buyer-123' }, { userId: 'seller-123' }],
        escrows: [],
      };

      (prisma.contract.findUnique as jest.Mock).mockResolvedValue(mockContract);
      (prisma.escrow.findFirst as jest.Mock).mockResolvedValue({
        id: 'escrow-123',
      });

      const result = await executeContract('contract-123');

      expect(result.success).toBe(true);
      expect(result.escrowId).toBe('escrow-123');
    });

    it('should return error when contract executed but no escrow exists', async () => {
      const mockContract = {
        id: 'contract-123',
        status: 'EXECUTED',
        offer: {
          buyerId: 'buyer-123',
          sellerId: 'seller-123',
          amount: BigInt(50000),
          currency: 'USD',
        },
        signatures: [{ userId: 'buyer-123' }, { userId: 'seller-123' }],
        escrows: [],
      };

      (prisma.contract.findUnique as jest.Mock).mockResolvedValue(mockContract);
      (prisma.escrow.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await executeContract('contract-123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('previous execution failure');
    });

    it('should create Stripe escrow for amounts <= $10,000', async () => {
      const mockContract = {
        id: 'contract-123',
        status: 'PENDING_SIGNATURE',
        offer: {
          buyerId: 'buyer-123',
          sellerId: 'seller-123',
          amount: BigInt(500000), // $5,000 (<= $10,000)
          currency: 'USD',
        },
        signatures: [{ userId: 'buyer-123' }, { userId: 'seller-123' }],
        escrows: [],
      };

      (prisma.contract.findUnique as jest.Mock).mockResolvedValue(mockContract);
      (prisma.escrow.create as jest.Mock).mockResolvedValue({
        id: 'escrow-123',
        rail: 'STRIPE',
      });
      (prisma.stripeEscrow.create as jest.Mock).mockResolvedValue({});
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({});

      const result = await executeContract('contract-123');

      expect(result.success).toBe(true);
      expect(prisma.escrow.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            rail: 'STRIPE',
          }),
        })
      );
      expect(prisma.stripeEscrow.create).toHaveBeenCalled();
      expect(prisma.stablecoinEscrow.create).not.toHaveBeenCalled();
    });

    it('should create USDC_BASE escrow for amounts > $10,000', async () => {
      const mockContract = {
        id: 'contract-123',
        status: 'PENDING_SIGNATURE',
        offer: {
          buyerId: 'buyer-123',
          sellerId: 'seller-123',
          amount: BigInt(15000000), // $150,000 (> $10,000)
          currency: 'USD',
        },
        signatures: [{ userId: 'buyer-123' }, { userId: 'seller-123' }],
        escrows: [],
      };

      (prisma.contract.findUnique as jest.Mock).mockResolvedValue(mockContract);
      (prisma.escrow.create as jest.Mock).mockResolvedValue({
        id: 'escrow-123',
        rail: 'USDC_BASE',
      });
      (prisma.stablecoinEscrow.create as jest.Mock).mockResolvedValue({});
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({});

      const result = await executeContract('contract-123');

      expect(result.success).toBe(true);
      expect(prisma.escrow.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            rail: 'USDC_BASE',
          }),
        })
      );
      expect(prisma.stablecoinEscrow.create).toHaveBeenCalled();
      expect(prisma.stripeEscrow.create).not.toHaveBeenCalled();
    });

    it('should clean up existing escrows before creating new one', async () => {
      const mockContract = {
        id: 'contract-123',
        status: 'PENDING_SIGNATURE',
        offer: {
          buyerId: 'buyer-123',
          sellerId: 'seller-123',
          amount: BigInt(500000), // $5,000
          currency: 'USD',
        },
        signatures: [{ userId: 'buyer-123' }, { userId: 'seller-123' }],
        escrows: [{ id: 'old-escrow-123', rail: 'STRIPE' }],
      };

      (prisma.contract.findUnique as jest.Mock).mockResolvedValue(mockContract);
      (prisma.$transaction as jest.Mock).mockImplementation(async callback => {
        return callback({
          stripeEscrow: { deleteMany: jest.fn().mockResolvedValue({}) },
          milestoneEscrow: { deleteMany: jest.fn().mockResolvedValue({}) },
          escrow: { delete: jest.fn().mockResolvedValue({}) },
        });
      });
      (prisma.escrow.create as jest.Mock).mockResolvedValue({
        id: 'escrow-123',
        rail: 'STRIPE',
      });
      (prisma.stripeEscrow.create as jest.Mock).mockResolvedValue({});
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({});

      const result = await executeContract('contract-123');

      expect(result.success).toBe(true);
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should handle errors during escrow cleanup', async () => {
      const mockContract = {
        id: 'contract-123',
        status: 'PENDING_SIGNATURE',
        offer: {
          buyerId: 'buyer-123',
          sellerId: 'seller-123',
          amount: BigInt(500000), // $5,000
          currency: 'USD',
        },
        signatures: [{ userId: 'buyer-123' }, { userId: 'seller-123' }],
        escrows: [{ id: 'old-escrow-123', rail: 'STRIPE' }],
      };

      (prisma.contract.findUnique as jest.Mock).mockResolvedValue(mockContract);
      (prisma.$transaction as jest.Mock).mockRejectedValue(
        new Error('Cleanup failed')
      );

      const result = await executeContract('contract-123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to clean up existing escrows');
    });

    it('should handle general errors', async () => {
      (prisma.contract.findUnique as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      const result = await executeContract('contract-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });
  });

  describe('isContractReadyForExecution', () => {
    it('should return false when contract not found', async () => {
      (prisma.contract.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await isContractReadyForExecution('non-existent');

      expect(result).toBe(false);
    });

    it('should return false when buyer has not signed', async () => {
      const mockContract = {
        id: 'contract-123',
        offer: {
          buyerId: 'buyer-123',
          sellerId: 'seller-123',
        },
        signatures: [{ userId: 'seller-123' }],
      };

      (prisma.contract.findUnique as jest.Mock).mockResolvedValue(mockContract);

      const result = await isContractReadyForExecution('contract-123');

      expect(result).toBe(false);
    });

    it('should return false when seller has not signed', async () => {
      const mockContract = {
        id: 'contract-123',
        offer: {
          buyerId: 'buyer-123',
          sellerId: 'seller-123',
        },
        signatures: [{ userId: 'buyer-123' }],
      };

      (prisma.contract.findUnique as jest.Mock).mockResolvedValue(mockContract);

      const result = await isContractReadyForExecution('contract-123');

      expect(result).toBe(false);
    });

    it('should return true when both parties have signed', async () => {
      const mockContract = {
        id: 'contract-123',
        offer: {
          buyerId: 'buyer-123',
          sellerId: 'seller-123',
        },
        signatures: [{ userId: 'buyer-123' }, { userId: 'seller-123' }],
      };

      (prisma.contract.findUnique as jest.Mock).mockResolvedValue(mockContract);

      const result = await isContractReadyForExecution('contract-123');

      expect(result).toBe(true);
    });

    it('should return false on error', async () => {
      (prisma.contract.findUnique as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      const result = await isContractReadyForExecution('contract-123');

      expect(result).toBe(false);
    });
  });

  describe('getContractExecutionStatus', () => {
    it('should return error when contract not found', async () => {
      (prisma.contract.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await getContractExecutionStatus('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Contract not found');
    });

    it('should return status when buyer has not signed', async () => {
      const mockContract = {
        id: 'contract-123',
        status: 'PENDING_SIGNATURE',
        offer: {
          buyerId: 'buyer-123',
          sellerId: 'seller-123',
        },
        signatures: [{ userId: 'seller-123' }],
        escrows: [],
      };

      (prisma.contract.findUnique as jest.Mock).mockResolvedValue(mockContract);

      const result = await getContractExecutionStatus('contract-123');

      expect(result.success).toBe(true);
      expect(result.status?.buyerSigned).toBe(false);
      expect(result.status?.sellerSigned).toBe(true);
      expect(result.status?.escrowCreated).toBe(false);
    });

    it('should return status when both parties have signed and escrow created', async () => {
      const mockContract = {
        id: 'contract-123',
        status: 'EXECUTED',
        offer: {
          buyerId: 'buyer-123',
          sellerId: 'seller-123',
        },
        signatures: [{ userId: 'buyer-123' }, { userId: 'seller-123' }],
        escrows: [{ id: 'escrow-123' }],
      };

      (prisma.contract.findUnique as jest.Mock).mockResolvedValue(mockContract);

      const result = await getContractExecutionStatus('contract-123');

      expect(result.success).toBe(true);
      expect(result.status?.buyerSigned).toBe(true);
      expect(result.status?.sellerSigned).toBe(true);
      expect(result.status?.escrowCreated).toBe(true);
      expect(result.status?.escrowId).toBe('escrow-123');
      expect(result.status?.contractStatus).toBe('EXECUTED');
    });

    it('should handle errors', async () => {
      (prisma.contract.findUnique as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      const result = await getContractExecutionStatus('contract-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });
  });
});
