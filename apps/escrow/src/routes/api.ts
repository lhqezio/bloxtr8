import { Router, type Router as ExpressRouter } from 'express';

import healthRoutes from './health.js';

const router: ExpressRouter = Router();

// Mount route modules
router.use('/health', healthRoutes);

export default router;
