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

// Mock the GameVerificationService
jest.mock('../../lib/asset-verification.js', () => ({
  GameVerificationService: jest.fn().mockImplementation(() => ({
    verifyGameOwnership: jest.fn(),
    getUserVerifiedGames: jest.fn(),
    createGameSnapshot: jest.fn(),
  })),
}));

describe('Game Verification API', () => {
  let mockGameVerificationService: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Get the mocked service instance
    const { GameVerificationService } = require('../../lib/asset-verification.js');
    mockGameVerificationService = new GameVerificationService();
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

      mockGameVerificationService.verifyGameOwnership.mockResolvedValue(mockResult);

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

      mockGameVerificationService.verifyGameOwnership.mockResolvedValue(mockResult);

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
      mockGameVerificationService.verifyGameOwnership.mockRejectedValue(
        new Error('Internal error')
      );

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

      mockGameVerificationService.getUserVerifiedGames.mockResolvedValue(mockGames);

      const response = await request(app)
        .get('/api/asset-verification/user/user123/games')
        .expect(200);

      expect(response.body.games).toEqual(mockGames);
      expect(response.body.count).toBe(2);
    });

    it('should return empty array when no games found', async () => {
      mockGameVerificationService.getUserVerifiedGames.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/asset-verification/user/user123/games')
        .expect(200);

      expect(response.body.games).toEqual([]);
      expect(response.body.count).toBe(0);
    });

    it('should return 500 on internal server error', async () => {
      mockGameVerificationService.getUserVerifiedGames.mockRejectedValue(
        new Error('Database error')
      );

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

      mockGameVerificationService.createGameSnapshot.mockResolvedValue(mockSnapshot);

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
      mockGameVerificationService.createGameSnapshot.mockRejectedValue(
        new Error('Game not verified')
      );

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
