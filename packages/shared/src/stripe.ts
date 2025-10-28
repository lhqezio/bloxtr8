import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is required');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-09-30.clover',
  typescript: true,
});

export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// Stripe Connect configuration
export const STRIPE_CONNECT_CONFIG = {
  // Use Express Connect accounts for sellers
  accountType: 'express' as const,
  // Enable manual payouts to control when sellers can withdraw funds
  manualPayouts: true,
  // Enable KYC verification for connected accounts
  kycVerification: true,
} as const;

