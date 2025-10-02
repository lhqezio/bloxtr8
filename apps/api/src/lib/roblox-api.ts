interface RobloxApiConfig {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  rateLimitDelay: number;
}

interface RobloxAsset {
  id: string;
  name: string;
  description?: string;
  assetType: {
    id: number;
    name: string;
  };
  creator: {
    id: number;
    name: string;
    type: string;
  };
  created: string;
  updated: string;
}

interface RobloxInventoryItem {
  id: string;
  name: string;
  assetId: string;
  assetTypeId: number;
  serialNumber?: number;
  originalPrice?: number;
  recentAveragePrice?: number;
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
        'Authorization': `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64')}`
      },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        scope: 'read'
      })
    });

    if (!response.ok) {
      throw new Error(`Roblox API authentication failed: ${response.statusText}`);
    }

    const tokenData = await response.json();
    this.accessToken = tokenData.access_token;
    this.tokenExpiresAt = new Date(Date.now() + (tokenData.expires_in * 1000));
  }

  /**
   * Get user's Roblox inventory
   */
  async getUserInventory(userId: string, assetTypeIds?: number[]): Promise<RobloxInventoryItem[]> {
    await this.ensureAuthenticated();
    
    const params = new URLSearchParams({
      assetTypes: assetTypeIds?.join(',') || '',
      limit: '100',
      sortOrder: 'Desc'
    });

    const response = await fetch(
      `${this.config.baseUrl}/inventory/v1/users/${userId}/assets/collectibles?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/json'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch user inventory: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data || [];
  }

  /**
   * Verify if user owns specific asset
   */
  async verifyAssetOwnership(userId: string, assetId: string): Promise<boolean> {
    try {
      const inventory = await this.getUserInventory(userId);
      return inventory.some(item => item.assetId === assetId);
    } catch (error) {
      console.error('Asset ownership verification failed:', error);
      return false;
    }
  }

  /**
   * Get asset details
   */
  async getAssetDetails(assetId: string): Promise<RobloxAsset | null> {
    await this.ensureAuthenticated();

    const response = await fetch(`${this.config.baseUrl}/catalog/v1/assets/${assetId}/details`, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch asset details: ${response.statusText}`);
    }

    return await response.json();
  }

  private async ensureAuthenticated(): Promise<void> {
    if (!this.accessToken || !this.tokenExpiresAt || this.tokenExpiresAt <= new Date()) {
      await this.authenticate();
    }
  }
}
