import { Router, type Router as ExpressRouter } from 'express';

import escrowRoutes from './escrow.js';
import healthRoutes from './health.js';
import webhookRoutes from './webhooks.js';

const router: ExpressRouter = Router();

// Mount route modules
router.use('/health', healthRoutes);
router.use('/escrow', escrowRoutes);
router.use('/webhooks', webhookRoutes);

export default router;
