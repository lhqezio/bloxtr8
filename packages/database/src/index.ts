// Database package exports
export const DATABASE_READY = true;

// Export Prisma client and types from generated location
export * from './generated/prisma/client.js';
export * from './generated/prisma/enums.js';
export { PrismaClient } from './generated/prisma/client.js';

// Export singleton instance for use across the application
export { prisma } from './client.js';
