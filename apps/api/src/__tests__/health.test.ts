import request from 'supertest';

// Mock Prisma client before importing app
jest.mock('@bloxtr8/database', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    listing: {
      create: jest.fn().mockResolvedValue({}),
    },
  })),
}));

// Mock PostgreSQL Pool to prevent hanging on database connection
const mockQuery = jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] });
jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    query: mockQuery,
    end: jest.fn(),
  })),
}));

import app from '../app.js';

describe('Health Endpoint', () => {
  beforeEach(() => {
    // Reset mock to return success by default
    mockQuery.mockResolvedValue({ rows: [{ '?column?': 1 }] });
  });

  it('should return health status with 200', async () => {
    const response = await request(app).get('/health').expect(200);

    expect(response.body).toHaveProperty('status', 'ok');
    expect(response.body).toHaveProperty('version', '1.0.0');
    expect(response.body).toHaveProperty('message', 'Bloxtr8 API is running');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('db');
  });

  it('should return proper content type', async () => {
    const response = await request(app).get('/health').expect(200);

    expect(response.headers['content-type']).toMatch(/application\/json/);
  });

  it('should handle database connection errors', async () => {
    // This tests the branch where pool.query throws an error
    mockQuery.mockRejectedValue(new Error('Connection failed'));
    const response = await request(app).get('/health').expect(200);

    // The health check should still return 200 but with db status error
    expect(response.body).toHaveProperty('status', 'ok');
    expect(response.body).toHaveProperty('db', 'error');
    expect(response.body).toHaveProperty('dbError');
    expect(response.body).toHaveProperty('message', 'Bloxtr8 API is running');
  });
});
