import request from 'supertest';

// Mock Prisma client before importing app
const mockUserFindUnique = jest.fn();
const mockUserFindFirst = jest.fn();
const mockUserCreate = jest.fn();
const mockAccountFindMany = jest.fn();
const mockAccountCreate = jest.fn();
const mockAccountUpsert = jest.fn();
const mockTransaction = jest.fn();

jest.mock('@bloxtr8/database', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    user: {
      findUnique: mockUserFindUnique,
      findFirst: mockUserFindFirst,
      create: mockUserCreate,
    },
    account: {
      findMany: mockAccountFindMany,
      create: mockAccountCreate,
      upsert: mockAccountUpsert,
    },
    $transaction: mockTransaction,
  })),
}));

import app from '../index.js';

describe('Users API Routes', () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockUserFindUnique.mockClear();
    mockUserFindFirst.mockClear();
    mockUserCreate.mockClear();
    mockAccountFindMany.mockClear();
    mockAccountCreate.mockClear();
    mockAccountUpsert.mockClear();
    mockTransaction.mockClear();
  });

  describe('GET /api/users/account/:id', () => {
    it('should return 200 with user data when user exists', async () => {
      const mockUser = {
        id: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
        kycVerified: true,
        kycTier: 'TIER_2',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockUserFindUnique.mockResolvedValue(mockUser);

      const response = await request(app)
        .get('/api/users/account/user-123')
        .expect(200);

      expect(response.body).toMatchObject({
        id: mockUser.id,
        name: mockUser.name,
        email: mockUser.email,
        kycVerified: mockUser.kycVerified,
        kycTier: mockUser.kycTier,
      });
      expect(mockUserFindUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
      });
    });

    it('should return 404 when user not found', async () => {
      mockUserFindUnique.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/users/account/nonexistent-user')
        .expect(404);

      expect(response.body).toMatchObject({
        title: 'Not Found',
        status: 404,
      });
    });

    it('should handle database errors', async () => {
      mockUserFindUnique.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/users/account/user-123')
        .expect(500);

      expect(response.body).toMatchObject({
        title: 'Internal Server Error',
        status: 500,
      });
    });
  });

  describe('GET /api/users/verify/:id', () => {
    it('should return 200 with user data when Discord account exists', async () => {
      const mockUser = {
        id: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
        kycVerified: true,
        kycTier: 'TIER_2',
        accounts: [{ accountId: 'discord-123' }],
      };

      mockUserFindFirst.mockResolvedValue(mockUser);

      const response = await request(app)
        .get('/api/users/verify/discord-123')
        .expect(200);

      expect(response.body).toEqual(mockUser);
      expect(mockUserFindFirst).toHaveBeenCalledWith({
        where: {
          accounts: {
            some: {
              accountId: 'discord-123',
              providerId: 'discord',
            },
          },
        },
        select: {
          id: true,
          name: true,
          email: true,
          kycVerified: true,
          kycTier: true,
          accounts: {
            where: {
              providerId: 'discord',
            },
            select: {
              accountId: true,
            },
          },
        },
      });
    });

    it('should return 404 when Discord account not found', async () => {
      mockUserFindFirst.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/users/verify/nonexistent-discord-id')
        .expect(404);

      expect(response.body).toMatchObject({
        title: 'Not Found',
        status: 404,
      });
    });

    it('should return 400 for empty account ID', async () => {
      await request(app)
        .get('/api/users/verify/')
        .expect(404); // Express returns 404 for empty path param

      // Test with whitespace-only string in path - this will be trimmed and validated
      const response2 = await request(app)
        .get('/api/users/verify/%20%20%20')
        .expect(400);

      expect(response2.body).toMatchObject({
        title: 'Bad Request',
        status: 400,
      });
    });

    it('should handle database errors', async () => {
      mockUserFindFirst.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/users/verify/discord-123')
        .expect(500);

      expect(response.body).toMatchObject({
        title: 'Internal Server Error',
        status: 500,
      });
    });
  });

  describe('GET /api/users/accounts/:id', () => {
    it('should return 200 with accounts array when user exists', async () => {
      const mockUser = { id: 'user-123' };
      const mockAccounts = [
        { accountId: 'discord-123', providerId: 'discord' },
        { accountId: 'roblox-456', providerId: 'roblox' },
      ];

      mockUserFindFirst.mockResolvedValue(mockUser);
      mockAccountFindMany.mockResolvedValue(mockAccounts);

      const response = await request(app)
        .get('/api/users/accounts/discord-123')
        .expect(200);

      expect(response.body).toEqual(mockAccounts);
      expect(mockUserFindFirst).toHaveBeenCalledWith({
        where: {
          accounts: {
            some: {
              accountId: 'discord-123',
              providerId: 'discord',
            },
          },
        },
      });
      expect(mockAccountFindMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
        },
        select: {
          accountId: true,
          providerId: true,
        },
      });
    });

    it('should return 200 with empty array when user not found', async () => {
      mockUserFindFirst.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/users/accounts/nonexistent-discord-id')
        .expect(200);

      expect(response.body).toEqual([]);
      expect(mockAccountFindMany).not.toHaveBeenCalled();
    });

    it('should return 400 for empty account ID', async () => {
      const response = await request(app)
        .get('/api/users/accounts/%20%20%20')
        .expect(400);

      expect(response.body).toMatchObject({
        title: 'Bad Request',
        status: 400,
      });
    });

    it('should handle database errors', async () => {
      mockUserFindFirst.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/users/accounts/discord-123')
        .expect(500);

      expect(response.body).toMatchObject({
        title: 'Internal Server Error',
        status: 500,
      });
    });
  });

  describe('POST /api/users/ensure', () => {
    it('should return 200 with existing user when Discord account exists', async () => {
      const mockUser = {
        id: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
        kycVerified: true,
        kycTier: 'TIER_2',
        accounts: [{ accountId: 'discord-123' }],
      };

      mockUserFindFirst.mockResolvedValue(mockUser);

      const response = await request(app)
        .post('/api/users/ensure')
        .send({
          discordId: 'discord-123',
          username: 'Test User',
        })
        .expect(200);

      expect(response.body).toEqual(mockUser);
      expect(mockUserFindFirst).toHaveBeenCalledWith({
        where: {
          accounts: {
            some: {
              accountId: 'discord-123',
              providerId: 'discord',
            },
          },
        },
        select: {
          id: true,
          name: true,
          email: true,
          kycVerified: true,
          kycTier: true,
          accounts: {
            where: {
              providerId: 'discord',
            },
            select: {
              accountId: true,
            },
          },
        },
      });
    });

    it('should return 200 with new user when Discord account does not exist', async () => {
      const mockNewUser = {
        id: 'user-123',
        name: 'New User',
        email: 'discord-123@discord.example',
        kycVerified: false,
        kycTier: 'TIER_1',
      };

      const mockTransactionResult = {
        ...mockNewUser,
        accounts: [{ accountId: 'discord-123' }],
      };

      mockUserFindFirst.mockResolvedValue(null);
      mockTransaction.mockImplementation(async (callback) => {
        const mockTx = {
          user: {
            create: jest.fn().mockResolvedValue(mockNewUser),
          },
          account: {
            create: jest.fn().mockResolvedValue({}),
          },
        };
        return callback(mockTx);
      });

      // Mock the transaction to return the expected result
      mockTransaction.mockResolvedValue(mockTransactionResult);

      const response = await request(app)
        .post('/api/users/ensure')
        .send({
          discordId: 'discord-123',
          username: 'New User',
        })
        .expect(200);

      expect(response.body).toEqual(mockTransactionResult);
      expect(mockUserFindFirst).toHaveBeenCalled();
      expect(mockTransaction).toHaveBeenCalled();
    });

    it('should return 400 for missing discordId', async () => {
      const response = await request(app)
        .post('/api/users/ensure')
        .send({
          username: 'Test User',
        })
        .expect(400);

      expect(response.body).toMatchObject({
        title: 'Bad Request',
        status: 400,
      });
    });

    it('should return 400 for missing username', async () => {
      const response = await request(app)
        .post('/api/users/ensure')
        .send({
          discordId: 'discord-123',
        })
        .expect(400);

      expect(response.body).toMatchObject({
        title: 'Bad Request',
        status: 400,
      });
    });

    it('should return 400 for empty discordId', async () => {
      const response = await request(app)
        .post('/api/users/ensure')
        .send({
          discordId: '',
          username: 'Test User',
        })
        .expect(400);

      expect(response.body).toMatchObject({
        title: 'Bad Request',
        status: 400,
      });
    });

    it('should return 400 for empty username', async () => {
      const response = await request(app)
        .post('/api/users/ensure')
        .send({
          discordId: 'discord-123',
          username: '',
        })
        .expect(400);

      expect(response.body).toMatchObject({
        title: 'Bad Request',
        status: 400,
      });
    });

    it('should handle database errors', async () => {
      mockUserFindFirst.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/api/users/ensure')
        .send({
          discordId: 'discord-123',
          username: 'Test User',
        })
        .expect(500);

      expect(response.body).toMatchObject({
        title: 'Internal Server Error',
        status: 500,
      });
    });

    it('should handle transaction errors', async () => {
      mockUserFindFirst.mockResolvedValue(null);
      mockTransaction.mockRejectedValue(new Error('Transaction error'));

      const response = await request(app)
        .post('/api/users/ensure')
        .send({
          discordId: 'discord-123',
          username: 'Test User',
        })
        .expect(500);

      expect(response.body).toMatchObject({
        title: 'Internal Server Error',
        status: 500,
      });
    });
  });

  describe('Error handling', () => {
    it('should handle malformed JSON in POST requests', async () => {
      const response = await request(app)
        .post('/api/users/ensure')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(500);

      expect(response.body).toMatchObject({
        title: 'Internal Server Error',
        status: 500,
      });
    });

    it('should handle missing Content-Type header', async () => {
      const response = await request(app)
        .post('/api/users/ensure')
        .send('discordId=test&username=test')
        .expect(400);

      expect(response.body).toMatchObject({
        title: 'Bad Request',
        status: 400,
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle very long account IDs', async () => {
      const longId = 'a'.repeat(1000);
      mockUserFindFirst.mockResolvedValue(null);

      await request(app)
        .get(`/api/users/verify/${  longId}`)
        .expect(404);

      expect(mockUserFindFirst).toHaveBeenCalledWith({
        where: {
          accounts: {
            some: {
              accountId: longId,
              providerId: 'discord',
            },
          },
        },
        select: expect.any(Object),
      });
    });

    it('should handle special characters in account IDs', async () => {
      const specialId = 'discord-123!@#$%^&*()';
      mockUserFindFirst.mockResolvedValue(null);

      await request(app)
        .get(`/api/users/verify/${  encodeURIComponent(specialId)}`)
        .expect(404);

      expect(mockUserFindFirst).toHaveBeenCalledWith({
        where: {
          accounts: {
            some: {
              accountId: specialId,
              providerId: 'discord',
            },
          },
        },
        select: expect.any(Object),
      });
    });

    it('should handle unicode characters in usernames', async () => {
      const unicodeUsername = '用户测试🚀';
      mockUserFindFirst.mockResolvedValue(null);
      mockTransaction.mockResolvedValue({
        id: 'user-123',
        name: unicodeUsername,
        email: 'discord-123@discord.example',
        kycVerified: false,
        kycTier: 'TIER_1',
        accounts: [{ accountId: 'discord-123' }],
      });

      const response = await request(app)
        .post('/api/users/ensure')
        .send({
          discordId: 'discord-123',
          username: unicodeUsername,
        })
        .expect(200);

      expect(response.body.name).toBe(unicodeUsername);
    });
  });
});
