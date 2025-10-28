// Shared utilities and constants placeholder

export const APP_NAME = 'Bloxtr8';
export const APP_VERSION = '1.0.0';

// Common utility functions
export const formatDate = (date: Date): string => {
  return date.toISOString();
};

// Common validation schemas (using zod)
import { z } from 'zod';

export const userIdSchema = z.string().min(1);
export const robloxUserIdSchema = z.number().positive();

// Domain types and enums
export { EscrowState, ProviderId, Role } from './domain.js';

// Environment validation utilities
export * from './env-validation.js';
