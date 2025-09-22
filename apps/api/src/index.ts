import { createPresignedPutUrl, createPresignedGetUrl } from '@bloxtr8/storage';
import { config } from '@dotenvx/dotenvx';
import { toNodeHandler } from "better-auth/node";
import compress from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pkg from 'pg';

import { auth } from "./lib/auth.js";
const { Pool } = pkg;
// Load environment variables
config();

const app = express();
const port = process.env.PORT || 3000;
app.all("/api/auth/*", toNodeHandler(auth));


app.use(compress());

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

// PDF upload endpoint - returns presigned PUT URL
app.post('/contracts/:id/upload', async (req, res) => {
  try {
    const { id } = req.params;
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
app.get('/contracts/:id/pdf', async (req, res) => {
  try {
    const { id } = req.params;
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

// Start server
app.listen(port, () => {
  console.log(`🚀 Bloxtr8 API running on http://localhost:${port}`);
  console.log(`📊 Health check available at http://localhost:${port}/health`);
});
