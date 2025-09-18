import { config } from '@dotenvx/dotenvx';
import compress from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pkg from 'pg';

const { Pool } = pkg;
// Load environment variables
config();

const app = express();
app.use(compress());
const port = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
// Basic health check route
app.get('/health', async (req, res) => {
  let dbStatus = 'ok';
  let dbError = null;

  try {
    // Run a simple query to check DB connection
    await pool.query('SELECT 1');
  } catch (err) {
    dbStatus = 'error';
    dbError = typeof err === 'object' && err !== null && 'message' in err ? (err as { message: string }).message : String(err);
  }

  res.json({
    status: 'ok',
    dbStatus,
    dbError,
    message: 'Bloxtr8 API is running',
    timestamp: new Date().toISOString(),
  });
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Bloxtr8 API running on http://localhost:${port}`);
  console.log(`📊 Health check available at http://localhost:${port}/health`);
});
