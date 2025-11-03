import request from 'supertest';

// Mock isDebugMode before importing app
jest.mock('../lib/env-validation.js', () => ({
  isDebugMode: jest.fn().mockReturnValue(false),
}));

// Mock the database before importing app
jest.mock('@bloxtr8/database', () => ({
  prisma: {
    contract: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    escrow: {
      findUnique: jest.fn().mockResolvedValue(null), // Default to null (not found)
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    delivery: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    stripeEscrow: {
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    stablecoinEscrow: {
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    milestoneEscrow: {
      deleteMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn((callback) => {
      // Mock transaction client
      const tx = {
        escrow: {
          update: jest.fn(),
          create: jest.fn(),
        },
        delivery: {
          create: jest.fn(),
          update: jest.fn(),
        },
        stripeEscrow: {
          update: jest.fn(),
        },
        stablecoinEscrow: {
          update: jest.fn(),
        },
        auditLog: {
          create: jest.fn(),
        },
      };
      return callback(tx);
    }),
  },
}));

import { isDebugMode } from '../lib/env-validation.js';
import app from '../index.js';

describe('Escrow API Routes', () => {
  beforeEach(() => {
    // Reset isDebugMode mock to false by default
    (isDebugMode as jest.Mock).mockReturnValue(false);
  });
  describe('POST /api/escrow/:id/mark-delivered', () => {
    const { prisma } = require('@bloxtr8/database');

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should return 400 when userId is missing', async () => {
      const response = await request(app)
        .post('/api/escrow/test-id/mark-delivered')
        .send({ title: 'Test Delivery' })
        .expect(400);

      expect(response.body).toHaveProperty('title', 'Bad Request');
      expect(response.body).toHaveProperty('status', 400);
    });

    it('should return 400 when title is missing', async () => {
      const response = await request(app)
        .post('/api/escrow/test-id/mark-delivered')
        .send({ userId: 'test-user-id' })
        .expect(400);

      expect(response.body).toHaveProperty('title', 'Bad Request');
      expect(response.body).toHaveProperty('status', 400);
    });

    it('should return 404 when escrow does not exist', async () => {
      (prisma.escrow.findUnique as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .post('/api/escrow/non-existent-id/mark-delivered')
        .send({ userId: 'test-user-id', title: 'Test Delivery' })
        .expect(404);

      expect(response.body).toHaveProperty('title', 'Not Found');
      expect(response.body).toHaveProperty('status', 404);
    });

    it('should return 403 when user is not the seller', async () => {
      (prisma.escrow.findUnique as jest.Mock).mockResolvedValue({
        id: 'escrow-1',
        status: 'FUNDS_HELD',
        offer: {
          sellerId: 'seller-1',
          buyerId: 'buyer-1',
          listingId: 'listing-1',
        },
        offerId: 'offer-1',
        contractId: 'contract-1',
        deliveries: [],
      });

      const response = await request(app)
        .post('/api/escrow/escrow-1/mark-delivered')
        .send({ userId: 'buyer-1', title: 'Test Delivery' })
        .expect(403);

      expect(response.body).toHaveProperty('title', 'Forbidden');
      expect(response.body).toHaveProperty('status', 403);
    });

    it('should return 400 when escrow status is not FUNDS_HELD', async () => {
      (prisma.escrow.findUnique as jest.Mock).mockResolvedValue({
        id: 'escrow-1',
        status: 'AWAIT_FUNDS',
        offer: {
          sellerId: 'seller-1',
          buyerId: 'buyer-1',
          listingId: 'listing-1',
        },
        offerId: 'offer-1',
        contractId: 'contract-1',
        deliveries: [],
      });

      const response = await request(app)
        .post('/api/escrow/escrow-1/mark-delivered')
        .send({ userId: 'seller-1', title: 'Test Delivery' })
        .expect(400);

      expect(response.body).toHaveProperty('title', 'Bad Request');
      expect(response.body).toHaveProperty('status', 400);
    });

    it('should return 400 when delivery already marked', async () => {
      (prisma.escrow.findUnique as jest.Mock).mockResolvedValue({
        id: 'escrow-1',
        status: 'FUNDS_HELD',
        offer: {
          sellerId: 'seller-1',
          buyerId: 'buyer-1',
          listingId: 'listing-1',
        },
        offerId: 'offer-1',
        contractId: 'contract-1',
        deliveries: [{ id: 'delivery-1' }],
      });

      const response = await request(app)
        .post('/api/escrow/escrow-1/mark-delivered')
        .send({ userId: 'seller-1', title: 'Test Delivery' })
        .expect(400);

      expect(response.body).toHaveProperty('title', 'Bad Request');
      expect(response.body).toHaveProperty('status', 400);
    });

    it('should successfully mark delivery as complete', async () => {
      const mockEscrow = {
        id: 'escrow-1',
        status: 'FUNDS_HELD',
        offer: {
          sellerId: 'seller-1',
          buyerId: 'buyer-1',
          listingId: 'listing-1',
        },
        offerId: 'offer-1',
        contractId: 'contract-1',
        deliveries: [],
      };

      (prisma.escrow.findUnique as jest.Mock).mockResolvedValue(mockEscrow);
      (prisma.$transaction as jest.Mock).mockImplementation(async callback => {
        const tx = {
          escrow: {
            update: jest.fn().mockResolvedValue({
              ...mockEscrow,
              status: 'DELIVERED',
            }),
          },
          delivery: {
            create: jest.fn().mockResolvedValue({
              id: 'delivery-1',
              title: 'Test Delivery',
              status: 'DELIVERED',
            }),
          },
          auditLog: {
            create: jest.fn().mockResolvedValue({}),
          },
        };
        return callback(tx);
      });

      const response = await request(app)
        .post('/api/escrow/escrow-1/mark-delivered')
        .send({
          userId: 'seller-1',
          title: 'Test Delivery',
          description: 'Test description',
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('escrow');
      expect(response.body).toHaveProperty('delivery');
    });
  });

  describe('POST /api/escrow/:id/confirm-delivery', () => {
    const { prisma } = require('@bloxtr8/database');

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should return 400 when userId is missing', async () => {
      const response = await request(app)
        .post('/api/escrow/test-id/confirm-delivery')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('title', 'Bad Request');
      expect(response.body).toHaveProperty('status', 400);
    });

    it('should return 404 when escrow does not exist', async () => {
      (prisma.escrow.findUnique as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .post('/api/escrow/non-existent-id/confirm-delivery')
        .send({ userId: 'test-user-id' })
        .expect(404);

      expect(response.body).toHaveProperty('title', 'Not Found');
      expect(response.body).toHaveProperty('status', 404);
    });

    it('should return 403 when user is not the buyer', async () => {
      (prisma.escrow.findUnique as jest.Mock).mockResolvedValue({
        id: 'escrow-1',
        status: 'DELIVERED',
        offer: {
          sellerId: 'seller-1',
          buyerId: 'buyer-1',
        },
        deliveries: [{ id: 'delivery-1' }],
        stripeEscrow: null,
        stablecoinEscrow: null,
      });

      const response = await request(app)
        .post('/api/escrow/escrow-1/confirm-delivery')
        .send({ userId: 'seller-1' })
        .expect(403);

      expect(response.body).toHaveProperty('title', 'Forbidden');
      expect(response.body).toHaveProperty('status', 403);
    });

    it('should return 400 when escrow status is not DELIVERED', async () => {
      (prisma.escrow.findUnique as jest.Mock).mockResolvedValue({
        id: 'escrow-1',
        status: 'FUNDS_HELD',
        offer: {
          sellerId: 'seller-1',
          buyerId: 'buyer-1',
        },
        deliveries: [],
        stripeEscrow: null,
        stablecoinEscrow: null,
      });

      const response = await request(app)
        .post('/api/escrow/escrow-1/confirm-delivery')
        .send({ userId: 'buyer-1' })
        .expect(400);

      expect(response.body).toHaveProperty('title', 'Bad Request');
      expect(response.body).toHaveProperty('status', 400);
    });

    it('should return 400 when no delivery found', async () => {
      (prisma.escrow.findUnique as jest.Mock).mockResolvedValue({
        id: 'escrow-1',
        status: 'DELIVERED',
        offer: {
          sellerId: 'seller-1',
          buyerId: 'buyer-1',
        },
        deliveries: [],
        stripeEscrow: null,
        stablecoinEscrow: null,
      });

      const response = await request(app)
        .post('/api/escrow/escrow-1/confirm-delivery')
        .send({ userId: 'buyer-1' })
        .expect(400);

      expect(response.body).toHaveProperty('title', 'Bad Request');
      expect(response.body).toHaveProperty('status', 400);
    });

    it('should successfully confirm delivery with Stripe escrow', async () => {
      const mockEscrow = {
        id: 'escrow-1',
        status: 'DELIVERED',
        offer: {
          sellerId: 'seller-1',
          buyerId: 'buyer-1',
        },
        deliveries: [{ id: 'delivery-1' }],
        stripeEscrow: { id: 'stripe-escrow-1' },
        stablecoinEscrow: null,
      };

      (prisma.escrow.findUnique as jest.Mock).mockResolvedValue(mockEscrow);
      (prisma.$transaction as jest.Mock).mockImplementation(async callback => {
        const tx = {
          escrow: {
            update: jest.fn().mockResolvedValue({
              ...mockEscrow,
              status: 'RELEASED',
            }),
          },
          delivery: {
            update: jest.fn().mockResolvedValue({}),
          },
          stripeEscrow: {
            update: jest.fn().mockResolvedValue({}),
          },
          auditLog: {
            create: jest.fn().mockResolvedValue({}),
          },
        };
        return callback(tx);
      });

      (isDebugMode as jest.Mock).mockReturnValue(true);

      const response = await request(app)
        .post('/api/escrow/escrow-1/confirm-delivery')
        .send({ userId: 'buyer-1' })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('escrow');
    });

    it('should successfully confirm delivery with USDC escrow', async () => {
      const mockEscrow = {
        id: 'escrow-1',
        status: 'DELIVERED',
        offer: {
          sellerId: 'seller-1',
          buyerId: 'buyer-1',
        },
        deliveries: [{ id: 'delivery-1' }],
        stripeEscrow: null,
        stablecoinEscrow: { id: 'stablecoin-escrow-1' },
      };

      (prisma.escrow.findUnique as jest.Mock).mockResolvedValue(mockEscrow);
      (prisma.$transaction as jest.Mock).mockImplementation(async callback => {
        const tx = {
          escrow: {
            update: jest.fn().mockResolvedValue({
              ...mockEscrow,
              status: 'RELEASED',
            }),
          },
          delivery: {
            update: jest.fn().mockResolvedValue({}),
          },
          stablecoinEscrow: {
            update: jest.fn().mockResolvedValue({}),
          },
          auditLog: {
            create: jest.fn().mockResolvedValue({}),
          },
        };
        return callback(tx);
      });

      (isDebugMode as jest.Mock).mockReturnValue(true);

      const response = await request(app)
        .post('/api/escrow/escrow-1/confirm-delivery')
        .send({ userId: 'buyer-1' })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('escrow');
    });
  });

  describe('POST /api/escrow/:id/simulate-payment', () => {
    const { prisma } = require('@bloxtr8/database');

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should return 400 when userId is missing', async () => {
      const response = await request(app)
        .post('/api/escrow/test-id/simulate-payment')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('title', 'Bad Request');
      expect(response.body).toHaveProperty('status', 400);
    });

    it('should return 403 when debug mode is not enabled', async () => {
      const response = await request(app)
        .post('/api/escrow/test-id/simulate-payment')
        .send({ userId: 'test-user-id' })
        .expect(403);

      expect(response.body).toHaveProperty('title', 'Forbidden');
      expect(response.body).toHaveProperty('status', 403);
    });

    it('should return 404 when escrow does not exist', async () => {
      // Enable debug mode so we can get past the 403 check
      (isDebugMode as jest.Mock).mockReturnValue(true);
      (prisma.escrow.findUnique as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .post('/api/escrow/non-existent-id/simulate-payment')
        .send({ userId: 'test-user-id' })
        .expect(404);

      expect(response.body).toHaveProperty('title', 'Not Found');
      expect(response.body).toHaveProperty('status', 404);
    });

    it('should return 400 when escrow status is not AWAIT_FUNDS', async () => {
      (isDebugMode as jest.Mock).mockReturnValue(true);
      (prisma.escrow.findUnique as jest.Mock).mockResolvedValue({
        id: 'escrow-1',
        status: 'FUNDS_HELD',
        offer: {
          buyerId: 'buyer-1',
          sellerId: 'seller-1',
        },
        stablecoinEscrow: null,
      });

      const response = await request(app)
        .post('/api/escrow/escrow-1/simulate-payment')
        .send({ userId: 'buyer-1' })
        .expect(400);

      expect(response.body).toHaveProperty('title', 'Bad Request');
      expect(response.body).toHaveProperty('status', 400);
    });

    it('should return 403 when user is not buyer or seller', async () => {
      (isDebugMode as jest.Mock).mockReturnValue(true);
      (prisma.escrow.findUnique as jest.Mock).mockResolvedValue({
        id: 'escrow-1',
        status: 'AWAIT_FUNDS',
        offer: {
          buyerId: 'buyer-1',
          sellerId: 'seller-1',
        },
        stablecoinEscrow: null,
      });

      const response = await request(app)
        .post('/api/escrow/escrow-1/simulate-payment')
        .send({ userId: 'other-user' })
        .expect(403);

      expect(response.body).toHaveProperty('title', 'Forbidden');
      expect(response.body).toHaveProperty('status', 403);
    });

    it('should successfully simulate payment for USDC escrow', async () => {
      const mockEscrow = {
        id: 'escrow-1',
        status: 'AWAIT_FUNDS',
        rail: 'USDC_BASE',
        offer: {
          buyerId: 'buyer-1',
          sellerId: 'seller-1',
        },
        stablecoinEscrow: { id: 'stablecoin-escrow-1' },
      };

      (isDebugMode as jest.Mock).mockReturnValue(true);
      (prisma.escrow.findUnique as jest.Mock).mockResolvedValue(mockEscrow);
      (prisma.$transaction as jest.Mock).mockImplementation(async callback => {
        const tx = {
          escrow: {
            update: jest.fn().mockResolvedValue({
              ...mockEscrow,
              status: 'FUNDS_HELD',
            }),
          },
          stablecoinEscrow: {
            update: jest.fn().mockResolvedValue({}),
          },
          auditLog: {
            create: jest.fn().mockResolvedValue({}),
          },
        };
        return callback(tx);
      });

      const response = await request(app)
        .post('/api/escrow/escrow-1/simulate-payment')
        .send({ userId: 'buyer-1' })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('escrow');
      expect(response.body).toHaveProperty('debugMode', true);
    });
  });

  describe('GET /api/escrow/:id/delivery-status', () => {
    const { prisma } = require('@bloxtr8/database');

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should return 400 when userId is missing', async () => {
      const response = await request(app)
        .get('/api/escrow/test-id/delivery-status')
        .expect(400);

      expect(response.body).toHaveProperty('title', 'Bad Request');
      expect(response.body).toHaveProperty('status', 400);
    });

    it('should return 404 when escrow does not exist', async () => {
      (prisma.escrow.findUnique as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .get('/api/escrow/non-existent-id/delivery-status?userId=test-user-id')
        .expect(404);

      expect(response.body).toHaveProperty('title', 'Not Found');
      expect(response.body).toHaveProperty('status', 404);
    });

    it('should return 403 when user is not buyer or seller', async () => {
      (prisma.escrow.findUnique as jest.Mock).mockResolvedValue({
        id: 'escrow-1',
        status: 'FUNDS_HELD',
        offer: {
          seller: { id: 'seller-1', name: 'Seller' },
          buyer: { id: 'buyer-1', name: 'Buyer' },
          listing: { id: 'listing-1', title: 'Listing' },
        },
        deliveries: [],
        stripeEscrow: null,
        stablecoinEscrow: null,
      });

      const response = await request(app)
        .get('/api/escrow/escrow-1/delivery-status?userId=other-user')
        .expect(403);

      expect(response.body).toHaveProperty('title', 'Forbidden');
      expect(response.body).toHaveProperty('status', 403);
    });

    it('should successfully return delivery status for buyer', async () => {
      const mockEscrow = {
        id: 'escrow-1',
        status: 'DELIVERED',
        offer: {
          sellerId: 'seller-1',
          buyerId: 'buyer-1',
          seller: { id: 'seller-1', name: 'Seller' },
          buyer: { id: 'buyer-1', name: 'Buyer' },
          listing: { id: 'listing-1', title: 'Listing' },
        },
        deliveries: [{ id: 'delivery-1' }],
        stripeEscrow: null,
        stablecoinEscrow: null,
      };

      (prisma.escrow.findUnique as jest.Mock).mockResolvedValue(mockEscrow);

      const response = await request(app)
        .get('/api/escrow/escrow-1/delivery-status?userId=buyer-1')
        .expect(200);

      expect(response.body).toHaveProperty('escrow');
      expect(response.body).toHaveProperty('isBuyer', true);
      expect(response.body).toHaveProperty('isSeller', false);
    });

    it('should successfully return delivery status for seller', async () => {
      const mockEscrow = {
        id: 'escrow-1',
        status: 'FUNDS_HELD',
        offer: {
          sellerId: 'seller-1',
          buyerId: 'buyer-1',
          seller: { id: 'seller-1', name: 'Seller' },
          buyer: { id: 'buyer-1', name: 'Buyer' },
          listing: { id: 'listing-1', title: 'Listing' },
        },
        deliveries: [],
        stripeEscrow: null,
        stablecoinEscrow: null,
      };

      (prisma.escrow.findUnique as jest.Mock).mockResolvedValue(mockEscrow);

      const response = await request(app)
        .get('/api/escrow/escrow-1/delivery-status?userId=seller-1')
        .expect(200);

      expect(response.body).toHaveProperty('escrow');
      expect(response.body).toHaveProperty('isBuyer', false);
      expect(response.body).toHaveProperty('isSeller', true);
      expect(response.body).toHaveProperty('canMarkDelivered', true);
    });
  });

  describe('Route validation', () => {
    it('should return 404 for invalid escrow route', async () => {
      const response = await request(app).get('/api/escrow').expect(404);

      expect(response.body).toHaveProperty('title', 'Not Found');
    });

    it('should return 404 for escrow route with empty ID', async () => {
      const { prisma } = require('@bloxtr8/database');
      (prisma.escrow.findUnique as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .post('/api/escrow/ /mark-delivered')
        .send({ userId: 'test-user-id', title: 'Test' })
        .expect(404);

      expect(response.body).toHaveProperty('title', 'Not Found');
    });
  });
});
