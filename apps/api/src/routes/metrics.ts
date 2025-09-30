import { Router } from 'express';

import { metrics } from '../lib/metrics.js';

const router = Router();

// Health check endpoint for monitoring
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Metrics endpoint for monitoring systems
router.get('/metrics', (req, res) => {
  const currentMetrics = metrics.getMetrics();
  const successRate = metrics.getSuccessRate();

  res.status(200).json({
    oauth: {
      attempts: currentMetrics.oauthAttempts,
      success: currentMetrics.oauthSuccess,
      failures: currentMetrics.oauthFailures,
      successRate: `${successRate.toFixed(2)}%`,
    },
    validation: {
      discordFailures: currentMetrics.discordValidationFailures,
      robloxFailures: currentMetrics.robloxValidationFailures,
    },
    timestamp: new Date().toISOString(),
  });
});

export default router;
