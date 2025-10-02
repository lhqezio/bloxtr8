// Mock Prisma Client before importing anything else
jest.mock('@bloxtr8/database', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    assetVerification: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
    robloxSnapshot: {
      create: jest.fn(),
    },
  })),
}));

import request from 'supertest';
import app from '../../index.js';

// Mock the AssetVerificationService
jest.mock('../../lib/asset-verification.js', () => ({
  AssetVerificationService: jest.fn().mockImplementation(() => ({
    verifyAssetOwnership: jest.fn(),
    getUserVerifiedAssets: jest.fn(),
    createAssetSnapshot: jest.fn(),
  })),
}));

describe('Asset Verification API', () => {
  let mockAssetVerificationService: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Get the mocked service instance
    const { AssetVerificationService } = require('../../lib/asset-verification.js');
    mockAssetVerificationService = new AssetVerificationService();
  });

  describe('POST /api/asset-verification/verify', () => {
    it('should verify asset ownership successfully', async () => {
      const mockResult = {
        success: true,
        verified: true,
        assetDetails: {
          id: '123456789',
          name: 'Test Asset',
          assetType: { name: 'Limited' },
        },
        verificationId: 'verification123',
      };

      mockAssetVerificationService.verifyAssetOwnership.mockResolvedValue(mockResult);

      // Mock authentication middleware
      const mockReq = {
        user: { id: 'user123' },
      };

      const response = await request(app)
        .post('/api/asset-verification/verify')
        .send({
          assetId: '123456789',
          robloxUserId: '987654321',
        })
        .expect(200);

      expect(response.body.verified).toBe(true);
      expect(response.body.assetDetails).toBeDefined();
      expect(response.body.verificationId).toBe('verification123');
    });

    it('should return 400 for missing fields', async () => {
      await request(app)
        .post('/api/asset-verification/verify')
        .send({})
        .expect(400);
    });

    it('should return 400 when verification fails', async () => {
      const mockResult = {
        success: false,
        verified: false,
        error: 'Asset not found',
      };

      mockAssetVerificationService.verifyAssetOwnership.mockResolvedValue(mockResult);

      await request(app)
        .post('/api/asset-verification/verify')
        .send({
          assetId: '123456789',
          robloxUserId: '987654321',
        })
        .expect(400);
    });

    it('should return 500 on internal server error', async () => {
      mockAssetVerificationService.verifyAssetOwnership.mockRejectedValue(
        new Error('Internal error')
      );

      await request(app)
        .post('/api/asset-verification/verify')
        .send({
          assetId: '123456789',
          robloxUserId: '987654321',
        })
        .expect(500);
    });
  });

  describe('GET /api/asset-verification/user/:userId/assets', () => {
    it('should return user verified assets', async () => {
      const mockAssets = [
        {
          id: 'verification1',
          assetId: 'asset1',
          verificationStatus: 'VERIFIED',
          verifiedAt: new Date(),
        },
        {
          id: 'verification2',
          assetId: 'asset2',
          verificationStatus: 'VERIFIED',
          verifiedAt: new Date(),
        },
      ];

      mockAssetVerificationService.getUserVerifiedAssets.mockResolvedValue(mockAssets);

      const response = await request(app)
        .get('/api/asset-verification/user/user123/assets')
        .expect(200);

      expect(response.body.assets).toEqual(mockAssets);
      expect(response.body.count).toBe(2);
    });

    it('should return empty array when no assets found', async () => {
      mockAssetVerificationService.getUserVerifiedAssets.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/asset-verification/user/user123/assets')
        .expect(200);

      expect(response.body.assets).toEqual([]);
      expect(response.body.count).toBe(0);
    });

    it('should return 500 on internal server error', async () => {
      mockAssetVerificationService.getUserVerifiedAssets.mockRejectedValue(
        new Error('Database error')
      );

      await request(app)
        .get('/api/asset-verification/user/user123/assets')
        .expect(500);
    });
  });

  describe('POST /api/asset-verification/snapshot', () => {
    it('should create asset snapshot successfully', async () => {
      const mockSnapshot = {
        id: 'snapshot123',
        assetId: 'asset456',
        assetName: 'Test Asset',
        verifiedOwnership: true,
      };

      mockAssetVerificationService.createAssetSnapshot.mockResolvedValue(mockSnapshot);

      const response = await request(app)
        .post('/api/asset-verification/snapshot')
        .send({
          listingId: 'listing123',
          assetId: 'asset456',
          verificationId: 'verification789',
        })
        .expect(200);

      expect(response.body.snapshot).toEqual(mockSnapshot);
    });

    it('should return 400 for missing fields', async () => {
      await request(app)
        .post('/api/asset-verification/snapshot')
        .send({
          listingId: 'listing123',
          // Missing assetId and verificationId
        })
        .expect(400);
    });

    it('should return 500 when snapshot creation fails', async () => {
      mockAssetVerificationService.createAssetSnapshot.mockRejectedValue(
        new Error('Asset not verified')
      );

      await request(app)
        .post('/api/asset-verification/snapshot')
        .send({
          listingId: 'listing123',
          assetId: 'asset456',
          verificationId: 'verification789',
        })
        .expect(500);
    });
  });
});
