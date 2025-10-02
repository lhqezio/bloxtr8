import { RobloxApiClient } from '../lib/roblox-api.js';

// Mock fetch
global.fetch = jest.fn();

describe('RobloxApiClient', () => {
  let client: RobloxApiClient;
  const mockConfig = {
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    baseUrl: 'https://apis.roblox.com',
    rateLimitDelay: 1000,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    client = new RobloxApiClient(mockConfig);
  });

  describe('authenticate', () => {
    it('should authenticate successfully', async () => {
      const mockTokenResponse = {
        access_token: 'test-access-token',
        expires_in: 3600,
      };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockTokenResponse,
      });

      await client.authenticate();

      expect(fetch).toHaveBeenCalledWith(
        'https://apis.roblox.com/oauth/v1/token',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': expect.stringContaining('Basic'),
          }),
          body: JSON.stringify({
            grant_type: 'client_credentials',
            scope: 'read',
          }),
        })
      );

      // Verify token is stored
      expect((client as any).accessToken).toBe('test-access-token');
      expect((client as any).tokenExpiresAt).toBeInstanceOf(Date);
    });

    it('should throw error on authentication failure', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        statusText: 'Unauthorized',
      });

      await expect(client.authenticate()).rejects.toThrow(
        'Roblox API authentication failed: Unauthorized'
      );
    });
  });

  describe('getGameDetails', () => {
    it('should return game details successfully', async () => {
      const mockGameDetails = {
        id: '123456789',
        name: 'Test Game',
        description: 'A test game',
        creator: { id: 1, name: 'Test Creator', type: 'User' },
        created: '2023-01-01T00:00:00Z',
        updated: '2023-01-01T00:00:00Z',
        visits: 1000,
        playing: 50,
        maxPlayers: 100,
        genre: 'Adventure',
      };

      // Mock authentication
      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'test-token',
            expires_in: 3600,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [mockGameDetails] }),
        });

      const result = await client.getGameDetails('123456789');

      expect(result).toEqual(mockGameDetails);
      expect(fetch).toHaveBeenCalledWith(
        'https://apis.roblox.com/v1/games?gameIds=123456789',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
            'Accept': 'application/json',
          }),
        })
      );
    });

    it('should return null for 404 response', async () => {
      // Mock authentication
      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'test-token',
            expires_in: 3600,
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        });

      const result = await client.getGameDetails('123456789');

      expect(result).toBeNull();
    });

    it('should throw error for other API failures', async () => {
      // Mock authentication
      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'test-token',
            expires_in: 3600,
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        });

      await expect(client.getGameDetails('123456789')).rejects.toThrow(
        'Failed to fetch game details: Internal Server Error'
      );
    });
  });

  describe('verifyGameOwnership', () => {
    it('should return true when user owns game', async () => {
      const mockGames = [
        {
          id: '123456789',
          name: 'Test Game',
          creator: { id: 1, name: 'Test Creator', type: 'User' },
        },
      ];

      const mockGameDetails = {
        id: '123456789',
        name: 'Test Game',
        creator: { id: 1, name: 'Test Creator', type: 'User' },
      };

      // Mock getUserGames and getGameDetails
      jest.spyOn(client, 'getUserGames').mockResolvedValue(mockGames);
      jest.spyOn(client, 'getGameDetails').mockResolvedValue(mockGameDetails);

      const result = await client.verifyGameOwnership('1', '123456789');

      expect(result).toEqual({ owns: true, role: 'Owner' });
    });

    it('should return true when user has admin access', async () => {
      const mockGames = [
        {
          id: '123456789',
          name: 'Test Game',
          creator: { id: 999, name: 'Other Creator', type: 'User' },
        },
      ];

      const mockGameDetails = {
        id: '123456789',
        name: 'Test Game',
        creator: { id: 999, name: 'Other Creator', type: 'User' },
      };

      const mockPermissions = {
        gameId: '123456789',
        userId: '1',
        permissions: ['admin'],
        role: 'Admin',
      };

      // Mock getUserGames, getGameDetails, and getGamePermissions
      jest.spyOn(client, 'getUserGames').mockResolvedValue(mockGames);
      jest.spyOn(client, 'getGameDetails').mockResolvedValue(mockGameDetails);
      jest.spyOn(client, 'getGamePermissions').mockResolvedValue(mockPermissions);

      const result = await client.verifyGameOwnership('1', '123456789');

      expect(result).toEqual({ owns: true, role: 'Admin' });
    });

    it('should return false when user does not own or have access to game', async () => {
      const mockGames = [
        {
          id: '987654321',
          name: 'Other Game',
          creator: { id: 1, name: 'Test Creator', type: 'User' },
        },
      ];

      // Mock getUserGames
      jest.spyOn(client, 'getUserGames').mockResolvedValue(mockGames);

      const result = await client.verifyGameOwnership('1', '123456789');

      expect(result).toEqual({ owns: false, role: 'None' });
    });

    it('should return false on error', async () => {
      // Mock getUserGames to throw error
      jest.spyOn(client, 'getUserGames').mockRejectedValue(new Error('API Error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await client.verifyGameOwnership('1', '123456789');

      expect(result).toEqual({ owns: false, role: 'None' });
      expect(consoleSpy).toHaveBeenCalledWith(
        'Game ownership verification failed:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('getUserGames', () => {
    it('should return user games successfully', async () => {
      const mockGamesData = {
        data: [
          {
            id: '123456789',
            name: 'Test Game',
            creator: { id: 1, name: 'Test Creator', type: 'User' },
            visits: 1000,
            playing: 50,
          },
        ],
      };

      // Mock authentication
      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'test-token',
            expires_in: 3600,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockGamesData,
        });

      const result = await client.getUserGames('user123');

      expect(result).toEqual(mockGamesData.data);
      expect(fetch).toHaveBeenCalledWith(
        'https://apis.roblox.com/v1/users/user123/games?limit=100&sortOrder=Desc',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
            'Accept': 'application/json',
          }),
        })
      );
    });

    it('should handle API errors', async () => {
      // Mock authentication
      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'test-token',
            expires_in: 3600,
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          statusText: 'Forbidden',
        });

      await expect(client.getUserGames('user123')).rejects.toThrow(
        'Failed to fetch user games: Forbidden'
      );
    });
  });

  describe('getGamePermissions', () => {
    it('should return game permissions successfully', async () => {
      const mockPermissions = {
        gameId: '123456789',
        userId: 'user123',
        permissions: ['admin', 'edit'],
        role: 'Admin',
      };

      // Mock authentication
      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'test-token',
            expires_in: 3600,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockPermissions,
        });

      const result = await client.getGamePermissions('123456789', 'user123');

      expect(result).toEqual(mockPermissions);
      expect(fetch).toHaveBeenCalledWith(
        'https://apis.roblox.com/v1/games/123456789/permissions?userId=user123',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
            'Accept': 'application/json',
          }),
        })
      );
    });

    it('should return null for 404 response', async () => {
      // Mock authentication
      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'test-token',
            expires_in: 3600,
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        });

      const result = await client.getGamePermissions('123456789', 'user123');

      expect(result).toBeNull();
    });

    it('should throw error for other API failures', async () => {
      // Mock authentication
      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'test-token',
            expires_in: 3600,
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        });

      await expect(client.getGamePermissions('123456789', 'user123')).rejects.toThrow(
        'Failed to fetch game permissions: Internal Server Error'
      );
    });
  });
});
