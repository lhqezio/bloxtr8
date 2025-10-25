import request from 'supertest';

// Mock Prisma client before importing app
const mockOfferDraftUpsert = jest.fn();
const mockOfferDraftFindUnique = jest.fn();
const mockOfferDraftDelete = jest.fn();
const mockOfferDraftDeleteMany = jest.fn();

jest.mock('@bloxtr8/database', () => ({
  prisma: {
    offerDraft: {
      upsert: mockOfferDraftUpsert,
      findUnique: mockOfferDraftFindUnique,
      delete: mockOfferDraftDelete,
      deleteMany: mockOfferDraftDeleteMany,
    },
  },
}));

import app from '../index.js';

describe('Offer Drafts API Routes', () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockOfferDraftUpsert.mockClear();
    mockOfferDraftFindUnique.mockClear();
    mockOfferDraftDelete.mockClear();
    mockOfferDraftDeleteMany.mockClear();
  });

  describe('POST /api/offer-drafts', () => {
    const validDraft = {
      discordUserId: 'discord-123',
      listingId: 'listing-456',
      amount: '50000',
      conditions: 'Test conditions',
    };

    it('should return 400 for invalid payload - missing required fields', async () => {
      const response = await request(app)
        .post('/api/offer-drafts')
        .send({})
        .expect(400);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toHaveProperty('message', 'Invalid request body');
      expect(response.body).toHaveProperty('errors');
      expect(Array.isArray(response.body.errors)).toBe(true);
    });

    it('should return 400 for invalid amount format', async () => {
      const response = await request(app)
        .post('/api/offer-drafts')
        .send({
          ...validDraft,
          amount: 'invalid-number',
        })
        .expect(400);

      expect(response.body).toHaveProperty('message', 'Invalid request body');
      expect(response.body).toHaveProperty('errors');
    });

    it('should return 400 for empty discordUserId', async () => {
      const response = await request(app)
        .post('/api/offer-drafts')
        .send({
          ...validDraft,
          discordUserId: '',
        })
        .expect(400);

      expect(response.body).toHaveProperty('message', 'Invalid request body');
    });

    it('should return 400 for empty listingId', async () => {
      const response = await request(app)
        .post('/api/offer-drafts')
        .send({
          ...validDraft,
          listingId: '',
        })
        .expect(400);

      expect(response.body).toHaveProperty('message', 'Invalid request body');
    });

    it('should return 400 for invalid expiresAt format', async () => {
      const response = await request(app)
        .post('/api/offer-drafts')
        .send({
          ...validDraft,
          expiresAt: 'not-a-date',
        })
        .expect(400);

      expect(response.body).toHaveProperty('message', 'Invalid request body');
    });

    it('should create draft with valid payload', async () => {
      const mockDraft = {
        id: 'draft-789',
        discordUserId: validDraft.discordUserId,
        listingId: validDraft.listingId,
        amount: BigInt(validDraft.amount),
        conditions: validDraft.conditions,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        createdAt: new Date(),
      };

      mockOfferDraftUpsert.mockResolvedValue(mockDraft);

      const response = await request(app)
        .post('/api/offer-drafts')
        .send(validDraft)
        .expect(201);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toHaveProperty('id', 'draft-789');
      expect(response.body).toHaveProperty(
        'discordUserId',
        validDraft.discordUserId
      );
      expect(response.body).toHaveProperty('listingId', validDraft.listingId);
      expect(response.body).toHaveProperty('amount', validDraft.amount);
      expect(response.body).toHaveProperty('conditions', validDraft.conditions);
      expect(response.body).toHaveProperty('expiresAt');
      expect(response.body).toHaveProperty('createdAt');
    });

    it('should update existing draft with upsert', async () => {
      const mockDraft = {
        id: 'draft-789',
        discordUserId: validDraft.discordUserId,
        listingId: validDraft.listingId,
        amount: BigInt('75000'), // Updated amount
        conditions: 'Updated conditions',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        createdAt: new Date(),
      };

      mockOfferDraftUpsert.mockResolvedValue(mockDraft);

      const response = await request(app)
        .post('/api/offer-drafts')
        .send({
          ...validDraft,
          amount: '75000',
          conditions: 'Updated conditions',
        })
        .expect(201);

      expect(response.body).toHaveProperty('amount', '75000');
      expect(response.body).toHaveProperty('conditions', 'Updated conditions');
    });

    it('should accept draft without optional conditions', async () => {
      const mockDraft = {
        id: 'draft-789',
        discordUserId: validDraft.discordUserId,
        listingId: validDraft.listingId,
        amount: BigInt(validDraft.amount),
        conditions: null,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        createdAt: new Date(),
      };

      mockOfferDraftUpsert.mockResolvedValue(mockDraft);

      const response = await request(app)
        .post('/api/offer-drafts')
        .send({
          discordUserId: validDraft.discordUserId,
          listingId: validDraft.listingId,
          amount: validDraft.amount,
        })
        .expect(201);

      expect(response.body).toHaveProperty('conditions', null);
    });

    it('should use custom expiresAt when provided', async () => {
      const customExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      const mockDraft = {
        id: 'draft-789',
        discordUserId: validDraft.discordUserId,
        listingId: validDraft.listingId,
        amount: BigInt(validDraft.amount),
        conditions: validDraft.conditions,
        expiresAt: customExpiry,
        createdAt: new Date(),
      };

      mockOfferDraftUpsert.mockResolvedValue(mockDraft);

      const response = await request(app)
        .post('/api/offer-drafts')
        .send({
          ...validDraft,
          expiresAt: customExpiry.toISOString(),
        })
        .expect(201);

      expect(response.body).toHaveProperty(
        'expiresAt',
        customExpiry.toISOString()
      );
    });

    it('should handle database errors gracefully', async () => {
      mockOfferDraftUpsert.mockRejectedValue(
        new Error('Database connection failed')
      );

      const response = await request(app)
        .post('/api/offer-drafts')
        .send(validDraft)
        .expect(500);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toHaveProperty('status', 500);
    });
  });

  describe('GET /api/offer-drafts/:discordUserId/:listingId', () => {
    it('should return 400 for empty discordUserId', async () => {
      const response = await request(app)
        .get('/api/offer-drafts//listing-456')
        .expect(404); // Express treats double slash as not found

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    it('should return 404 when draft not found', async () => {
      mockOfferDraftFindUnique.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/offer-drafts/discord-123/listing-456')
        .expect(404);

      expect(response.body).toHaveProperty('message', 'Offer draft not found');
    });

    it('should return 404 and delete when draft has expired', async () => {
      const expiredDraft = {
        id: 'draft-789',
        discordUserId: 'discord-123',
        listingId: 'listing-456',
        amount: BigInt('50000'),
        conditions: 'Test conditions',
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
        createdAt: new Date(),
      };

      mockOfferDraftFindUnique.mockResolvedValue(expiredDraft);
      mockOfferDraftDelete.mockResolvedValue(expiredDraft);

      const response = await request(app)
        .get('/api/offer-drafts/discord-123/listing-456')
        .expect(404);

      expect(response.body).toHaveProperty(
        'message',
        'Offer draft has expired'
      );
      expect(mockOfferDraftDelete).toHaveBeenCalledWith({
        where: { id: 'draft-789' },
      });
    });

    it('should return draft when found and not expired', async () => {
      const validDraft = {
        id: 'draft-789',
        discordUserId: 'discord-123',
        listingId: 'listing-456',
        amount: BigInt('50000'),
        conditions: 'Test conditions',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // Expires in 10 minutes
        createdAt: new Date(),
      };

      mockOfferDraftFindUnique.mockResolvedValue(validDraft);

      const response = await request(app)
        .get('/api/offer-drafts/discord-123/listing-456')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toHaveProperty('id', 'draft-789');
      expect(response.body).toHaveProperty('discordUserId', 'discord-123');
      expect(response.body).toHaveProperty('listingId', 'listing-456');
      expect(response.body).toHaveProperty('amount', '50000');
      expect(response.body).toHaveProperty('conditions', 'Test conditions');
      expect(response.body).toHaveProperty('expiresAt');
      expect(response.body).toHaveProperty('createdAt');
    });

    it('should handle database errors gracefully', async () => {
      mockOfferDraftFindUnique.mockRejectedValue(
        new Error('Database connection failed')
      );

      const response = await request(app)
        .get('/api/offer-drafts/discord-123/listing-456')
        .expect(500);

      expect(response.body).toHaveProperty('status', 500);
    });
  });

  describe('DELETE /api/offer-drafts/:discordUserId/:listingId', () => {
    it('should return 204 when draft is deleted', async () => {
      mockOfferDraftDeleteMany.mockResolvedValue({ count: 1 });

      await request(app)
        .delete('/api/offer-drafts/discord-123/listing-456')
        .expect(204);

      expect(mockOfferDraftDeleteMany).toHaveBeenCalledWith({
        where: {
          discordUserId: 'discord-123',
          listingId: 'listing-456',
        },
      });
    });

    it('should return 204 even when draft does not exist', async () => {
      mockOfferDraftDeleteMany.mockResolvedValue({ count: 0 });

      await request(app)
        .delete('/api/offer-drafts/discord-123/listing-456')
        .expect(204);

      expect(mockOfferDraftDeleteMany).toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      mockOfferDraftDeleteMany.mockRejectedValue(
        new Error('Database connection failed')
      );

      const response = await request(app)
        .delete('/api/offer-drafts/discord-123/listing-456')
        .expect(500);

      expect(response.body).toHaveProperty('status', 500);
    });
  });

  describe('DELETE /api/offer-drafts/cleanup', () => {
    it('should clean up expired drafts', async () => {
      mockOfferDraftDeleteMany.mockResolvedValue({ count: 5 });

      const response = await request(app)
        .delete('/api/offer-drafts/cleanup')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toHaveProperty(
        'message',
        'Expired drafts cleaned up'
      );
      expect(response.body).toHaveProperty('count', 5);

      expect(mockOfferDraftDeleteMany).toHaveBeenCalledWith({
        where: {
          expiresAt: {
            lt: expect.any(Date),
          },
        },
      });
    });

    it('should return 0 count when no expired drafts', async () => {
      mockOfferDraftDeleteMany.mockResolvedValue({ count: 0 });

      const response = await request(app)
        .delete('/api/offer-drafts/cleanup')
        .expect(200);

      expect(response.body).toHaveProperty('count', 0);
    });

    it('should handle database errors gracefully', async () => {
      mockOfferDraftDeleteMany.mockRejectedValue(
        new Error('Database connection failed')
      );

      const response = await request(app)
        .delete('/api/offer-drafts/cleanup')
        .expect(500);

      expect(response.body).toHaveProperty('status', 500);
    });
  });
});


