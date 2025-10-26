import { prisma } from '@bloxtr8/database';
import { createPresignedPutUrl, createPresignedGetUrl } from '@bloxtr8/storage';
import { Router, type Router as ExpressRouter } from 'express';
import crypto from 'crypto';

import {
  generateContract,
  verifyContract,
} from '../lib/contract-generator.js';
import { executeContract } from '../lib/contract-execution.js';
import { AppError } from '../middleware/errorHandler.js';
import { serializeBigInt } from '../utils/bigint.js';

const router: ExpressRouter = Router();

// Generate contract from accepted offer
router.post('/contracts/generate', async (req, res, next) => {
  try {
    const { offerId } = req.body;

    if (!offerId) {
      throw new AppError('Offer ID is required', 400);
    }

    // Fetch offer with related data
    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
      include: {
        listing: {
          include: {
            robloxSnapshots: {
              where: { verifiedOwnership: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
        buyer: {
          include: {
            accounts: {
              where: { providerId: 'roblox' },
            },
          },
        },
        seller: {
          include: {
            accounts: {
              where: { providerId: 'roblox' },
            },
          },
        },
      },
    });

    if (!offer) {
      throw new AppError('Offer not found', 404);
    }

    if (offer.status !== 'ACCEPTED') {
      throw new AppError('Only accepted offers can generate contracts', 400);
    }

    // Check if contract already exists for this offer
    const existingContract = await prisma.contract.findFirst({
      where: { offerId: offer.id },
    });

    if (existingContract) {
      return res.json({
        contractId: existingContract.id,
        status: existingContract.status,
        pdfUrl: existingContract.pdfUrl,
        alreadyExists: true,
      });
    }

    // Create contract record
    const contract = await prisma.contract.create({
      data: {
        offerId: offer.id,
        status: 'PENDING_SIGNATURE',
      },
    });

    // Prepare Roblox asset data from snapshot
    const robloxSnapshot = offer.listing.robloxSnapshots[0];
    const robloxData = robloxSnapshot
      ? {
          gameId: robloxSnapshot.gameId,
          gameName: robloxSnapshot.gameName,
          gameDescription: robloxSnapshot.gameDescription || undefined,
          thumbnailUrl: robloxSnapshot.thumbnailUrl || undefined,
          playerCount: robloxSnapshot.playerCount || undefined,
          visits: robloxSnapshot.visits || undefined,
          verifiedOwnership: robloxSnapshot.verifiedOwnership,
          ownershipType: robloxSnapshot.ownershipType,
          verificationDate: robloxSnapshot.verificationDate || undefined,
        }
      : undefined;

    // Generate PDF
    const result = await generateContract({
      contractId: contract.id,
      offerId: offer.id,
      listingId: offer.listing.id,
      seller: {
        id: offer.seller.id,
        name: offer.seller.name || 'User ' + offer.seller.id,
        email: offer.seller.email,
        kycTier: offer.seller.kycTier,
        robloxAccountId: offer.seller.accounts[0]?.accountId,
      },
      buyer: {
        id: offer.buyer.id,
        name: offer.buyer.name || 'User ' + offer.buyer.id,
        email: offer.buyer.email,
        kycTier: offer.buyer.kycTier,
        robloxAccountId: offer.buyer.accounts[0]?.accountId,
      },
      asset: {
        title: offer.listing.title,
        description: offer.listing.summary,
        category: offer.listing.category,
        robloxData,
      },
      financial: {
        amountCents: offer.amount,
        currency: offer.currency,
      },
      offer: {
        id: offer.id,
        conditions: offer.conditions || undefined,
        acceptedAt: offer.updatedAt,
      },
    });

    if (!result.success) {
      throw new AppError(`Failed to generate contract: ${result.error}`, 500);
    }

    // Update contract with PDF details
    const updatedContract = await prisma.contract.update({
      where: { id: contract.id },
      data: {
        pdfUrl: result.pdfUrl,
        sha256: result.sha256,
        templateVersion: result.templateVersion,
        robloxAssetData: robloxData as any,
      },
    });

    res.json({
      contractId: updatedContract.id,
      status: updatedContract.status,
      pdfUrl: updatedContract.pdfUrl,
      sha256: updatedContract.sha256,
    });
  } catch (error) {
    next(error);
  }
});

// Get contract details
router.get('/contracts/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const contract = await prisma.contract.findUnique({
      where: { id },
      include: {
        signatures: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        offer: {
          include: {
            buyer: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            seller: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            listing: {
              select: {
                id: true,
                title: true,
                category: true,
              },
            },
          },
        },
      },
    });

    if (!contract) {
      throw new AppError('Contract not found', 404);
    }

    res.json(serializeBigInt(contract));
  } catch (error) {
    next(error);
  }
});

