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

export interface RobloxExperience {
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
  universeId: number;
  placeId?: string;
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
   * Get user's experiences (public games they own)
   * Uses the public Roblox Games API to fetch user-owned experiences
   */
  async getUserExperiences(userId: string): Promise<RobloxExperience[]> {
    try {
      const experiences: RobloxExperience[] = [];
      let cursor: string | null = null;
      let hasMore = true;

      // Fetch user-owned experiences
      while (hasMore) {
        const url: string = `https://games.roblox.com/v2/users/${userId}/games?accessFilter=Public&sortOrder=Asc&limit=50${cursor ? `&cursor=${cursor}` : ''}`;

        const response = await fetch(url);

        if (!response.ok) {
          console.error(
            `Failed to fetch user experiences: ${response.statusText}`
          );
          break;
        }

        const data: any = await response.json();

        if (!data.data || data.data.length === 0) {
          break;
        }

        // Transform each experience
        for (const experience of data.data) {
          // The Roblox API returns place IDs, not universe IDs
          // Use placeId as the primary ID since that's what we get from the API
          const placeId =
            experience.placeId?.toString() || experience.id?.toString() || '';
          const universeId = experience.universeId || 0;

          // Get creator name if creator ID is available
          let creatorName = 'Unknown';
          if (experience.creator?.id) {
            try {
              const creatorResponse = await fetch(
                `https://users.roblox.com/v1/users/${experience.creator.id}`
              );
              if (creatorResponse.ok) {
                const creatorData = await creatorResponse.json();
                creatorName =
                  creatorData.name || creatorData.displayName || 'Unknown';
              }
            } catch (error) {
              console.log('Failed to fetch creator name:', error);
            }
          }

          experiences.push({
            id: placeId, // Use placeId as the main ID since that's what the API returns
            name: experience.name || 'Unknown Experience',
            description: experience.description || '',
            creator: {
              id: experience.creator?.id || 0,
              name: creatorName,
              type: experience.creator?.type || 'User',
            },
            created: experience.created || '',
            updated: experience.updated || '',
            visits: experience.visits || 0,
            playing: experience.playing || 0,
            maxPlayers: experience.maxPlayers || 0,
            genre: experience.genre?.name || '',
            thumbnailUrl:
              experience.thumbnailUrl ||
              `https://thumbnails.roblox.com/v1/games/icons?gameIds=${placeId}&size=420x420&format=Png`,
            universeId,
            placeId,
          });
        }

        // Check if there are more pages
        cursor = data.nextPageCursor;
        hasMore = !!cursor;
      }

      return experiences;
    } catch (error) {
      console.error('Failed to fetch user experiences:', error);
      return [];
    }
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
   * @param userId - Roblox user ID
   * @param gameId - Can be either universe ID or place ID
   */
  async verifyGameOwnership(
    userId: string,
    gameId: string
  ): Promise<{ owns: boolean; role: string; gameDetails?: any }> {
    try {
      // First, get the user's experiences to check if they own this game
      const userExperiences = await this.getUserExperiences(userId);

      // Check if the gameId (place ID) is in the user's experiences
      const ownedExperience = userExperiences.find(exp => exp.id === gameId);

      if (ownedExperience) {
        // Convert RobloxExperience to the format expected by GameVerificationService
        const gameDetails = {
          id: ownedExperience.id,
          name: ownedExperience.name,
          description: ownedExperience.description,
          creator: ownedExperience.creator,
          created: ownedExperience.created,
          updated: ownedExperience.updated,
          visits: ownedExperience.visits,
          playing: ownedExperience.playing,
          maxPlayers: ownedExperience.maxPlayers,
          genre: ownedExperience.genre,
          thumbnailUrl: ownedExperience.thumbnailUrl,
        };

        return { owns: true, role: 'Owner', gameDetails };
      }

      // If not found in user experiences, try the old method as fallback
      let universeId: string;

      // Check if gameId is already a universe ID by trying to fetch game details directly
      const gameResponse = await fetch(
        `https://games.roblox.com/v1/games?universeIds=${gameId}`
      );

      if (gameResponse.ok) {
        // gameId is a universe ID
        universeId = gameId;
      } else {
        // gameId is a place ID, need to get universe ID
        const universeResponse = await fetch(
          `${this.config.baseUrl}/universes/v1/places/${gameId}/universe`
        );

        if (!universeResponse.ok) {
          return { owns: false, role: 'None' };
        }

        const universeData = await universeResponse.json();
        universeId = universeData.universeId;

        if (!universeId) {
          return { owns: false, role: 'None' };
        }
      }

      // Get game details by universe ID
      const finalGameResponse = await fetch(
        `https://games.roblox.com/v1/games?universeIds=${universeId}`
      );

      if (!finalGameResponse.ok) {
        return { owns: false, role: 'None' };
      }

      const gameData = await finalGameResponse.json();
      const game = gameData.data?.[0];

      if (!game || !game.creator) {
        return { owns: false, role: 'None' };
      }

      // Check if user is the creator - handle both string and number comparisons
      const userIdStr = userId.toString();
      const userIdNum = parseInt(userId);
      const creatorIdStr = game.creator.id.toString();
      const creatorIdNum = parseInt(game.creator.id.toString());

      if (
        game.creator.type === 'User' &&
        (creatorIdStr === userIdStr || creatorIdNum === userIdNum)
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
   * @param gameId - Can be either universe ID or place ID
   */
  async getGameDetails(gameId: string): Promise<RobloxGame | null> {
    try {
      let universeId: string;
      let placeId: string = gameId;

      // Check if gameId is already a universe ID by trying to fetch game details directly
      const gameResponse = await fetch(
        `https://games.roblox.com/v1/games?universeIds=${gameId}`
      );

      if (gameResponse.ok) {
        // gameId is a universe ID - we already have the game data
        const gameData = await gameResponse.json();
        const game = gameData.data?.[0];

        if (!game) {
          return null;
        }

        // Get place ID for thumbnail URL
        if (game.rootPlace) {
          placeId = game.rootPlace.id.toString();
        }

        // Transform to our interface using the data we already have
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
            `https://thumbnails.roblox.com/v1/games/icons?gameIds=${placeId}&size=420x420&format=Png`,
        };
      } else {
        // gameId is a place ID, need to get universe ID
        const universeResponse = await fetch(
          `${this.config.baseUrl}/universes/v1/places/${gameId}/universe`
        );

        if (!universeResponse.ok) {
          return null;
        }

        const universeData = await universeResponse.json();
        universeId = universeData.universeId;

        if (!universeId) {
          return null;
        }
      }

      // Get game details by universe ID
      const finalGameResponse = await fetch(
        `https://games.roblox.com/v1/games?universeIds=${universeId}`
      );

      if (!finalGameResponse.ok) {
        if (finalGameResponse.status === 404) {
          return null;
        }
        throw new Error(
          `Failed to fetch game details: ${finalGameResponse.statusText}`
        );
      }

      const gameData = await finalGameResponse.json();
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
          `https://thumbnails.roblox.com/v1/games/icons?gameIds=${placeId}&size=420x420&format=Png`,
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
