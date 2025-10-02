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
   * Authenticate with Roblox API using client credentials
   */
  async authenticate(): Promise<void> {
    const response = await fetch(`${this.config.baseUrl}/oauth/v1/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64')}`,
      },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        scope: 'read',
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Roblox API authentication failed: ${response.statusText}`
      );
    }

    const tokenData = await response.json();
    this.accessToken = tokenData.access_token;
    this.tokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
  }

  /**
   * Get user's games (games they own or have permissions for)
   */
  async getUserGames(userId: string): Promise<RobloxGame[]> {
    await this.ensureAuthenticated();

    const params = new URLSearchParams({
      limit: '100',
      sortOrder: 'Desc',
    });

    const response = await fetch(
      `${this.config.baseUrl}/v1/users/${userId}/games?${params}`,
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch user games: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data || [];
  }

  /**
   * Verify if user owns or has admin access to specific game
   */
  async verifyGameOwnership(
    userId: string,
    gameId: string
  ): Promise<{ owns: boolean; role: string }> {
    try {
      const games = await this.getUserGames(userId);
      const game = games.find(g => g.id === gameId);

      if (!game) {
        return { owns: false, role: 'None' };
      }

      // Check if user is the creator/owner
      const gameDetails = await this.getGameDetails(gameId);
      if (gameDetails && gameDetails.creator.id.toString() === userId) {
        return { owns: true, role: 'Owner' };
      }

      // Check permissions for admin/developer roles
      const permissions = await this.getGamePermissions(gameId, userId);
      if (permissions && permissions.role !== 'Member') {
        return { owns: true, role: permissions.role };
      }

      return { owns: false, role: 'Member' };
    } catch (error) {
      console.error('Game ownership verification failed:', error);
      return { owns: false, role: 'None' };
    }
  }

  /**
   * Get game details
   */
  async getGameDetails(gameId: string): Promise<RobloxGame | null> {
    await this.ensureAuthenticated();

    const response = await fetch(
      `${this.config.baseUrl}/v1/games?gameIds=${gameId}`,
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: 'application/json',
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch game details: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data?.[0] || null;
  }

  /**
   * Get game permissions for a user
   */
  async getGamePermissions(
    gameId: string,
    userId: string
  ): Promise<GamePermissions | null> {
    await this.ensureAuthenticated();

    const response = await fetch(
      `${this.config.baseUrl}/v1/games/${gameId}/permissions?userId=${userId}`,
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: 'application/json',
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(
        `Failed to fetch game permissions: ${response.statusText}`
      );
    }

    return await response.json();
  }

  private async ensureAuthenticated(): Promise<void> {
    if (
      !this.accessToken ||
      !this.tokenExpiresAt ||
      this.tokenExpiresAt <= new Date()
    ) {
      await this.authenticate();
    }
  }
}
