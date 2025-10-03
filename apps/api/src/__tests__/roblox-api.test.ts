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
    it('should authenticate successfully (stubbed)', async () => {
      // Method is stubbed out and doesn't make API calls
      await client.authenticate();

      // Should resolve without error
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('getUserExperiences', () => {
    it('should fetch user experiences successfully', async () => {
      const mockExperienceData = {
        data: [
          {
            id: 123456789,
            placeId: 987654321,
            universeId: 555666777,
            name: 'Test Experience',
            description: 'A test experience',
            creator: { id: 123, type: 'User' },
            created: '2023-01-01T00:00:00Z',
            updated: '2023-01-01T00:00:00Z',
            visits: 1000,
            playing: 50,
            maxPlayers: 100,
            genre: { name: 'Adventure' },
            thumbnailUrl: 'https://example.com/thumb.png',
          },
        ],
        nextPageCursor: null,
      };

      const mockCreatorData = {
        name: 'Test Creator',
        displayName: 'Test Creator Display',
      };

      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockExperienceData,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockCreatorData,
        });

      const result = await client.getUserExperiences('123');

      expect(result).toEqual([
        {
          id: '987654321',
          name: 'Test Experience',
          description: 'A test experience',
          creator: {
            id: 123,
            name: 'Test Creator',
            type: 'User',
          },
          created: '2023-01-01T00:00:00Z',
          updated: '2023-01-01T00:00:00Z',
          visits: 1000,
          playing: 50,
          maxPlayers: 100,
          genre: 'Adventure',
          thumbnailUrl: 'https://example.com/thumb.png',
          universeId: 555666777,
          placeId: '987654321',
        },
      ]);
      expect(fetch).toHaveBeenCalledWith(
        'https://games.roblox.com/v2/users/123/games?accessFilter=Public&sortOrder=Asc&limit=50'
      );
    });

    it('should handle multiple pages of experiences', async () => {
      const mockFirstPage = {
        data: [
          {
            id: 123456789,
            placeId: 987654321,
            universeId: 555666777,
            name: 'First Experience',
            creator: { id: 123, type: 'User' },
            created: '2023-01-01T00:00:00Z',
            updated: '2023-01-01T00:00:00Z',
            visits: 1000,
            playing: 50,
            maxPlayers: 100,
            genre: { name: 'Adventure' },
          },
        ],
        nextPageCursor: 'next-cursor',
      };

      const mockSecondPage = {
        data: [
          {
            id: 987654321,
            placeId: 111222333,
            universeId: 444555666,
            name: 'Second Experience',
            creator: { id: 456, type: 'User' },
            created: '2023-01-02T00:00:00Z',
            updated: '2023-01-02T00:00:00Z',
            visits: 2000,
            playing: 100,
            maxPlayers: 200,
            genre: { name: 'Racing' },
          },
        ],
        nextPageCursor: null,
      };

      const mockCreator1 = { name: 'Creator 1' };
      const mockCreator2 = { name: 'Creator 2' };

      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockFirstPage,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockCreator1,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockSecondPage,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockCreator2,
        });

      const result = await client.getUserExperiences('123');

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('First Experience');
      expect(result[1].name).toBe('Second Experience');
      expect(fetch).toHaveBeenCalledTimes(4);
    });

    it('should handle API errors gracefully', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await client.getUserExperiences('123');

      expect(result).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to fetch user experiences: Not Found'
      );

      consoleSpy.mockRestore();
    });

    it('should handle empty data response', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

      const result = await client.getUserExperiences('123');

      expect(result).toEqual([]);
    });

    it('should handle missing data property', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ nextPageCursor: null }),
      });

      const result = await client.getUserExperiences('123');

      expect(result).toEqual([]);
    });

    it('should handle creator name fetch failure', async () => {
      const mockExperienceData = {
        data: [
          {
            id: 123456789,
            placeId: 987654321,
            universeId: 555666777,
            name: 'Test Experience',
            creator: { id: 123, type: 'User' },
            created: '2023-01-01T00:00:00Z',
            updated: '2023-01-01T00:00:00Z',
            visits: 1000,
            playing: 50,
            maxPlayers: 100,
            genre: { name: 'Adventure' },
          },
        ],
        nextPageCursor: null,
      };

      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockExperienceData,
        })
        .mockRejectedValueOnce(new Error('Creator fetch failed'));

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = await client.getUserExperiences('123');

      expect(result[0].creator.name).toBe('Unknown');
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to fetch creator name:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should handle network errors', async () => {
      (fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await client.getUserExperiences('123');

      expect(result).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to fetch user experiences:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('getGameDetails', () => {
    it('should return game details successfully when gameId is universe ID', async () => {
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
        rootPlace: { id: 987654321 },
        thumbnail: { finalUrl: 'https://example.com/thumb.png' },
      };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [mockGameDetails] }),
      });

      const result = await client.getGameDetails('123456789');

      expect(result).toEqual({
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
        thumbnailUrl: 'https://example.com/thumb.png',
      });
      expect(fetch).toHaveBeenCalledWith(
        'https://games.roblox.com/v1/games?universeIds=123456789'
      );
    });

    it('should return null when game not found', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

      const result = await client.getGameDetails('123456789');

      expect(result).toBeNull();
    });

    it('should handle place ID and fetch universe ID', async () => {
      const mockUniverseData = { universeId: '987654321' };
      const mockGameDetails = {
        id: '987654321',
        name: 'Test Game',
        description: 'A test game',
        creator: { id: 1, name: 'Test Creator', type: 'User' },
        created: '2023-01-01T00:00:00Z',
        updated: '2023-01-01T00:00:00Z',
        visits: 1000,
        playing: 50,
        maxPlayers: 100,
        genre: 'Adventure',
        thumbnail: { finalUrl: 'https://example.com/thumb.png' },
      };

      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockUniverseData,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [mockGameDetails] }),
        });

      const result = await client.getGameDetails('123456789');

      expect(result).toEqual({
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
        thumbnailUrl: 'https://example.com/thumb.png',
      });
      expect(fetch).toHaveBeenCalledWith(
        'https://games.roblox.com/v1/games?universeIds=123456789'
      );
      expect(fetch).toHaveBeenCalledWith(
        'https://apis.roblox.com/universes/v1/places/123456789/universe'
      );
    });

    it('should return null when universe ID fetch fails', async () => {
      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        });

      const result = await client.getGameDetails('123456789');

      expect(result).toBeNull();
    });

    it('should return null when universe ID is missing', async () => {
      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ universeId: null }),
        });

      const result = await client.getGameDetails('123456789');

      expect(result).toBeNull();
    });

    it('should handle 404 response from final game fetch', async () => {
      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ universeId: '987654321' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        });

      const result = await client.getGameDetails('123456789');

      expect(result).toBeNull();
    });

    it('should return null for non-404 API failures', async () => {
      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ universeId: '987654321' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await client.getGameDetails('123456789');

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to fetch game details:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should handle errors and return null', async () => {
      (fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await client.getGameDetails('123456789');

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to fetch game details:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('verifyGameOwnership', () => {
    it('should return true when user owns game through experiences', async () => {
      const mockGames = [
        {
          id: '123456789',
          name: 'Test Game',
          creator: { id: 1, name: 'Test Creator', type: 'User' },
        },
      ];

      // Mock getUserExperiences to return owned games
      jest
        .spyOn(client, 'getUserExperiences')
        .mockResolvedValue(mockGames as any);

      const result = await client.verifyGameOwnership('1', '123456789');

      expect(result).toEqual({
        owns: true,
        role: 'Owner',
        gameDetails: expect.objectContaining({
          id: '123456789',
          name: 'Test Game',
          creator: { id: 1, name: 'Test Creator', type: 'User' },
        }),
      });
    });

    it('should return true when user is creator of universe ID game', async () => {
      const mockGameDetails = {
        id: '123456789',
        name: 'Test Game',
        creator: { id: 1, name: 'Test Creator', type: 'User' },
      };

      // Mock getUserExperiences to return empty (not in experiences)
      jest.spyOn(client, 'getUserExperiences').mockResolvedValue([]);

      // Mock the first fetch (checking if gameId is universe ID) - this succeeds
      // Mock the second fetch (getting game details by universe ID) - this also succeeds
      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [mockGameDetails] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [mockGameDetails] }),
        });

      const result = await client.verifyGameOwnership('1', '123456789');

      expect(result).toEqual({
        owns: true,
        role: 'Owner',
      });
    });

    it('should return true when user is creator of place ID game', async () => {
      const mockUniverseData = { universeId: '987654321' };
      const mockGameDetails = {
        id: '987654321',
        name: 'Test Game',
        creator: { id: 1, name: 'Test Creator', type: 'User' },
      };

      // Mock getUserExperiences to return empty
      jest.spyOn(client, 'getUserExperiences').mockResolvedValue([]);

      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockUniverseData,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [mockGameDetails] }),
        });

      const result = await client.verifyGameOwnership('1', '123456789');

      expect(result).toEqual({
        owns: true,
        role: 'Owner',
      });
    });

    it('should return false when user does not own game', async () => {
      const mockGameDetails = {
        id: '123456789',
        name: 'Test Game',
        creator: { id: 999, name: 'Other Creator', type: 'User' },
      };

      // Mock getUserExperiences to return empty
      jest.spyOn(client, 'getUserExperiences').mockResolvedValue([]);

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [mockGameDetails] }),
      });

      const result = await client.verifyGameOwnership('1', '123456789');

      expect(result).toEqual({ owns: false, role: 'None' });
    });

    it('should return false for group-owned games', async () => {
      const mockGameDetails = {
        id: '123456789',
        name: 'Test Game',
        creator: { id: 1, name: 'Test Creator', type: 'Group' },
      };

      // Mock getUserExperiences to return empty
      jest.spyOn(client, 'getUserExperiences').mockResolvedValue([]);

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [mockGameDetails] }),
      });

      const result = await client.verifyGameOwnership('1', '123456789');

      expect(result).toEqual({ owns: false, role: 'None' });
    });

    it('should return false when game not found', async () => {
      // Mock getUserExperiences to return empty
      jest.spyOn(client, 'getUserExperiences').mockResolvedValue([]);

      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        });

      const result = await client.verifyGameOwnership('1', '123456789');

      expect(result).toEqual({ owns: false, role: 'None' });
    });

    it('should return false when universe ID is missing', async () => {
      // Mock getUserExperiences to return empty
      jest.spyOn(client, 'getUserExperiences').mockResolvedValue([]);

      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ universeId: null }),
        });

      const result = await client.verifyGameOwnership('1', '123456789');

      expect(result).toEqual({ owns: false, role: 'None' });
    });

    it('should return false on error', async () => {
      // Mock getUserExperiences to throw error
      jest
        .spyOn(client, 'getUserExperiences')
        .mockRejectedValue(new Error('API Error'));

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
    it('should return empty array (method not implemented)', async () => {
      const result = await client.getUserGames('user123');

      expect(result).toEqual([]);
      // Method is stubbed out and doesn't make any API calls
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('getGamePermissions', () => {
    it('should return null (method not implemented)', async () => {
      const result = await client.getGamePermissions('123456789', 'user123');

      expect(result).toBeNull();
      // Method is stubbed out and doesn't make any API calls
      expect(fetch).not.toHaveBeenCalled();
    });
  });
});
