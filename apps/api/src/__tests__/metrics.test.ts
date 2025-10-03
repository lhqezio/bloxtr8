import request from 'supertest';

import app from '../index.js';
import { metrics } from '../lib/metrics.js';

// Mock the database
jest.mock('@bloxtr8/database', () => ({
  PrismaClient: jest.fn(() => ({
    $disconnect: jest.fn(),
  })),
}));

describe('Metrics API Routes', () => {
  const originalConsoleInfo = console.info;

  beforeEach(() => {
    jest.clearAllMocks();
    console.info = jest.fn();
  });

  afterEach(() => {
    console.info = originalConsoleInfo;
  });

  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/api/health').expect(200);

      expect(response.body).toMatchObject({
        status: 'healthy',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
      });
      expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
      expect(response.body.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('GET /api/metrics', () => {
    it('should return metrics data', async () => {
      const response = await request(app).get('/api/metrics').expect(200);

      expect(response.body).toMatchObject({
        oauth: {
          attempts: expect.any(Number),
          success: expect.any(Number),
          failures: expect.any(Number),
          successRate: expect.stringMatching(/^\d+\.\d{2}%$/),
        },
        validation: {
          discordFailures: expect.any(Number),
          robloxFailures: expect.any(Number),
        },
        timestamp: expect.any(String),
      });
      expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
    });

    it('should return zero success rate when no attempts', async () => {
      const response = await request(app).get('/api/metrics').expect(200);

      expect(response.body.oauth.successRate).toBe('0.00%');
    });
  });
});

describe('MetricsCollector', () => {
  const originalConsoleInfo = console.info;

  beforeEach(() => {
    jest.clearAllMocks();
    console.info = jest.fn();
  });

  afterEach(() => {
    console.info = originalConsoleInfo;
  });

  describe('incrementOAuthAttempt', () => {
    it('should increment oauth attempts counter', () => {
      const initialMetrics = metrics.getMetrics();
      const initialAttempts = initialMetrics.oauthAttempts;

      metrics.incrementOAuthAttempt();

      const newMetrics = metrics.getMetrics();
      expect(newMetrics.oauthAttempts).toBe(initialAttempts + 1);
      expect(console.info).toHaveBeenCalledWith('METRIC: oauth.attempt', {
        count: initialAttempts + 1,
      });
    });
  });

  describe('incrementOAuthSuccess', () => {
    it('should increment oauth success counter', () => {
      const initialMetrics = metrics.getMetrics();
      const initialSuccess = initialMetrics.oauthSuccess;

      metrics.incrementOAuthSuccess();

      const newMetrics = metrics.getMetrics();
      expect(newMetrics.oauthSuccess).toBe(initialSuccess + 1);
      expect(console.info).toHaveBeenCalledWith('METRIC: oauth.success', {
        count: initialSuccess + 1,
      });
    });
  });

  describe('incrementOAuthFailure', () => {
    it('should increment oauth failures counter', () => {
      const initialMetrics = metrics.getMetrics();
      const initialFailures = initialMetrics.oauthFailures;

      metrics.incrementOAuthFailure();

      const newMetrics = metrics.getMetrics();
      expect(newMetrics.oauthFailures).toBe(initialFailures + 1);
      expect(console.info).toHaveBeenCalledWith('METRIC: oauth.failure', {
        count: initialFailures + 1,
      });
    });
  });

  describe('incrementDiscordValidationFailure', () => {
    it('should increment discord validation failures counter', () => {
      const initialMetrics = metrics.getMetrics();
      const initialFailures = initialMetrics.discordValidationFailures;

      metrics.incrementDiscordValidationFailure();

      const newMetrics = metrics.getMetrics();
      expect(newMetrics.discordValidationFailures).toBe(initialFailures + 1);
      expect(console.info).toHaveBeenCalledWith(
        'METRIC: discord.validation.failure',
        {
          count: initialFailures + 1,
        }
      );
    });
  });

  describe('incrementRobloxValidationFailure', () => {
    it('should increment roblox validation failures counter', () => {
      const initialMetrics = metrics.getMetrics();
      const initialFailures = initialMetrics.robloxValidationFailures;

      metrics.incrementRobloxValidationFailure();

      const newMetrics = metrics.getMetrics();
      expect(newMetrics.robloxValidationFailures).toBe(initialFailures + 1);
      expect(console.info).toHaveBeenCalledWith(
        'METRIC: roblox.validation.failure',
        {
          count: initialFailures + 1,
        }
      );
    });
  });

  describe('getMetrics', () => {
    it('should return a copy of metrics data', () => {
      const metrics1 = metrics.getMetrics();
      const metrics2 = metrics.getMetrics();

      expect(metrics1).toEqual(metrics2);
      expect(metrics1).not.toBe(metrics2); // Should be different objects
    });
  });

  describe('getSuccessRate', () => {
    it('should return 0 when no attempts have been made', () => {
      // Get current state and calculate expected rate
      const currentMetrics = metrics.getMetrics();
      const expectedRate =
        currentMetrics.oauthAttempts > 0
          ? (currentMetrics.oauthSuccess / currentMetrics.oauthAttempts) * 100
          : 0;

      const successRate = metrics.getSuccessRate();
      expect(successRate).toBe(expectedRate);
    });

    it('should calculate success rate correctly', () => {
      // Get current state
      const currentMetrics = metrics.getMetrics();
      const initialAttempts = currentMetrics.oauthAttempts;
      const initialSuccess = currentMetrics.oauthSuccess;

      // Add some attempts and successes
      for (let i = 0; i < 10; i++) {
        metrics.incrementOAuthAttempt();
      }
      for (let i = 0; i < 7; i++) {
        metrics.incrementOAuthSuccess();
      }

      const successRate = metrics.getSuccessRate();
      const expectedRate =
        ((initialSuccess + 7) / (initialAttempts + 10)) * 100;
      expect(successRate).toBeCloseTo(expectedRate, 1);
    });

    it('should handle partial success rates', () => {
      // Add one attempt and one success
      metrics.incrementOAuthAttempt();
      metrics.incrementOAuthSuccess();

      const successRate = metrics.getSuccessRate();
      expect(successRate).toBeGreaterThan(0);
    });
  });
});
