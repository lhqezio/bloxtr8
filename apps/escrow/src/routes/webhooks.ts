import { prisma } from '@bloxtr8/database';
import { Router, type Router as ExpressRouter } from 'express';

import { EscrowService } from '../lib/escrow-service.js';
import { stripe, STRIPE_WEBHOOK_SECRET } from '../lib/stripe.js';

const router: ExpressRouter = Router();

/**
 * Stripe webhook handler
 * POST /api/webhooks/stripe
 */
router.post('/stripe', async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;
  
  if (!sig) {
    return res.status(400).json({ error: 'Missing stripe-signature header' });
  }

  if (!STRIPE_WEBHOOK_SECRET) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  let event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  try {
    // Check if we've already processed this event
    const existingEvent = await prisma.webhookEvent.findUnique({
      where: { eventId: event.id },
    });

    if (existingEvent) {
      console.log(`Event ${event.id} already processed`);
      return res.json({ received: true, status: 'duplicate' });
    }

    // Store the webhook event for idempotency
    await prisma.webhookEvent.create({
      data: {
        eventId: event.id,
        provider: 'stripe',
        processed: false,
      },
    });

    // Process the event
    await EscrowService.handleStripeWebhook(event);

    // Mark as processed
    await prisma.webhookEvent.update({
      where: { eventId: event.id },
      data: { processed: true },
    });

    console.log(`Processed webhook event: ${event.type}`);
    res.json({ received: true, status: 'processed' });
  } catch (error) {
    console.error('Error processing webhook:', error);
    
    // Mark as failed
    await prisma.webhookEvent.update({
      where: { eventId: event.id },
      data: { processed: false },
    });

    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;

