import type { Request } from 'express';
import request from 'supertest';

// Mock Prisma client before importing app
jest.mock('@bloxtr8/database', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    listing: {
      create: jest.fn().mockResolvedValue({}),
    },
  })),
}));

import app from '../index.js';
import { AppError, createProblemDetails } from '../middleware/errorHandler.js';

describe('Error Handling', () => {
  describe('404 Errors', () => {
    it('should return 404 for non-existent routes', async () => {
      const response = await request(app).get('/api/non-existent').expect(404);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toHaveProperty(
        'type',
        'https://bloxtr8.com/problems/not-found'
      );
      expect(response.body).toHaveProperty('title', 'Not Found');
      expect(response.body).toHaveProperty('status', 404);
      expect(response.body).toHaveProperty('detail');
      expect(response.body).toHaveProperty('instance', '/api/non-existent');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should return 404 for root path', async () => {
      const response = await request(app).get('/').expect(404);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toHaveProperty(
        'type',
        'https://bloxtr8.com/problems/not-found'
      );
      expect(response.body).toHaveProperty('title', 'Not Found');
      expect(response.body).toHaveProperty('status', 404);
      expect(response.body).toHaveProperty('detail');
      expect(response.body).toHaveProperty('instance', '/');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('Error Handler Coverage', () => {
    it('should handle AppError with custom status code', async () => {
      // This tests the branch where error instanceof AppError is true
      const response = await request(app)
        .post('/api/contracts/ /upload')
        .expect(400);

      expect(response.body).toHaveProperty('status', 400);
      expect(response.body).toHaveProperty('title', 'Bad Request');
      expect(response.body).toHaveProperty(
        'type',
        'https://bloxtr8.com/problems/bad-request'
      );
    });

    it('should handle various HTTP status codes', async () => {
      // Test different status codes to cover more branches in error handler
      const responses = [
        {
          path: '/api/contracts/ /upload',
          method: 'post',
          expectedStatus: 400,
          expectedType: 'bad-request',
        },
        {
          path: '/api/non-existent',
          method: 'get',
          expectedStatus: 404,
          expectedType: 'not-found',
        },
      ];

      for (const { path, method, expectedStatus, expectedType } of responses) {
        const response =
          method === 'post'
            ? await request(app).post(path).expect(expectedStatus)
            : await request(app).get(path).expect(expectedStatus);

        expect(response.body).toHaveProperty(
          'type',
          `https://bloxtr8.com/problems/${expectedType}`
        );
        expect(response.body).toHaveProperty('title');
        expect(response.body).toHaveProperty('status', expectedStatus);
      }
    });

    it('should handle unknown status codes with fallback', async () => {
      // Create a custom AppError with an unknown status code to test the fallback
      const customError = new AppError('Custom error', 999);

      // We can't easily test this through the API, but we can verify the error handler
      // handles unknown status codes by testing the error creation logic
      expect(customError.statusCode).toBe(999);
      expect(customError.message).toBe('Custom error');
      expect(customError.isOperational).toBe(true);
    });

    it('should test error handler fallback cases directly', () => {
      // Test the createProblemDetails function directly with unknown status codes
      const mockReq = {
        originalUrl: '/test',
      } as Request;

      const error = new AppError('Test error', 999); // Unknown status code
      const problemDetails = createProblemDetails(error, mockReq);

      // Should use fallback values for unknown status codes
      expect(problemDetails.type).toBe(
        'https://bloxtr8.com/problems/unknown-error'
      );
      expect(problemDetails.title).toBe('Unknown Error');
      expect(problemDetails.status).toBe(999);
      expect(problemDetails.detail).toBe('Test error');
      expect(problemDetails.instance).toBe('/test');
      expect(problemDetails.timestamp).toBeDefined();
    });
  });

  describe('Content Type Validation', () => {
    it('should return problem+json for errors', async () => {
      const response = await request(app).get('/api/non-existent').expect(404);

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
