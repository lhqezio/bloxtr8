// Singleton PrismaClient instance to prevent connection pool exhaustion
import { PrismaClient } from './generated/prisma/client.js';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

// Store globally in all environments to maintain singleton
globalForPrisma.prisma = prisma;

// Export PrismaClient type for type safety
export type { PrismaClient } from './generated/prisma/client.js';
