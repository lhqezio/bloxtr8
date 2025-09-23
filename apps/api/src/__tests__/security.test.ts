import request from 'supertest';

// Mock Prisma client before importing app
jest.mock('@bloxtr8/database', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    listing: {
      create: jest.fn().mockResolvedValue({}),
    },
  })),
}));

import app from '../index.js';

describe('Security Middleware', () => {
  describe('Security Headers', () => {
    it('should include security headers from helmet', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.headers).toHaveProperty(
        'x-content-type-options',
        'nosniff'
      );
      expect(response.headers).toHaveProperty('x-frame-options', 'SAMEORIGIN');
      expect(response.headers).toHaveProperty('x-xss-protection', '0');
    });

    it('should include CORS headers', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.headers).toHaveProperty(
        'access-control-allow-credentials'
      );
      expect(response.headers).toHaveProperty('vary');
    });
  });

  describe('Rate Limiting', () => {
    it('should include rate limit headers', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.headers).toHaveProperty('ratelimit-limit');
      expect(response.headers).toHaveProperty('ratelimit-remaining');
      expect(response.headers).toHaveProperty('ratelimit-reset');
    });
  });
});
