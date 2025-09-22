import { config } from '@dotenvx/dotenvx';
import compress from 'compression';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import pkg from 'pg';

import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import apiRoutes from './routes/api.js';
import healthRoutes, { setPool } from './routes/health.js';

const { Pool } = pkg;
// Load environment variables
config();

const app: express.Application = express();
app.use(compress());
const port = process.env.PORT || 3000;

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Middleware
app.use(helmet());
app.use(
  cors({
    credentials: true,
    origin: true,
  })
);
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Set the pool for health routes
setPool(pool);

// Health check routes
app.use('/health', healthRoutes);

// API routes
app.use('/api', apiRoutes);

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// Start server only if not in test environment
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`🚀 Bloxtr8 API running on http://localhost:${port}`);
    console.log(`📊 Health check available at http://localhost:${port}/health`);
  });
}

// Export app for testing
export default app;
