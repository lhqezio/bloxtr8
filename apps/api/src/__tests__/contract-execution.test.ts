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
    },
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

// Mock the EscrowClient
const mockCreateEscrow = jest.fn();
const mockGetEscrowStatus = jest.fn();

jest.mock('../lib/escrow-client.js', () => ({
  EscrowClient: jest.fn().mockImplementation(() => ({
    createEscrow: mockCreateEscrow,
    getEscrowStatus: mockGetEscrowStatus,
  })),
}));

describe('Contract Execution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default successful escrow creation mock
    mockCreateEscrow.mockResolvedValue({
      success: true,
      data: {
        escrowId: 'escrow-123',
        clientSecret: 'pi_test_client_secret',
        paymentIntentId: 'pi_test_123',
        status: 'AWAIT_FUNDS',
      },
    });

    mockGetEscrowStatus.mockResolvedValue({
      success: true,
      data: {
        id: 'escrow-123',
        status: 'AWAIT_FUNDS',
        rail: 'STRIPE',
        amount: BigInt(5000),
        currency: 'USD',
        stripeEscrow: {
          paymentIntentId: 'pi_test_123',
        },
        clientSecret: 'pi_test_client_secret',
      },
    });
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
          id: 'offer-123',
          buyerId: 'buyer-123',
          sellerId: 'seller-123',
          amount: BigInt(5000),
          currency: 'USD',
          seller: {
            stripeAccountId: 'acct_test123',
          },
        },
        signatures: [{ userId: 'seller-123' }],
        escrows: [],
      };

      (prisma.contract.findUnique as jest.Mock).mockResolvedValue(mockContract);

      const result = await executeContract('contract-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Both parties must sign before contract execution');
    });

    it('should return error when seller has not signed', async () => {
      const mockContract = {
        id: 'contract-123',
        status: 'PENDING_SIGNATURE',
        offer: {
          id: 'offer-123',
          buyerId: 'buyer-123',
          sellerId: 'seller-123',
          amount: BigInt(5000),
          currency: 'USD',
          seller: {
            stripeAccountId: 'acct_test123',
          },
        },
        signatures: [{ userId: 'buyer-123' }],
        escrows: [],
      };

      (prisma.contract.findUnique as jest.Mock).mockResolvedValue(mockContract);

      const result = await executeContract('contract-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Both parties must sign before contract execution');
    });

    it('should return success when contract is already executed', async () => {
      const mockContract = {
        id: 'contract-123',
        status: 'EXECUTED',
        offer: {
          id: 'offer-123',
          buyerId: 'buyer-123',
          sellerId: 'seller-123',
          amount: BigInt(5000),
          currency: 'USD',
          seller: {
            stripeAccountId: 'acct_test123',
          },
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

    it('should create Stripe escrow for amounts <= $10,000', async () => {
      const mockContract = {
        id: 'contract-123',
        status: 'PENDING_SIGNATURE',
        offer: {
          id: 'offer-123',
          buyerId: 'buyer-123',
          sellerId: 'seller-123',
          amount: BigInt(500000), // $5,000 (<= $10,000)
          currency: 'USD',
          seller: {
            stripeAccountId: 'acct_test123',
          },
        },
        signatures: [{ userId: 'buyer-123' }, { userId: 'seller-123' }],
        escrows: [],
      };

      (prisma.contract.findUnique as jest.Mock).mockResolvedValue(mockContract);
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({});

      const result = await executeContract('contract-123');

      expect(result.success).toBe(true);
      expect(result.escrowId).toBe('escrow-123');
      expect(mockCreateEscrow).toHaveBeenCalledWith({
        offerId: 'offer-123',
        contractId: 'contract-123',
        rail: 'STRIPE',
        amount: '500000',
        currency: 'USD',
        buyerId: 'buyer-123',
        sellerId: 'seller-123',
        sellerStripeAccountId: 'acct_test123',
        buyerFee: 100, // 2% of $5,000 = $100
        sellerFee: 100,
      });
    });

    it('should create USDC_BASE escrow for amounts > $10,000', async () => {
      const mockContract = {
        id: 'contract-123',
        status: 'PENDING_SIGNATURE',
        offer: {
          id: 'offer-123',
          buyerId: 'buyer-123',
          sellerId: 'seller-123',
          amount: BigInt(1500000), // $15,000 (> $10,000)
          currency: 'USD',
          seller: {
            stripeAccountId: 'acct_test123',
          },
        },
        signatures: [{ userId: 'buyer-123' }, { userId: 'seller-123' }],
        escrows: [],
      };

      (prisma.contract.findUnique as jest.Mock).mockResolvedValue(mockContract);
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({});

      // Mock USDC escrow response
      mockCreateEscrow.mockResolvedValueOnce({
        success: true,
        data: {
          escrowId: 'escrow-456',
          depositAddr: '0x_test_deposit_address',
          status: 'AWAIT_FUNDS',
        },
      });

      const result = await executeContract('contract-123');

      expect(result.success).toBe(true);
      expect(result.escrowId).toBe('escrow-456');
      expect(mockCreateEscrow).toHaveBeenCalledWith({
        offerId: 'offer-123',
        contractId: 'contract-123',
        rail: 'USDC_BASE',
        amount: '1500000',
        currency: 'USD',
        buyerId: 'buyer-123',
        sellerId: 'seller-123',
        sellerStripeAccountId: 'acct_test123',
        buyerFee: 450, // 3% of $15,000 = $450
        sellerFee: 450,
      });
    });

    it('should handle escrow creation failure', async () => {
      const mockContract = {
        id: 'contract-123',
        status: 'PENDING_SIGNATURE',
        offer: {
          id: 'offer-123',
          buyerId: 'buyer-123',
          sellerId: 'seller-123',
          amount: BigInt(500000),
          currency: 'USD',
          seller: {
            stripeAccountId: 'acct_test123',
          },
        },
        signatures: [{ userId: 'buyer-123' }, { userId: 'seller-123' }],
        escrows: [],
      };

      (prisma.contract.findUnique as jest.Mock).mockResolvedValue(mockContract);
      mockCreateEscrow.mockResolvedValueOnce({
        success: false,
        error: 'Failed to create payment intent',
      });

      const result = await executeContract('contract-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to create escrow');
    });

    it('should handle general errors', async () => {
      (prisma.contract.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'));

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

    it('should return false when only buyer has signed', async () => {
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
  });

  describe('getContractExecutionStatus', () => {
    it('should return error when contract not found', async () => {
      (prisma.contract.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await getContractExecutionStatus('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Contract not found');
    });

    it('should return status when only seller has signed', async () => {
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

    it('should return status when both parties have signed', async () => {
      const mockContract = {
        id: 'contract-123',
        status: 'EXECUTED',
        offer: {
          buyerId: 'buyer-123',
          sellerId: 'seller-123',
        },
        signatures: [{ userId: 'buyer-123' }, { userId: 'seller-123' }],
        escrows: [],
      };

      (prisma.contract.findUnique as jest.Mock).mockResolvedValue(mockContract);

      const result = await getContractExecutionStatus('contract-123');

      expect(result.success).toBe(true);
      expect(result.status?.buyerSigned).toBe(true);
      expect(result.status?.sellerSigned).toBe(true);
      expect(result.status?.escrowCreated).toBe(false);
      expect(result.status?.contractStatus).toBe('EXECUTED');
    });
  });
});