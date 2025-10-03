interface RobloxApiConfig {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  rateLimitDelay: number;
}

interface RobloxGame {
  id: string;
  name: string;
  description?: string;
  creator: {
    id: number;
    name: string;
    type: string;
  };
  created: string;
  updated: string;
  visits: number;
  playing: number;
  maxPlayers: number;
  genre: string;
  thumbnailUrl?: string;
}

interface GamePermissions {
  gameId: string;
  userId: string;
  permissions: string[];
  role: 'Owner' | 'Admin' | 'Developer' | 'Member';
}

export class RobloxApiClient {
  private config: RobloxApiConfig;
  private accessToken: string | null = null;
  private tokenExpiresAt: Date | null = null;

  constructor(config: RobloxApiConfig) {
    this.config = config;
  }

  /**
   * No authentication needed for public endpoints
   */
  async authenticate(): Promise<void> {
    // Public endpoints don't require authentication
    return;
  }

  /**
   * Get user's games (games they own or have permissions for)
   * Note: This method is not used in the current implementation
   */
  async getUserGames(_userId: string): Promise<RobloxGame[]> {
    // This would require authentication, so return empty array for now
    return [];
  }

  /**
   * Verify if user owns or has admin access to specific game
   */
  async verifyGameOwnership(
    userId: string,
    gameId: string
  ): Promise<{ owns: boolean; role: string }> {
    try {
      // First, get universe ID from game ID (place ID)
      const universeResponse = await fetch(
        `${this.config.baseUrl}/universes/v1/places/${gameId}/universe`
      );

      if (!universeResponse.ok) {
        return { owns: false, role: 'None' };
      }

      const universeData = await universeResponse.json();
      const universeId = universeData.universeId;

      if (!universeId) {
        return { owns: false, role: 'None' };
      }

      // Get game details by universe ID
      const gameResponse = await fetch(
        `https://games.roblox.com/v1/games?universeIds=${universeId}`
      );

      if (!gameResponse.ok) {
        return { owns: false, role: 'None' };
      }

      const gameData = await gameResponse.json();
      const game = gameData.data?.[0];

      if (!game || !game.creator) {
        return { owns: false, role: 'None' };
      }

      // Check if user is the creator
      if (
        game.creator.type === 'User' &&
        game.creator.id.toString() === userId
      ) {
        return { owns: true, role: 'Owner' };
      }

      // If group-owned, check if user is in the group
      if (game.creator.type === 'Group') {
        // For now, assume user doesn't own group-owned games
        // In a complete implementation, you'd check group membership via Open Cloud API
        return { owns: false, role: 'None' };
      }

      return { owns: false, role: 'None' };
    } catch (error) {
      console.error('Game ownership verification failed:', error);
      return { owns: false, role: 'None' };
    }
  }

  /**
   * Get game details
   */
  async getGameDetails(gameId: string): Promise<RobloxGame | null> {
    try {
      // First, get universe ID from game ID (place ID)
      const universeResponse = await fetch(
        `${this.config.baseUrl}/universes/v1/places/${gameId}/universe`
      );

      if (!universeResponse.ok) {
        return null;
      }

      const universeData = await universeResponse.json();
      const universeId = universeData.universeId;

      if (!universeId) {
        return null;
      }

      // Get game details by universe ID
      const gameResponse = await fetch(
        `https://games.roblox.com/v1/games?universeIds=${universeId}`
      );

      if (!gameResponse.ok) {
        if (gameResponse.status === 404) {
          return null;
        }
        throw new Error(
          `Failed to fetch game details: ${gameResponse.statusText}`
        );
      }

      const gameData = await gameResponse.json();
      const game = gameData.data?.[0];

      if (!game) {
        return null;
      }

      // Transform to our interface
      return {
        id: gameId,
        name: game.name || 'Unknown Game',
        description: game.description || '',
        creator: {
          id: game.creator?.id || 0,
          name: game.creator?.name || 'Unknown',
          type: game.creator?.type || 'User',
        },
        created: game.created || '',
        updated: game.updated || '',
        visits: game.visits || 0,
        playing: game.playing || 0,
        maxPlayers: game.maxPlayers || 0,
        genre: game.genre || '',
        thumbnailUrl:
          game.thumbnail?.finalUrl ||
          `https://thumbnails.roblox.com/v1/games/icons?gameIds=${gameId}&size=420x420&format=Png`,
      };
    } catch (error) {
      console.error('Failed to fetch game details:', error);
      return null;
    }
  }

  /**
   * Get game permissions for a user
   * Note: This method would require authentication and is not used in the current implementation
   */
  async getGamePermissions(
    _gameId: string,
    _userId: string
  ): Promise<GamePermissions | null> {
    // This would require authentication, so return null for now
    return null;
  }

  private async ensureAuthenticated(): Promise<void> {
    // No authentication needed for public endpoints
    return;
  }
}
