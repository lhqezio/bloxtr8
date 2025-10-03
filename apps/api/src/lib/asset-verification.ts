import type { PrismaClient } from '@bloxtr8/database';

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

  constructor(prismaClient: PrismaClient) {
    // Validate required environment variables
    if (!process.env.ROBLOX_CLIENT_ID || !process.env.ROBLOX_CLIENT_SECRET) {
      throw new Error(
        'Missing required Roblox API credentials (ROBLOX_CLIENT_ID, ROBLOX_CLIENT_SECRET)'
      );
    }

    this.prisma = prismaClient;
    this.robloxApi = new RobloxApiClient({
      clientId: process.env.ROBLOX_CLIENT_ID,
      clientSecret: process.env.ROBLOX_CLIENT_SECRET,
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
        existingVerification.expiresAt instanceof Date &&
        existingVerification.expiresAt > new Date()
      ) {
        // Extract gameDetails from cached metadata
        let gameDetails = null;
        if (
          existingVerification.metadata &&
          typeof existingVerification.metadata === 'object'
        ) {
          gameDetails = (existingVerification.metadata as any).gameDetails;
        }

        // Validate gameDetails structure - ensure it has required fields
        const isValidGameDetails = (details: any): boolean => {
          return (
            details &&
            typeof details === 'object' &&
            typeof details.id === 'string' &&
            typeof details.name === 'string' &&
            details.id &&
            details.name &&
            typeof details.id.trim === 'function' &&
            typeof details.name.trim === 'function' &&
            details.id.trim() !== '' &&
            details.name.trim() !== ''
          );
        };

        // If gameDetails is missing from cache or invalid, create fallback
        if (!isValidGameDetails(gameDetails)) {
          // Try to fetch the actual game details from Roblox API
          try {
            const actualGameDetails =
              await this.robloxApi.getGameDetails(gameId);
            if (
              actualGameDetails &&
              actualGameDetails.id &&
              actualGameDetails.name
            ) {
              gameDetails = actualGameDetails;
            } else {
              // If API call fails, create minimal fallback
              gameDetails = {
                id: gameId,
                name: `Game ${gameId}`,
                description: 'Game verification successful (cached)',
                creator: {
                  id: 0, // Use 0 instead of robloxUserId to avoid confusion
                  name: 'Unknown Creator',
                  type: 'User',
                },
                visits: 0,
                playing: 0,
                maxPlayers: 0,
                genre: 'Unknown',
                created: '',
                updated: '',
                thumbnailUrl: `https://thumbnails.roblox.com/v1/games/icons?gameIds=${gameId}&size=420x420&format=Png`,
              };
            }
          } catch (error) {
            // If API call fails, create minimal fallback
            console.log('Failed to fetch game details for fallback:', error);
            gameDetails = {
              id: gameId,
              name: `Game ${gameId}`,
              description: 'Game verification successful (cached)',
              creator: {
                id: 0, // Use 0 instead of robloxUserId to avoid confusion
                name: 'Unknown Creator',
                type: 'User',
              },
              visits: 0,
              playing: 0,
              maxPlayers: 0,
              genre: 'Unknown',
              created: '',
              updated: '',
              thumbnailUrl: `https://thumbnails.roblox.com/v1/games/icons?gameIds=${gameId}&size=420x420&format=Png`,
            };
          }
        }

        // Fix creator name if it's "Unknown" - fetch the correct name
        if (
          gameDetails.creator &&
          gameDetails.creator.name === 'Unknown' &&
          gameDetails.creator.id
        ) {
          try {
            const creatorResponse = await fetch(
              `https://users.roblox.com/v1/users/${gameDetails.creator.id}`
            );
            if (creatorResponse.ok) {
              const creatorData = await creatorResponse.json();
              gameDetails.creator.name =
                creatorData.name || creatorData.displayName || 'Unknown';
            }
          } catch (error) {
            console.log('Failed to fix cached creator name:', error);
          }
        }

        return {
          success: true,
          verified: true,
          gameDetails,
          ownershipType: existingVerification.ownershipType,
          verificationId: existingVerification.id,
        };
      }

      // Verify ownership/admin access first
      const ownershipResult = await this.robloxApi.verifyGameOwnership(
        robloxUserId,
        gameId
      );

      if (!ownershipResult.owns) {
        return {
          success: true,
          verified: false,
          error: 'You do not own or have admin access to this game',
        };
      }

      // Use game details from verification result if available, otherwise fetch them
      let gameDetails = ownershipResult.gameDetails;

      if (!gameDetails) {
        // If verification passed but no game details, fetch from user's experiences
        const userExperiences =
          await this.robloxApi.getUserExperiences(robloxUserId);
        const ownedExperience = userExperiences.find(exp => exp.id === gameId);

        if (ownedExperience) {
          gameDetails = {
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
        } else {
          gameDetails = await this.robloxApi.getGameDetails(gameId);
        }
      }

      if (!gameDetails) {
        // Even if game details fail, we know ownership is verified
        // Create basic game details as fallback
        gameDetails = {
          id: gameId,
          name: `Game ${gameId}`,
          description: 'Game verification successful',
          creator: {
            id: 0, // Use 0 instead of robloxUserId to avoid confusion with actual creator
            name: 'Unknown Creator',
            type: 'User',
          },
          visits: 0,
          playing: 0,
          maxPlayers: 0,
          genre: 'Unknown',
          created: '',
          updated: '',
          thumbnailUrl: `https://thumbnails.roblox.com/v1/games/icons?gameIds=${gameId}&size=420x420&format=Png`,
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
          } as any,
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
          } as any,
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

    const gameDetails = (verification.metadata as any)?.gameDetails;

    // Validate gameDetails structure - ensure it has required fields
    const isValidGameDetails = (details: any): boolean => {
      return (
        details &&
        typeof details === 'object' &&
        typeof details.id === 'string' &&
        typeof details.name === 'string' &&
        details.id &&
        details.name &&
        typeof details.id.trim === 'function' &&
        typeof details.name.trim === 'function' &&
        details.id.trim() !== '' &&
        details.name.trim() !== ''
      );
    };

    if (!isValidGameDetails(gameDetails)) {
      throw new Error('Game details not found or invalid');
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
