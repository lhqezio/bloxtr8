import { createPresignedPutUrl, createPresignedGetUrl } from '@bloxtr8/storage';
import { config } from '@dotenvx/dotenvx';
import compress from 'compression';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import pkg from 'pg';

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
app.use(cors({
  credentials: true,
  origin: true
}));
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

// API routes
app.use('/api', express.Router());

// PDF upload endpoint - returns presigned PUT URL
app.post('/api/contracts/:id/upload', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate contract ID
    if (!id || id.trim() === '') {
      return res.status(400).json({
        type: 'https://bloxtr8.com/problems/bad-request',
        title: 'Bad Request',
        status: 400,
        detail: 'Contract ID is required and cannot be empty',
        instance: req.path,
        timestamp: new Date().toISOString(),
      });
    }
    
    const key = `contracts/${id}.pdf`;
    const presignedUrl = await createPresignedPutUrl(key);

    res.json({
      uploadUrl: presignedUrl,
      key,
      expiresIn: 900, // 15 minutes
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

// PDF download endpoint - returns presigned GET URL
app.get('/api/contracts/:id/pdf', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate contract ID
    if (!id || id.trim() === '') {
      return res.status(400).json({
        type: 'https://bloxtr8.com/problems/bad-request',
        title: 'Bad Request',
        status: 400,
        detail: 'Contract ID is required and cannot be empty',
        instance: req.path,
        timestamp: new Date().toISOString(),
      });
    }
    
    const key = `contracts/${id}.pdf`;
    const presignedUrl = await createPresignedGetUrl(key);

    res.json({
      downloadUrl: presignedUrl,
      key,
      expiresIn: 3600, // 1 hour
    });
  } catch (error) {
    console.error('Get Contract error:', error);
    res.status(500).json({ error: 'Failed to generate download URL' });
  }
});

// Error handling middleware
app.use((req, res, _next) => {
  res.status(404).json({
    type: 'https://bloxtr8.com/problems/not-found',
    title: 'Not Found',
    status: 404,
    detail: `The requested resource ${req.path} was not found`,
    instance: req.path,
    timestamp: new Date().toISOString(),
  });
});

// Global error handler
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    type: 'https://bloxtr8.com/problems/internal-server-error',
    title: 'Internal Server Error',
    status: 500,
    detail: 'An unexpected error occurred',
    instance: req.path,
    timestamp: new Date().toISOString(),
  });
});

// Start server only if not in test environment
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`🚀 Bloxtr8 API running on http://localhost:${port}`);
    console.log(`📊 Health check available at http://localhost:${port}/health`);
  });
}

// Export app for testing
export default app;