// Sign contract
router.post('/contracts/:id/sign', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { userId, ipAddress, userAgent, signatureMethod = 'DISCORD_NATIVE', token } = req.body;

    if (!userId) {
      throw new AppError('User ID is required', 400);
    }

    // Validate audit trail parameters
    if (signatureMethod === 'WEB_BASED') {
      if (!ipAddress) {
        throw new AppError('IP address is required for web-based signatures', 400);
      }
      if (!userAgent) {
        throw new AppError('User agent is required for web-based signatures', 400);
      }
    }

    // Fetch contract with offer details
    const contract = await prisma.contract.findUnique({
      where: { id },
      include: {
        offer: true,
        signatures: true,
      },
    });

    if (!contract) {
      throw new AppError('Contract not found', 404);
    }

    if (contract.status !== 'PENDING_SIGNATURE') {
      throw new AppError('Contract is not pending signature', 400);
    }

    // Verify user is buyer or seller
    if (
      userId !== contract.offer.buyerId &&
      userId !== contract.offer.sellerId
    ) {
      throw new AppError('User is not authorized to sign this contract', 403);
    }

    // Check if user already signed
    const existingSignature = contract.signatures.find(
      sig => sig.userId === userId
    );

    if (existingSignature) {
      throw new AppError('User has already signed this contract', 400);
    }

    // If signing with a web token, validate it hasn't been used
    if (token && signatureMethod === 'WEB_BASED') {
      const signToken = await prisma.contractSignToken.findUnique({
        where: { token },
      });

      if (!signToken) {
        throw new AppError('Invalid signing token', 401);
      }

      if (signToken.used) {
        throw new AppError('Signing token has already been used', 401);
      }

      if (signToken.contractId !== id) {
        throw new AppError('Token does not match this contract', 401);
      }

      if (signToken.userId !== userId) {
        throw new AppError('Token does not match this user', 401);
      }
    }

    // Create signature
    const signature = await prisma.signature.create({
      data: {
        userId,
        contractId: id,
        ipAddress,
        userAgent,
        signatureMethod,
      },
    });

    // Mark token as used AFTER signature is successfully created
    if (token && signatureMethod === 'WEB_BASED') {
      await prisma.contractSignToken.update({
        where: { token },
        data: { used: true },
      });
    }

    // Check if both parties have signed
    const allSignatures = await prisma.signature.findMany({
      where: { contractId: id },
    });

    const bothSigned =
      allSignatures.some(sig => sig.userId === contract.offer.buyerId) &&
      allSignatures.some(sig => sig.userId === contract.offer.sellerId);

    // If both signed, execute contract (create escrow) and update status
    let contractStatus = 'PENDING_SIGNATURE';
    let escrowId: string | undefined;
    let executionError: string | undefined;

    if (bothSigned) {
      try {
        // Execute contract synchronously to ensure escrow is created before responding
        const executionResult = await executeContract(id);
        
        if (executionResult.success) {
          // Only mark as EXECUTED if escrow creation succeeded
          await prisma.contract.update({
            where: { id },
            data: {
              status: 'EXECUTED',
            },
          });
          contractStatus = 'EXECUTED';
          escrowId = executionResult.escrowId;
          console.log(
            `Contract ${id} executed successfully. Escrow ${escrowId} created.`
          );
        } else {
          // If escrow creation failed, keep contract in a safe state
          await prisma.contract.update({
            where: { id },
            data: {
              status: 'EXECUTION_FAILED',
            },
          });
          contractStatus = 'EXECUTION_FAILED';
          executionError = executionResult.error;
          console.error(`Failed to execute contract ${id}:`, executionResult.error);
        }
      } catch (error) {
        // Handle unexpected errors during contract execution
        await prisma.contract.update({
          where: { id },
          data: {
            status: 'EXECUTION_FAILED',
          },
        });
        contractStatus = 'EXECUTION_FAILED';
        executionError = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error executing contract:', error);
      }
    }

    res.json({
      signature: serializeBigInt(signature),
      contractStatus,
      bothPartiesSigned: bothSigned,
      ...(escrowId && { escrowId }),
      ...(executionError && { executionError }),
    });
  } catch (error) {
    next(error);
  }
});

