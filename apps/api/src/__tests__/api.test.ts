import request from 'supertest';
import app from '../index';

describe('Bloxtr8 API', () => {
  describe('Health Endpoint', () => {
    it('should return health status with 200', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('version', '1.0.0');
      expect(response.body).toHaveProperty('message', 'Bloxtr8 API is running');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('db');
    });

    it('should return proper content type', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });

  describe('API Endpoints', () => {
    describe('POST /api/contracts/:id/upload', () => {
      it('should return 404 for missing contract ID (double slash)', async () => {
        const response = await request(app)
          .post('/api/contracts//upload')
          .expect(404);

        expect(response.headers['content-type']).toMatch(/application\/json/);
        expect(response.body).toHaveProperty('type', 'https://bloxtr8.com/problems/not-found');
        expect(response.body).toHaveProperty('title', 'Not Found');
        expect(response.body).toHaveProperty('status', 404);
        expect(response.body).toHaveProperty('detail');
        expect(response.body).toHaveProperty('instance', '/api/contracts//upload');
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
    });

    describe('GET /api/contracts/:id/pdf', () => {
      it('should return 404 for missing contract ID (double slash)', async () => {
        const response = await request(app)
          .get('/api/contracts//pdf')
          .expect(404);

        expect(response.headers['content-type']).toMatch(/application\/json/);
        expect(response.body).toHaveProperty('type', 'https://bloxtr8.com/problems/not-found');
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
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent routes', async () => {
      const response = await request(app)
        .get('/api/non-existent')
        .expect(404);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toHaveProperty('type', 'https://bloxtr8.com/problems/not-found');
      expect(response.body).toHaveProperty('title', 'Not Found');
      expect(response.body).toHaveProperty('status', 404);
      expect(response.body).toHaveProperty('detail');
      expect(response.body).toHaveProperty('instance', '/api/non-existent');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should return 404 for root path', async () => {
      const response = await request(app)
        .get('/')
        .expect(404);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toHaveProperty('type', 'https://bloxtr8.com/problems/not-found');
      expect(response.body).toHaveProperty('title', 'Not Found');
      expect(response.body).toHaveProperty('status', 404);
      expect(response.body).toHaveProperty('detail');
      expect(response.body).toHaveProperty('instance', '/');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('Security Headers', () => {
    it('should include security headers from helmet', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers).toHaveProperty('x-content-type-options', 'nosniff');
      expect(response.headers).toHaveProperty('x-frame-options', 'SAMEORIGIN');
      expect(response.headers).toHaveProperty('x-xss-protection', '0');
    });

    it('should include CORS headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers).toHaveProperty('access-control-allow-credentials');
      expect(response.headers).toHaveProperty('vary');
    });
  });

  describe('Rate Limiting', () => {
    it('should include rate limit headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers).toHaveProperty('ratelimit-limit');
      expect(response.headers).toHaveProperty('ratelimit-remaining');
      expect(response.headers).toHaveProperty('ratelimit-reset');
    });
  });

  describe('Content Type Validation', () => {
    it('should return problem+json for errors', async () => {
      const response = await request(app)
        .get('/api/non-existent')
        .expect(404);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      
      // Verify it follows RFC 7807 Problem Details format
      expect(response.body).toHaveProperty('type');
      expect(response.body).toHaveProperty('title');
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('detail');
      expect(response.body).toHaveProperty('instance');
      expect(response.body).toHaveProperty('timestamp');
    });
  });
});
