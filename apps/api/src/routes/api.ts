import { Router, type Router as ExpressRouter } from 'express';

import contractsRouter from './contracts.js';
import listingsRouter from './listings.js';
import offersRouter from './offers.js';
import usersRouter from './users.js';

const router: ExpressRouter = Router();

// Mount route modules
router.use('/', usersRouter);
router.use('/', listingsRouter);
router.use('/', offersRouter);
router.use('/', contractsRouter);

export default router;
