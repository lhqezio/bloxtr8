import {
  exchangeCodeForToken,
  getRobloxUserInfo,
  validateRobloxOAuth,
} from '../lib/roblox-oauth.js';

// Mock fetch globally
global.fetch = jest.fn();

describe('Roblox OAuth Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Set up environment variables
    process.env.ROBLOX_CLIENT_ID = 'test-client-id';
    process.env.ROBLOX_CLIENT_SECRET = 'test-client-secret';
  });

  afterEach(() => {
    delete process.env.ROBLOX_CLIENT_ID;
    delete process.env.ROBLOX_CLIENT_SECRET;
  });

  describe('exchangeCodeForToken', () => {
    it('should exchange code for token successfully', async () => {
      const mockTokenResponse = {
        access_token: 'test-access-token',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'test-refresh-token',
        scope: 'openid',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTokenResponse),
      });

      const result = await exchangeCodeForToken(
        'test-code',
        'http://localhost:3000/callback'
      );

      expect(global.fetch).toHaveBeenCalledWith(
        'https://apis.roblox.com/oauth/v1/token',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: expect.stringContaining('grant_type=authorization_code'),
        }
      );

      expect(result).toEqual(mockTokenResponse);
    });

    it('should throw error when credentials are missing', async () => {
      delete process.env.ROBLOX_CLIENT_ID;

      await expect(
        exchangeCodeForToken('test-code', 'http://localhost:3000/callback')
      ).rejects.toThrow('Roblox OAuth credentials not configured');
    });

    it('should throw error when API request fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Invalid request'),
      });

      await expect(
        exchangeCodeForToken('invalid-code', 'http://localhost:3000/callback')
      ).rejects.toThrow(
        'Failed to exchange code for token: 400 Invalid request'
      );
    });

    it('should include correct parameters in request body', async () => {
      const mockTokenResponse = {
        access_token: 'test-access-token',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'openid',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTokenResponse),
      });

      await exchangeCodeForToken('test-code', 'http://localhost:3000/callback');

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const body = fetchCall[1].body;

      expect(body).toContain('grant_type=authorization_code');
      expect(body).toContain('client_id=test-client-id');
      expect(body).toContain('client_secret=test-client-secret');
      expect(body).toContain('code=test-code');
      expect(body).toContain(
        'redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fcallback'
      );
    });
  });

  describe('getRobloxUserInfo', () => {
    it('should get user info successfully', async () => {
      const mockUserInfo = {
        sub: 'roblox-user-123',
        name: 'TestUser',
        preferred_username: 'TestUser',
        picture: 'https://example.com/avatar.png',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockUserInfo),
      });

      const result = await getRobloxUserInfo('test-access-token');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://apis.roblox.com/oauth/v1/userinfo',
        {
          method: 'GET',
          headers: {
            Authorization: 'Bearer test-access-token',
            Accept: 'application/json',
          },
        }
      );

      expect(result).toEqual(mockUserInfo);
    });

    it('should throw error when API request fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      await expect(getRobloxUserInfo('invalid-token')).rejects.toThrow(
        'Failed to get user info: 401 Unauthorized'
      );
    });
  });

  describe('validateRobloxOAuth', () => {
    it('should validate OAuth code and return user ID', async () => {
      const mockTokenResponse = {
        access_token: 'test-access-token',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'openid',
      };

      const mockUserInfo = {
        sub: 'roblox-user-123',
        name: 'TestUser',
        preferred_username: 'TestUser',
      };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockTokenResponse),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockUserInfo),
        });

      const result = await validateRobloxOAuth(
        'test-code',
        'http://localhost:3000/callback'
      );

      expect(result).toBe('roblox-user-123');
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should throw error when token exchange fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Invalid code'),
      });

      await expect(
        validateRobloxOAuth('invalid-code', 'http://localhost:3000/callback')
      ).rejects.toThrow('Failed to validate Roblox OAuth code');
    });

    it('should throw error when user info fetch fails', async () => {
      const mockTokenResponse = {
        access_token: 'test-access-token',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'openid',
      };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockTokenResponse),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          text: () => Promise.resolve('Unauthorized'),
        });

      await expect(
        validateRobloxOAuth('test-code', 'http://localhost:3000/callback')
      ).rejects.toThrow('Failed to validate Roblox OAuth code');
    });

    it('should handle network errors gracefully', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error')
      );

      await expect(
        validateRobloxOAuth('test-code', 'http://localhost:3000/callback')
      ).rejects.toThrow('Failed to validate Roblox OAuth code');
    });
  });
});
