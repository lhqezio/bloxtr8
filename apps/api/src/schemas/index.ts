import { z } from 'zod';

// User validation schemas
export const createUserSchema = z.object({
  discordId: z.string().min(1, 'Discord ID is required'),
  username: z.string().min(1, 'Username is required'),
});

// Listing validation schemas
export const createListingSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(255, 'Title must be less than 255 characters'),
  summary: z
    .string()
    .min(1, 'Summary is required')
    .max(1000, 'Summary must be less than 1000 characters'),
  price: z
    .union([z.string(), z.number()])
    .refine(
      val => {
        try {
          const num = BigInt(val);
          return num > 0n;
        } catch {
          return false;
        }
      },
      { message: 'Price must be a positive integer' }
    )
    .transform(val => BigInt(val)),
  category: z
    .string()
    .min(1, 'Category is required')
    .max(100, 'Category must be less than 100 characters'),
  sellerId: z.string().min(1, 'Seller ID is required'),
  guildId: z.string().optional(),
  visibility: z.enum(['PUBLIC', 'PRIVATE']).optional(),
  threadId: z.string().optional(),
  channelId: z.string().optional(),
  priceRange: z.string().optional(),
});

// Offer validation schemas
export const createOfferSchema = z.object({
  listingId: z.string().min(1, 'Listing ID is required'),
  buyerId: z.string().min(1, 'Buyer ID is required'),
  amount: z
    .number()
    .int()
    .positive('Amount must be a positive integer')
    .max(2147483647, 'Amount exceeds maximum allowed value ($21,474,836.47)'),
  conditions: z.string().optional(),
  expiry: z.string().datetime().optional(), // ISO datetime string
});

// Contract validation schemas
export const contractIdSchema = z.object({
  id: z.string().min(1, 'Contract ID is required'),
});

// Common validation schemas
export const discordIdSchema = z.object({
  discordId: z.string().min(1, 'Discord ID is required'),
});
