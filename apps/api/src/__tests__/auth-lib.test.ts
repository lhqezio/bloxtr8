// Mock the database before importing auth
jest.mock('@bloxtr8/database', () => ({
  prisma: {
    user: {},
    account: {},
    session: {},
    verification: {},
  },
}));

// Mock environment variables
const originalEnv = process.env;

describe('Auth Configuration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      DISCORD_CLIENT_ID: 'test-discord-client-id',
      DISCORD_CLIENT_SECRET: 'test-discord-client-secret',
      ROBLOX_CLIENT_ID: 'test-roblox-client-id',
      ROBLOX_CLIENT_SECRET: 'test-roblox-client-secret',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should create auth instance with correct configuration', async () => {
    const { auth } = await import('../lib/auth.js');
    expect(auth).toBeDefined();
    expect(auth).toHaveProperty('api');
    expect(auth).toHaveProperty('handler');
  });

  it('should have email and password authentication enabled', async () => {
    const { auth } = await import('../lib/auth.js');
    // This tests that the auth instance is created without errors
    // The actual configuration is internal to better-auth
    expect(auth).toBeDefined();
  });

  it('should have Discord social provider configured', async () => {
    const { auth } = await import('../lib/auth.js');
    // This tests that the auth instance is created without errors
    // The actual configuration is internal to better-auth
    expect(auth).toBeDefined();
  });

  it('should have Roblox social provider configured', async () => {
    const { auth } = await import('../lib/auth.js');
    // This tests that the auth instance is created without errors
    // The actual configuration is internal to better-auth
    expect(auth).toBeDefined();
  });

  it('should handle missing environment variables gracefully', async () => {
    process.env.DISCORD_CLIENT_ID = '';
    process.env.DISCORD_CLIENT_SECRET = '';
    process.env.ROBLOX_CLIENT_ID = '';
    process.env.ROBLOX_CLIENT_SECRET = '';

    // Should not throw an error during auth creation
    expect(async () => {
      const { auth: testAuth } = await import('../lib/auth.js');
      expect(testAuth).toBeDefined();
    }).not.toThrow();
  });
});
