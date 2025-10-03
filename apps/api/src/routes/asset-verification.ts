import { prisma } from '@bloxtr8/database';
import { Router, type Router as ExpressRouter } from 'express';

import { GameVerificationService } from '../lib/asset-verification.js';

const router: ExpressRouter = Router();
const gameVerificationService = new GameVerificationService(prisma);

/**
 * POST /api/asset-verification/verify
 * Verify game ownership/admin access for a user
 */
router.post('/verify', async (req, res) => {
  try {
    const { gameId, robloxUserId, userId: bodyUserId } = req.body;
    // Note: req.user would be set by authentication middleware if present
    const userId = (req as any).user?.id || bodyUserId;

    if (!userId || !gameId || !robloxUserId) {
      return res.status(400).json({
        error: 'Missing required fields: userId, gameId, robloxUserId',
      });
    }

    const result = await gameVerificationService.verifyGameOwnership(
      userId,
      gameId,
      robloxUserId
    );

    if (!result.success) {
      return res.status(400).json({
        error: result.error || 'Verification failed',
      });
    }

    res.json({
      verified: result.verified,
      gameDetails: result.gameDetails,
      ownershipType: result.ownershipType,
      verificationId: result.verificationId,
    });
  } catch (error) {
    console.error('Game verification endpoint error:', error);
    res.status(500).json({
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/asset-verification/user/:userId/games
 * Get user's verified games
 */
router.get('/user/:userId/games', async (req, res) => {
  try {
    const { userId } = req.params;
    const games = await gameVerificationService.getUserVerifiedGames(userId);

    res.json({
      games,
      count: games.length,
    });
  } catch (error) {
    console.error('Get verified games error:', error);
    res.status(500).json({
      error: 'Internal server error',
    });
  }
});

/**
 * POST /api/asset-verification/snapshot
 * Create game snapshot for listing
 */
router.post('/snapshot', async (req, res) => {
  try {
    const { listingId, gameId, verificationId } = req.body;

    if (!listingId || !gameId || !verificationId) {
      return res.status(400).json({
        error: 'Missing required fields: listingId, gameId, verificationId',
      });
    }

    const snapshot = await gameVerificationService.createGameSnapshot(
      listingId,
      gameId,
      verificationId
    );

    res.json({
      snapshot,
    });
  } catch (error) {
    console.error('Create game snapshot error:', error);
    res.status(500).json({
      error: 'Internal server error',
    });
  }
});

export default router;
