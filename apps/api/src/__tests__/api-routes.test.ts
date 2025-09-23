import request from 'supertest';

// Mock Prisma client before importing app
jest.mock('@bloxtr8/database', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    listing: {
      create: jest.fn().mockResolvedValue({
        id: 'test-listing-id',
        title: 'Test Listing',
        summary: 'Test summary',
        price: 10000,
        category: 'Test Category',
        userId: 'test-seller-id',
        guildId: null,
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    },
  })),
}));

import app from '../index.js';

describe('API Routes', () => {
  describe('POST /api/contracts/:id/upload', () => {
    it('should return 404 for missing contract ID (double slash)', async () => {
      const response = await request(app)
        .post('/api/contracts//upload')
        .expect(404);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toHaveProperty(
        'type',
        'https://bloxtr8.com/problems/not-found'
      );
      expect(response.body).toHaveProperty('title', 'Not Found');
      expect(response.body).toHaveProperty('status', 404);
      expect(response.body).toHaveProperty('detail');
      expect(response.body).toHaveProperty(
        'instance',
        '/api/contracts//upload'
      );
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should return 400 for empty contract ID', async () => {
      const response = await request(app)
        .post('/api/contracts/ /upload')
        .expect(400);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toHaveProperty('type');
      expect(response.body).toHaveProperty('title', 'Bad Request');
      expect(response.body).toHaveProperty('status', 400);
      expect(response.body).toHaveProperty('detail');
      expect(response.body).toHaveProperty('instance');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should return presigned upload URL for valid contract ID', async () => {
      const response = await request(app)
        .post('/api/contracts/valid-id/upload')
        .expect(200);

      expect(response.body).toHaveProperty('uploadUrl');
      expect(response.body).toHaveProperty('key', 'contracts/valid-id.pdf');
      expect(response.body).toHaveProperty('expiresIn', 900);
    });
  });

  describe('GET /api/contracts/:id/pdf', () => {
    it('should return 404 for missing contract ID (double slash)', async () => {
      const response = await request(app)
        .get('/api/contracts//pdf')
        .expect(404);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toHaveProperty(
        'type',
        'https://bloxtr8.com/problems/not-found'
      );
      expect(response.body).toHaveProperty('title', 'Not Found');
      expect(response.body).toHaveProperty('status', 404);
      expect(response.body).toHaveProperty('detail');
      expect(response.body).toHaveProperty('instance', '/api/contracts//pdf');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should return 400 for empty contract ID', async () => {
      const response = await request(app)
        .get('/api/contracts/ /pdf')
        .expect(400);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toHaveProperty('type');
      expect(response.body).toHaveProperty('title', 'Bad Request');
      expect(response.body).toHaveProperty('status', 400);
      expect(response.body).toHaveProperty('detail');
      expect(response.body).toHaveProperty('instance');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should return presigned download URL for valid contract ID', async () => {
      const response = await request(app)
        .get('/api/contracts/valid-id/pdf')
        .expect(200);

      expect(response.body).toHaveProperty('downloadUrl');
      expect(response.body).toHaveProperty('key', 'contracts/valid-id.pdf');
      expect(response.body).toHaveProperty('expiresIn', 3600);
    });
  });

  describe('POST /api/listings', () => {
    it('should return 400 for invalid payload - missing required fields', async () => {
      const response = await request(app)
        .post('/api/listings')
        .send({})
        .expect(400);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toHaveProperty('type');
      expect(response.body).toHaveProperty('title', 'Bad Request');
      expect(response.body).toHaveProperty('status', 400);
      expect(response.body).toHaveProperty('detail');
      expect(response.body.detail).toContain('Validation failed');
    });

    it('should return 400 for invalid payload - invalid price', async () => {
      const response = await request(app)
        .post('/api/listings')
        .send({
          title: 'Test Listing',
          summary: 'Test summary',
          price: -100, // Invalid negative price
          category: 'Test Category',
          sellerId: 'test-seller-id',
        })
        .expect(400);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toHaveProperty('type');
      expect(response.body).toHaveProperty('title', 'Bad Request');
      expect(response.body).toHaveProperty('status', 400);
      expect(response.body).toHaveProperty('detail');
      expect(response.body.detail).toContain('Validation failed');
    });

    it('should return 400 for invalid payload - empty title', async () => {
      const response = await request(app)
        .post('/api/listings')
        .send({
          title: '', // Empty title
          summary: 'Test summary',
          price: 10000,
          category: 'Test Category',
          sellerId: 'test-seller-id',
        })
        .expect(400);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toHaveProperty('type');
      expect(response.body).toHaveProperty('title', 'Bad Request');
      expect(response.body).toHaveProperty('status', 400);
      expect(response.body).toHaveProperty('detail');
      expect(response.body.detail).toContain('Validation failed');
    });

    it('should return 201 with listing id for valid payload', async () => {
      const response = await request(app)
        .post('/api/listings')
        .send({
          title: 'Test Listing',
          summary: 'Test summary for the listing',
          price: 10000, // $100.00 in cents
          category: 'Test Category',
          sellerId: 'test-seller-id',
        })
        .expect(201);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toHaveProperty('id');
      expect(typeof response.body.id).toBe('string');
      expect(response.body.id.length).toBeGreaterThan(0);
    });

    it('should return 201 with listing id for valid payload with optional guildId', async () => {
      const response = await request(app)
        .post('/api/listings')
        .send({
          title: 'Test Listing with Guild',
          summary: 'Test summary for the listing with guild',
          price: 15000, // $150.00 in cents
          category: 'Test Category',
          sellerId: 'test-seller-id',
          guildId: 'test-guild-id',
        })
        .expect(201);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toHaveProperty('id');
      expect(typeof response.body.id).toBe('string');
      expect(response.body.id.length).toBeGreaterThan(0);
    });
  });
});
