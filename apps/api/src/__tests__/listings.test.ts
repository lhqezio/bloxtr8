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
const mockFindMany = jest.fn();
const mockCount = jest.fn();
const mockUpdate = jest.fn();
const mockGuildFindUnique = jest.fn();

jest.mock('@bloxtr8/database', () => ({
  prisma: {
    listing: {
      create: mockCreate,
      findUnique: mockFindUnique,
      findMany: mockFindMany,
      count: mockCount,
      update: mockUpdate,
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
    mockFindMany.mockClear();
    mockCount.mockClear();
    mockUpdate.mockClear();
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
          messageId: true,
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

  describe('GET /api/listings', () => {
    const mockListings = [
      {
        id: 'listing-1',
        title: 'Test Listing 1',
        summary: 'Test summary 1',
        price: BigInt(10000),
        category: 'Games',
        status: 'ACTIVE',
        visibility: 'PUBLIC',
        messageId: null,
        channelId: null,
        priceRange: null,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
        userId: 'user-1',
        guildId: null,
        user: {
          name: 'User 1',
          kycTier: 'TIER_1',
          kycVerified: true,
        },
        guild: null,
        robloxSnapshots: [],
      },
      {
        id: 'listing-2',
        title: 'Test Listing 2',
        summary: 'Test summary 2',
        price: BigInt(20000),
        category: 'Assets',
        status: 'ACTIVE',
        visibility: 'PUBLIC',
        messageId: null,
        channelId: null,
        priceRange: null,
        createdAt: new Date('2024-01-02'),
        updatedAt: new Date('2024-01-02'),
        userId: 'user-2',
        guildId: null,
        user: {
          name: 'User 2',
          kycTier: 'TIER_0',
          kycVerified: false,
        },
        guild: null,
        robloxSnapshots: [],
      },
    ];

    it('should return paginated listings with default parameters', async () => {
      mockFindMany.mockResolvedValue(mockListings);
      mockCount.mockResolvedValue(2);

      const response = await request(app).get('/api/listings').expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toHaveProperty('listings');
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.listings).toHaveLength(2);
      expect(response.body.pagination).toMatchObject({
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1,
        hasPrev: false,
        hasNext: false,
      });
    });

    it('should handle custom page and limit parameters', async () => {
      mockFindMany.mockResolvedValue([mockListings[0]]);
      mockCount.mockResolvedValue(15);

      const response = await request(app)
        .get('/api/listings?page=2&limit=5')
        .expect(200);

      expect(response.body.pagination).toMatchObject({
        page: 2,
        limit: 5,
        total: 15,
        totalPages: 3,
        hasPrev: true,
        hasNext: true,
      });

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 5, // (page 2 - 1) * limit 5
          take: 5,
        })
      );
    });

    it('should default to page 1 when page is 0', async () => {
      mockFindMany.mockResolvedValue(mockListings);
      mockCount.mockResolvedValue(2);

      await request(app).get('/api/listings?page=0').expect(200);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0, // page defaults to 1, so skip = (1-1) * limit = 0
        })
      );
    });

    it('should cap limit at 50 when limit is greater than 50', async () => {
      mockFindMany.mockResolvedValue(mockListings);
      mockCount.mockResolvedValue(2);

      await request(app).get('/api/listings?limit=100').expect(200);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50, // limit is capped at 50
        })
      );
    });

    it('should default to limit 10 when limit is 0', async () => {
      mockFindMany.mockResolvedValue(mockListings);
      mockCount.mockResolvedValue(2);

      await request(app).get('/api/listings?limit=0').expect(200);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10, // limit defaults to 10
        })
      );
    });

    it('should filter by status', async () => {
      mockFindMany.mockResolvedValue([mockListings[0]]);
      mockCount.mockResolvedValue(1);

      await request(app).get('/api/listings?status=ACTIVE').expect(200);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'ACTIVE' }),
        })
      );
    });

    it('should filter by category', async () => {
      mockFindMany.mockResolvedValue([mockListings[0]]);
      mockCount.mockResolvedValue(1);

      await request(app).get('/api/listings?category=Games').expect(200);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ category: 'Games' }),
        })
      );
    });

    it('should filter by userId', async () => {
      mockFindMany.mockResolvedValue([mockListings[0]]);
      mockCount.mockResolvedValue(1);

      await request(app).get('/api/listings?userId=user-1').expect(200);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-1' }),
        })
      );
    });

    it('should filter by priceRange', async () => {
      mockFindMany.mockResolvedValue([mockListings[0]]);
      mockCount.mockResolvedValue(1);

      await request(app).get('/api/listings?priceRange=UNDER_100').expect(200);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ priceRange: 'UNDER_100' }),
        })
      );
    });

    it('should show only PUBLIC listings when no guildId provided', async () => {
      mockFindMany.mockResolvedValue(mockListings);
      mockCount.mockResolvedValue(2);

      await request(app).get('/api/listings').expect(200);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ visibility: 'PUBLIC' }),
        })
      );
    });

    it('should show PUBLIC and PRIVATE listings for valid guildId', async () => {
      mockGuildFindUnique.mockResolvedValue({ id: 'internal-guild-id' });
      mockFindMany.mockResolvedValue(mockListings);
      mockCount.mockResolvedValue(2);

      await request(app).get('/api/listings?guildId=test-guild-id').expect(200);

      expect(mockGuildFindUnique).toHaveBeenCalledWith({
        where: { discordId: 'test-guild-id' },
        select: { id: true },
      });

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { visibility: 'PUBLIC' },
              {
                AND: [
                  { visibility: 'PRIVATE' },
                  { guildId: 'internal-guild-id' },
                ],
              },
            ],
          }),
        })
      );
    });

    it('should show only PUBLIC listings when guild not found', async () => {
      mockGuildFindUnique.mockResolvedValue(null);
      mockFindMany.mockResolvedValue(mockListings);
      mockCount.mockResolvedValue(2);

      await request(app).get('/api/listings?guildId=invalid-guild').expect(200);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ visibility: 'PUBLIC' }),
        })
      );
    });

    it('should filter by visibility when provided', async () => {
      mockFindMany.mockResolvedValue(mockListings);
      mockCount.mockResolvedValue(2);

      await request(app).get('/api/listings?visibility=PRIVATE').expect(200);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ visibility: 'PRIVATE' }),
        })
      );
    });

    it('should handle empty results', async () => {
      mockFindMany.mockResolvedValue([]);
      mockCount.mockResolvedValue(0);

      const response = await request(app).get('/api/listings').expect(200);

      expect(response.body.listings).toHaveLength(0);
      expect(response.body.pagination.total).toBe(0);
      expect(response.body.pagination.totalPages).toBe(0);
    });

    it('should handle database errors gracefully', async () => {
      mockFindMany.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app).get('/api/listings').expect(500);

      expect(response.body).toHaveProperty('status', 500);
    });

    it('should serialize BigInt values correctly', async () => {
      mockFindMany.mockResolvedValue(mockListings);
      mockCount.mockResolvedValue(2);

      const response = await request(app).get('/api/listings').expect(200);

      // Price should be serialized as string
      expect(response.body.listings[0].price).toBe('10000');
      expect(response.body.listings[1].price).toBe('20000');
    });
  });

  describe('PATCH /api/listings/:id/message', () => {
    it('should return 400 for empty listing ID', async () => {
      const response = await request(app)
        .patch('/api/listings/%20/message') // URL encoded space
        .send({
          messageId: 'msg-123',
          channelId: 'channel-456',
        })
        .expect(400);

      expect(response.body).toHaveProperty('detail');
      expect(response.body.detail).toContain('Listing ID is required');
    });

    it('should return 404 when listing not found', async () => {
      mockFindUnique.mockResolvedValue(null);

      const response = await request(app)
        .patch('/api/listings/non-existent-id/message')
        .send({
          messageId: 'msg-123',
          channelId: 'channel-456',
        })
        .expect(404);

      expect(response.body).toHaveProperty('detail');
      expect(response.body.detail).toContain('Listing not found');
    });

    it('should update message information successfully', async () => {
      mockFindUnique.mockResolvedValue({ id: 'test-listing-id' });
      mockUpdate.mockResolvedValue({
        id: 'test-listing-id',
        messageId: 'msg-123',
        channelId: 'channel-456',
        priceRange: null,
        updatedAt: new Date(),
      });

      const response = await request(app)
        .patch('/api/listings/test-listing-id/message')
        .send({
          messageId: 'msg-123',
          channelId: 'channel-456',
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'test-listing-id' },
        data: {
          messageId: 'msg-123',
          channelId: 'channel-456',
          priceRange: null,
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should update priceRange when provided', async () => {
      mockFindUnique.mockResolvedValue({ id: 'test-listing-id' });
      mockUpdate.mockResolvedValue({
        id: 'test-listing-id',
        messageId: 'msg-123',
        channelId: 'channel-456',
        priceRange: 'UNDER_100',
        updatedAt: new Date(),
      });

      const response = await request(app)
        .patch('/api/listings/test-listing-id/message')
        .send({
          messageId: 'msg-123',
          channelId: 'channel-456',
          priceRange: 'UNDER_100',
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'test-listing-id' },
        data: expect.objectContaining({
          priceRange: 'UNDER_100',
        }),
      });
    });

    it('should set null when fields are not provided', async () => {
      mockFindUnique.mockResolvedValue({ id: 'test-listing-id' });
      mockUpdate.mockResolvedValue({
        id: 'test-listing-id',
        messageId: null,
        channelId: null,
        priceRange: null,
        updatedAt: new Date(),
      });

      await request(app)
        .patch('/api/listings/test-listing-id/message')
        .send({})
        .expect(200);

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'test-listing-id' },
        data: {
          messageId: null,
          channelId: null,
          priceRange: null,
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should handle database errors gracefully', async () => {
      mockFindUnique.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .patch('/api/listings/test-listing-id/message')
        .send({
          messageId: 'msg-123',
        })
        .expect(500);

      expect(response.body).toHaveProperty('status', 500);
    });
  });
});
