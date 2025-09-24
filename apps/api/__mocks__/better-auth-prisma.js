// Mock for better-auth/adapters/prisma module
const mockPrismaAdapter = (prisma, options) => ({
  adapter: 'prisma',
  provider: options?.provider || 'postgresql',
  prisma,
  options,
});

module.exports = {
  prismaAdapter: mockPrismaAdapter,
};
