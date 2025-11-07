import path from 'path';
import { fileURLToPath } from 'url';

import express from 'express';

import app, { dbPool } from './app.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const port = process.env.PORT || 3000;

// Static file serving - must be before error handlers
const __filename1 = fileURLToPath(import.meta.url);
const __dirnameLocal = path.dirname(__filename1);
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
    if (dbPool) {
      await dbPool.end();
      console.log('Database pool closed');
    }

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
