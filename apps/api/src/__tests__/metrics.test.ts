import request from 'supertest';

// Mock the database
jest.mock('@bloxtr8/database', () => ({
  PrismaClient: jest.fn(() => ({
    $disconnect: jest.fn(),
  })),
}));

import app from '../index.js';

describe('Metrics API Routes', () => {
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
