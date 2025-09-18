// Database package exports
export const DATABASE_READY = true;

// Export Prisma client and types from generated location
export * from './generated/prisma/client.js';
export { PrismaClient } from './generated/prisma/client.js';
