import {
  verifyDiscordUser,
  validateDiscordUser,
  generateOAuthState,
  validateOAuthState,
} from '../lib/discord-verification.js';

// Mock fetch globally
global.fetch = jest.fn();

// Mock the database module
jest.mock('@bloxtr8/database', () => ({
  prisma: {
    linkToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      deleteMany: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

describe('Discord Verification Functions', () => {
  let mockPrisma: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Set up environment variables
    process.env.DISCORD_BOT_TOKEN = 'test-bot-token';

    // Get the mocked prisma instance
    const { prisma } = await import('@bloxtr8/database');
    mockPrisma = prisma;
  });

  afterEach(() => {
    delete process.env.DISCORD_BOT_TOKEN;
  });

  describe('verifyDiscordUser', () => {
    it('should verify Discord user successfully', async () => {
      const mockDiscordUser = {
        id: 'discord-user-123',
        username: 'TestUser',
        discriminator: '0001',
        avatar: 'test-avatar-hash',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockDiscordUser),
      });

      const result = await verifyDiscordUser('discord-user-123');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://discord.com/api/v10/users/discord-user-123',
        {
          method: 'GET',
          headers: {
            Authorization: 'Bot test-bot-token',
            'Content-Type': 'application/json',
          },
        }
      );

      expect(result).toEqual(mockDiscordUser);
    });

    it('should return null when user not found', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await verifyDiscordUser('nonexistent-user');

      expect(result).toBeNull();
    });

    it('should throw error when bot token is missing', async () => {
      delete process.env.DISCORD_BOT_TOKEN;

      await expect(verifyDiscordUser('discord-user-123')).rejects.toThrow(
        'Discord bot token not configured'
      );
    });

    it('should throw error when API request fails with non-404 status', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(verifyDiscordUser('discord-user-123')).rejects.toThrow(
        'Failed to verify Discord user'
      );
    });

    it('should handle network errors gracefully', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error')
      );

      await expect(verifyDiscordUser('discord-user-123')).rejects.toThrow(
        'Failed to verify Discord user'
      );
    });
  });

  describe('validateDiscordUser', () => {
    it('should return true when user exists', async () => {
      const mockDiscordUser = {
        id: 'discord-user-123',
        username: 'TestUser',
        discriminator: '0001',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockDiscordUser),
      });

      const result = await validateDiscordUser('discord-user-123');

      expect(result).toBe(true);
    });

    it('should return false when user does not exist', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await validateDiscordUser('nonexistent-user');

      expect(result).toBe(false);
    });

    it('should return false when API request fails', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error')
      );

      const result = await validateDiscordUser('discord-user-123');

      expect(result).toBe(false);
    });
  });

  describe('generateOAuthState', () => {
    it('should generate a random state and store it in database', async () => {
      const discordId = 'discord-user-123';

      mockPrisma.linkToken.deleteMany.mockResolvedValueOnce({ count: 0 });
      mockPrisma.linkToken.create.mockResolvedValueOnce({
        id: 'link-token-id',
        token: 'mock-state-token',
        discordId,
        purpose: 'oauth_state',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        used: false,
      });

      const state = await generateOAuthState(discordId);

      expect(state).toBeTruthy();
      expect(typeof state).toBe('string');
      expect(state.length).toBe(64); // 32 bytes hex = 64 characters

      // Should NOT delete existing states to avoid race conditions
      expect(mockPrisma.linkToken.deleteMany).not.toHaveBeenCalled();

      // Should create new state
      expect(mockPrisma.linkToken.create).toHaveBeenCalledWith({
        data: {
          token: expect.any(String),
          discordId,
          purpose: 'oauth_state',
          expiresAt: expect.any(Date),
          used: false,
        },
      });
    });

    it('should generate unique states for same user', async () => {
      const discordId = 'discord-user-123';

      mockPrisma.linkToken.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.linkToken.create.mockResolvedValue({
        id: 'link-token-id',
        token: 'mock-state-token',
        discordId,
        purpose: 'oauth_state',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        used: false,
      });

      const state1 = await generateOAuthState(discordId);
      const state2 = await generateOAuthState(discordId);

      expect(state1).not.toBe(state2);
    });

    it('should set expiration to 10 minutes from now', async () => {
      const discordId = 'discord-user-123';
      const beforeTime = Date.now() + 10 * 60 * 1000;

      mockPrisma.linkToken.deleteMany.mockResolvedValueOnce({ count: 0 });
      mockPrisma.linkToken.create.mockResolvedValueOnce({
        id: 'link-token-id',
        token: 'mock-state-token',
        discordId,
        purpose: 'oauth_state',
        expiresAt: new Date(beforeTime),
        used: false,
      });

      await generateOAuthState(discordId);

      const afterTime = Date.now() + 10 * 60 * 1000;

      const createCall = mockPrisma.linkToken.create.mock.calls[0][0];
      const expiresAt = createCall.data.expiresAt.getTime();

      expect(expiresAt).toBeGreaterThanOrEqual(beforeTime - 100); // Allow 100ms tolerance
      expect(expiresAt).toBeLessThanOrEqual(afterTime + 100);
    });
  });

  describe('validateOAuthState', () => {
    it('should validate correct state and return Discord ID', async () => {
      const discordId = 'discord-user-123';
      const state = 'valid-state-token';

      mockPrisma.linkToken.findUnique.mockResolvedValueOnce({
        id: 'link-token-id',
        token: state,
        discordId,
        purpose: 'oauth_state',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes from now
        used: false,
      });

      mockPrisma.linkToken.updateMany.mockResolvedValueOnce({ count: 1 });

      const result = await validateOAuthState(state);

      expect(result).toBe(discordId);
      expect(mockPrisma.linkToken.findUnique).toHaveBeenCalledWith({
        where: { token: state },
      });
      expect(mockPrisma.linkToken.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'link-token-id',
          used: false,
        },
        data: { used: true },
      });
    });

    it('should return null when state not found in database', async () => {
      const state = 'nonexistent-state';

      mockPrisma.linkToken.findUnique.mockResolvedValueOnce(null);

      const result = await validateOAuthState(state);

      expect(result).toBeNull();
      expect(mockPrisma.linkToken.updateMany).not.toHaveBeenCalled();
    });

    it('should return null when state has wrong purpose', async () => {
      const state = 'wrong-purpose-state';

      mockPrisma.linkToken.findUnique.mockResolvedValueOnce({
        id: 'link-token-id',
        token: state,
        discordId: 'discord-user-123',
        purpose: 'roblox_link', // Wrong purpose
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        used: false,
      });

      const result = await validateOAuthState(state);

      expect(result).toBeNull();
      expect(mockPrisma.linkToken.updateMany).not.toHaveBeenCalled();
    });

    it('should return null and delete expired state', async () => {
      const state = 'expired-state';
      const expiredDate = new Date(Date.now() - 1 * 60 * 1000); // 1 minute ago

      mockPrisma.linkToken.findUnique.mockResolvedValueOnce({
        id: 'link-token-id',
        token: state,
        discordId: 'discord-user-123',
        purpose: 'oauth_state',
        expiresAt: expiredDate,
        used: false,
      });

      mockPrisma.linkToken.delete.mockResolvedValueOnce({
        id: 'link-token-id',
        token: state,
        discordId: 'discord-user-123',
        purpose: 'oauth_state',
        expiresAt: expiredDate,
        used: false,
      });

      const result = await validateOAuthState(state);

      expect(result).toBeNull();
      expect(mockPrisma.linkToken.delete).toHaveBeenCalledWith({
        where: { id: 'link-token-id' },
      });
      expect(mockPrisma.linkToken.updateMany).not.toHaveBeenCalled();
    });

    it('should return null when state has already been used', async () => {
      const state = 'used-state';

      mockPrisma.linkToken.findUnique.mockResolvedValueOnce({
        id: 'link-token-id',
        token: state,
        discordId: 'discord-user-123',
        purpose: 'oauth_state',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        used: true, // Already used
      });

      const result = await validateOAuthState(state);

      expect(result).toBeNull();
      expect(mockPrisma.linkToken.updateMany).not.toHaveBeenCalled();
    });

    it('should return null when state is undefined', async () => {
      const result = await validateOAuthState(undefined);

      expect(result).toBeNull();
      expect(mockPrisma.linkToken.findUnique).not.toHaveBeenCalled();
    });

    it('should mark state as used after successful validation', async () => {
      const discordId = 'discord-user-456';
      const state = 'valid-unused-state';

      mockPrisma.linkToken.findUnique.mockResolvedValueOnce({
        id: 'link-token-id-2',
        token: state,
        discordId,
        purpose: 'oauth_state',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        used: false,
      });

      mockPrisma.linkToken.updateMany.mockResolvedValueOnce({ count: 1 });

      const result = await validateOAuthState(state);

      expect(result).toBe(discordId);
      expect(mockPrisma.linkToken.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'link-token-id-2',
          used: false,
        },
        data: { used: true },
      });
    });
  });
});
