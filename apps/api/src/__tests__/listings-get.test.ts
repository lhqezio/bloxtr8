import request from 'supertest';

// Mock Prisma
const mockFindMany = jest.fn();
const mockCount = jest.fn();

jest.mock('@bloxtr8/database', () => ({
  prisma: {
    listing: {
      findMany: mockFindMany,
      count: mockCount,
    },
  },
}));

import app from '../index.js';

describe('GET /api/listings', () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockFindMany.mockClear();
    mockCount.mockClear();
  });

  it('should return listings with pagination', async () => {
    const mockListings = [
      {
        id: 'listing-1',
        title: 'Test Game 1',
        summary: 'A test game',
        price: 10000,
        category: 'Games',
        status: 'ACTIVE',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        userId: 'user-1',
        guildId: null,
        user: {
          name: 'Test User',
          email: 'test@example.com',
        },
        guild: null,
      },
      {
        id: 'listing-2',
        title: 'Test Game 2',
        summary: 'Another test game',
        price: 20000,
        category: 'Games',
        status: 'ACTIVE',
        createdAt: '2024-01-02T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
        userId: 'user-2',
        guildId: null,
        user: {
          name: 'Test User 2',
          email: 'test2@example.com',
        },
        guild: null,
      },
    ];

    mockFindMany.mockResolvedValue(mockListings);
    mockCount.mockResolvedValue(2);

    const response = await request(app)
      .get('/api/listings')
      .expect(200);

    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toHaveProperty('listings');
    expect(response.body).toHaveProperty('pagination');
    expect(response.body.listings).toHaveLength(2);
    expect(response.body.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 2,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    });
  });

  it('should handle pagination parameters', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await request(app)
      .get('/api/listings?page=2&limit=5')
      .expect(200);

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {},
      select: expect.any(Object),
      orderBy: { createdAt: 'desc' },
      skip: 5, // (page - 1) * limit = (2 - 1) * 5 = 5
      take: 5,
    });
  });

  it('should handle filtering by status', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await request(app)
      .get('/api/listings?status=ACTIVE')
      .expect(200);

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { status: 'ACTIVE' },
      select: expect.any(Object),
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 10,
    });
  });

  it('should handle filtering by category', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await request(app)
      .get('/api/listings?category=Games')
      .expect(200);

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { category: 'Games' },
      select: expect.any(Object),
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 10,
    });
  });

  it('should handle filtering by userId', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await request(app)
      .get('/api/listings?userId=user-123')
      .expect(200);

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: 'user-123' },
      select: expect.any(Object),
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 10,
    });
  });

  it('should handle multiple filters', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await request(app)
      .get('/api/listings?status=ACTIVE&category=Games&userId=user-123')
      .expect(200);

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        status: 'ACTIVE',
        category: 'Games',
        userId: 'user-123',
      },
      select: expect.any(Object),
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 10,
    });
  });

  it('should enforce maximum limit of 50', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await request(app)
      .get('/api/listings?limit=100')
      .expect(200);

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {},
      select: expect.any(Object),
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 50, // Should be capped at 50
    });
  });

  it('should return 400 for invalid page parameter', async () => {
    const response = await request(app)
      .get('/api/listings?page=0')
      .expect(400);

    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toHaveProperty('type');
    expect(response.body).toHaveProperty('title', 'Bad Request');
    expect(response.body).toHaveProperty('status', 400);
  });

  it('should return 400 for invalid limit parameter', async () => {
    const response = await request(app)
      .get('/api/listings?limit=0')
      .expect(400);

    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toHaveProperty('type');
    expect(response.body).toHaveProperty('title', 'Bad Request');
    expect(response.body).toHaveProperty('status', 400);
  });
});
