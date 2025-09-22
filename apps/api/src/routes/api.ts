import { Router, type Router as ExpressRouter } from 'express';
import { createPresignedPutUrl, createPresignedGetUrl } from '@bloxtr8/storage';
import { AppError } from '../middleware/errorHandler.js';

const router: ExpressRouter = Router();

// PDF upload endpoint - returns presigned PUT URL
router.post('/contracts/:id/upload', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    if (!id || typeof id !== 'string' || id.trim() === '') {
      throw new AppError('Contract ID is required and must be a non-empty string', 400);
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
      throw new AppError('Contract ID is required and must be a non-empty string', 400);
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

export default router;
