import { Router, type Router as ExpressRouter } from 'express';

import authRouter from './auth.js';
import contractsRouter from './contracts.js';
import listingsRouter from './listings.js';
import metricsRouter from './metrics.js';
import offersRouter from './offers.js';
import usersRouter from './users.js';

const router: ExpressRouter = Router();

// Mount route modules
router.use('/oauth', authRouter); // Changed from /auth to /oauth to avoid Better Auth conflict
router.use('/', usersRouter);
router.use('/', listingsRouter);
router.use('/', offersRouter);
router.use('/', contractsRouter);
router.use('/', metricsRouter);

export default router;
