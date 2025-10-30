import request from 'supertest';

import app from '../index.js';

describe('Escrow API Routes', () => {
  describe('POST /api/escrow/:id/mark-delivered', () => {
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
      const response = await request(app)
        .post('/api/escrow/non-existent-id/mark-delivered')
        .send({ userId: 'test-user-id', title: 'Test Delivery' })
        .expect(404);

      expect(response.body).toHaveProperty('title', 'Not Found');
      expect(response.body).toHaveProperty('status', 404);
    });
  });

  describe('POST /api/escrow/:id/confirm-delivery', () => {
    it('should return 400 when userId is missing', async () => {
      const response = await request(app)
        .post('/api/escrow/test-id/confirm-delivery')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('title', 'Bad Request');
      expect(response.body).toHaveProperty('status', 400);
    });

    it('should return 404 when escrow does not exist', async () => {
      const response = await request(app)
        .post('/api/escrow/non-existent-id/confirm-delivery')
        .send({ userId: 'test-user-id' })
        .expect(404);

      expect(response.body).toHaveProperty('title', 'Not Found');
      expect(response.body).toHaveProperty('status', 404);
    });
  });

  describe('POST /api/escrow/:id/simulate-payment', () => {
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
      const response = await request(app)
        .post('/api/escrow/non-existent-id/simulate-payment')
        .send({ userId: 'test-user-id' })
        .expect(404);

      expect(response.body).toHaveProperty('title', 'Not Found');
      expect(response.body).toHaveProperty('status', 404);
    });
  });

  describe('GET /api/escrow/:id/delivery-status', () => {
    it('should return 400 when userId is missing', async () => {
      const response = await request(app)
        .get('/api/escrow/test-id/delivery-status')
        .expect(400);

      expect(response.body).toHaveProperty('title', 'Bad Request');
      expect(response.body).toHaveProperty('status', 400);
    });

    it('should return 404 when escrow does not exist', async () => {
      const response = await request(app)
        .get('/api/escrow/non-existent-id/delivery-status?userId=test-user-id')
        .expect(404);

      expect(response.body).toHaveProperty('title', 'Not Found');
      expect(response.body).toHaveProperty('status', 404);
    });
  });

  describe('Route validation', () => {
    it('should return 404 for invalid escrow route', async () => {
      const response = await request(app).get('/api/escrow').expect(404);

      expect(response.body).toHaveProperty('title', 'Not Found');
    });

    it('should return 404 for escrow route with empty ID', async () => {
      const response = await request(app)
        .post('/api/escrow/ /mark-delivered')
        .send({ userId: 'test-user-id', title: 'Test' })
        .expect(404);

      expect(response.body).toHaveProperty('title', 'Not Found');
    });
  });
});
