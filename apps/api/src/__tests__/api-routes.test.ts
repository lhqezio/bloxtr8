import request from 'supertest';

// Mock Prisma client before importing app
jest.mock('@bloxtr8/database', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    listing: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
  })),
}));

import app from '../index.js';

describe('API Routes Integration', () => {
  describe('General API behavior', () => {
    it('should handle CORS headers correctly', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.headers).toHaveProperty(
        'access-control-allow-credentials'
      );
    });

    it('should return JSON content type for API responses', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    it('should handle 404 for non-existent API routes', async () => {
      const response = await request(app)
        .get('/api/non-existent-endpoint')
        .expect(404);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toHaveProperty('type');
      expect(response.body).toHaveProperty('title', 'Not Found');
      expect(response.body).toHaveProperty('status', 404);
    });
  });
});
