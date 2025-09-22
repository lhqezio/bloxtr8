import { Router, type Router as ExpressRouter } from 'express';
import pkg from 'pg';

const { Pool } = pkg;

const router: ExpressRouter = Router();

// Create a separate pool for health checks to avoid conflicts
const healthPool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

router.get('/', async (req, res, _next) => {
  let dbStatus = 'ok';
  let dbError = null;

  try {
    // Run a simple query to check DB connection
    await healthPool.query('SELECT 1');
  } catch (err) {
    dbStatus = 'error';
    dbError =
      typeof err === 'object' && err !== null && 'message' in err
        ? (err as { message: string }).message
        : String(err);
  }

  res.json({
    status: 'ok',
    version: '1.0.0',
    db: dbStatus,
    dbError,
    message: 'Bloxtr8 API is running',
    timestamp: new Date().toISOString(),
  });
});

export default router;
