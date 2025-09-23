import { createPresignedPutUrl, createPresignedGetUrl } from '@bloxtr8/storage';
import { PrismaClient } from '@bloxtr8/database';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';

import { AppError } from '../middleware/errorHandler.js';

const router: ExpressRouter = Router();
const prisma = new PrismaClient();

// Zod schema for listing creation
const createListingSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255, 'Title must be less than 255 characters'),
  summary: z.string().min(1, 'Summary is required').max(1000, 'Summary must be less than 1000 characters'),
  price: z.number().int().positive('Price must be a positive integer'),
  category: z.string().min(1, 'Category is required').max(100, 'Category must be less than 100 characters'),
  sellerId: z.string().min(1, 'Seller ID is required'),
  guildId: z.string().optional(),
});

// Create listing endpoint
router.post('/listings', async (req, res, next) => {
  try {
    // Validate payload with zod
    const validationResult = createListingSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      const errors = validationResult.error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      
      throw new AppError(
        `Validation failed: ${errors.map(e => `${e.field}: ${e.message}`).join(', ')}`,
        400
      );
    }

    const { title, summary, price, category, sellerId, guildId } = validationResult.data;

    // Insert listing with sellerId
    const listing = await prisma.listing.create({
      data: {
        title,
        summary,
        price,
        category,
        userId: sellerId,
        guildId,
      },
    });

    // Return listing id
    res.status(201).json({
      id: listing.id,
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

export default router;
