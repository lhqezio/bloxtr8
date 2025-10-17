// Mock Prisma client before importing
const mockOfferFindMany = jest.fn();
const mockOfferUpdateMany = jest.fn();
const mockAuditLogCreateMany = jest.fn();

jest.mock('@bloxtr8/database', () => ({
  prisma: {
    offer: {
      findMany: mockOfferFindMany,
      updateMany: mockOfferUpdateMany,
    },
    auditLog: {
      createMany: mockAuditLogCreateMany,
    },
  },
}));

import { manuallyExpireOffers } from '../lib/offer-expiry.js';

// Mock node-cron
jest.mock('node-cron', () => ({
  schedule: jest.fn(),
}));

// Mock events
jest.mock('../lib/events.js', () => ({
  emitOfferEvent: jest.fn(),
  OfferEventType: {
    EXPIRED: 'offer.expired',
  },
}));

describe('Offer Expiry Service', () => {
  beforeEach(() => {
    mockOfferFindMany.mockClear();
    mockOfferUpdateMany.mockClear();
    mockAuditLogCreateMany.mockClear();
    jest.clearAllMocks();
  });

  describe('manuallyExpireOffers', () => {
    it('should find and expire pending offers that have expired', async () => {
      const expiredDate = new Date(Date.now() - 1000);
      const mockExpiredOffers = [
        {
          id: 'offer-1',
          listingId: 'listing-1',
          buyerId: 'buyer-1',
          sellerId: 'seller-1',
          amount: BigInt(5000),
          status: 'PENDING',
          expiry: expiredDate,
        },
        {
          id: 'offer-2',
          listingId: 'listing-2',
          buyerId: 'buyer-2',
          sellerId: 'seller-2',
          amount: BigInt(10000),
          status: 'PENDING',
          expiry: expiredDate,
        },
      ];

      mockOfferFindMany.mockResolvedValue(mockExpiredOffers);
      mockOfferUpdateMany.mockResolvedValue({ count: 2 });
      mockAuditLogCreateMany.mockResolvedValue({ count: 2 });

      const result = await manuallyExpireOffers();

      expect(result.expired).toBe(2);
      expect(result.offerIds).toEqual(['offer-1', 'offer-2']);

      // Verify offers were queried correctly
      expect(mockOfferFindMany).toHaveBeenCalledWith({
        where: {
          status: {
            in: ['PENDING', 'COUNTERED'],
          },
          expiry: {
            lt: expect.any(Date),
          },
        },
        select: {
          id: true,
          listingId: true,
          buyerId: true,
          sellerId: true,
          amount: true,
          status: true,
          expiry: true,
        },
      });

      // Verify offers were updated
      expect(mockOfferUpdateMany).toHaveBeenCalledWith({
        where: {
          id: {
            in: ['offer-1', 'offer-2'],
          },
        },
        data: {
          status: 'EXPIRED',
        },
      });

      // Verify audit logs were created
      expect(mockAuditLogCreateMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            action: 'OFFER_EXPIRED',
            userId: null,
            details: expect.objectContaining({
              offerId: 'offer-1',
              listingId: 'listing-1',
              manualExpiry: true,
            }),
          }),
          expect.objectContaining({
            action: 'OFFER_EXPIRED',
            userId: null,
            details: expect.objectContaining({
              offerId: 'offer-2',
              listingId: 'listing-2',
              manualExpiry: true,
            }),
          }),
        ]),
      });
    });

    it('should handle countered offers that have expired', async () => {
      const expiredDate = new Date(Date.now() - 1000);
      const mockExpiredOffer = {
        id: 'offer-counter-1',
        listingId: 'listing-1',
        buyerId: 'buyer-1',
        sellerId: 'seller-1',
        amount: BigInt(7500),
        status: 'COUNTERED',
        expiry: expiredDate,
      };

      mockOfferFindMany.mockResolvedValue([mockExpiredOffer]);
      mockOfferUpdateMany.mockResolvedValue({ count: 1 });
      mockAuditLogCreateMany.mockResolvedValue({ count: 1 });

      const result = await manuallyExpireOffers();

      expect(result.expired).toBe(1);
      expect(result.offerIds).toEqual(['offer-counter-1']);
    });

    it('should return empty result when no offers have expired', async () => {
      mockOfferFindMany.mockResolvedValue([]);

      const result = await manuallyExpireOffers();

      expect(result.expired).toBe(0);
      expect(result.offerIds).toEqual([]);

      // Verify no updates or audit logs were created
      expect(mockOfferUpdateMany).not.toHaveBeenCalled();
      expect(mockAuditLogCreateMany).not.toHaveBeenCalled();
    });

    it('should handle large batches of expired offers', async () => {
      const expiredDate = new Date(Date.now() - 1000);
      const mockExpiredOffers = Array.from({ length: 50 }, (_, i) => ({
        id: `offer-${i}`,
        listingId: `listing-${i}`,
        buyerId: `buyer-${i}`,
        sellerId: `seller-${i}`,
        amount: BigInt(5000 + i * 100),
        status: 'PENDING',
        expiry: expiredDate,
      }));

      mockOfferFindMany.mockResolvedValue(mockExpiredOffers);
      mockOfferUpdateMany.mockResolvedValue({ count: 50 });
      mockAuditLogCreateMany.mockResolvedValue({ count: 50 });

      const result = await manuallyExpireOffers();

      expect(result.expired).toBe(50);
      expect(result.offerIds).toHaveLength(50);
      expect(mockOfferUpdateMany).toHaveBeenCalledTimes(1);
      expect(mockAuditLogCreateMany).toHaveBeenCalledTimes(1);
    });

    it('should include correct audit log details', async () => {
      const expiredDate = new Date('2025-01-01T00:00:00.000Z');
      const mockExpiredOffer = {
        id: 'test-offer',
        listingId: 'test-listing',
        buyerId: 'test-buyer',
        sellerId: 'test-seller',
        amount: BigInt(9999),
        status: 'PENDING',
        expiry: expiredDate,
      };

      mockOfferFindMany.mockResolvedValue([mockExpiredOffer]);
      mockOfferUpdateMany.mockResolvedValue({ count: 1 });
      mockAuditLogCreateMany.mockResolvedValue({ count: 1 });

      await manuallyExpireOffers();

      expect(mockAuditLogCreateMany).toHaveBeenCalledWith({
        data: [
          {
            action: 'OFFER_EXPIRED',
            userId: null,
            details: {
              offerId: 'test-offer',
              listingId: 'test-listing',
              buyerId: 'test-buyer',
              sellerId: 'test-seller',
              amount: '9999',
              previousStatus: 'PENDING',
              expiry: '2025-01-01T00:00:00.000Z',
              manualExpiry: true,
            },
          },
        ],
      });
    });
  });
});

