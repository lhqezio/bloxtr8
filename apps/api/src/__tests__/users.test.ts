import request from 'supertest';

// Mock Prisma client before importing app
const mockUserFindUnique = jest.fn();
const mockUserFindFirst = jest.fn();
const mockUserCreate = jest.fn();
const mockUserUpdate = jest.fn();
const mockAccountFindMany = jest.fn();
const mockAccountFindFirst = jest.fn();
const mockAccountCreate = jest.fn();
const mockAccountUpsert = jest.fn();
const mockLinkTokenFindUnique = jest.fn();
const mockLinkTokenCreate = jest.fn();
const mockLinkTokenUpdate = jest.fn();
const mockLinkTokenDelete = jest.fn();
const mockLinkTokenDeleteMany = jest.fn();

const mockTransaction = jest.fn(callback => {
  // Execute the callback with a mock transaction client that has the same methods
  return callback({
    user: {
      findUnique: mockUserFindUnique,
      findFirst: mockUserFindFirst,
      create: mockUserCreate,
      update: mockUserUpdate,
    },
    account: {
      findMany: mockAccountFindMany,
      findFirst: mockAccountFindFirst,
      create: mockAccountCreate,
      upsert: mockAccountUpsert,
    },
  });
});

jest.mock('@bloxtr8/database', () => ({
  prisma: {
    user: {
      findUnique: mockUserFindUnique,
      findFirst: mockUserFindFirst,
      create: mockUserCreate,
      update: mockUserUpdate,
    },
    account: {
      findMany: mockAccountFindMany,
      findFirst: mockAccountFindFirst,
      create: mockAccountCreate,
      upsert: mockAccountUpsert,
    },
    linkToken: {
      findUnique: mockLinkTokenFindUnique,
      create: mockLinkTokenCreate,
      update: mockLinkTokenUpdate,
      delete: mockLinkTokenDelete,
      deleteMany: mockLinkTokenDeleteMany,
    },
    $transaction: mockTransaction,
  },
}));

import app from '../index.js';

