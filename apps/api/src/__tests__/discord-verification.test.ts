import {
  verifyDiscordUser,
  validateDiscordUser,
  generateOAuthState,
  validateOAuthState,
} from '../lib/discord-verification.js';

// Mock fetch globally
global.fetch = jest.fn();

describe('Discord Verification Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Set up environment variables
    process.env.DISCORD_BOT_TOKEN = 'test-bot-token';
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
    it('should generate state with correct format', () => {
      const discordId = 'discord-user-123';
      const state = generateOAuthState(discordId);

      expect(state).toMatch(/^discord_discord-user-123_\d+_[a-z0-9]+$/);
    });

    it('should generate unique states for same user', () => {
      const discordId = 'discord-user-123';
      const state1 = generateOAuthState(discordId);
      const state2 = generateOAuthState(discordId);

      expect(state1).not.toBe(state2);
    });

    it('should include timestamp in state', () => {
      const discordId = 'discord-user-123';
      const beforeTime = Date.now();
      const state = generateOAuthState(discordId);
      const afterTime = Date.now();

      const parts = state.split('_');
      const timestamp = parseInt(parts[2] || '0', 10);

      expect(timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(timestamp).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('validateOAuthState', () => {
    it('should validate correct state', () => {
      const discordId = 'discord-user-123';
      const timestamp = Date.now();
      const random = 'abc123';
      const state = `discord_${discordId}_${timestamp}_${random}`;

      const result = validateOAuthState(state, discordId);

      expect(result).toBe(true);
    });

    it('should reject state with wrong Discord ID', () => {
      const discordId = 'discord-user-123';
      const timestamp = Date.now();
      const random = 'abc123';
      const state = `discord_different-user_${timestamp}_${random}`;

      const result = validateOAuthState(state, discordId);

      expect(result).toBe(false);
    });

    it('should reject state with wrong prefix', () => {
      const discordId = 'discord-user-123';
      const timestamp = Date.now();
      const random = 'abc123';
      const state = `wrong_${discordId}_${timestamp}_${random}`;

      const result = validateOAuthState(state, discordId);

      expect(result).toBe(false);
    });

    it('should reject state with missing parts', () => {
      const discordId = 'discord-user-123';
      const state = `discord_${discordId}_123`; // Missing random part

      const result = validateOAuthState(state, discordId);

      expect(result).toBe(false);
    });

    it('should reject state with invalid timestamp', () => {
      const discordId = 'discord-user-123';
      const state = `discord_${discordId}_invalid_timestamp_abc123`;

      const result = validateOAuthState(state, discordId);

      expect(result).toBe(false);
    });

    it('should reject expired state (older than 10 minutes)', () => {
      const discordId = 'discord-user-123';
      const expiredTimestamp = Date.now() - 11 * 60 * 1000; // 11 minutes ago
      const random = 'abc123';
      const state = `discord_${discordId}_${expiredTimestamp}_${random}`;

      const result = validateOAuthState(state, discordId);

      expect(result).toBe(false);
    });

    it('should accept state within 10 minutes', () => {
      const discordId = 'discord-user-123';
      const recentTimestamp = Date.now() - 5 * 60 * 1000; // 5 minutes ago
      const random = 'abc123';
      const state = `discord_${discordId}_${recentTimestamp}_${random}`;

      const result = validateOAuthState(state, discordId);

      expect(result).toBe(true);
    });

    it('should return false when state is undefined', () => {
      const discordId = 'discord-user-123';

      const result = validateOAuthState(undefined, discordId);

      expect(result).toBe(false);
    });

    it('should return false when discordId is undefined', () => {
      const timestamp = Date.now();
      const random = 'abc123';
      const state = `discord_discord-user-123_${timestamp}_${random}`;

      const result = validateOAuthState(state, undefined);

      expect(result).toBe(false);
    });

    it('should return false when both are undefined', () => {
      const result = validateOAuthState(undefined, undefined);

      expect(result).toBe(false);
    });
  });
});
