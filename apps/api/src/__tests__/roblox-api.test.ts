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

  describe('getAssetDetails', () => {
    it('should return asset details successfully', async () => {
      const mockAssetDetails = {
        id: '123456789',
        name: 'Test Asset',
        assetType: { id: 1, name: 'Limited' },
        creator: { id: 1, name: 'Test Creator', type: 'User' },
        created: '2023-01-01T00:00:00Z',
        updated: '2023-01-01T00:00:00Z',
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
          json: async () => mockAssetDetails,
        });

      const result = await client.getAssetDetails('123456789');

      expect(result).toEqual(mockAssetDetails);
      expect(fetch).toHaveBeenCalledWith(
        'https://apis.roblox.com/catalog/v1/assets/123456789/details',
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

      const result = await client.getAssetDetails('123456789');

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

      await expect(client.getAssetDetails('123456789')).rejects.toThrow(
        'Failed to fetch asset details: Internal Server Error'
      );
    });
  });

  describe('verifyAssetOwnership', () => {
    it('should return true when user owns asset', async () => {
      const mockInventory = [
        {
          id: '1',
          name: 'Asset 1',
          assetId: '123456789',
          assetTypeId: 1,
        },
        {
          id: '2',
          name: 'Asset 2',
          assetId: '987654321',
          assetTypeId: 1,
        },
      ];

      // Mock getUserInventory
      jest.spyOn(client, 'getUserInventory').mockResolvedValue(mockInventory);

      const result = await client.verifyAssetOwnership('user123', '123456789');

      expect(result).toBe(true);
    });

    it('should return false when user does not own asset', async () => {
      const mockInventory = [
        {
          id: '1',
          name: 'Asset 1',
          assetId: '987654321',
          assetTypeId: 1,
        },
      ];

      // Mock getUserInventory
      jest.spyOn(client, 'getUserInventory').mockResolvedValue(mockInventory);

      const result = await client.verifyAssetOwnership('user123', '123456789');

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      // Mock getUserInventory to throw error
      jest.spyOn(client, 'getUserInventory').mockRejectedValue(new Error('API Error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await client.verifyAssetOwnership('user123', '123456789');

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Asset ownership verification failed:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('getUserInventory', () => {
    it('should return user inventory successfully', async () => {
      const mockInventoryData = {
        data: [
          {
            id: '1',
            name: 'Asset 1',
            assetId: '123456789',
            assetTypeId: 1,
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
          json: async () => mockInventoryData,
        });

      const result = await client.getUserInventory('user123');

      expect(result).toEqual(mockInventoryData.data);
      expect(fetch).toHaveBeenCalledWith(
        'https://apis.roblox.com/inventory/v1/users/user123/assets/collectibles?assetTypes=&limit=100&sortOrder=Desc',
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

      await expect(client.getUserInventory('user123')).rejects.toThrow(
        'Failed to fetch user inventory: Forbidden'
      );
    });
  });
});
