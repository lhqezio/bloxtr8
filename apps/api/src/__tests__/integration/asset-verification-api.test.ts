// Mock functions that will be used
const mockVerifyGameOwnership = jest.fn();
const mockGetUserVerifiedGames = jest.fn();
const mockCreateGameSnapshot = jest.fn();

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

// Mock the GameVerificationService
jest.mock('../../lib/asset-verification.js', () => ({
  GameVerificationService: jest.fn().mockImplementation(() => ({
    verifyGameOwnership: mockVerifyGameOwnership,
    getUserVerifiedGames: mockGetUserVerifiedGames,
    createGameSnapshot: mockCreateGameSnapshot,
  })),
}));

import request from 'supertest';

import app from '../../index.js';

describe('Game Verification API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/asset-verification/verify', () => {
    it('should verify game ownership successfully', async () => {
      const mockResult = {
        success: true,
        verified: true,
        gameDetails: {
          id: '123456789',
          name: 'Test Game',
          description: 'A test game',
          creator: { name: 'Test Creator', id: 123, type: 'User' },
          visits: 1000,
          playing: 50,
        },
        ownershipType: 'Owner',
        verificationId: 'verification123',
      };

      mockVerifyGameOwnership.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/asset-verification/verify')
        .send({
          gameId: '123456789',
          robloxUserId: '987654321',
          userId: 'user123', // Add userId to request body since no auth middleware
        })
        .expect(200);

      expect(response.body.verified).toBe(true);
      expect(response.body.gameDetails).toBeDefined();
      expect(response.body.ownershipType).toBe('Owner');
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
        error: 'Game not found',
      };

      mockVerifyGameOwnership.mockResolvedValue(mockResult);

      await request(app)
        .post('/api/asset-verification/verify')
        .send({
          gameId: '123456789',
          robloxUserId: '987654321',
          userId: 'user123',
        })
        .expect(400);
    });

    it('should return 500 on internal server error', async () => {
      mockVerifyGameOwnership.mockRejectedValue(new Error('Internal error'));

      await request(app)
        .post('/api/asset-verification/verify')
        .send({
          gameId: '123456789',
          robloxUserId: '987654321',
          userId: 'user123',
        })
        .expect(500);
    });
  });

  describe('GET /api/asset-verification/user/:userId/games', () => {
    it('should return user verified games', async () => {
      const now = new Date();
      const mockGames = [
        {
          id: 'verification1',
          gameId: 'game1',
          verificationStatus: 'VERIFIED',
          ownershipType: 'OWNER',
          verifiedAt: now,
        },
        {
          id: 'verification2',
          gameId: 'game2',
          verificationStatus: 'VERIFIED',
          ownershipType: 'ADMIN',
          verifiedAt: now,
        },
      ];

      mockGetUserVerifiedGames.mockResolvedValue(mockGames);

      const response = await request(app)
        .get('/api/asset-verification/user/user123/games')
        .expect(200);

      // Dates are serialized to strings in JSON
      expect(response.body.games).toEqual([
        { ...mockGames[0], verifiedAt: now.toISOString() },
        { ...mockGames[1], verifiedAt: now.toISOString() },
      ]);
      expect(response.body.count).toBe(2);
    });

    it('should return empty array when no games found', async () => {
      mockGetUserVerifiedGames.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/asset-verification/user/user123/games')
        .expect(200);

      expect(response.body.games).toEqual([]);
      expect(response.body.count).toBe(0);
    });

    it('should return 500 on internal server error', async () => {
      mockGetUserVerifiedGames.mockRejectedValue(new Error('Database error'));

      await request(app)
        .get('/api/asset-verification/user/user123/games')
        .expect(500);
    });
  });

  describe('POST /api/asset-verification/snapshot', () => {
    it('should create game snapshot successfully', async () => {
      const mockSnapshot = {
        id: 'snapshot123',
        gameId: 'game456',
        gameName: 'Test Game',
        verifiedOwnership: true,
      };

      mockCreateGameSnapshot.mockResolvedValue(mockSnapshot);

      const response = await request(app)
        .post('/api/asset-verification/snapshot')
        .send({
          listingId: 'listing123',
          gameId: 'game456',
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
          // Missing gameId and verificationId
        })
        .expect(400);
    });

    it('should return 500 when snapshot creation fails', async () => {
      mockCreateGameSnapshot.mockRejectedValue(new Error('Game not verified'));

      await request(app)
        .post('/api/asset-verification/snapshot')
        .send({
          listingId: 'listing123',
          gameId: 'game456',
          verificationId: 'verification789',
        })
        .expect(500);
    });
  });
});
