import { prisma } from '@bloxtr8/database';
import request from 'supertest';

// Mock dependencies before importing app
jest.mock('@bloxtr8/database', () => {
  const mockPrisma = {
    offer: {
      findUnique: jest.fn(),
    },
    contract: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    signature: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    contractSignToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  return {
    prisma: mockPrisma,
    PrismaClient: jest.fn(() => mockPrisma),
  };
});

jest.mock('../lib/contract-generator', () => ({
  generateContract: jest.fn().mockResolvedValue({
    success: true,
    pdfUrl: 'https://example.com/contract.pdf',
    sha256: 'mock_hash',
    templateVersion: '1.0.0',
  }),
  verifyContract: jest.fn().mockResolvedValue(true),
}));

jest.mock('../lib/contract-execution', () => ({
  executeContract: jest.fn().mockResolvedValue({
    success: true,
    escrowId: 'escrow-123',
  }),
}));

import app from '../index.js';

describe('Contract API Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/contracts/generate', () => {
    it('should generate contract for accepted offer', async () => {
      const mockOffer = {
        id: 'offer-123',
        status: 'ACCEPTED',
        amount: BigInt(100000),
        currency: 'USD',
        updatedAt: new Date(),
        listing: {
          id: 'listing-123',
          title: 'Test Game',
          summary: 'A test game',
          category: 'Games',
          robloxSnapshots: [],
        },
        buyer: {
          id: 'buyer-123',
          name: 'Buyer Name',
          email: 'buyer@test.com',
          kycTier: 'TIER_1',
          accounts: [],
        },
        seller: {
          id: 'seller-123',
          name: 'Seller Name',
          email: 'seller@test.com',
          kycTier: 'TIER_1',
          accounts: [],
        },
      };

      (prisma.offer.findUnique as jest.Mock).mockResolvedValue(mockOffer);
      (prisma.contract.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.contract.create as jest.Mock).mockResolvedValue({
        id: 'contract-123',
        offerId: 'offer-123',
        status: 'PENDING_SIGNATURE',
      });
      (prisma.contract.update as jest.Mock).mockResolvedValue({
        id: 'contract-123',
        pdfUrl: 'https://example.com/contract.pdf',
        sha256: 'mock_hash',
        status: 'PENDING_SIGNATURE',
      });

      const response = await request(app)
        .post('/api/contracts/generate')
        .send({ offerId: 'offer-123' })
        .expect(200);

      expect(response.body).toHaveProperty('contractId');
      expect(response.body).toHaveProperty('pdfUrl');
      expect(response.body).toHaveProperty('sha256');
      expect(prisma.contract.create).toHaveBeenCalled();
    });

    it('should return error for missing offer ID', async () => {
      const response = await request(app)
        .post('/api/contracts/generate')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('detail');
    });

    it('should return error for non-accepted offer', async () => {
      const mockOffer = {
        id: 'offer-123',
        status: 'PENDING',
      };

      (prisma.offer.findUnique as jest.Mock).mockResolvedValue(mockOffer);

      const response = await request(app)
        .post('/api/contracts/generate')
        .send({ offerId: 'offer-123' })
        .expect(400);

      expect(response.body.detail).toContain('accepted');
    });

    it('should return existing contract if already generated', async () => {
      const mockOffer = {
        id: 'offer-123',
        status: 'ACCEPTED',
      };

      const existingContract = {
        id: 'contract-123',
        status: 'EXECUTED',
        pdfUrl: 'https://example.com/contract.pdf',
      };

      (prisma.offer.findUnique as jest.Mock).mockResolvedValue(mockOffer);
      (prisma.contract.findFirst as jest.Mock).mockResolvedValue(
        existingContract
      );

      const response = await request(app)
        .post('/api/contracts/generate')
        .send({ offerId: 'offer-123' })
        .expect(200);

      expect(response.body.alreadyExists).toBe(true);
      expect(response.body.contractId).toBe('contract-123');
    });
  });

  describe('GET /api/contracts/:id', () => {
    it('should return contract details', async () => {
      const mockContract = {
        id: 'contract-123',
        status: 'PENDING_SIGNATURE',
        pdfUrl: 'https://example.com/contract.pdf',
        signatures: [],
        offer: {
          buyer: { id: 'buyer-123', name: 'Buyer', email: 'buyer@test.com' },
          seller: {
            id: 'seller-123',
            name: 'Seller',
            email: 'seller@test.com',
          },
          listing: { id: 'listing-123', title: 'Test', category: 'Games' },
        },
      };

      (prisma.contract.findUnique as jest.Mock).mockResolvedValue(mockContract);

      const response = await request(app)
        .get('/api/contracts/contract-123')
        .expect(200);

      expect(response.body).toHaveProperty('id', 'contract-123');
      expect(response.body).toHaveProperty('status');
    });

    it('should return 404 for non-existent contract', async () => {
      (prisma.contract.findUnique as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .get('/api/contracts/non-existent')
        .expect(404);

      expect(response.body).toHaveProperty('detail');
    });
  });

  describe('POST /api/contracts/:id/sign', () => {
    it('should successfully sign contract', async () => {
      const mockContract = {
        id: 'contract-123',
        status: 'PENDING_SIGNATURE',
        offer: {
          buyerId: 'buyer-123',
          sellerId: 'seller-123',
        },
        signatures: [],
      };

      (prisma.contract.findUnique as jest.Mock).mockResolvedValue(mockContract);
      (prisma.signature.create as jest.Mock).mockResolvedValue({
        id: 'signature-123',
        userId: 'buyer-123',
        contractId: 'contract-123',
        signedAt: new Date(),
      });
      (prisma.signature.findMany as jest.Mock).mockResolvedValue([
        { userId: 'buyer-123' },
      ]);

      const response = await request(app)
        .post('/api/contracts/contract-123/sign')
        .send({
          userId: 'buyer-123',
          ipAddress: '192.168.1.1',
          userAgent: 'Test Browser',
        })
        .expect(200);

      expect(response.body).toHaveProperty('signature');
      expect(response.body).toHaveProperty('bothPartiesSigned', false);
      expect(prisma.signature.create).toHaveBeenCalled();
    });

    it('should execute contract when both parties sign', async () => {
      const mockContract = {
        id: 'contract-123',
        status: 'PENDING_SIGNATURE',
        offer: {
          buyerId: 'buyer-123',
          sellerId: 'seller-123',
        },
        signatures: [{ userId: 'buyer-123' }],
      };

      (prisma.contract.findUnique as jest.Mock).mockResolvedValue(mockContract);
      (prisma.signature.create as jest.Mock).mockResolvedValue({
        id: 'signature-456',
        userId: 'seller-123',
      });
      (prisma.signature.findMany as jest.Mock).mockResolvedValue([
        { userId: 'buyer-123' },
        { userId: 'seller-123' },
      ]);
      (prisma.contract.update as jest.Mock).mockResolvedValue({
        id: 'contract-123',
        status: 'EXECUTED',
      });

      const response = await request(app)
        .post('/api/contracts/contract-123/sign')
        .send({ userId: 'seller-123' })
        .expect(200);

      expect(response.body.bothPartiesSigned).toBe(true);
      expect(response.body.contractStatus).toBe('EXECUTED');
      expect(prisma.contract.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'EXECUTED' },
        })
      );
    });

    it('should reject unauthorized user', async () => {
      const mockContract = {
        id: 'contract-123',
        status: 'PENDING_SIGNATURE',
        offer: {
          buyerId: 'buyer-123',
          sellerId: 'seller-123',
        },
        signatures: [],
      };

      (prisma.contract.findUnique as jest.Mock).mockResolvedValue(mockContract);

      const response = await request(app)
        .post('/api/contracts/contract-123/sign')
        .send({ userId: 'unauthorized-user' })
        .expect(403);

      expect(response.body.detail).toContain('not authorized');
    });

    it('should prevent double signing', async () => {
      const mockContract = {
        id: 'contract-123',
        status: 'PENDING_SIGNATURE',
        offer: {
          buyerId: 'buyer-123',
          sellerId: 'seller-123',
        },
        signatures: [{ userId: 'buyer-123' }],
      };

      (prisma.contract.findUnique as jest.Mock).mockResolvedValue(mockContract);

      const response = await request(app)
        .post('/api/contracts/contract-123/sign')
        .send({ userId: 'buyer-123' })
        .expect(400);

      expect(response.body.detail).toContain('already signed');
    });
  });

  describe('POST /api/contracts/:id/sign-token', () => {
    it('should generate sign token for authorized user', async () => {
      const mockContract = {
        id: 'contract-123',
        offer: {
          buyerId: 'buyer-123',
          sellerId: 'seller-123',
        },
      };

      (prisma.contract.findUnique as jest.Mock).mockResolvedValue(mockContract);
      (prisma.contractSignToken.create as jest.Mock).mockResolvedValue({
        token: 'test-token-123',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });

      const response = await request(app)
        .post('/api/contracts/contract-123/sign-token')
        .send({ userId: 'buyer-123' })
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('signUrl');
      expect(prisma.contractSignToken.create).toHaveBeenCalled();
    });

    it('should reject unauthorized user for token generation', async () => {
      const mockContract = {
        id: 'contract-123',
        offer: {
          buyerId: 'buyer-123',
          sellerId: 'seller-123',
        },
      };

      (prisma.contract.findUnique as jest.Mock).mockResolvedValue(mockContract);

      const response = await request(app)
        .post('/api/contracts/contract-123/sign-token')
        .send({ userId: 'unauthorized-user' })
        .expect(403);

      expect(response.body.detail).toContain('not authorized');
    });
  });
});
