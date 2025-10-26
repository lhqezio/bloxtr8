import request from 'supertest';

// Mock Prisma client and GameVerificationService before importing app
const mockOfferFindUnique = jest.fn();
const mockOfferCreate = jest.fn();
const mockOfferUpdate = jest.fn();
const mockAuditLogCreate = jest.fn();
const mockAuditLogCreateMany = jest.fn();
const mockUserFindUnique = jest.fn();
const mockReverifyAssetOwnership = jest.fn();

jest.mock('@bloxtr8/database', () => ({
  prisma: {
    offer: {
      findUnique: mockOfferFindUnique,
      create: mockOfferCreate,
      update: mockOfferUpdate,
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

jest.mock('../lib/asset-verification.js', () => ({
  GameVerificationService: jest.fn().mockImplementation(() => ({
    reverifyAssetOwnership: mockReverifyAssetOwnership,
  })),
}));

import app from '../index.js';

describe('Offer Negotiation API Routes', () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockOfferFindUnique.mockClear();
    mockOfferCreate.mockClear();
    mockOfferUpdate.mockClear();
    mockAuditLogCreate.mockClear();
    mockAuditLogCreateMany.mockClear();
    mockUserFindUnique.mockClear();
    mockReverifyAssetOwnership.mockClear();
  });

  describe('PATCH /api/offers/:id/accept', () => {
    const mockPendingOffer = {
      id: 'test-offer-id',
      listingId: 'test-listing-id',
      buyerId: 'test-buyer-id',
      sellerId: 'test-seller-id',
      amount: BigInt(5000),
      status: 'PENDING',
      expiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Future date
      listing: {
        id: 'test-listing-id',
        userId: 'test-seller-id',
        status: 'ACTIVE',
      },
    };

    it('should return 400 for missing userId', async () => {
      const response = await request(app)
        .patch('/api/offers/test-offer-id/accept')
        .send({})
        .expect(400);

      expect(response.body.detail).toContain('Validation failed');
    });

    it('should return 404 when offer not found', async () => {
      mockOfferFindUnique.mockResolvedValue(null);

      const response = await request(app)
        .patch('/api/offers/non-existent-id/accept')
        .send({ userId: 'test-seller-id' })
        .expect(404);

      expect(response.body.detail).toContain('Offer not found');
    });

    it('should return 403 when user is not the seller', async () => {
      mockOfferFindUnique.mockResolvedValue(mockPendingOffer);

      const response = await request(app)
        .patch('/api/offers/test-offer-id/accept')
        .send({ userId: 'wrong-user-id' })
        .expect(403);

      expect(response.body.detail).toContain(
        'Only the seller can accept offers'
      );
    });

    it('should return 400 when offer is already processed', async () => {
      const acceptedOffer = {
        ...mockPendingOffer,
        status: 'ACCEPTED',
      };
      mockOfferFindUnique.mockResolvedValue(acceptedOffer);

      const response = await request(app)
        .patch('/api/offers/test-offer-id/accept')
        .send({ userId: 'test-seller-id' })
        .expect(400);

      expect(response.body.detail).toContain(
        'Cannot accept offer with status: ACCEPTED'
      );
    });

    it('should return 400 when offer has expired', async () => {
      const expiredOffer = {
        ...mockPendingOffer,
        expiry: new Date(Date.now() - 1000), // Past date
      };
      mockOfferFindUnique.mockResolvedValue(expiredOffer);
      mockOfferUpdate.mockResolvedValue({ ...expiredOffer, status: 'EXPIRED' });

      const response = await request(app)
        .patch('/api/offers/test-offer-id/accept')
        .send({ userId: 'test-seller-id' })
        .expect(400);

      expect(response.body.detail).toContain('Offer has expired');
      expect(mockOfferUpdate).toHaveBeenCalledWith({
        where: { id: 'test-offer-id' },
        data: { status: 'EXPIRED' },
      });
    });

    it('should return 400 when asset verification fails', async () => {
      mockOfferFindUnique.mockResolvedValue(mockPendingOffer);
      // Mock seller with valid Roblox account
      mockUserFindUnique.mockResolvedValue({
        id: 'test-seller-id',
        kycTier: 'TIER_1',
        accounts: [{ providerId: 'roblox', accountId: '12345' }],
      });
      mockReverifyAssetOwnership.mockResolvedValue({
        verified: false,
        error: 'Seller no longer owns the asset',
      });

      const response = await request(app)
        .patch('/api/offers/test-offer-id/accept')
        .send({ userId: 'test-seller-id' })
        .expect(400);

      expect(response.body.detail).toContain('Seller no longer owns the asset');
      expect(mockReverifyAssetOwnership).toHaveBeenCalledWith(
        'test-listing-id'
      );
    });

    it('should successfully accept offer with valid verification', async () => {
      mockOfferFindUnique.mockResolvedValue(mockPendingOffer);
      // Mock seller with valid Roblox account
      mockUserFindUnique.mockResolvedValue({
        id: 'test-seller-id',
        kycTier: 'TIER_1',
        accounts: [{ providerId: 'roblox', accountId: '12345' }],
      });
      mockReverifyAssetOwnership.mockResolvedValue({
        verified: true,
        ownershipType: 'OWNER',
      });
      mockOfferUpdate.mockResolvedValue({
        ...mockPendingOffer,
        status: 'ACCEPTED',
      });
      mockAuditLogCreate.mockResolvedValue({});

      const response = await request(app)
        .patch('/api/offers/test-offer-id/accept')
        .send({ userId: 'test-seller-id' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.offer.status).toBe('ACCEPTED');
      expect(mockOfferUpdate).toHaveBeenCalledWith({
        where: { id: 'test-offer-id' },
        data: { status: 'ACCEPTED' },
      });
      expect(mockAuditLogCreate).toHaveBeenCalled();
    });
  });

  describe('PATCH /api/offers/:id/decline', () => {
    const mockPendingOffer = {
      id: 'test-offer-id',
      listingId: 'test-listing-id',
      buyerId: 'test-buyer-id',
      sellerId: 'test-seller-id',
      amount: BigInt(5000),
      status: 'PENDING',
    };

    it('should return 400 for missing userId', async () => {
      const response = await request(app)
        .patch('/api/offers/test-offer-id/decline')
        .send({})
        .expect(400);

      expect(response.body.detail).toContain('Validation failed');
    });

    it('should return 404 when offer not found', async () => {
      mockOfferFindUnique.mockResolvedValue(null);

      const response = await request(app)
        .patch('/api/offers/non-existent-id/decline')
        .send({ userId: 'test-seller-id' })
        .expect(404);

      expect(response.body.detail).toContain('Offer not found');
    });

    it('should return 400 when trying to decline already declined offer', async () => {
      const declinedOffer = {
        ...mockPendingOffer,
        status: 'DECLINED',
      };
      mockOfferFindUnique.mockResolvedValue(declinedOffer);

      const response = await request(app)
        .patch('/api/offers/test-offer-id/decline')
        .send({ userId: 'test-seller-id' })
        .expect(400);

      expect(response.body.detail).toContain(
        'Cannot decline offer with status: DECLINED'
      );
    });

    it('should return 403 when user is not the seller', async () => {
      mockOfferFindUnique.mockResolvedValue(mockPendingOffer);

      const response = await request(app)
        .patch('/api/offers/test-offer-id/decline')
        .send({ userId: 'wrong-user-id' })
        .expect(403);

      expect(response.body.detail).toContain(
        'Only the seller can decline offers'
      );
    });

    it('should successfully decline offer', async () => {
      mockOfferFindUnique.mockResolvedValue(mockPendingOffer);
      mockOfferUpdate.mockResolvedValue({
        ...mockPendingOffer,
        status: 'DECLINED',
      });
      mockAuditLogCreate.mockResolvedValue({});

      const response = await request(app)
        .patch('/api/offers/test-offer-id/decline')
        .send({ userId: 'test-seller-id' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.offer.status).toBe('DECLINED');
      expect(mockOfferUpdate).toHaveBeenCalledWith({
        where: { id: 'test-offer-id' },
        data: { status: 'DECLINED' },
      });
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
      expiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    };

    it('should return 400 for missing userId', async () => {
      const response = await request(app)
        .patch('/api/offers/test-offer-id/counter')
        .send({ amount: 7000 })
        .expect(400);

      expect(response.body.detail).toContain('Validation failed');
    });

    it('should return 400 for missing amount', async () => {
      const response = await request(app)
        .patch('/api/offers/test-offer-id/counter')
        .send({ userId: 'test-seller-id' })
        .expect(400);

      expect(response.body.detail).toContain('Validation failed');
    });

    it('should return 400 for invalid amount', async () => {
      const response = await request(app)
        .patch('/api/offers/test-offer-id/counter')
        .send({ userId: 'test-seller-id', amount: -100 })
        .expect(400);

      expect(response.body.detail).toContain('Validation failed');
    });

    it('should return 404 when offer not found', async () => {
      mockOfferFindUnique.mockResolvedValue(null);

      const response = await request(app)
        .patch('/api/offers/non-existent-id/counter')
        .send({ userId: 'test-seller-id', amount: 7000 })
        .expect(404);

      expect(response.body.detail).toContain('Offer not found');
    });

    it('should return 400 when trying to counter already countered offer', async () => {
      const counteredOffer = {
        ...mockPendingOffer,
        status: 'COUNTERED',
      };
      mockOfferFindUnique.mockResolvedValue(counteredOffer);

      const response = await request(app)
        .patch('/api/offers/test-offer-id/counter')
        .send({ userId: 'test-seller-id', amount: 7000 })
        .expect(400);

      expect(response.body.detail).toContain(
        'Cannot counter offer with status: COUNTERED'
      );
    });

    it('should return 403 when user is not the seller', async () => {
      mockOfferFindUnique.mockResolvedValue(mockPendingOffer);

      const response = await request(app)
        .patch('/api/offers/test-offer-id/counter')
        .send({
          userId: 'wrong-user-id',
          amount: 7000,
        })
        .expect(403);

      expect(response.body.detail).toContain(
        'Only the seller can counter offers'
      );
    });

    it('should return 400 when original offer has expired', async () => {
      const expiredOffer = {
        ...mockPendingOffer,
        expiry: new Date(Date.now() - 1000),
      };
      mockOfferFindUnique.mockResolvedValue(expiredOffer);
      mockOfferUpdate.mockResolvedValue({ ...expiredOffer, status: 'EXPIRED' });

      const response = await request(app)
        .patch('/api/offers/test-offer-id/counter')
        .send({
          userId: 'test-seller-id',
          amount: 7000,
        })
        .expect(400);

      expect(response.body.detail).toContain('Original offer has expired');
    });

    it('should successfully create counter offer', async () => {
      mockOfferFindUnique.mockResolvedValue(mockPendingOffer);
      // Mock buyer with valid Roblox account and TIER_1
      mockUserFindUnique.mockResolvedValue({
        id: 'test-buyer-id',
        kycTier: 'TIER_1',
        accounts: [{ providerId: 'roblox', accountId: '12345' }],
      });
      mockOfferCreate.mockResolvedValue({
        id: 'counter-offer-id',
        listingId: 'test-listing-id',
        buyerId: 'test-seller-id', // Swapped
        sellerId: 'test-buyer-id', // Swapped
        amount: BigInt(7000),
        status: 'PENDING',
        parentId: 'test-offer-id',
        expiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      mockOfferUpdate.mockResolvedValue({
        ...mockPendingOffer,
        status: 'COUNTERED',
      });
      mockAuditLogCreateMany.mockResolvedValue({});

      const response = await request(app)
        .patch('/api/offers/test-offer-id/counter')
        .send({
          userId: 'test-seller-id',
          amount: 7000,
          conditions: 'Payment in 2 installments',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.originalOffer.status).toBe('COUNTERED');
      expect(response.body.counterOffer.id).toBe('counter-offer-id');

      // Verify original offer was updated to COUNTERED
      expect(mockOfferUpdate).toHaveBeenCalledWith({
        where: { id: 'test-offer-id' },
        data: { status: 'COUNTERED' },
      });

      // Verify counter offer was created with swapped buyer/seller
      expect(mockOfferCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          listingId: 'test-listing-id',
          buyerId: 'test-seller-id', // Original seller becomes buyer
          sellerId: 'test-buyer-id', // Original buyer becomes seller
          amount: BigInt(7000),
          parentId: 'test-offer-id',
        }),
      });
    });
  });

  describe('Offer Negotiation Flow', () => {
    it('should handle complete negotiation: offer → counter → accept', async () => {
      // Step 1: Counter offer created (tested above)
      const originalOffer = {
        id: 'original-offer-id',
        listingId: 'test-listing-id',
        buyerId: 'buyer-id',
        sellerId: 'seller-id',
        amount: BigInt(5000),
        status: 'PENDING',
        expiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      // Seller counters
      mockOfferFindUnique.mockResolvedValue(originalOffer);
      // Mock buyer with valid Roblox account and TIER_1
      mockUserFindUnique.mockResolvedValueOnce({
        id: 'buyer-id',
        kycTier: 'TIER_1',
        accounts: [{ providerId: 'roblox', accountId: '12345' }],
      });
      mockOfferCreate.mockResolvedValue({
        id: 'counter-offer-id',
        listingId: 'test-listing-id',
        buyerId: 'seller-id', // Swapped
        sellerId: 'buyer-id', // Swapped
        amount: BigInt(7000),
        status: 'PENDING',
        parentId: 'original-offer-id',
        expiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      mockOfferUpdate.mockResolvedValue({
        ...originalOffer,
        status: 'COUNTERED',
      });
      mockAuditLogCreateMany.mockResolvedValue({});

      const counterResponse = await request(app)
        .patch('/api/offers/original-offer-id/counter')
        .send({
          userId: 'seller-id',
          amount: 7000,
        })
        .expect(201);

      expect(counterResponse.body.success).toBe(true);
      expect(counterResponse.body.counterOffer.id).toBe('counter-offer-id');

      // Step 2: Original buyer accepts counter offer
      const counterOffer = {
        id: 'counter-offer-id',
        listingId: 'test-listing-id',
        buyerId: 'seller-id',
        sellerId: 'buyer-id', // Original buyer is now seller of counter
        amount: BigInt(7000),
        status: 'PENDING',
        expiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        listing: {
          id: 'test-listing-id',
          userId: 'seller-id',
          status: 'ACTIVE',
        },
      };

      mockOfferFindUnique.mockResolvedValue(counterOffer);
      // Mock original buyer (now seller of counter) with valid Roblox account
      mockUserFindUnique.mockResolvedValueOnce({
        id: 'buyer-id',
        kycTier: 'TIER_1',
        accounts: [{ providerId: 'roblox', accountId: '12345' }],
      });
      mockReverifyAssetOwnership.mockResolvedValue({
        verified: true,
        ownershipType: 'OWNER',
      });
      mockOfferUpdate.mockResolvedValue({
        ...counterOffer,
        status: 'ACCEPTED',
      });
      mockAuditLogCreate.mockResolvedValue({});

      const acceptResponse = await request(app)
        .patch('/api/offers/counter-offer-id/accept')
        .send({ userId: 'buyer-id' }) // Original buyer accepts
        .expect(200);

      expect(acceptResponse.body.success).toBe(true);
      expect(acceptResponse.body.offer.status).toBe('ACCEPTED');
    });
  });
});
