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

// Mock node-cron before importing
const mockSchedule = jest.fn();
jest.mock('node-cron', () => ({
  schedule: (...args: unknown[]) => mockSchedule(...args),
}));

import {
  manuallyExpireOffers,
  initializeOfferExpiryJob,
} from '../lib/offer-expiry.js';

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

  describe('initializeOfferExpiryJob', () => {
    it('should schedule cron job to run every 5 minutes', () => {
      initializeOfferExpiryJob();

      expect(mockSchedule).toHaveBeenCalledWith(
        '*/5 * * * *',
        expect.any(Function)
      );
    });

    it('should execute expiry logic when cron job runs', async () => {
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
      ];

      mockOfferFindMany.mockResolvedValue(mockExpiredOffers);
      mockOfferUpdateMany.mockResolvedValue({ count: 1 });
      mockAuditLogCreateMany.mockResolvedValue({ count: 1 });

      // Initialize the job
      initializeOfferExpiryJob();

      // Get the callback function that was passed to schedule
      const scheduleCallback = mockSchedule.mock.calls[0][1];

      // Execute the callback (simulating cron trigger)
      await scheduleCallback();

      // Verify that the expiry logic ran
      expect(mockOfferFindMany).toHaveBeenCalled();
      expect(mockOfferUpdateMany).toHaveBeenCalled();
      expect(mockAuditLogCreateMany).toHaveBeenCalled();
    });

    it('should handle case when no expired offers found', async () => {
      mockOfferFindMany.mockResolvedValue([]);

      initializeOfferExpiryJob();

      const scheduleCallback = mockSchedule.mock.calls[0][1];
      await scheduleCallback();

      expect(mockOfferFindMany).toHaveBeenCalled();
      expect(mockOfferUpdateMany).not.toHaveBeenCalled();
      expect(mockAuditLogCreateMany).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully during cron execution', async () => {
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      mockOfferFindMany.mockRejectedValue(new Error('Database error'));

      initializeOfferExpiryJob();

      const scheduleCallback = mockSchedule.mock.calls[0][1];
      await scheduleCallback();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Offer Expiry] Error during expiry check:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it('should log when checking for expired offers', async () => {
      const consoleLogSpy = jest
        .spyOn(console, 'log')
        .mockImplementation(() => {});

      mockOfferFindMany.mockResolvedValue([]);

      initializeOfferExpiryJob();

      const scheduleCallback = mockSchedule.mock.calls[0][1];
      await scheduleCallback();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Offer Expiry] Running expiry check...'
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Offer Expiry] No expired offers found'
      );

      consoleLogSpy.mockRestore();
    });

    it('should create audit logs with autoExpired flag for cron-triggered expiry', async () => {
      const expiredDate = new Date(Date.now() - 1000);
      const mockExpiredOffer = {
        id: 'offer-1',
        listingId: 'listing-1',
        buyerId: 'buyer-1',
        sellerId: 'seller-1',
        amount: BigInt(5000),
        status: 'PENDING',
        expiry: expiredDate,
      };

      mockOfferFindMany.mockResolvedValue([mockExpiredOffer]);
      mockOfferUpdateMany.mockResolvedValue({ count: 1 });
      mockAuditLogCreateMany.mockResolvedValue({ count: 1 });

      initializeOfferExpiryJob();

      const scheduleCallback = mockSchedule.mock.calls[0][1];
      await scheduleCallback();

      expect(mockAuditLogCreateMany).toHaveBeenCalledWith({
        data: [
          {
            action: 'OFFER_EXPIRED',
            userId: null,
            details: expect.objectContaining({
              autoExpired: true,
            }),
          },
        ],
      });
    });
  });
});
