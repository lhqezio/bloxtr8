import { PrismaClient } from '@bloxtr8/database';
import { RobloxApiClient } from './roblox-api.js';

export interface AssetVerificationResult {
  success: boolean;
  verified: boolean;
  assetDetails?: any;
  error?: string;
  verificationId?: string;
}

export class AssetVerificationService {
  private prisma: PrismaClient;
  private robloxApi: RobloxApiClient;

  constructor() {
    this.prisma = new PrismaClient();
    this.robloxApi = new RobloxApiClient({
      clientId: process.env.ROBLOX_CLIENT_ID!,
      clientSecret: process.env.ROBLOX_CLIENT_SECRET!,
      baseUrl: 'https://apis.roblox.com',
      rateLimitDelay: 1000
    });
  }

  /**
   * Verify asset ownership for a user
   */
  async verifyAssetOwnership(
    userId: string,
    assetId: string,
    robloxUserId: string
  ): Promise<AssetVerificationResult> {
    try {
      // Check if we have a recent verification
      const existingVerification = await this.prisma.assetVerification.findUnique({
        where: {
          userId_assetId: {
            userId,
            assetId
          }
        }
      });

      // If recent verification exists and is still valid, return cached result
      if (existingVerification && 
          existingVerification.verificationStatus === 'VERIFIED' &&
          existingVerification.expiresAt && 
          existingVerification.expiresAt > new Date()) {
        return {
          success: true,
          verified: true,
          verificationId: existingVerification.id
        };
      }

      // Get asset details from Roblox
      const assetDetails = await this.robloxApi.getAssetDetails(assetId);
      if (!assetDetails) {
        return {
          success: false,
          verified: false,
          error: 'Asset not found'
        };
      }

      // Verify ownership
      const ownsAsset = await this.robloxApi.verifyAssetOwnership(robloxUserId, assetId);

      // Create or update verification record
      const verification = await this.prisma.assetVerification.upsert({
        where: {
          userId_assetId: {
            userId,
            assetId
          }
        },
        update: {
          verificationStatus: ownsAsset ? 'VERIFIED' : 'FAILED',
          verifiedAt: ownsAsset ? new Date() : null,
          expiresAt: ownsAsset ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null, // 24 hours
          metadata: {
            assetDetails,
            verifiedAt: new Date().toISOString(),
            robloxUserId
          }
        },
        create: {
          userId,
          assetId,
          verificationStatus: ownsAsset ? 'VERIFIED' : 'FAILED',
          verificationMethod: 'INVENTORY_API',
          verifiedAt: ownsAsset ? new Date() : null,
          expiresAt: ownsAsset ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null,
          metadata: {
            assetDetails,
            verifiedAt: new Date().toISOString(),
            robloxUserId
          }
        }
      });

      return {
        success: true,
        verified: ownsAsset,
        assetDetails,
        verificationId: verification.id
      };

    } catch (error) {
      console.error('Asset verification error:', error);
      return {
        success: false,
        verified: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Create asset snapshot for listing
   */
  async createAssetSnapshot(
    listingId: string,
    assetId: string,
    verificationId: string
  ): Promise<any> {
    const verification = await this.prisma.assetVerification.findUnique({
      where: { id: verificationId }
    });

    if (!verification || verification.verificationStatus !== 'VERIFIED') {
      throw new Error('Asset not verified');
    }

    const assetDetails = verification.metadata?.assetDetails;
    if (!assetDetails) {
      throw new Error('Asset details not found');
    }

    const snapshot = await this.prisma.robloxSnapshot.create({
      data: {
        assetId,
        assetType: assetDetails.assetType?.name || 'Unknown',
        assetName: assetDetails.name,
        assetDescription: assetDetails.description,
        thumbnailUrl: `https://thumbnails.roblox.com/v1/assets?assetIds=${assetId}&size=420x420&format=Png`,
        currentPrice: assetDetails.recentAveragePrice,
        originalPrice: assetDetails.originalPrice,
        verifiedOwnership: true,
        verificationDate: verification.verifiedAt,
        metadata: {
          verificationId,
          assetDetails,
          createdAt: new Date().toISOString()
        },
        listingId
      }
    });

    return snapshot;
  }

  /**
   * Get user's verified assets
   */
  async getUserVerifiedAssets(userId: string): Promise<any[]> {
    return await this.prisma.assetVerification.findMany({
      where: {
        userId,
        verificationStatus: 'VERIFIED',
        expiresAt: {
          gt: new Date()
        }
      },
      orderBy: {
        verifiedAt: 'desc'
      }
    });
  }
}
