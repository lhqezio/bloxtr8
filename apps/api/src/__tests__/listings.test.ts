import request from 'supertest';

// Mock Prisma client before importing app
const mockFindUnique = jest.fn();
const mockCreate = jest.fn().mockResolvedValue({
  id: 'test-listing-id',
  title: 'Test Listing',
  summary: 'Test summary',
  price: BigInt(10000), // BigInt to match Prisma schema
  category: 'Test Category',
  userId: 'test-seller-id',
  guildId: null,
  status: 'ACTIVE',
  createdAt: new Date(),
  updatedAt: new Date(),
});
const mockGuildFindUnique = jest.fn();

jest.mock('@bloxtr8/database', () => ({
  prisma: {
    listing: {
      create: mockCreate,
      findUnique: mockFindUnique,
    },
    guild: {
      findUnique: mockGuildFindUnique,
    },
  },
}));

import app from '../index.js';

describe('Listings API Routes', () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockFindUnique.mockClear();
    mockCreate.mockClear();
    mockGuildFindUnique.mockClear();

    // Default mock for guild lookup - return a guild when guildId is provided
    mockGuildFindUnique.mockImplementation(({ where }) => {
      if (where.discordId === 'test-guild-id') {
        return Promise.resolve({ id: 'internal-guild-id' });
      }
      return Promise.resolve(null);
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

  describe('GET /api/listings/:id', () => {
    const mockListing = {
      id: 'test-listing-id',
      title: 'Test Listing',
      summary: 'Test summary for the listing',
      price: BigInt(10000), // BigInt to match Prisma schema
      category: 'Test Category',
      status: 'ACTIVE',
      userId: 'test-seller-id',
      guildId: null,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };

    it('should return 404 for missing listing ID (double slash)', async () => {
      const response = await request(app).get('/api/listings//').expect(404);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toHaveProperty(
        'type',
        'https://bloxtr8.com/problems/not-found'
      );
      expect(response.body).toHaveProperty('title', 'Not Found');
      expect(response.body).toHaveProperty('status', 404);
      expect(response.body).toHaveProperty('detail');
      expect(response.body).toHaveProperty('instance', '/api/listings//');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should return 400 for empty listing ID', async () => {
      const response = await request(app)
        .get('/api/listings/%20') // URL encoded space
        .expect(400);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toHaveProperty('type');
      expect(response.body).toHaveProperty('title', 'Bad Request');
      expect(response.body).toHaveProperty('status', 400);
      expect(response.body).toHaveProperty('detail');
      expect(response.body.detail).toContain('Listing ID is required');
      expect(response.body).toHaveProperty('instance');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should return 404 when listing is not found', async () => {
      mockFindUnique.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/listings/non-existent-id')
        .expect(404);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toHaveProperty('type');
      expect(response.body).toHaveProperty('title', 'Not Found');
      expect(response.body).toHaveProperty('status', 404);
      expect(response.body).toHaveProperty('detail');
      expect(response.body.detail).toContain('Listing not found');
      expect(response.body).toHaveProperty('instance');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should return 200 with listing data when found', async () => {
      mockFindUnique.mockResolvedValue(mockListing);

      const response = await request(app)
        .get('/api/listings/test-listing-id')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      // Note: price is now serialized as string due to BigInt
      expect(response.body).toHaveProperty('id', 'test-listing-id');
      expect(response.body).toHaveProperty('title', 'Test Listing');
      expect(response.body).toHaveProperty(
        'summary',
        'Test summary for the listing'
      );
      expect(response.body).toHaveProperty('price', '10000'); // BigInt serialized as string
      expect(response.body).toHaveProperty('category', 'Test Category');
      expect(response.body).toHaveProperty('status', 'ACTIVE');
      expect(response.body).toHaveProperty('userId', 'test-seller-id');
      expect(response.body).toHaveProperty('guildId', null);
      expect(response.body).toHaveProperty('createdAt');
      expect(response.body).toHaveProperty('updatedAt');
    });

    it('should return 200 with listing data including guildId when found', async () => {
      const listingWithGuild = {
        ...mockListing,
        guildId: 'test-guild-id',
      };

      mockFindUnique.mockResolvedValue(listingWithGuild);

      const response = await request(app)
        .get('/api/listings/test-listing-id')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      // Note: price is now serialized as string due to BigInt
      expect(response.body).toHaveProperty('price', '10000'); // BigInt serialized as string
      expect(response.body).toHaveProperty('guildId', 'test-guild-id');
    });

    it('should call prisma with correct parameters', async () => {
      mockFindUnique.mockResolvedValue(mockListing);

      await request(app).get('/api/listings/test-listing-id').expect(200);

      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { id: 'test-listing-id' },
        select: {
          id: true,
          title: true,
          summary: true,
          price: true,
          category: true,
          status: true,
          visibility: true,
          threadId: true,
          channelId: true,
          priceRange: true,
          createdAt: true,
          updatedAt: true,
          userId: true,
          guildId: true,
          user: {
            select: {
              name: true,
              kycTier: true,
              kycVerified: true,
            },
          },
          guild: {
            select: {
              name: true,
              discordId: true,
            },
          },
          robloxSnapshots: {
            select: {
              gameName: true,
              gameDescription: true,
              thumbnailUrl: true,
              playerCount: true,
              visits: true,
              verifiedOwnership: true,
            },
          },
        },
      });
    });
  });
});
