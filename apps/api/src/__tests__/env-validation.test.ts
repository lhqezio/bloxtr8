import {
  validateEnvironment,
  getEnvVar,
  isDevelopment,
  isProduction,
  isTest,
} from '../lib/env-validation.js';

describe('Environment Validation', () => {
  const originalEnv = process.env;
  const originalConsoleLog = console.log;
  const originalConsoleWarn = console.warn;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    console.log = jest.fn();
    console.warn = jest.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
  });

  describe('validateEnvironment', () => {
    it('should pass when all required environment variables are set', () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
      process.env.DISCORD_CLIENT_ID = 'test-client-id';
      process.env.DISCORD_CLIENT_SECRET = 'test-client-secret';

      expect(() => validateEnvironment()).not.toThrow();
      expect(console.log).toHaveBeenCalledWith(
        '✅ Environment variables validated successfully'
      );
    });

    it('should throw error when DATABASE_URL is missing', () => {
      process.env.DISCORD_CLIENT_ID = 'test-client-id';
      process.env.DISCORD_CLIENT_SECRET = 'test-client-secret';

      expect(() => validateEnvironment()).toThrow(
        'Missing required environment variables: DATABASE_URL\n' +
          'Please check your .env file or environment configuration.'
      );
    });

    it('should throw error when DISCORD_CLIENT_ID is missing', () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
      process.env.DISCORD_CLIENT_SECRET = 'test-client-secret';

      expect(() => validateEnvironment()).toThrow(
        'Missing required environment variables: DISCORD_CLIENT_ID\n' +
          'Please check your .env file or environment configuration.'
      );
    });

    it('should throw error when DISCORD_CLIENT_SECRET is missing', () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
      process.env.DISCORD_CLIENT_ID = 'test-client-id';

      expect(() => validateEnvironment()).toThrow(
        'Missing required environment variables: DISCORD_CLIENT_SECRET\n' +
          'Please check your .env file or environment configuration.'
      );
    });

    it('should throw error when multiple variables are missing', () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';

      expect(() => validateEnvironment()).toThrow(
        'Missing required environment variables: DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET\n' +
          'Please check your .env file or environment configuration.'
      );
    });

    it('should warn when DATABASE_URL does not start with postgresql://', () => {
      process.env.DATABASE_URL = 'mysql://localhost:3306/test';
      process.env.DISCORD_CLIENT_ID = 'test-client-id';
      process.env.DISCORD_CLIENT_SECRET = 'test-client-secret';

      validateEnvironment();

      expect(console.warn).toHaveBeenCalledWith(
        '⚠️  DATABASE_URL should start with "postgresql://"'
      );
    });

    it('should not warn when DATABASE_URL starts with postgresql://', () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
      process.env.DISCORD_CLIENT_ID = 'test-client-id';
      process.env.DISCORD_CLIENT_SECRET = 'test-client-secret';

      validateEnvironment();

      expect(console.warn).not.toHaveBeenCalled();
    });

    it('should not warn when DATABASE_URL is not set', () => {
      process.env.DISCORD_CLIENT_ID = 'test-client-id';
      process.env.DISCORD_CLIENT_SECRET = 'test-client-secret';

      expect(() => validateEnvironment()).toThrow();
      expect(console.warn).not.toHaveBeenCalled();
    });
  });

  describe('getEnvVar', () => {
    it('should return environment variable value when set', () => {
      process.env.TEST_VAR = 'test-value';

      const result = getEnvVar('TEST_VAR');

      expect(result).toBe('test-value');
    });

    it('should return default value when environment variable is not set', () => {
      delete process.env.TEST_VAR;

      const result = getEnvVar('TEST_VAR', 'default-value');

      expect(result).toBe('default-value');
    });

    it('should throw error when environment variable is not set and no default provided', () => {
      delete process.env.TEST_VAR;

      expect(() => getEnvVar('TEST_VAR')).toThrow(
        'Environment variable TEST_VAR is not set'
      );
    });

    it('should return empty string when environment variable is empty and no default provided', () => {
      process.env.TEST_VAR = '';

      expect(() => getEnvVar('TEST_VAR')).toThrow(
        'Environment variable TEST_VAR is not set'
      );
    });

    it('should return default value when environment variable is empty string', () => {
      process.env.TEST_VAR = '';

      const result = getEnvVar('TEST_VAR', 'default-value');

      expect(result).toBe('default-value');
    });
  });

  describe('isDevelopment', () => {
    it('should return true when NODE_ENV is development', () => {
      process.env.NODE_ENV = 'development';

      expect(isDevelopment()).toBe(true);
    });

    it('should return false when NODE_ENV is not development', () => {
      process.env.NODE_ENV = 'production';

      expect(isDevelopment()).toBe(false);
    });

    it('should return false when NODE_ENV is not set', () => {
      delete process.env.NODE_ENV;

      expect(isDevelopment()).toBe(false);
    });
  });

  describe('isProduction', () => {
    it('should return true when NODE_ENV is production', () => {
      process.env.NODE_ENV = 'production';

      expect(isProduction()).toBe(true);
    });

    it('should return false when NODE_ENV is not production', () => {
      process.env.NODE_ENV = 'development';

      expect(isProduction()).toBe(false);
    });

    it('should return false when NODE_ENV is not set', () => {
      delete process.env.NODE_ENV;

      expect(isProduction()).toBe(false);
    });
  });

  describe('isTest', () => {
    it('should return true when NODE_ENV is test', () => {
      process.env.NODE_ENV = 'test';

      expect(isTest()).toBe(true);
    });

    it('should return false when NODE_ENV is not test', () => {
      process.env.NODE_ENV = 'development';

      expect(isTest()).toBe(false);
    });

    it('should return false when NODE_ENV is not set', () => {
      delete process.env.NODE_ENV;

      expect(isTest()).toBe(false);
    });
  });
});