// Verify contract integrity
router.post('/contracts/:id/verify', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { pdfBytes } = req.body;

    const contract = await prisma.contract.findUnique({
      where: { id },
    });

    if (!contract) {
      throw new AppError('Contract not found', 404);
    }

    if (!contract.sha256) {
      throw new AppError('Contract has no hash for verification', 400);
    }

    if (!pdfBytes) {
      throw new AppError('PDF bytes required for verification', 400);
    }

    // Convert base64 to buffer if needed
    const buffer =
      typeof pdfBytes === 'string'
        ? Buffer.from(pdfBytes, 'base64')
        : Buffer.from(pdfBytes);

    const isValid = await verifyContract(
      new Uint8Array(buffer),
      contract.sha256
    );

    res.json({
      contractId: id,
      isValid,
      expectedHash: contract.sha256,
    });
  } catch (error) {
    next(error);
  }
});

// PDF upload endpoint - returns presigned PUT URL
router.post('/contracts/:id/upload', async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string' || id.trim() === '') {
      throw new AppError(
        'Contract ID is required and must be a non-empty string',
        400
      );
    }

    const key = `contracts/${id}.pdf`;
    const presignedUrl = await createPresignedPutUrl(key);

    res.json({
      uploadUrl: presignedUrl,
      key,
      expiresIn: 900, // 15 minutes
    });
  } catch (error) {
    next(error);
  }
});

// PDF download endpoint - returns presigned GET URL
router.get('/contracts/:id/pdf', async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string' || id.trim() === '') {
      throw new AppError(
        'Contract ID is required and must be a non-empty string',
        400
      );
    }

    const key = `contracts/${id}.pdf`;
    const presignedUrl = await createPresignedGetUrl(key);

    res.json({
      downloadUrl: presignedUrl,
      key,
      expiresIn: 3600, // 1 hour
    });
  } catch (error) {
    next(error);
  }
});

// Generate contract signing token for web app
router.post('/contracts/:id/sign-token', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    if (!userId) {
      throw new AppError('User ID is required', 400);
    }

    // Verify contract exists and user is authorized
    const contract = await prisma.contract.findUnique({
      where: { id },
      include: {
        offer: true,
      },
    });

    if (!contract) {
      throw new AppError('Contract not found', 404);
    }

    if (
      userId !== contract.offer.buyerId &&
      userId !== contract.offer.sellerId
    ) {
      throw new AppError('User is not authorized to sign this contract', 403);
    }

    // Generate one-time token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await prisma.contractSignToken.create({
      data: {
        token,
        contractId: id,
        userId,
        expiresAt,
      },
    });

    res.json({
      token,
      expiresAt,
      signUrl: `${process.env.WEB_APP_URL || 'http://localhost:5173'}/contract/${id}/sign?token=${token}`,
    });
  } catch (error) {
    next(error);
  }
});

// Validate contract signing token
router.post('/contracts/validate-token', async (req, res, next) => {
  try {
    const { token } = req.body;

    if (!token) {
      throw new AppError('Token is required', 400);
    }

    // Look up token
    const signToken = await prisma.contractSignToken.findUnique({
      where: { token },
    });

    if (!signToken) {
      throw new AppError('Invalid or expired token', 401);
    }

    // Check if token is expired
    if (signToken.expiresAt < new Date()) {
      throw new AppError('Token has expired', 401);
    }

    // Check if token has already been used
    if (signToken.used) {
      throw new AppError('Token has already been used', 401);
    }

    // Do NOT mark token as used here - it will be marked as used only after
    // the signature is successfully recorded in the /contracts/:id/sign endpoint
    res.json({
      contractId: signToken.contractId,
      userId: signToken.userId,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
