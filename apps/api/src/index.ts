import path from 'path';
import { fileURLToPath } from 'url';

import { config } from '@dotenvx/dotenvx';
import { toNodeHandler } from 'better-auth/node';
import compress from 'compression';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import pkg from 'pg';

import { auth } from './lib/auth.js';
// import {
//   initializeContractExecutionProcessor,
//   stopContractExecutionProcessor,
// } from './lib/contract-execution-processor.js';
import { validateEnvironment } from './lib/env-validation.js';
// import {
//   initializeOfferExpiryJob,
//   stopOfferExpiryJob,
// } from './lib/offer-expiry.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import apiRoutes from './routes/api.js';
import healthRoutes, { setPool } from './routes/health.js';

const { Pool } = pkg;
// Load environment variables
config();

// Validate environment variables at startup
try {
  validateEnvironment();
} catch (error) {
  console.error('❌ Environment validation failed:', error);
  if (process.env.NODE_ENV !== 'test') {
    process.exit(1);
  }
}

const app: express.Application = express();

// Trust proxy configuration for proper IP extraction
// This prevents IP spoofing by only trusting headers from trusted proxies
if (process.env.TRUSTED_PROXIES) {
  app.set(
    'trust proxy',
    process.env.TRUSTED_PROXIES.split(',').map(ip => ip.trim())
  );
} else if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', true); // Trust first proxy in production
} else {
  app.set('trust proxy', 'loopback'); // Only trust localhost in development
}

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
    origin: ['http://localhost:5173'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
// Handle CORS preflight requests globally to avoid 404 on OPTIONS
app.options('*', cors());

// Mount Better Auth after CORS so preflight works
app.all('/api/auth/*', toNodeHandler(auth)); // For ExpressJS v4
// Mount express.json after Better Auth per docs with size limit
app.use(express.json({ limit: '10mb' })); // Prevent huge payload attacks

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Set the pool for health routes
setPool(pool);

// Health check routes
app.use('/health', healthRoutes);

// API routes
app.use('/api', apiRoutes);

// Static file serving - must be before error handlers
const __filename = fileURLToPath(import.meta.url);
const __dirnameLocal = path.dirname(__filename);
// When running from dist/, go up one level to find public folder
const staticDir = path.resolve(__dirnameLocal, '..', 'public');
app.use(express.static(staticDir));

// SPA fallback: let frontend handle routing for non-API paths
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/health')) {
    return next();
  }
  res.sendFile(path.join(staticDir, 'index.html'));
});

// 404 handler - must be after static files and SPA fallback
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// Start server only if not in test environment
if (process.env.NODE_ENV !== 'test') {
  // Initialize background jobs
  // initializeOfferExpiryJob();
  // initializeContractExecutionProcessor();

  const server = app.listen(port, () => {
    console.log(`🚀 Bloxtr8 API running on http://localhost:${port}`);
    console.log(`📊 Health check available at http://localhost:${port}/health`);
  });

  // Graceful shutdown handlers
  const gracefulShutdown = async (signal: string) => {
    console.log(`\n${signal} received. Starting graceful shutdown...`);

    // Stop accepting new requests
    server.close(() => {
      console.log('HTTP server closed');
    });

    // Stop cron jobs
    // stopOfferExpiryJob();
    // stopContractExecutionProcessor();

    // Close database pool
    await pool.end();
    console.log('Database pool closed');

    console.log('Graceful shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => {
    gracefulShutdown('SIGTERM').catch(err => {
      console.error('Error during graceful shutdown:', err);
      process.exit(1);
    });
  });
  process.on('SIGINT', () => {
    gracefulShutdown('SIGINT').catch(err => {
      console.error('Error during graceful shutdown:', err);
      process.exit(1);
    });
  });
}

// Export app for testing
export default app;
