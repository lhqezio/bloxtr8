import request from 'supertest';

// Mock Prisma client before importing app
const mockListingFindUnique = jest.fn();
const mockOfferCreate = jest.fn().mockResolvedValue({
  id: 'test-offer-id',
  listingId: 'test-listing-id',
  buyerId: 'test-buyer-id',
  sellerId: 'test-seller-id',
  amount: 5000n,
  conditions: null,
  expiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  status: 'PENDING',
  createdAt: new Date(),
  updatedAt: new Date(),
});
const mockRobloxSnapshotFindFirst = jest.fn();
const mockUserFindUnique = jest.fn();
const mockAuditLogCreate = jest.fn();
const mockAuditLogCreateMany = jest.fn();
const mockOfferFindMany = jest.fn();
const mockOfferFindUnique = jest.fn();
const mockOfferUpdate = jest.fn();

jest.mock('@bloxtr8/database', () => ({
  prisma: {
    listing: {
      findUnique: mockListingFindUnique,
    },
    offer: {
      create: mockOfferCreate,
      findMany: mockOfferFindMany,
      findUnique: mockOfferFindUnique,
      update: mockOfferUpdate,
    },
    robloxSnapshot: {
      findFirst: mockRobloxSnapshotFindFirst,
    },
    user: {
      findUnique: mockUserFindUnique,
    },
    auditLog: {
      create: mockAuditLogCreate,
      createMany: mockAuditLogCreateMany,
    },
  },
}));

// Mock asset verification service
jest.mock('../lib/asset-verification.js', () => ({
  GameVerificationService: jest.fn().mockImplementation(() => ({
    reverifyAssetOwnership: jest.fn().mockResolvedValue({
      verified: true,
      ownershipType: 'OWNER',
    }),
  })),
}));

// Mock events
jest.mock('../lib/events.js', () => ({
  emitOfferEvent: jest.fn(),
  OfferEventType: {
    CREATED: 'offer.created',
    ACCEPTED: 'offer.accepted',
    DECLINED: 'offer.declined',
    COUNTERED: 'offer.countered',
    EXPIRED: 'offer.expired',
  },
}));

import app from '../index.js';

