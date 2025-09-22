import { Router, type Router as ExpressRouter } from 'express';
import type { Pool } from 'pg';

const router: ExpressRouter = Router();

// Use the existing pool from the main app
// This will be set by the main app when mounting the routes
let pool: Pool | null = null;

export const setPool = (dbPool: Pool) => {
  pool = dbPool;
};

router.get('/', async (req, res, _next) => {
  let dbStatus = 'ok';
  let dbError = null;

  if (pool) {
    try {
      // Run a simple query to check DB connection
      await pool.query('SELECT 1');
    } catch (err) {
      dbStatus = 'error';
      dbError =
        typeof err === 'object' && err !== null && 'message' in err
          ? (err as { message: string }).message
          : String(err);
    }
  } else {
    dbStatus = 'error';
    dbError = 'Database pool not initialized';
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
