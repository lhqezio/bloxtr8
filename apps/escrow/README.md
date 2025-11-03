# Bloxtr8 Escrow Service

A dedicated service for handling payment escrow operations using Stripe Connect for Roblox game and asset trading.

## Features

- **Stripe Connect Integration**: Secure payment processing with seller onboarding
- **Escrow State Machine**: Robust state management with optimistic locking
- **Webhook Processing**: Real-time payment event handling
- **Audit Trail**: Complete transaction logging for compliance
- **Multi-rail Support**: Stripe (fiat) and USDC (crypto) payment rails

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Marketplace   │    │   Escrow API    │    │   Stripe API    │
│   (apps/api)    │───▶│  (apps/escrow)  │───▶│   Connect       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │   Database      │
                       │   (PostgreSQL)  │
                       └─────────────────┘
```

## API Endpoints

### Escrow Management

- `POST /api/escrow` - Create new escrow
- `GET /api/escrow/:id` - Get escrow details
- `POST /api/escrow/:id/transition` - Transition escrow state
- `POST /api/escrow/:id/release` - Release funds to seller
- `POST /api/escrow/:id/refund` - Refund buyer

### Webhooks

- `POST /api/webhooks/stripe` - Stripe webhook handler

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://...
DATABASE_URL_PRISMA=postgresql://...

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Application
ESCROW_PORT=3001
NODE_ENV=development
```

## Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Run tests
pnpm test

# Build for production
pnpm build
```

## Stripe Connect Flow

### 1. Seller Onboarding

```typescript
// Create Stripe Connect account for seller
const account = await stripe.accounts.create({
  type: 'express',
  country: 'US',
  email: 'seller@example.com',
});
```

### 2. Escrow Creation

```typescript
// Create escrow with Stripe Connect
const escrow = await EscrowService.createEscrow({
  offerId: 'offer_123',
  contractId: 'contract_456',
  rail: 'STRIPE',
  amount: BigInt(5000), // $50.00
  currency: 'USD',
  buyerId: 'buyer_123',
  sellerId: 'seller_456',
  sellerStripeAccountId: 'acct_123',
  buyerFee: 250, // $2.50
  sellerFee: 250, // $2.50
});
```

### 3. Payment Processing

```typescript
// Buyer completes payment
// Webhook automatically transitions to FUNDS_HELD
// Seller delivers asset
// Buyer confirms delivery
// Funds released to seller
```

## State Machine

```
AWAIT_FUNDS ──(payment)──▶ FUNDS_HELD
     │                           │
     │                           ▼
     │                    DELIVERED
     │                           │
     │                           ▼
     └──(timeout)──▶ CANCELLED   RELEASED
```

## Security Features

- **Webhook Signature Verification**: All Stripe webhooks are verified
- **Idempotency**: Duplicate webhook events are handled gracefully
- **Optimistic Locking**: Prevents race conditions in state transitions
- **Audit Logging**: Complete trail of all operations
- **KYC Integration**: High-value trades require verification

## Testing

```bash
# Test Stripe Connect setup
pnpm tsx src/test-stripe-connect.ts

# Run integration tests
pnpm test
```

## Deployment

The service is containerized and can be deployed using Docker:

```bash
# Build Docker image
docker build -t bloxtr8-escrow .

# Run container
docker run -p 3001:3001 bloxtr8-escrow
```

## Monitoring

- Health check: `GET /health`
- Metrics: Built-in logging for all operations
- Alerts: Configure alerts for failed webhooks and state transitions

## Integration with Main API

The escrow service is designed to work alongside the main marketplace API:

1. **Marketplace API** (`apps/api`): Handles listings, offers, contracts
2. **Escrow Service** (`apps/escrow`): Handles payments and fund management
3. **Database**: Shared PostgreSQL instance with proper schema

## Next Steps

1. **USDC Integration**: Add Coinbase Prime integration for crypto payments
2. **Dispute Resolution**: Implement automated dispute handling
3. **Analytics**: Add comprehensive reporting and analytics
4. **Mobile SDK**: Create mobile SDK for escrow operations
