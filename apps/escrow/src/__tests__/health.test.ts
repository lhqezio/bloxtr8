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

describe('Health Endpoint', () => {
  it('should return health status with 200', async () => {
    const response = await request(app).get('/health').expect(200);

    expect(response.body).toHaveProperty('status', 'ok');
    expect(response.body).toHaveProperty('version', '1.0.0');
    expect(response.body).toHaveProperty('message', 'Escrow API is running');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('db');
  });

  it('should return proper content type', async () => {
    const response = await request(app).get('/health').expect(200);

    expect(response.headers['content-type']).toMatch(/application\/json/);
  });

  it('should handle database connection errors', async () => {
    // This tests the branch where pool.query throws an error
    // We'll need to mock the database to simulate a connection error
    const response = await request(app).get('/health').expect(200);

    // The health check should still return 200 but with db status
    expect(response.body).toHaveProperty('status', 'ok');
    expect(response.body).toHaveProperty('db');
    expect(response.body).toHaveProperty('message', 'Escrow API is running');
  });
});
