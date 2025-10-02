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

import { AssetVerificationService } from '../lib/asset-verification.js';

// Mock RobloxApiClient
jest.mock('../lib/roblox-api.js', () => ({
  RobloxApiClient: jest.fn().mockImplementation(() => ({
    getAssetDetails: jest.fn(),
    verifyAssetOwnership: jest.fn(),
  })),
}));

describe('AssetVerificationService', () => {
  let service: AssetVerificationService;
  let mockRobloxApi: any;
  let mockPrisma: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockRobloxApi = {
      getAssetDetails: jest.fn(),
      verifyAssetOwnership: jest.fn(),
    };

    mockPrisma = {
      assetVerification: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        findMany: jest.fn(),
      },
      robloxSnapshot: {
        create: jest.fn(),
      },
    };

    service = new AssetVerificationService();
    // Inject mock prisma
    (service as any).prisma = mockPrisma;
    (service as any).robloxApi = mockRobloxApi;
  });

  describe('verifyAssetOwnership', () => {
    it('should verify asset ownership successfully', async () => {
      const userId = 'user123';
      const assetId = 'asset456';
      const robloxUserId = 'roblox789';

      const mockAssetDetails = {
        id: assetId,
        name: 'Test Asset',
        assetType: { name: 'Limited' },
        creator: { name: 'Test Creator' },
        created: '2023-01-01T00:00:00Z',
        recentAveragePrice: 1000,
      };

      const mockVerification = {
        id: 'verification123',
        userId,
        assetId,
        verificationStatus: 'VERIFIED',
        verifiedAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      // Mock no existing verification
      mockPrisma.assetVerification.findUnique.mockResolvedValue(null);
      mockRobloxApi.getAssetDetails.mockResolvedValue(mockAssetDetails);
      mockRobloxApi.verifyAssetOwnership.mockResolvedValue(true);
      mockPrisma.assetVerification.upsert.mockResolvedValue(mockVerification);

      const result = await service.verifyAssetOwnership(userId, assetId, robloxUserId);

      expect(result.success).toBe(true);
      expect(result.verified).toBe(true);
      expect(result.assetDetails).toEqual(mockAssetDetails);
      expect(result.verificationId).toBe('verification123');
    });

    it('should return cached result for recent verification', async () => {
      const userId = 'user123';
      const assetId = 'asset456';
      const robloxUserId = 'roblox789';

      const existingVerification = {
        id: 'verification123',
        verificationStatus: 'VERIFIED',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Still valid
      };

      mockPrisma.assetVerification.findUnique.mockResolvedValue(existingVerification);

      const result = await service.verifyAssetOwnership(userId, assetId, robloxUserId);

      expect(result.success).toBe(true);
      expect(result.verified).toBe(true);
      expect(result.verificationId).toBe('verification123');
      
      // Should not call Roblox API for cached results
      expect(mockRobloxApi.getAssetDetails).not.toHaveBeenCalled();
      expect(mockRobloxApi.verifyAssetOwnership).not.toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      const userId = 'user123';
      const assetId = 'asset456';
      const robloxUserId = 'roblox789';

      mockPrisma.assetVerification.findUnique.mockResolvedValue(null);
      mockRobloxApi.getAssetDetails.mockRejectedValue(new Error('API Error'));

      const result = await service.verifyAssetOwnership(userId, assetId, robloxUserId);

      expect(result.success).toBe(false);
      expect(result.verified).toBe(false);
      expect(result.error).toBe('API Error');
    });

    it('should return error when asset not found', async () => {
      const userId = 'user123';
      const assetId = 'asset456';
      const robloxUserId = 'roblox789';

      mockPrisma.assetVerification.findUnique.mockResolvedValue(null);
      mockRobloxApi.getAssetDetails.mockResolvedValue(null);

      const result = await service.verifyAssetOwnership(userId, assetId, robloxUserId);

      expect(result.success).toBe(false);
      expect(result.verified).toBe(false);
      expect(result.error).toBe('Asset not found');
    });
  });

  describe('getUserVerifiedAssets', () => {
    it('should return user verified assets', async () => {
      const userId = 'user123';
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

      mockPrisma.assetVerification.findMany.mockResolvedValue(mockAssets);

      const result = await service.getUserVerifiedAssets(userId);

      expect(result).toEqual(mockAssets);
      expect(mockPrisma.assetVerification.findMany).toHaveBeenCalledWith({
        where: {
          userId,
          verificationStatus: 'VERIFIED',
          expiresAt: {
            gt: expect.any(Date),
          },
        },
        orderBy: {
          verifiedAt: 'desc',
        },
      });
    });
  });

  describe('createAssetSnapshot', () => {
    it('should create asset snapshot successfully', async () => {
      const listingId = 'listing123';
      const assetId = 'asset456';
      const verificationId = 'verification789';

      const mockVerification = {
        id: verificationId,
        verificationStatus: 'VERIFIED',
        verifiedAt: new Date(),
        metadata: {
          assetDetails: {
            id: assetId,
            name: 'Test Asset',
            assetType: { name: 'Limited' },
            description: 'Test Description',
            recentAveragePrice: 1000,
            originalPrice: 500,
          },
        },
      };

      const mockSnapshot = {
        id: 'snapshot123',
        assetId,
        assetName: 'Test Asset',
        verifiedOwnership: true,
      };

      mockPrisma.assetVerification.findUnique.mockResolvedValue(mockVerification);
      mockPrisma.robloxSnapshot.create.mockResolvedValue(mockSnapshot);

      const result = await service.createAssetSnapshot(listingId, assetId, verificationId);

      expect(result).toEqual(mockSnapshot);
      expect(mockPrisma.robloxSnapshot.create).toHaveBeenCalledWith({
        data: {
          assetId,
          assetType: 'Limited',
          assetName: 'Test Asset',
          assetDescription: 'Test Description',
          thumbnailUrl: `https://thumbnails.roblox.com/v1/assets?assetIds=${assetId}&size=420x420&format=Png`,
          currentPrice: 1000,
          originalPrice: 500,
          verifiedOwnership: true,
          verificationDate: mockVerification.verifiedAt,
          metadata: {
            verificationId,
            assetDetails: mockVerification.metadata.assetDetails,
            createdAt: expect.any(String),
          },
          listingId,
        },
      });
    });

    it('should throw error when asset not verified', async () => {
      const listingId = 'listing123';
      const assetId = 'asset456';
      const verificationId = 'verification789';

      const mockVerification = {
        id: verificationId,
        verificationStatus: 'FAILED',
      };

      mockPrisma.assetVerification.findUnique.mockResolvedValue(mockVerification);

      await expect(
        service.createAssetSnapshot(listingId, assetId, verificationId)
      ).rejects.toThrow('Asset not verified');
    });
  });
});
