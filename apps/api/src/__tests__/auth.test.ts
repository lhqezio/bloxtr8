import request from 'supertest';

// Mock the database
const mockPrismaClient = {
  linkToken: {
    findUnique: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    update: jest.fn(),
  },
  user: {
    findFirst: jest.fn(),
  },
  account: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  $disconnect: jest.fn(),
};

// Mock the database import
jest.mock('@bloxtr8/database', () => ({
  prisma: mockPrismaClient,
}));

import app from '../index.js';

// Mock the lib functions
jest.mock('../lib/discord-verification.js', () => ({
  generateOAuthState: jest.fn(() => 'discord_123456789'),
  validateOAuthState: jest.fn(() => true),
}));

jest.mock('../lib/roblox-oauth.js', () => ({
  validateRobloxOAuth: jest.fn(() => 'roblox-123456'),
}));

// Mock environment variables
const originalEnv = process.env;

describe('Auth API Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      ROBLOX_CLIENT_ID: 'test-client-id',
      WEB_APP_URL: 'http://localhost:5173',
      API_BASE_URL: 'http://localhost:3000',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('POST /api/oauth/roblox/url', () => {
    it('should generate OAuth URL with discordId', async () => {
      const response = await request(app)
        .post('/api/oauth/roblox/url')
        .send({
          redirectUri: 'http://localhost:5173/auth/callback',
          discordId: '123456789',
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        authUrl: expect.stringContaining(
          'https://apis.roblox.com/oauth/v1/authorize'
        ),
      });
      expect(response.body.authUrl).toContain('client_id=test-client-id');
      expect(response.body.authUrl).toContain(
        'redirect_uri=http%3A%2F%2Flocalhost%3A5173%2Fauth%2Fcallback'
      );
      expect(response.body.authUrl).toContain('response_type=code');
      expect(response.body.authUrl).toContain('scope=openid');
      expect(response.body.authUrl).toContain('state=discord_123456789');
    });

    it('should generate OAuth URL with valid token', async () => {
      const mockToken = {
        id: 'token-123',
        token: 'valid-token',
        discordId: '123456789',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes from now
        used: false,
      };

      mockPrismaClient.linkToken.findUnique.mockResolvedValue(mockToken);

      const response = await request(app)
        .post('/api/oauth/roblox/url')
        .send({
          redirectUri: 'http://localhost:5173/auth/callback',
          token: 'valid-token',
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        authUrl: expect.stringContaining(
          'https://apis.roblox.com/oauth/v1/authorize'
        ),
      });
      expect(mockPrismaClient.linkToken.findUnique).toHaveBeenCalledWith({
        where: { token: 'valid-token' },
      });
    });

    it('should return 400 when redirectUri is missing', async () => {
      const response = await request(app)
        .post('/api/oauth/roblox/url')
        .send({
          discordId: '123456789',
        })
        .expect(400);

      expect(response.body).toMatchObject({
        type: 'https://bloxtr8.com/problems/bad-request',
        title: 'Bad Request',
        status: 400,
        detail: 'Redirect URI is required',
      });
    });

    it('should return 400 when neither discordId nor token is provided', async () => {
      const response = await request(app)
        .post('/api/oauth/roblox/url')
        .send({
          redirectUri: 'http://localhost:5173/auth/callback',
        })
        .expect(400);

      expect(response.body).toMatchObject({
        type: 'https://bloxtr8.com/problems/bad-request',
        title: 'Bad Request',
        status: 400,
        detail: 'Discord ID or token is required',
      });
    });

    it('should return 404 when token is invalid', async () => {
      mockPrismaClient.linkToken.findUnique.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/oauth/roblox/url')
        .send({
          redirectUri: 'http://localhost:5173/auth/callback',
          token: 'invalid-token',
        })
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
        expiresAt: new Date(Date.now() - 1000), // 1 second ago
        used: false,
      };

      mockPrismaClient.linkToken.findUnique.mockResolvedValue(expiredToken);
      mockPrismaClient.linkToken.delete.mockResolvedValue(expiredToken);

      const response = await request(app)
        .post('/api/oauth/roblox/url')
        .send({
          redirectUri: 'http://localhost:5173/auth/callback',
          token: 'expired-token',
        })
        .expect(410);

      expect(response.body).toMatchObject({
        type: 'https://bloxtr8.com/problems/unknown-error',
        title: 'Unknown Error',
        status: 410,
        detail: 'Token has expired',
      });
      expect(mockPrismaClient.linkToken.delete).toHaveBeenCalledWith({
        where: { id: 'token-123' },
      });
    });

    it('should return 410 when token is already used', async () => {
      const usedToken = {
        id: 'token-123',
        token: 'used-token',
        discordId: '123456789',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        used: true,
      };

      mockPrismaClient.linkToken.findUnique.mockResolvedValue(usedToken);

      const response = await request(app)
        .post('/api/oauth/roblox/url')
        .send({
          redirectUri: 'http://localhost:5173/auth/callback',
          token: 'used-token',
        })
        .expect(410);

      expect(response.body).toMatchObject({
        type: 'https://bloxtr8.com/problems/unknown-error',
        title: 'Unknown Error',
        status: 410,
        detail: 'Token has already been used',
      });
    });

    it('should return 500 when ROBLOX_CLIENT_ID is not configured', async () => {
      process.env.ROBLOX_CLIENT_ID = '';

      const response = await request(app)
        .post('/api/oauth/roblox/url')
        .send({
          redirectUri: 'http://localhost:5173/auth/callback',
          discordId: '123456789',
        })
        .expect(500);

      expect(response.body).toMatchObject({
        type: 'https://bloxtr8.com/problems/internal-server-error',
        title: 'Internal Server Error',
        status: 500,
        detail: 'Roblox OAuth not configured',
      });
    });
  });

  describe('GET /api/oauth/roblox/callback', () => {
    it('should redirect to error page when OAuth error is present', async () => {
      const response = await request(app)
        .get('/api/oauth/roblox/callback?error=access_denied')
        .expect(302);

      expect(response.headers.location).toBe(
        'http://localhost:5173/auth/link/error?error=access_denied'
      );
    });

    it('should redirect to error page when code or state is missing', async () => {
      const response = await request(app)
        .get('/api/oauth/roblox/callback')
        .expect(302);

      expect(response.headers.location).toBe(
        'http://localhost:5173/auth/link/error?error=missing_parameters'
      );
    });

    it('should redirect to error page when state is invalid', async () => {
      const response = await request(app)
        .get('/api/oauth/roblox/callback?code=test-code&state=invalid-state')
        .expect(302);

      expect(response.headers.location).toBe(
        'http://localhost:5173/auth/link/error?error=invalid_state'
      );
    });

    it('should redirect to error page when OAuth validation fails', async () => {
      const { validateRobloxOAuth } = await import('../lib/roblox-oauth.js');
      (validateRobloxOAuth as jest.Mock).mockRejectedValue(
        new Error('OAuth validation failed')
      );

      const response = await request(app)
        .get(
          '/api/oauth/roblox/callback?code=test-code&state=discord_123456789'
        )
        .expect(302);

      expect(response.headers.location).toContain(
        'http://localhost:5173/auth/link/error?error=oauth_validation_failed'
      );
    });

    it('should redirect to error page when user is not found', async () => {
      const { validateRobloxOAuth } = await import('../lib/roblox-oauth.js');
      (validateRobloxOAuth as jest.Mock).mockResolvedValue('roblox-123456');

      mockPrismaClient.user.findFirst.mockResolvedValue(null);

      const response = await request(app)
        .get(
          '/api/oauth/roblox/callback?code=test-code&state=discord_123456789'
        )
        .expect(302);

      expect(response.headers.location).toContain(
        'http://localhost:5173/auth/link/error?error=user_not_signed_up'
      );
    });

    it('should redirect to success page when account is already linked', async () => {
      const { validateRobloxOAuth } = await import('../lib/roblox-oauth.js');
      (validateRobloxOAuth as jest.Mock).mockResolvedValue('roblox-123456');

      const mockUser = { id: 'user-123' };
      const mockExistingAccount = { id: 'account-123' };

      mockPrismaClient.user.findFirst.mockResolvedValue(mockUser);
      mockPrismaClient.account.findFirst.mockResolvedValue(mockExistingAccount);

      const response = await request(app)
        .get(
          '/api/oauth/roblox/callback?code=test-code&state=discord_123456789'
        )
        .expect(302);

      expect(response.headers.location).toContain(
        'http://localhost:5173/auth/link/success?message=Roblox+account+is+already+linked'
      );
    });

    it('should redirect to error page when account is linked to different user', async () => {
      const { validateRobloxOAuth } = await import('../lib/roblox-oauth.js');
      (validateRobloxOAuth as jest.Mock).mockResolvedValue('roblox-123456');

      const mockUser = { id: 'user-123' };
      const mockExistingUser = { id: 'different-user-123' };

      mockPrismaClient.user.findFirst
        .mockResolvedValueOnce(mockUser) // First call for user lookup
        .mockResolvedValueOnce(mockExistingUser); // Second call for existing Roblox user

      mockPrismaClient.account.findFirst.mockResolvedValue(null);

      const response = await request(app)
        .get(
          '/api/oauth/roblox/callback?code=test-code&state=discord_123456789'
        )
        .expect(302);

      expect(response.headers.location).toContain(
        'http://localhost:5173/auth/link/error?error=account_conflict'
      );
    });

    it('should successfully link account and redirect to success page', async () => {
      const { validateRobloxOAuth } = await import('../lib/roblox-oauth.js');
      (validateRobloxOAuth as jest.Mock).mockResolvedValue('roblox-123456');

      const mockUser = { id: 'user-123' };
      const mockCreatedAccount = { id: 'account-123' };

      mockPrismaClient.user.findFirst.mockResolvedValue(mockUser);
      mockPrismaClient.account.findFirst.mockResolvedValue(null);
      mockPrismaClient.account.create.mockResolvedValue(mockCreatedAccount);

      const response = await request(app)
        .get(
          '/api/oauth/roblox/callback?code=test-code&state=discord_123456789'
        )
        .expect(302);

      expect(response.headers.location).toContain(
        'http://localhost:5173/auth/link/success?message=Roblox+account+linked+successfully%21'
      );
      expect(mockPrismaClient.account.create).toHaveBeenCalledWith({
        data: {
          id: 'roblox_roblox-123456',
          userId: 'user-123',
          accountId: 'roblox-123456',
          providerId: 'roblox',
        },
      });
    });

    it('should handle OAuth code reuse error', async () => {
      const { validateRobloxOAuth } = await import('../lib/roblox-oauth.js');
      (validateRobloxOAuth as jest.Mock).mockRejectedValue(
        new Error('Authorization code has been used')
      );

      const response = await request(app)
        .get(
          '/api/oauth/roblox/callback?code=test-code&state=discord_123456789'
        )
        .expect(302);

      expect(response.headers.location).toContain(
        'http://localhost:5173/auth/link/error?error=oauth_code_used'
      );
    });
  });

  describe('POST /api/oauth/roblox/link', () => {
    it('should return success for backward compatibility', async () => {
      const response = await request(app)
        .post('/api/oauth/roblox/link')
        .send({
          code: 'test-code',
          state: 'discord_123456789',
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Account linking is handled in the OAuth callback',
      });
    });
  });

  describe('POST /api/oauth/roblox/test', () => {
    it('should return test response', async () => {
      const response = await request(app)
        .post('/api/oauth/roblox/test')
        .send({
          code: 'test-code',
          state: 'discord_123456789',
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Test OAuth endpoint reached',
      });
    });
  });
});
