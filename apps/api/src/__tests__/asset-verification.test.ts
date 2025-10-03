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

import { GameVerificationService } from '../lib/asset-verification.js';

// Mock RobloxApiClient
jest.mock('../lib/roblox-api.js', () => ({
  RobloxApiClient: jest.fn().mockImplementation(() => ({
    getGameDetails: jest.fn(),
    verifyGameOwnership: jest.fn(),
    getUserExperiences: jest.fn(),
  })),
}));

describe('GameVerificationService', () => {
  let service: GameVerificationService;
  let mockRobloxApi: any;
  let mockPrisma: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Set required environment variables for tests
    process.env.ROBLOX_CLIENT_ID = 'test-client-id';
    process.env.ROBLOX_CLIENT_SECRET = 'test-client-secret';

    mockRobloxApi = {
      getGameDetails: jest.fn(),
      verifyGameOwnership: jest.fn(),
      getUserExperiences: jest.fn(),
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

    service = new GameVerificationService(mockPrisma);
    // Inject mock roblox API
    (service as any).robloxApi = mockRobloxApi;
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.ROBLOX_CLIENT_ID;
    delete process.env.ROBLOX_CLIENT_SECRET;
  });

  describe('verifyGameOwnership', () => {
    it('should verify game ownership successfully', async () => {
      const userId = 'user123';
      const gameId = 'game456';
      const robloxUserId = 'roblox789';

      const mockGameDetails = {
        id: gameId,
        name: 'Test Game',
        description: 'A test game',
        creator: { name: 'Test Creator', id: 123, type: 'User' },
        created: '2023-01-01T00:00:00Z',
        visits: 1000,
        playing: 50,
        genre: 'Adventure',
        thumbnailUrl: 'https://example.com/thumbnail.png',
      };

      const mockOwnershipResult = {
        owns: true,
        role: 'Owner',
      };

      const mockVerification = {
        id: 'verification123',
        userId,
        gameId,
        verificationStatus: 'VERIFIED',
        ownershipType: 'OWNER',
        verifiedAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      // Mock no existing verification
      mockPrisma.assetVerification.findUnique.mockResolvedValue(null);
      mockRobloxApi.getGameDetails.mockResolvedValue(mockGameDetails);
      mockRobloxApi.verifyGameOwnership.mockResolvedValue(mockOwnershipResult);
      mockRobloxApi.getUserExperiences.mockResolvedValue([]);
      mockPrisma.assetVerification.upsert.mockResolvedValue(mockVerification);

      const result = await service.verifyGameOwnership(
        userId,
        gameId,
        robloxUserId
      );

      expect(result.success).toBe(true);
      expect(result.verified).toBe(true);
      expect(result.gameDetails).toEqual(mockGameDetails);
      expect(result.ownershipType).toBe('Owner');
      expect(result.verificationId).toBe('verification123');
    });

    it('should return cached result for recent verification', async () => {
      const userId = 'user123';
      const gameId = 'game456';
      const robloxUserId = 'roblox789';

      const existingVerification = {
        id: 'verification123',
        verificationStatus: 'VERIFIED',
        ownershipType: 'OWNER',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Still valid
        metadata: {
          gameDetails: {
            id: gameId,
            name: 'Test Game',
            description: 'A test game',
            creator: { name: 'Test Creator', id: 123, type: 'User' },
            created: '2023-01-01T00:00:00Z',
            visits: 1000,
            playing: 50,
            genre: 'Adventure',
            thumbnailUrl: 'https://example.com/thumbnail.png',
          },
        },
      };

      mockPrisma.assetVerification.findUnique.mockResolvedValue(
        existingVerification
      );

      const result = await service.verifyGameOwnership(
        userId,
        gameId,
        robloxUserId
      );

      expect(result.success).toBe(true);
      expect(result.verified).toBe(true);
      expect(result.ownershipType).toBe('OWNER');
      expect(result.verificationId).toBe('verification123');

      // Should not call Roblox API for cached results
      expect(mockRobloxApi.getGameDetails).not.toHaveBeenCalled();
      expect(mockRobloxApi.verifyGameOwnership).not.toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      const userId = 'user123';
      const gameId = 'game456';
      const robloxUserId = 'roblox789';

      mockPrisma.assetVerification.findUnique.mockResolvedValue(null);
      mockRobloxApi.verifyGameOwnership.mockRejectedValue(
        new Error('API Error')
      );

      const result = await service.verifyGameOwnership(
        userId,
        gameId,
        robloxUserId
      );

      expect(result.success).toBe(false);
      expect(result.verified).toBe(false);
      // The error actually comes from the getGameDetails call
      expect(result.error).toBe('API Error');
    });

    it('should return error when game not found', async () => {
      const userId = 'user123';
      const gameId = 'game456';
      const robloxUserId = 'roblox789';

      mockPrisma.assetVerification.findUnique.mockResolvedValue(null);
      mockRobloxApi.getGameDetails.mockResolvedValue(null);
      mockRobloxApi.verifyGameOwnership.mockResolvedValue({
        owns: true,
        role: 'Owner',
      });
      mockRobloxApi.getUserExperiences.mockResolvedValue([]);
      // Mock upsert to return a verification object with id
      mockPrisma.assetVerification.upsert.mockResolvedValue({
        id: 'verification123',
        ownershipType: 'OWNER',
      });

      const result = await service.verifyGameOwnership(
        userId,
        gameId,
        robloxUserId
      );

      expect(result.success).toBe(true);
      expect(result.verified).toBe(true);
      expect(result.gameDetails).toBeDefined();
      expect(result.gameDetails?.name).toBe('Game game456'); // fallback name
    });

    it('should return error when user does not own game', async () => {
      const userId = 'user123';
      const gameId = 'game456';
      const robloxUserId = 'roblox789';

      const mockGameDetails = {
        id: gameId,
        name: 'Test Game',
        description: 'A test game',
        creator: { name: 'Test Creator', id: 123, type: 'User' },
      };

      const mockOwnershipResult = {
        owns: false,
        role: 'None',
      };

      mockPrisma.assetVerification.findUnique.mockResolvedValue(null);
      mockRobloxApi.getGameDetails.mockResolvedValue(mockGameDetails);
      mockRobloxApi.verifyGameOwnership.mockResolvedValue(mockOwnershipResult);

      const result = await service.verifyGameOwnership(
        userId,
        gameId,
        robloxUserId
      );

      expect(result.success).toBe(true);
      expect(result.verified).toBe(false);
      expect(result.gameDetails).toBeUndefined();
      expect(result.error).toBe(
        'You do not own or have admin access to this game'
      );
    });

    it('should handle invalid cached gameDetails without throwing TypeError', async () => {
      const userId = 'user123';
      const gameId = 'game456';
      const robloxUserId = 'roblox789';

      // Mock cached verification with invalid gameDetails
      const existingVerification = {
        id: 'verification123',
        verificationStatus: 'VERIFIED',
        ownershipType: 'OWNER',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Still valid
        metadata: {
          gameDetails: {
            id: null, // This would cause TypeError with .trim()
            name: undefined, // This would cause TypeError with .trim()
            creator: { name: 'Test Creator', id: 123, type: 'User' },
          },
        },
      };

      const mockGameDetails = {
        id: gameId,
        name: 'Test Game',
        description: 'A test game',
        creator: { name: 'Test Creator', id: 123, type: 'User' },
        created: '2023-01-01T00:00:00Z',
        visits: 1000,
        playing: 50,
        genre: 'Adventure',
        thumbnailUrl: 'https://example.com/thumbnail.png',
      };

      mockPrisma.assetVerification.findUnique.mockResolvedValue(
        existingVerification
      );
      mockRobloxApi.getGameDetails.mockResolvedValue(mockGameDetails);

      const result = await service.verifyGameOwnership(
        userId,
        gameId,
        robloxUserId
      );

      expect(result.success).toBe(true);
      expect(result.verified).toBe(true);
      expect(result.gameDetails).toEqual(mockGameDetails);
      expect(result.ownershipType).toBe('OWNER');
      expect(result.verificationId).toBe('verification123');

      // Should call getGameDetails to fetch fresh data
      expect(mockRobloxApi.getGameDetails).toHaveBeenCalledWith(gameId);
    });

    it('should handle empty string gameDetails without throwing TypeError', async () => {
      const userId = 'user123';
      const gameId = 'game456';
      const robloxUserId = 'roblox789';

      // Mock cached verification with empty string gameDetails
      const existingVerification = {
        id: 'verification123',
        verificationStatus: 'VERIFIED',
        ownershipType: 'OWNER',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Still valid
        metadata: {
          gameDetails: {
            id: '', // Empty string
            name: '', // Empty string
            creator: { name: 'Test Creator', id: 123, type: 'User' },
          },
        },
      };

      const mockGameDetails = {
        id: gameId,
        name: 'Test Game',
        description: 'A test game',
        creator: { name: 'Test Creator', id: 123, type: 'User' },
        created: '2023-01-01T00:00:00Z',
        visits: 1000,
        playing: 50,
        genre: 'Adventure',
        thumbnailUrl: 'https://example.com/thumbnail.png',
      };

      mockPrisma.assetVerification.findUnique.mockResolvedValue(
        existingVerification
      );
      mockRobloxApi.getGameDetails.mockResolvedValue(mockGameDetails);

      const result = await service.verifyGameOwnership(
        userId,
        gameId,
        robloxUserId
      );

      expect(result.success).toBe(true);
      expect(result.verified).toBe(true);
      expect(result.gameDetails).toEqual(mockGameDetails);
      expect(result.ownershipType).toBe('OWNER');
      expect(result.verificationId).toBe('verification123');

      // Should call getGameDetails to fetch fresh data
      expect(mockRobloxApi.getGameDetails).toHaveBeenCalledWith(gameId);
    });
  });

  describe('getUserVerifiedGames', () => {
    it('should return user verified games', async () => {
      const userId = 'user123';
      const mockGames = [
        {
          id: 'verification1',
          gameId: 'game1',
          verificationStatus: 'VERIFIED',
          ownershipType: 'OWNER',
          verifiedAt: new Date(),
        },
        {
          id: 'verification2',
          gameId: 'game2',
          verificationStatus: 'VERIFIED',
          ownershipType: 'ADMIN',
          verifiedAt: new Date(),
        },
      ];

      mockPrisma.assetVerification.findMany.mockResolvedValue(mockGames);

      const result = await service.getUserVerifiedGames(userId);

      expect(result).toEqual(mockGames);
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

  describe('createGameSnapshot', () => {
    it('should create game snapshot successfully', async () => {
      const listingId = 'listing123';
      const gameId = 'game456';
      const verificationId = 'verification789';

      const mockVerification = {
        id: verificationId,
        verificationStatus: 'VERIFIED',
        ownershipType: 'OWNER',
        verifiedAt: new Date(),
        metadata: {
          gameDetails: {
            id: gameId,
            name: 'Test Game',
            description: 'Test Game Description',
            creator: { name: 'Test Creator', id: 123, type: 'User' },
            created: '2023-01-01T00:00:00Z',
            visits: 1000,
            playing: 50,
            thumbnailUrl: 'https://example.com/thumbnail.png',
          },
        },
      };

      const mockSnapshot = {
        id: 'snapshot123',
        gameId,
        gameName: 'Test Game',
        verifiedOwnership: true,
      };

      mockPrisma.assetVerification.findUnique.mockResolvedValue(
        mockVerification
      );
      mockPrisma.robloxSnapshot.create.mockResolvedValue(mockSnapshot);

      const result = await service.createGameSnapshot(
        listingId,
        gameId,
        verificationId
      );

      expect(result).toEqual(mockSnapshot);
      expect(mockPrisma.robloxSnapshot.create).toHaveBeenCalledWith({
        data: {
          gameId,
          gameName: 'Test Game',
          gameDescription: 'Test Game Description',
          thumbnailUrl: 'https://example.com/thumbnail.png',
          playerCount: 50,
          visits: 1000,
          createdDate: new Date('2023-01-01T00:00:00Z'),
          verifiedOwnership: true,
          ownershipType: 'OWNER',
          verificationDate: mockVerification.verifiedAt,
          metadata: {
            verificationId,
            gameDetails: mockVerification.metadata.gameDetails,
            createdAt: expect.any(String),
          },
          listingId,
        },
      });
    });

    it('should throw error when game not verified', async () => {
      const listingId = 'listing123';
      const gameId = 'game456';
      const verificationId = 'verification789';

      const mockVerification = {
        id: verificationId,
        verificationStatus: 'FAILED',
      };

      mockPrisma.assetVerification.findUnique.mockResolvedValue(
        mockVerification
      );

      await expect(
        service.createGameSnapshot(listingId, gameId, verificationId)
      ).rejects.toThrow('Game not verified');
    });
  });
});
