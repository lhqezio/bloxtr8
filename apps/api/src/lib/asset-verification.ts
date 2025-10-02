import { PrismaClient } from '@bloxtr8/database';

import { RobloxApiClient } from './roblox-api.js';

export interface GameVerificationResult {
  success: boolean;
  verified: boolean;
  gameDetails?: any;
  ownershipType?: string;
  error?: string;
  verificationId?: string;
}

export class GameVerificationService {
  private prisma: PrismaClient;
  private robloxApi: RobloxApiClient;

  constructor() {
    this.prisma = new PrismaClient();
    this.robloxApi = new RobloxApiClient({
      clientId: process.env.ROBLOX_CLIENT_ID!,
      clientSecret: process.env.ROBLOX_CLIENT_SECRET!,
      baseUrl: 'https://apis.roblox.com',
      rateLimitDelay: 1000,
    });
  }

  /**
   * Verify game ownership/admin access for a user
   */
  async verifyGameOwnership(
    userId: string,
    gameId: string,
    robloxUserId: string
  ): Promise<GameVerificationResult> {
    try {
      // Check if we have a recent verification
      const existingVerification =
        await this.prisma.assetVerification.findUnique({
          where: {
            userId_gameId: {
              userId,
              gameId,
            },
          },
        });

      // If recent verification exists and is still valid, return cached result
      if (
        existingVerification &&
        existingVerification.verificationStatus === 'VERIFIED' &&
        existingVerification.expiresAt &&
        existingVerification.expiresAt > new Date()
      ) {
        return {
          success: true,
          verified: true,
          ownershipType: existingVerification.ownershipType,
          verificationId: existingVerification.id,
        };
      }

      // Get game details from Roblox
      const gameDetails = await this.robloxApi.getGameDetails(gameId);
      if (!gameDetails) {
        return {
          success: false,
          verified: false,
          error: 'Game not found',
        };
      }

      // Verify ownership/admin access
      const ownershipResult = await this.robloxApi.verifyGameOwnership(
        robloxUserId,
        gameId
      );

      if (!ownershipResult.owns) {
        return {
          success: true,
          verified: false,
          gameDetails,
          error: 'You do not own or have admin access to this game',
        };
      }

      // Determine ownership type for database
      let ownershipType = 'OWNER';
      if (ownershipResult.role === 'Admin') {
        ownershipType = 'ADMIN';
      } else if (ownershipResult.role === 'Developer') {
        ownershipType = 'DEVELOPER';
      }

      // Create or update verification record
      const verification = await this.prisma.assetVerification.upsert({
        where: {
          userId_gameId: {
            userId,
            gameId,
          },
        },
        update: {
          verificationStatus: 'VERIFIED',
          ownershipType: ownershipType as any,
          verifiedAt: new Date(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
          metadata: {
            gameDetails,
            ownershipResult,
            verifiedAt: new Date().toISOString(),
            robloxUserId,
          },
        },
        create: {
          userId,
          gameId,
          verificationStatus: 'VERIFIED',
          verificationMethod: 'GAME_OWNERSHIP_API',
          ownershipType: ownershipType as any,
          verifiedAt: new Date(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          metadata: {
            gameDetails,
            ownershipResult,
            verifiedAt: new Date().toISOString(),
            robloxUserId,
          },
        },
      });

      return {
        success: true,
        verified: true,
        gameDetails,
        ownershipType: ownershipResult.role,
        verificationId: verification.id,
      };
    } catch (error) {
      console.error('Game verification error:', error);
      return {
        success: false,
        verified: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Create game snapshot for listing
   */
  async createGameSnapshot(
    listingId: string,
    gameId: string,
    verificationId: string
  ): Promise<any> {
    const verification = await this.prisma.assetVerification.findUnique({
      where: { id: verificationId },
    });

    if (!verification || verification.verificationStatus !== 'VERIFIED') {
      throw new Error('Game not verified');
    }

    const gameDetails = verification.metadata?.gameDetails;
    if (!gameDetails) {
      throw new Error('Game details not found');
    }

    const snapshot = await this.prisma.robloxSnapshot.create({
      data: {
        gameId,
        gameName: gameDetails.name,
        gameDescription: gameDetails.description,
        thumbnailUrl:
          gameDetails.thumbnailUrl ||
          `https://thumbnails.roblox.com/v1/games/icons?gameIds=${gameId}&size=420x420&format=Png`,
        playerCount: gameDetails.playing,
        visits: gameDetails.visits,
        createdDate: gameDetails.created ? new Date(gameDetails.created) : null,
        verifiedOwnership: true,
        ownershipType: verification.ownershipType,
        verificationDate: verification.verifiedAt,
        metadata: {
          verificationId,
          gameDetails,
          createdAt: new Date().toISOString(),
        },
        listingId,
      },
    });

    return snapshot;
  }

  /**
   * Get user's verified games
   */
  async getUserVerifiedGames(userId: string): Promise<any[]> {
    return await this.prisma.assetVerification.findMany({
      where: {
        userId,
        verificationStatus: 'VERIFIED',
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        verifiedAt: 'desc',
      },
    });
  }
}
