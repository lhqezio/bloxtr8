import { Router } from 'express';
import { AssetVerificationService } from '../lib/asset-verification.js';

const router = Router();
const assetVerificationService = new AssetVerificationService();

/**
 * POST /api/asset-verification/verify
 * Verify asset ownership for a user
 */
router.post('/verify', async (req, res) => {
  try {
    const { assetId, robloxUserId } = req.body;
    const userId = req.user?.id;

    if (!userId || !assetId || !robloxUserId) {
      return res.status(400).json({
        error: 'Missing required fields: userId, assetId, robloxUserId'
      });
    }

    const result = await assetVerificationService.verifyAssetOwnership(
      userId,
      assetId,
      robloxUserId
    );

    if (!result.success) {
      return res.status(400).json({
        error: result.error || 'Verification failed'
      });
    }

    res.json({
      verified: result.verified,
      assetDetails: result.assetDetails,
      verificationId: result.verificationId
    });

  } catch (error) {
    console.error('Asset verification endpoint error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/asset-verification/user/:userId/assets
 * Get user's verified assets
 */
router.get('/user/:userId/assets', async (req, res) => {
  try {
    const { userId } = req.params;
    const assets = await assetVerificationService.getUserVerifiedAssets(userId);
    
    res.json({
      assets,
      count: assets.length
    });

  } catch (error) {
    console.error('Get verified assets error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

/**
 * POST /api/asset-verification/snapshot
 * Create asset snapshot for listing
 */
router.post('/snapshot', async (req, res) => {
  try {
    const { listingId, assetId, verificationId } = req.body;

    if (!listingId || !assetId || !verificationId) {
      return res.status(400).json({
        error: 'Missing required fields: listingId, assetId, verificationId'
      });
    }

    const snapshot = await assetVerificationService.createAssetSnapshot(
      listingId,
      assetId,
      verificationId
    );

    res.json({
      snapshot
    });

  } catch (error) {
    console.error('Create asset snapshot error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

export default router;
