import request from 'supertest';

import app from '../index.js';

describe('API Routes', () => {
  describe('POST /api/contracts/:id/upload', () => {
    it('should return 404 for missing contract ID (double slash)', async () => {
      const response = await request(app)
        .post('/api/contracts//upload')
        .expect(404);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toHaveProperty(
        'type',
        'https://bloxtr8.com/problems/not-found'
      );
      expect(response.body).toHaveProperty('title', 'Not Found');
      expect(response.body).toHaveProperty('status', 404);
      expect(response.body).toHaveProperty('detail');
      expect(response.body).toHaveProperty(
        'instance',
        '/api/contracts//upload'
      );
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should return 400 for empty contract ID', async () => {
      const response = await request(app)
        .post('/api/contracts/ /upload')
        .expect(400);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toHaveProperty('type');
      expect(response.body).toHaveProperty('title', 'Bad Request');
      expect(response.body).toHaveProperty('status', 400);
      expect(response.body).toHaveProperty('detail');
      expect(response.body).toHaveProperty('instance');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should return presigned upload URL for valid contract ID', async () => {
      const response = await request(app)
        .post('/api/contracts/valid-id/upload')
        .expect(200);

      expect(response.body).toHaveProperty('uploadUrl');
      expect(response.body).toHaveProperty('key', 'contracts/valid-id.pdf');
      expect(response.body).toHaveProperty('expiresIn', 900);
    });
  });

  describe('GET /api/contracts/:id/pdf', () => {
    it('should return 404 for missing contract ID (double slash)', async () => {
      const response = await request(app)
        .get('/api/contracts//pdf')
        .expect(404);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toHaveProperty(
        'type',
        'https://bloxtr8.com/problems/not-found'
      );
      expect(response.body).toHaveProperty('title', 'Not Found');
      expect(response.body).toHaveProperty('status', 404);
      expect(response.body).toHaveProperty('detail');
      expect(response.body).toHaveProperty('instance', '/api/contracts//pdf');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should return 400 for empty contract ID', async () => {
      const response = await request(app)
        .get('/api/contracts/ /pdf')
        .expect(400);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toHaveProperty('type');
      expect(response.body).toHaveProperty('title', 'Bad Request');
      expect(response.body).toHaveProperty('status', 400);
      expect(response.body).toHaveProperty('detail');
      expect(response.body).toHaveProperty('instance');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should return presigned download URL for valid contract ID', async () => {
      const response = await request(app)
        .get('/api/contracts/valid-id/pdf')
        .expect(200);

      expect(response.body).toHaveProperty('downloadUrl');
      expect(response.body).toHaveProperty('key', 'contracts/valid-id.pdf');
      expect(response.body).toHaveProperty('expiresIn', 3600);
    });
  });
});
