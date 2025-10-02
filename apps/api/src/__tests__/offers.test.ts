import request from 'supertest';

// Mock Prisma client before importing app
const mockListingFindUnique = jest.fn();
const mockOfferCreate = jest.fn().mockResolvedValue({
  id: 'test-offer-id',
  listingId: 'test-listing-id',
  buyerId: 'test-buyer-id',
  sellerId: 'test-seller-id',
  amount: 5000,
  conditions: null,
  expiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  status: 'PENDING',
  createdAt: new Date(),
  updatedAt: new Date(),
});

jest.mock('@bloxtr8/database', () => ({
  prisma: {
    listing: {
      findUnique: mockListingFindUnique,
    },
    offer: {
      create: mockOfferCreate,
    },
  },
}));

import app from '../index.js';

describe('Offers API Routes', () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockListingFindUnique.mockClear();
    mockOfferCreate.mockClear();
  });

  describe('POST /api/offers', () => {
    const mockActiveListing = {
      id: 'test-listing-id',
      status: 'ACTIVE',
      price: 10000,
      userId: 'test-seller-id',
    };

    it('should return 400 for invalid payload - missing required fields', async () => {
      const response = await request(app)
        .post('/api/offers')
        .send({})
        .expect(400);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toHaveProperty('type');
      expect(response.body).toHaveProperty('title', 'Bad Request');
      expect(response.body).toHaveProperty('status', 400);
      expect(response.body).toHaveProperty('detail');
      expect(response.body.detail).toContain('Validation failed');
    });

    it('should return 400 for invalid payload - invalid amount', async () => {
      const response = await request(app)
        .post('/api/offers')
        .send({
          listingId: 'test-listing-id',
          buyerId: 'test-buyer-id',
          amount: -100, // Invalid negative amount
        })
        .expect(400);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toHaveProperty('type');
      expect(response.body).toHaveProperty('title', 'Bad Request');
      expect(response.body).toHaveProperty('status', 400);
      expect(response.body).toHaveProperty('detail');
      expect(response.body.detail).toContain('Validation failed');
    });

    it('should return 400 for invalid payload - empty listingId', async () => {
      const response = await request(app)
        .post('/api/offers')
        .send({
          listingId: '', // Empty listing ID
          buyerId: 'test-buyer-id',
          amount: 5000,
        })
        .expect(400);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toHaveProperty('type');
      expect(response.body).toHaveProperty('title', 'Bad Request');
      expect(response.body).toHaveProperty('status', 400);
      expect(response.body).toHaveProperty('detail');
      expect(response.body.detail).toContain('Validation failed');
    });

    it('should return 400 for invalid payload - empty buyerId', async () => {
      const response = await request(app)
        .post('/api/offers')
        .send({
          listingId: 'test-listing-id',
          buyerId: '', // Empty buyer ID
          amount: 5000,
        })
        .expect(400);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toHaveProperty('type');
      expect(response.body).toHaveProperty('title', 'Bad Request');
      expect(response.body).toHaveProperty('status', 400);
      expect(response.body).toHaveProperty('detail');
      expect(response.body.detail).toContain('Validation failed');
    });

    it('should return 404 when listing is not found', async () => {
      mockListingFindUnique.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/offers')
        .send({
          listingId: 'non-existent-listing-id',
          buyerId: 'test-buyer-id',
          amount: 5000,
        })
        .expect(404);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toHaveProperty('type');
      expect(response.body).toHaveProperty('title', 'Not Found');
      expect(response.body).toHaveProperty('status', 404);
      expect(response.body).toHaveProperty('detail');
      expect(response.body.detail).toContain('Listing not found');
    });

    it('should return 400 when trying to offer on inactive listing', async () => {
      const inactiveListing = {
        ...mockActiveListing,
        status: 'INACTIVE',
      };
      mockListingFindUnique.mockResolvedValue(inactiveListing);

      const response = await request(app)
        .post('/api/offers')
        .send({
          listingId: 'test-listing-id',
          buyerId: 'test-buyer-id',
          amount: 5000,
        })
        .expect(400);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toHaveProperty('type');
      expect(response.body).toHaveProperty('title', 'Bad Request');
      expect(response.body).toHaveProperty('status', 400);
      expect(response.body).toHaveProperty('detail');
      expect(response.body.detail).toContain('Cannot offer on closed listing');
    });

    it('should return 400 when trying to offer on sold listing', async () => {
      const soldListing = {
        ...mockActiveListing,
        status: 'SOLD',
      };
      mockListingFindUnique.mockResolvedValue(soldListing);

      const response = await request(app)
        .post('/api/offers')
        .send({
          listingId: 'test-listing-id',
          buyerId: 'test-buyer-id',
          amount: 5000,
        })
        .expect(400);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toHaveProperty('type');
      expect(response.body).toHaveProperty('title', 'Bad Request');
      expect(response.body).toHaveProperty('status', 400);
      expect(response.body).toHaveProperty('detail');
      expect(response.body.detail).toContain('Cannot offer on closed listing');
    });

    it('should return 400 when buyer tries to offer on their own listing', async () => {
      mockListingFindUnique.mockResolvedValue(mockActiveListing);

      const response = await request(app)
        .post('/api/offers')
        .send({
          listingId: 'test-listing-id',
          buyerId: 'test-seller-id', // Same as seller
          amount: 5000,
        })
        .expect(400);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toHaveProperty('type');
      expect(response.body).toHaveProperty('title', 'Bad Request');
      expect(response.body).toHaveProperty('status', 400);
      expect(response.body).toHaveProperty('detail');
      expect(response.body.detail).toContain(
        'Cannot offer on your own listing'
      );
    });

    it('should return 400 when offer amount exceeds listing price', async () => {
      mockListingFindUnique.mockResolvedValue(mockActiveListing);

      const response = await request(app)
        .post('/api/offers')
        .send({
          listingId: 'test-listing-id',
          buyerId: 'test-buyer-id',
          amount: 15000, // Exceeds listing price of 10000
        })
        .expect(400);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toHaveProperty('type');
      expect(response.body).toHaveProperty('title', 'Bad Request');
      expect(response.body).toHaveProperty('status', 400);
      expect(response.body).toHaveProperty('detail');
      expect(response.body.detail).toContain(
        'Offer amount cannot exceed listing price'
      );
    });

    it('should return 201 with offer id for valid payload', async () => {
      mockListingFindUnique.mockResolvedValue(mockActiveListing);

      const response = await request(app)
        .post('/api/offers')
        .send({
          listingId: 'test-listing-id',
          buyerId: 'test-buyer-id',
          amount: 5000,
        })
        .expect(201);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toHaveProperty('id');
      expect(typeof response.body.id).toBe('string');
      expect(response.body.id.length).toBeGreaterThan(0);
    });

    it('should return 201 with offer id for valid payload with optional fields', async () => {
      mockListingFindUnique.mockResolvedValue(mockActiveListing);

      const response = await request(app)
        .post('/api/offers')
        .send({
          listingId: 'test-listing-id',
          buyerId: 'test-buyer-id',
          amount: 5000,
          conditions: 'Must be delivered within 3 days',
          expiry: '2024-12-31T23:59:59.000Z',
        })
        .expect(201);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toHaveProperty('id');
      expect(typeof response.body.id).toBe('string');
      expect(response.body.id.length).toBeGreaterThan(0);
    });

    it('should call prisma with correct parameters for listing lookup', async () => {
      mockListingFindUnique.mockResolvedValue(mockActiveListing);

      await request(app)
        .post('/api/offers')
        .send({
          listingId: 'test-listing-id',
          buyerId: 'test-buyer-id',
          amount: 5000,
        })
        .expect(201);

      expect(mockListingFindUnique).toHaveBeenCalledWith({
        where: { id: 'test-listing-id' },
        select: {
          id: true,
          status: true,
          price: true,
          userId: true,
        },
      });
    });

    it('should call prisma with correct parameters for offer creation', async () => {
      mockListingFindUnique.mockResolvedValue(mockActiveListing);

      await request(app)
        .post('/api/offers')
        .send({
          listingId: 'test-listing-id',
          buyerId: 'test-buyer-id',
          amount: 5000,
          conditions: 'Test conditions',
        })
        .expect(201);

      expect(mockOfferCreate).toHaveBeenCalledWith({
        data: {
          listingId: 'test-listing-id',
          buyerId: 'test-buyer-id',
          sellerId: 'test-seller-id',
          amount: 5000,
          conditions: 'Test conditions',
          expiry: expect.any(Date),
          status: 'PENDING',
        },
      });
    });

    it('should set default expiry to 7 days from now when not provided', async () => {
      mockListingFindUnique.mockResolvedValue(mockActiveListing);

      const beforeRequest = new Date();

      await request(app)
        .post('/api/offers')
        .send({
          listingId: 'test-listing-id',
          buyerId: 'test-buyer-id',
          amount: 5000,
        })
        .expect(201);

      const afterRequest = new Date();
      const expectedExpiryMin = new Date(
        beforeRequest.getTime() + 7 * 24 * 60 * 60 * 1000
      );
      const expectedExpiryMax = new Date(
        afterRequest.getTime() + 7 * 24 * 60 * 60 * 1000
      );

      expect(mockOfferCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          expiry: expect.any(Date),
        }),
      });

      const actualExpiry = mockOfferCreate.mock.calls[0][0].data.expiry;
      expect(actualExpiry.getTime()).toBeGreaterThanOrEqual(
        expectedExpiryMin.getTime()
      );
      expect(actualExpiry.getTime()).toBeLessThanOrEqual(
        expectedExpiryMax.getTime()
      );
    });

    it('should use provided expiry when given', async () => {
      mockListingFindUnique.mockResolvedValue(mockActiveListing);

      const customExpiry = '2024-12-31T23:59:59.000Z';

      await request(app)
        .post('/api/offers')
        .send({
          listingId: 'test-listing-id',
          buyerId: 'test-buyer-id',
          amount: 5000,
          expiry: customExpiry,
        })
        .expect(201);

      expect(mockOfferCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          expiry: new Date(customExpiry),
        }),
      });
    });

    it('should handle null conditions when not provided', async () => {
      mockListingFindUnique.mockResolvedValue(mockActiveListing);

      await request(app)
        .post('/api/offers')
        .send({
          listingId: 'test-listing-id',
          buyerId: 'test-buyer-id',
          amount: 5000,
        })
        .expect(201);

      expect(mockOfferCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          conditions: null,
        }),
      });
    });
  });
});