describe('Offers API Routes', () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockListingFindUnique.mockClear();
    mockOfferCreate.mockClear();
    mockRobloxSnapshotFindFirst.mockClear();
    mockUserFindUnique.mockClear();
    mockAuditLogCreate.mockClear();
    mockAuditLogCreateMany.mockClear();
    mockOfferFindMany.mockClear();
    mockOfferFindUnique.mockClear();
    mockOfferUpdate.mockClear();
  });

  describe('POST /api/offers', () => {
    const mockActiveListing = {
      id: 'test-listing-id',
      status: 'ACTIVE',
      price: BigInt(10000), // BigInt to match Prisma schema
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
      mockRobloxSnapshotFindFirst.mockResolvedValue({
        id: 'snapshot-id',
        verifiedOwnership: true,
      });
      mockUserFindUnique.mockResolvedValue({
        id: 'test-buyer-id',
        kycTier: 'TIER_1',
      });

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
      mockRobloxSnapshotFindFirst.mockResolvedValue({
        id: 'snapshot-id',
        verifiedOwnership: true,
      });
      mockUserFindUnique.mockResolvedValue({
        id: 'test-buyer-id',
        kycTier: 'TIER_1',
      });

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
      mockRobloxSnapshotFindFirst.mockResolvedValue({
        id: 'snapshot-id',
        verifiedOwnership: true,
      });
      mockUserFindUnique.mockResolvedValue({
        id: 'test-buyer-id',
        kycTier: 'TIER_1',
      });

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
      mockRobloxSnapshotFindFirst.mockResolvedValue({
        id: 'snapshot-id',
        verifiedOwnership: true,
      });
      mockUserFindUnique.mockResolvedValue({
        id: 'test-buyer-id',
        kycTier: 'TIER_1',
      });

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
      mockRobloxSnapshotFindFirst.mockResolvedValue({
        id: 'snapshot-id',
        verifiedOwnership: true,
      });
      mockUserFindUnique.mockResolvedValue({
        id: 'test-buyer-id',
        kycTier: 'TIER_1',
      });

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
          amount: 5000n,
          conditions: 'Test conditions',
          expiry: expect.any(Date),
          status: 'PENDING',
        },
      });
    });

    it('should set default expiry to 7 days from now when not provided', async () => {
      mockListingFindUnique.mockResolvedValue(mockActiveListing);
      mockRobloxSnapshotFindFirst.mockResolvedValue({
        id: 'snapshot-id',
        verifiedOwnership: true,
      });
      mockUserFindUnique.mockResolvedValue({
        id: 'test-buyer-id',
        kycTier: 'TIER_1',
      });

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
      mockRobloxSnapshotFindFirst.mockResolvedValue({
        id: 'snapshot-id',
        verifiedOwnership: true,
      });
      mockUserFindUnique.mockResolvedValue({
        id: 'test-buyer-id',
        kycTier: 'TIER_1',
      });

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
      mockRobloxSnapshotFindFirst.mockResolvedValue({
        id: 'snapshot-id',
        verifiedOwnership: true,
      });
      mockUserFindUnique.mockResolvedValue({
        id: 'test-buyer-id',
        kycTier: 'TIER_1',
      });

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

    it('should return 400 when listing has no verified Roblox snapshot', async () => {
      mockListingFindUnique.mockResolvedValue(mockActiveListing);
      mockRobloxSnapshotFindFirst.mockResolvedValue(null); // No verified snapshot

      const response = await request(app)
        .post('/api/offers')
        .send({
          listingId: 'test-listing-id',
          buyerId: 'test-buyer-id',
          amount: 5000,
        })
        .expect(400);

      expect(response.body.detail).toContain(
        'Listing must have a verified Roblox asset'
      );
    });

    it('should return 400 when buyer has TIER_0 KYC (no Roblox linked)', async () => {
      mockListingFindUnique.mockResolvedValue(mockActiveListing);
      mockRobloxSnapshotFindFirst.mockResolvedValue({
        id: 'snapshot-id',
        verifiedOwnership: true,
      });
      mockUserFindUnique.mockResolvedValue({
        id: 'test-buyer-id',
        kycTier: 'TIER_0',
      });

      const response = await request(app)
        .post('/api/offers')
        .send({
          listingId: 'test-listing-id',
          buyerId: 'test-buyer-id',
          amount: 5000,
        })
        .expect(400);

      expect(response.body.detail).toContain(
        'Must link Roblox account to make offers'
      );
    });

    it('should return 404 when buyer not found', async () => {
      mockListingFindUnique.mockResolvedValue(mockActiveListing);
      mockRobloxSnapshotFindFirst.mockResolvedValue({
        id: 'snapshot-id',
        verifiedOwnership: true,
      });
      mockUserFindUnique.mockResolvedValue(null); // Buyer not found

      const response = await request(app)
        .post('/api/offers')
        .send({
          listingId: 'test-listing-id',
          buyerId: 'non-existent-buyer',
          amount: 5000,
        })
        .expect(404);

      expect(response.body.detail).toContain('Buyer not found');
    });
  });

  describe('GET /api/offers/listing/:listingId', () => {
    it('should return all offers for a listing', async () => {
      const mockOffers = [
        {
          id: 'offer-1',
          amount: BigInt(5000),
          status: 'PENDING',
          buyer: {
            id: 'buyer-1',
            name: 'Buyer 1',
            kycTier: 'TIER_1',
            kycVerified: true,
          },
          seller: {
            id: 'seller-1',
            name: 'Seller 1',
            kycTier: 'TIER_1',
            kycVerified: true,
          },
          parent: null,
        },
        {
          id: 'offer-2',
          amount: BigInt(7000),
          status: 'COUNTERED',
          buyer: {
            id: 'buyer-2',
            name: 'Buyer 2',
            kycTier: 'TIER_2',
            kycVerified: true,
          },
          seller: {
            id: 'seller-2',
            name: 'Seller 2',
            kycTier: 'TIER_1',
            kycVerified: true,
          },
          parent: { id: 'offer-1', amount: BigInt(5000), status: 'PENDING' },
        },
      ];

      mockOfferFindMany.mockResolvedValue(mockOffers);

      const response = await request(app)
        .get('/api/offers/listing/test-listing-id')
        .expect(200);

      expect(response.body).toHaveProperty('offers');
      expect(response.body).toHaveProperty('count', 2);
      expect(response.body.offers).toHaveLength(2);
      expect(response.body.offers[0].amount).toBe('5000');
      expect(response.body.offers[1].amount).toBe('7000');
      expect(response.body.offers[1].parent.amount).toBe('5000');
    });

    it('should filter offers by status', async () => {
      const mockPendingOffers = [
        {
          id: 'offer-1',
          amount: BigInt(5000),
          status: 'PENDING',
          buyer: {
            id: 'buyer-1',
            name: 'Buyer 1',
            kycTier: 'TIER_1',
            kycVerified: true,
          },
          seller: {
            id: 'seller-1',
            name: 'Seller 1',
            kycTier: 'TIER_1',
            kycVerified: true,
          },
          parent: null,
        },
      ];

      mockOfferFindMany.mockResolvedValue(mockPendingOffers);

      const response = await request(app)
        .get('/api/offers/listing/test-listing-id?status=PENDING')
        .expect(200);

      expect(response.body.offers).toHaveLength(1);
      expect(response.body.offers[0].status).toBe('PENDING');
      expect(mockOfferFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            listingId: 'test-listing-id',
            status: 'PENDING',
          }),
        })
      );
    });
  });

  describe('GET /api/offers/events/recent', () => {
    it('should return recent offer events', async () => {
      const mockOffers = [
        {
          id: 'offer-1',
          status: 'ACCEPTED',
          amount: BigInt(5000),
          conditions: 'Test conditions',
          listingId: 'listing-1',
          buyerId: 'buyer-1',
          sellerId: 'seller-1',
          parentId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          listing: {
            id: 'listing-1',
            title: 'Test Listing',
            price: BigInt(10000),
            threadId: 'thread-123',
            channelId: 'channel-123',
          },
          buyer: {
            id: 'buyer-1',
            name: 'Buyer Name',
            accounts: [{ accountId: 'discord-buyer-123' }],
          },
          seller: {
            id: 'seller-1',
            name: 'Seller Name',
            accounts: [{ accountId: 'discord-seller-123' }],
          },
          parent: null,
        },
      ];

      mockOfferFindMany.mockResolvedValue(mockOffers);

      const response = await request(app)
        .get('/api/offers/events/recent')
        .expect(200);

      expect(response.body).toHaveProperty('events');
      expect(response.body).toHaveProperty('count', 1);
      expect(response.body).toHaveProperty('since');
      expect(response.body.events[0]).toMatchObject({
        offerId: 'offer-1',
        status: 'ACCEPTED',
        amount: '5000',
        listingTitle: 'Test Listing',
        buyerName: 'Buyer Name',
        sellerName: 'Seller Name',
      });
    });

    it('should filter events by since parameter', async () => {
      mockOfferFindMany.mockResolvedValue([]);

      const sinceDate = '2025-10-13T00:00:00.000Z';
      const response = await request(app)
        .get(`/api/offers/events/recent?since=${sinceDate}`)
        .expect(200);

      expect(response.body.since).toBe(sinceDate);
      expect(mockOfferFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            updatedAt: expect.objectContaining({
              gte: new Date(sinceDate),
            }),
          }),
        })
      );
    });

    it('should default to 5 minutes ago if no since parameter', async () => {
      mockOfferFindMany.mockResolvedValue([]);

      const beforeRequest = new Date();
      await request(app).get('/api/offers/events/recent').expect(200);

      const callArgs = mockOfferFindMany.mock.calls[0][0];
      const sinceDate = callArgs.where.updatedAt.gte;
      const expectedMinTime = new Date(beforeRequest.getTime() - 5 * 60 * 1000);

      expect(sinceDate.getTime()).toBeGreaterThanOrEqual(
        expectedMinTime.getTime() - 1000
      );
      expect(sinceDate.getTime()).toBeLessThanOrEqual(new Date().getTime());
    });
  });

  describe('PATCH /api/offers/:id/accept', () => {
    const mockPendingOffer = {
      id: 'test-offer-id',
      listingId: 'test-listing-id',
      buyerId: 'test-buyer-id',
      sellerId: 'test-seller-id',
      amount: BigInt(5000),
      status: 'PENDING',
      expiry: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day from now
      listing: {
        id: 'test-listing-id',
        userId: 'test-seller-id',
        status: 'ACTIVE',
      },
    };

    it('should reject accept if seller Roblox account is not linked', async () => {
      mockOfferFindUnique.mockResolvedValue(mockPendingOffer);
      // Seller without Roblox account
      mockUserFindUnique.mockResolvedValue({
        id: 'test-seller-id',
        kycTier: 'TIER_1',
        accounts: [], // No Roblox account
      });

      const response = await request(app)
        .patch('/api/offers/test-offer-id/accept')
        .send({ userId: 'test-seller-id' })
        .expect(403);

      expect(response.body.detail).toContain(
        'Seller must have a linked Roblox account to accept offers'
      );

      // Verify audit log was created
      expect(mockAuditLogCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'OFFER_ACCEPT_FAILED',
          userId: 'test-seller-id',
          details: expect.objectContaining({
            reason: 'Seller Roblox account not linked',
          }),
        }),
      });
    });

    it('should accept offer when seller has linked Roblox account', async () => {
      mockOfferFindUnique.mockResolvedValue(mockPendingOffer);
      // Seller with valid Roblox account
      mockUserFindUnique.mockResolvedValue({
        id: 'test-seller-id',
        kycTier: 'TIER_1',
        accounts: [{ providerId: 'roblox', accountId: '12345' }],
      });
      mockOfferUpdate.mockResolvedValue({
        ...mockPendingOffer,
        status: 'ACCEPTED',
      });

      const response = await request(app)
        .patch('/api/offers/test-offer-id/accept')
        .send({ userId: 'test-seller-id' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.offer.status).toBe('ACCEPTED');

      // Verify offer was updated
      expect(mockOfferUpdate).toHaveBeenCalledWith({
        where: { id: 'test-offer-id' },
        data: { status: 'ACCEPTED' },
      });
    });

    it('should reject accept if offer has expired', async () => {
      const expiredOffer = {
        ...mockPendingOffer,
        expiry: new Date(Date.now() - 1000), // Already expired
      };
      mockOfferFindUnique.mockResolvedValue(expiredOffer);

      const response = await request(app)
        .patch('/api/offers/test-offer-id/accept')
        .send({ userId: 'test-seller-id' })
        .expect(400);

      expect(response.body.detail).toContain('Offer has expired');

      // Verify offer was marked as expired
      expect(mockOfferUpdate).toHaveBeenCalledWith({
        where: { id: 'test-offer-id' },
        data: { status: 'EXPIRED' },
      });
    });

    it('should reject accept if user is not the seller', async () => {
      mockOfferFindUnique.mockResolvedValue(mockPendingOffer);

      const response = await request(app)
        .patch('/api/offers/test-offer-id/accept')
        .send({ userId: 'wrong-user-id' })
        .expect(403);

      expect(response.body.detail).toContain(
        'Only the seller can accept offers'
      );
    });
  });

  describe('PATCH /api/offers/:id/counter', () => {
    const mockPendingOffer = {
      id: 'test-offer-id',
      listingId: 'test-listing-id',
      buyerId: 'test-buyer-id',
      sellerId: 'test-seller-id',
      amount: BigInt(5000),
      status: 'PENDING',
      expiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };

    it('should reject counter if buyer Roblox account is not linked', async () => {
      mockOfferFindUnique.mockResolvedValue(mockPendingOffer);
      // Buyer without Roblox account
      mockUserFindUnique.mockResolvedValue({
        id: 'test-buyer-id',
        kycTier: 'TIER_1',
        accounts: [], // No Roblox account
      });

      const response = await request(app)
        .patch('/api/offers/test-offer-id/counter')
        .send({
          userId: 'test-seller-id',
          amount: 7000,
        })
        .expect(400);

      expect(response.body.detail).toContain(
        'Buyer must have a linked Roblox account to receive counter-offers'
      );

      // Verify audit log was created
      expect(mockAuditLogCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'OFFER_COUNTER_FAILED',
          userId: 'test-seller-id',
          details: expect.objectContaining({
            reason: 'Buyer Roblox account not linked',
          }),
        }),
      });
    });

    it('should reject counter if buyer is TIER_0', async () => {
      mockOfferFindUnique.mockResolvedValue(mockPendingOffer);
      // Buyer with downgraded KYC tier
      mockUserFindUnique.mockResolvedValue({
        id: 'test-buyer-id',
        kycTier: 'TIER_0',
        accounts: [{ providerId: 'roblox', accountId: '12345' }],
      });

      const response = await request(app)
        .patch('/api/offers/test-offer-id/counter')
        .send({
          userId: 'test-seller-id',
          amount: 7000,
        })
        .expect(400);

      expect(response.body.detail).toContain(
        'Buyer must be at least TIER_1 to receive counter-offers'
      );

      // Verify audit log was created
      expect(mockAuditLogCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'OFFER_COUNTER_FAILED',
          userId: 'test-seller-id',
          details: expect.objectContaining({
            reason: 'Buyer KYC tier insufficient (TIER_0)',
          }),
        }),
      });
    });

    it('should create counter-offer when buyer has valid Roblox account', async () => {
      mockOfferFindUnique.mockResolvedValue(mockPendingOffer);
      // Buyer with valid Roblox account and TIER_1
      mockUserFindUnique.mockResolvedValue({
        id: 'test-buyer-id',
        kycTier: 'TIER_1',
        accounts: [{ providerId: 'roblox', accountId: '12345' }],
      });
      mockOfferCreate.mockResolvedValue({
        id: 'counter-offer-id',
        listingId: 'test-listing-id',
        buyerId: 'test-seller-id',
        sellerId: 'test-buyer-id',
        amount: BigInt(7000),
        status: 'PENDING',
        parentId: 'test-offer-id',
        expiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockOfferUpdate.mockResolvedValue({
        ...mockPendingOffer,
        status: 'COUNTERED',
      });
      mockAuditLogCreateMany.mockResolvedValue({ count: 1 });

      const response = await request(app)
        .patch('/api/offers/test-offer-id/counter')
        .send({
          userId: 'test-seller-id',
          amount: 7000,
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.counterOffer.id).toBe('counter-offer-id');

      // Verify counter-offer was created with swapped buyer/seller
      expect(mockOfferCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          listingId: 'test-listing-id',
          buyerId: 'test-seller-id', // Seller becomes buyer in counter
          sellerId: 'test-buyer-id', // Buyer becomes seller in counter
          amount: BigInt(7000),
          parentId: 'test-offer-id',
        }),
      });
    });

    it('should reject counter if original offer has expired', async () => {
      const expiredOffer = {
        ...mockPendingOffer,
        expiry: new Date(Date.now() - 1000),
      };
      mockOfferFindUnique.mockResolvedValue(expiredOffer);

      const response = await request(app)
        .patch('/api/offers/test-offer-id/counter')
        .send({
          userId: 'test-seller-id',
          amount: 7000,
        })
        .expect(400);

      expect(response.body.detail).toContain('Original offer has expired');
    });
  });
});
