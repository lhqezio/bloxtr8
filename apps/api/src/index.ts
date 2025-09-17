import compress from 'compression';
import cors from 'cors';
import { config } from '@dotenvx/dotenvx';
import express from 'express';
import helmet from 'helmet';

// Load environment variables
config();

const app = express();
app.use(compress());
const port = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Basic health check route
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Bloxtr8 API is running',
    timestamp: new Date().toISOString(),
  });
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Bloxtr8 API running on http://localhost:${port}`);
  console.log(`📊 Health check available at http://localhost:${port}/health`);
});