describe('Users API Routes', () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockUserFindUnique.mockClear();
    mockUserFindFirst.mockClear();
    mockUserCreate.mockClear();
    mockUserUpdate.mockClear();
    mockAccountFindMany.mockClear();
    mockAccountFindFirst.mockClear();
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
        accounts: [{ accountId: 'discord-123', providerId: 'discord' }],
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
            select: {
              accountId: true,
              providerId: true,
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
      await request(app).get('/api/users/verify/').expect(404); // Express returns 404 for empty path param

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

      expect(response.body).toEqual({
        user: mockUser,
        accounts: mockAccounts,
        discordUserInfo: null,
        robloxUserInfo: null,
      });
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
            select: {
              accountId: true,
              providerId: true,
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
        kycTier: 'TIER_0',
      };

      const _mockTransactionResult = {
        ...mockNewUser,
        accounts: [{ accountId: 'discord-123', providerId: 'discord' }],
      };

      const _mockFinalUser = {
        ...mockNewUser,
        accounts: [{ accountId: 'discord-123', providerId: 'discord' }],
      };

      // Mock first call (user lookup) returns null
      mockUserFindFirst.mockResolvedValueOnce(null);

      mockTransaction.mockImplementation(async callback => {
        const mockTx = {
          user: {
            create: jest.fn().mockResolvedValue(mockNewUser),
          },
          account: {
            create: jest.fn().mockResolvedValue({}),
            findMany: jest.fn().mockResolvedValue([{ accountId: 'discord-123', providerId: 'discord' }]),
          },
        };
        return callback(mockTx);
      });

      const response = await request(app)
        .post('/api/users/ensure')
        .send({
          discordId: 'discord-123',
          username: 'New User',
        })
        .expect(200);

      expect(response.body).toEqual(_mockTransactionResult);
      expect(mockUserFindFirst).toHaveBeenCalledTimes(1);
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

      await request(app).get(`/api/users/verify/${longId}`).expect(404);

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
        .get(`/api/users/verify/${encodeURIComponent(specialId)}`)
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
      const _mockFinalUser = {
        id: 'user-123',
        name: unicodeUsername,
        email: 'discord-123@discord.example',
        kycVerified: false,
        kycTier: 'TIER_0',
        accounts: [{ accountId: 'discord-123', providerId: 'discord' }],
      };

      // Mock first call (user lookup) returns null
      mockUserFindFirst.mockResolvedValueOnce(null);

      mockTransaction.mockImplementation(async callback => {
        const mockTx = {
          user: {
            create: jest.fn().mockResolvedValue({
              id: 'user-123',
              name: unicodeUsername,
              email: 'discord-123@discord.example',
              kycVerified: false,
              kycTier: 'TIER_0',
            }),
          },
          account: {
            create: jest.fn().mockResolvedValue({}),
            findMany: jest.fn().mockResolvedValue([{ accountId: 'discord-123', providerId: 'discord' }]),
          },
        };
        return callback(mockTx);
      });

      const response = await request(app)
        .post('/api/users/ensure')
        .send({
          discordId: 'discord-123',
          username: unicodeUsername,
        })
        .expect(200);

      expect(response.body.name).toBe(unicodeUsername);
      expect(response.body.accounts).toEqual([{ accountId: 'discord-123', providerId: 'discord' }]);
    });
  });

  describe('POST /api/users/link-token', () => {
    it('should generate link token for valid user', async () => {
      const mockUser = { id: 'user-123' };
      const mockLinkToken = {
        id: 'token-123',
        token: 'generated-token',
        discordId: '123456789',
        purpose: 'roblox_link',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      };

      mockUserFindFirst.mockResolvedValue(mockUser);
      mockLinkTokenDeleteMany.mockResolvedValue({ count: 1 });
      mockLinkTokenCreate.mockResolvedValue(mockLinkToken);

      const response = await request(app)
        .post('/api/users/link-token')
        .send({
          discordId: '123456789',
          purpose: 'roblox_link',
        })
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        token: 'generated-token',
        expiresAt: expect.any(String),
        expiresIn: 15 * 60,
      });
      expect(mockUserFindFirst).toHaveBeenCalledWith({
        where: {
          accounts: {
            some: {
              accountId: '123456789',
              providerId: 'discord',
            },
          },
        },
      });
      expect(mockLinkTokenCreate).toHaveBeenCalledWith({
        data: {
          token: expect.any(String),
          discordId: '123456789',
          purpose: 'roblox_link',
          expiresAt: expect.any(Date),
        },
      });
    });

    it('should return 400 when discordId is missing', async () => {
      const response = await request(app)
        .post('/api/users/link-token')
        .send({})
        .expect(400);

      expect(response.body).toMatchObject({
        type: 'https://bloxtr8.com/problems/bad-request',
        title: 'Bad Request',
        status: 400,
        detail: 'Discord ID is required',
      });
    });

    it('should return 404 when user is not found', async () => {
      mockUserFindFirst.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/users/link-token')
        .send({
          discordId: 'nonexistent-123',
        })
        .expect(404);

      expect(response.body).toMatchObject({
        type: 'https://bloxtr8.com/problems/not-found',
        title: 'Not Found',
        status: 404,
        detail: 'User not found. Please sign up first.',
      });
    });

    it('should use default purpose when not provided', async () => {
      const mockUser = { id: 'user-123' };
      const mockLinkToken = {
        id: 'token-123',
        token: 'generated-token',
        discordId: '123456789',
        purpose: 'roblox_link',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      };

      mockUserFindFirst.mockResolvedValue(mockUser);
      mockLinkTokenDeleteMany.mockResolvedValue({ count: 1 });
      mockLinkTokenCreate.mockResolvedValue(mockLinkToken);

      const response = await request(app)
        .post('/api/users/link-token')
        .send({
          discordId: '123456789',
        })
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        token: 'generated-token',
      });
      expect(mockLinkTokenCreate).toHaveBeenCalledWith({
        data: {
          token: expect.any(String),
          discordId: '123456789',
          purpose: 'roblox_link',
          expiresAt: expect.any(Date),
        },
      });
    });
  });

  describe('GET /api/users/link-token/:token', () => {
    it('should validate and return token data', async () => {
      const mockLinkToken = {
        id: 'token-123',
        token: 'valid-token',
        discordId: '123456789',
        purpose: 'roblox_link',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        used: false,
      };
      const mockUser = {
        id: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
        accounts: [{ accountId: '123456789', providerId: 'discord' }],
      };

      mockLinkTokenFindUnique.mockResolvedValue(mockLinkToken);
      mockUserFindFirst.mockResolvedValue(mockUser);

      const response = await request(app)
        .get('/api/users/link-token/valid-token')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        token: 'valid-token',
        discordId: '123456789',
        purpose: 'roblox_link',
        expiresAt: expect.any(String),
        user: expect.objectContaining({
          id: 'user-123',
          name: 'Test User',
          email: 'test@example.com',
        }),
      });
    });

    it('should return 404 when token is invalid', async () => {
      mockLinkTokenFindUnique.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/users/link-token/invalid-token')
        .expect(404);

      expect(response.body).toMatchObject({
        type: 'https://bloxtr8.com/problems/not-found',
        title: 'Not Found',
        status: 404,
        detail: 'Invalid or expired token',
      });
    });

    it('should return 410 when token is expired', async () => {
      const expiredToken = {
        id: 'token-123',
        token: 'expired-token',
        discordId: '123456789',
        purpose: 'roblox_link',
        expiresAt: new Date(Date.now() - 1000), // 1 second ago
        used: false,
      };

      mockLinkTokenFindUnique.mockResolvedValue(expiredToken);
      mockLinkTokenDelete.mockResolvedValue(expiredToken);

      const response = await request(app)
        .get('/api/users/link-token/expired-token')
        .expect(410);

      expect(response.body).toMatchObject({
        type: 'https://bloxtr8.com/problems/unknown-error',
        title: 'Unknown Error',
        status: 410,
        detail: 'Token has expired',
      });
      expect(mockLinkTokenDelete).toHaveBeenCalledWith({
        where: { id: 'token-123' },
      });
    });

    it('should return 410 when token is already used', async () => {
      const usedToken = {
        id: 'token-123',
        token: 'used-token',
        discordId: '123456789',
        purpose: 'roblox_link',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        used: true,
      };

      mockLinkTokenFindUnique.mockResolvedValue(usedToken);

      const response = await request(app)
        .get('/api/users/link-token/used-token')
        .expect(410);

      expect(response.body).toMatchObject({
        type: 'https://bloxtr8.com/problems/unknown-error',
        title: 'Unknown Error',
        status: 410,
        detail: 'Token has already been used',
      });
    });

    it('should return 404 when user is not found', async () => {
      const mockLinkToken = {
        id: 'token-123',
        token: 'valid-token',
        discordId: '123456789',
        purpose: 'roblox_link',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        used: false,
      };

      mockLinkTokenFindUnique.mockResolvedValue(mockLinkToken);
      mockUserFindFirst.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/users/link-token/valid-token')
        .expect(404);

      expect(response.body).toMatchObject({
        type: 'https://bloxtr8.com/problems/not-found',
        title: 'Not Found',
        status: 404,
        detail: 'User not found',
      });
    });
  });

  describe('POST /api/users/link-token/:token/use', () => {
    it('should mark token as used', async () => {
      const mockLinkToken = {
        id: 'token-123',
        token: 'valid-token',
        discordId: '123456789',
        purpose: 'roblox_link',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        used: true,
      };

      mockLinkTokenUpdate.mockResolvedValue(mockLinkToken);

      const response = await request(app)
        .post('/api/users/link-token/valid-token/use')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Token marked as used',
      });
      expect(mockLinkTokenUpdate).toHaveBeenCalledWith({
        where: { token: 'valid-token' },
        data: { used: true },
      });
    });

    it('should return 404 when token is not found', async () => {
      mockLinkTokenUpdate.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/users/link-token/nonexistent-token/use')
        .expect(404);

      expect(response.body).toMatchObject({
        type: 'https://bloxtr8.com/problems/not-found',
        title: 'Not Found',
        status: 404,
        detail: 'Token not found',
      });
    });
  });
});
