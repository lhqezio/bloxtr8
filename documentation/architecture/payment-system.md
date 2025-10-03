# Payment System

Multi-rail payment system supporting Stripe (≤$10k) and USDC on Base (>$10k).

## Payment Rails

### Routing Logic

```typescript
function determineRail(amount: number): 'STRIPE' | 'USDC_BASE' {
  return amount <= 10000 ? 'STRIPE' : 'USDC_BASE';
}
```

Threshold: **$10,000 USD**

### Why Two Rails?

**Stripe (≤$10k)**:

- Familiar to users (credit cards, bank transfers)
- Built-in fraud protection
- Dispute handling
- Fee: 2.9% + $0.30 per transaction

**USDC on Base (>$10k)**:

- Much lower fees (~$0.01-0.10 gas)
- Fast settlement (minutes)
- Global accessibility
- No chargebacks

**Example cost comparison**:

- $50,000 transaction:
  - Stripe: $1,450.30 in fees (2.9%)
  - USDC: ~$0.10 in gas fees

## Stripe Rail

### Flow

```
1. Offer accepted → Contract signed
2. Create Escrow (rail: STRIPE, status: AWAIT_FUNDS)
3. Create PaymentIntent via Stripe API
4. Send payment link to buyer
5. Buyer completes payment
6. Stripe webhook: payment_intent.succeeded
7. Update Escrow.status = FUNDS_HELD
8. Seller delivers
9. Buyer confirms
10. Create Transfer to seller
11. Update Escrow.status = RELEASED
```

### Implementation

**Create PaymentIntent**:

```typescript
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const paymentIntent = await stripe.paymentIntents.create({
  amount: escrow.amount, // in cents
  currency: 'usd',
  metadata: {
    escrowId: escrow.id,
    offerId: escrow.offerId,
  },
  transfer_group: escrow.id, // For tracking
});

// Store in database
await prisma.stripeEscrow.create({
  data: {
    paymentIntentId: paymentIntent.id,
    escrowId: escrow.id,
  },
});
```

**Webhook Handler**:

```typescript
app.post('/api/webhooks/stripe', async (req, res) => {
  const sig = req.headers['stripe-signature'];

  // Verify signature
  const event = stripe.webhooks.constructEvent(
    req.body,
    sig,
    process.env.STRIPE_WEBHOOK_SECRET
  );

  // Check idempotency
  const existing = await prisma.webhookEvent.findUnique({
    where: { eventId: event.id },
  });
  if (existing) return res.json({ received: true });

  // Process event
  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object;

    await prisma.$transaction([
      // Mark webhook as processed
      prisma.webhookEvent.create({
        data: {
          eventId: event.id,
          provider: 'stripe',
          processed: true,
        },
      }),
      // Update escrow
      prisma.escrow.update({
        where: { id: paymentIntent.metadata.escrowId },
        data: { status: 'FUNDS_HELD' },
      }),
    ]);
  }

  res.json({ received: true });
});
```

**Release Funds**:

```typescript
const stripeEscrow = await prisma.stripeEscrow.findUnique({
  where: { escrowId },
});

// Create transfer to seller
const transfer = await stripe.transfers.create({
  amount: escrow.amount,
  currency: 'usd',
  destination: sellerStripeAccountId,
  transfer_group: escrow.id,
});

await prisma.$transaction([
  prisma.stripeEscrow.update({
    where: { escrowId },
    data: { transferId: transfer.id },
  }),
  prisma.escrow.update({
    where: { id: escrowId },
    data: { status: 'RELEASED' },
  }),
]);
```

### Stripe Connect

For marketplace functionality, use Stripe Connect:

1. Sellers create Connected Accounts
2. Platform collects payment
3. Platform transfers to seller (minus fees)

## USDC on Base Rail

### Flow

```
1. Offer accepted → Contract signed
2. Create Escrow (rail: USDC_BASE, status: AWAIT_FUNDS)
3. Generate unique deposit address (custodian API)
4. Show address + QR code to buyer
5. Buyer sends USDC to address
6. Base network confirms transaction
7. Custodian webhook: deposit.confirmed
8. Screen wallet (TRM + Chainalysis)
9. If clean → Update Escrow.status = FUNDS_HELD
10. Seller delivers
11. Buyer confirms
12. Transfer USDC to seller wallet
13. Update Escrow.status = RELEASED
```

### Implementation

**Generate Deposit Address**:

```typescript
const response = await fetch(`${CUSTODIAN_API}/addresses`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.CUSTODIAN_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    chain: 'BASE',
    currency: 'USDC',
    metadata: {
      escrowId: escrow.id,
    },
  }),
});

const { address } = await response.json();

await prisma.stablecoinEscrow.create({
  data: {
    chain: 'BASE',
    depositAddr: address,
    escrowId: escrow.id,
  },
});
```

**Webhook Handler**:

```typescript
app.post('/api/webhooks/custodian', async (req, res) => {
  // Verify signature
  const signature = req.headers['x-signature'];
  const isValid = verifyWebhookSignature(
    req.body,
    signature,
    process.env.CUSTODIAN_WEBHOOK_SECRET
  );

  if (!isValid) return res.status(401).json({ error: 'Invalid signature' });

  const event = req.body;

  // Check idempotency
  const existing = await prisma.webhookEvent.findUnique({
    where: { eventId: event.id },
  });
  if (existing) return res.json({ received: true });

  if (event.type === 'deposit.confirmed') {
    const { address, transactionHash, amount } = event.data;

    // Find escrow
    const stablecoinEscrow = await prisma.stablecoinEscrow.findFirst({
      where: { depositAddr: address },
      include: { escrow: true },
    });

    // Screen wallet
    const senderWallet = event.data.sender;
    const riskScore = await screenWallet(senderWallet);

    if (riskScore === 'SANCTIONED' || riskScore === 'HIGH') {
      // Initiate refund
      await refundDeposit(address, transactionHash);
      return res.json({ received: true, action: 'refunded' });
    }

    // Update escrow
    await prisma.$transaction([
      prisma.webhookEvent.create({
        data: {
          eventId: event.id,
          provider: 'custodian',
          processed: true,
        },
      }),
      prisma.stablecoinEscrow.update({
        where: { id: stablecoinEscrow.id },
        data: { depositTx: transactionHash },
      }),
      prisma.escrow.update({
        where: { id: stablecoinEscrow.escrowId },
        data: { status: 'FUNDS_HELD' },
      }),
    ]);
  }

  res.json({ received: true });
});
```

**Wallet Screening**:

```typescript
async function screenWallet(address: string): Promise<WalletRisk> {
  // TRM Labs screening
  const trmResponse = await fetch(`${TRM_API}/screen`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.TRM_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ address }),
  });

  const trmData = await trmResponse.json();

  // Chainalysis screening
  const chainResponse = await fetch(`${CHAINALYSIS_API}/sanctions/${address}`);

  const chainData = await chainResponse.json();

  // Combine results
  if (chainData.isSanctioned) return 'SANCTIONED';
  if (trmData.riskScore > 80) return 'HIGH';
  if (trmData.riskScore > 50) return 'MEDIUM';
  return 'LOW';
}
```

**Release Funds**:

```typescript
const stablecoinEscrow = await prisma.stablecoinEscrow.findUnique({
  where: { escrowId },
  include: { escrow: true },
});

// Transfer USDC to seller
const response = await fetch(`${CUSTODIAN_API}/transfers`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.CUSTODIAN_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    from: stablecoinEscrow.depositAddr,
    to: sellerWalletAddress,
    amount: escrow.amount,
    currency: 'USDC',
    chain: 'BASE',
    metadata: {
      escrowId: escrow.id,
    },
  }),
});

const { transactionHash } = await response.json();

await prisma.$transaction([
  prisma.stablecoinEscrow.update({
    where: { escrowId },
    data: { releaseTx: transactionHash },
  }),
  prisma.escrow.update({
    where: { id: escrowId },
    data: { status: 'RELEASED' },
  }),
]);
```

## Database Schema

```prisma
model Escrow {
  id     String      @id @default(cuid())
  rail   EscrowRail  // STRIPE | USDC_BASE
  amount Int
  status EscrowStatus

  stripeEscrow     StripeEscrow?
  stablecoinEscrow StablecoinEscrow?
}

model StripeEscrow {
  id              String @id @default(cuid())
  paymentIntentId String @unique
  transferId      String?
  refundId        String?
  escrowId        String @unique
  escrow          Escrow @relation(fields: [escrowId])
}

model StablecoinEscrow {
  id          String @id @default(cuid())
  chain       String @default("BASE")
  depositAddr String
  depositTx   String?
  releaseTx   String?
  escrowId    String @unique
  escrow      Escrow @relation(fields: [escrowId])
}

model WebhookEvent {
  id        String   @id @default(cuid())
  eventId   String   @unique
  provider  String   // 'stripe' | 'custodian'
  processed Boolean  @default(false)
  createdAt DateTime @default(now())
}

enum EscrowRail {
  STRIPE
  USDC_BASE
}
```

## Security

### Webhook Verification

**Stripe**:

```typescript
const event = stripe.webhooks.constructEvent(
  req.body,
  req.headers['stripe-signature'],
  process.env.STRIPE_WEBHOOK_SECRET
);
```

**Custodian**:

```typescript
function verifyWebhookSignature(body, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(JSON.stringify(body)).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}
```

### Idempotency

All webhooks check `WebhookEvent` table:

```typescript
const existing = await prisma.webhookEvent.findUnique({
  where: { eventId: event.id },
});

if (existing) {
  return res.json({ received: true }); // Already processed
}
```

### Wallet Screening

- **TRM Labs**: Risk scoring
- **Chainalysis**: Sanctions screening
- Automatic refund for high-risk wallets

## Testing

### Stripe Test Mode

```env
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
```

Test cards:

- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`

### USDC Testnet

Use **Base Goerli** testnet:

- Test USDC contract
- Faucet for test USDC
- Test custodian API

## Monitoring

Track metrics:

- Payment success rate by rail
- Average settlement time
- Failed payments
- Webhook processing time
- Wallet screening results

## Future Enhancements

- **ACH**: For domestic transfers
- **Wire Transfers**: For large international
- **Additional Stablecoins**: USDT, DAI
- **Other L2s**: Arbitrum, Optimism
- **Smart Contracts**: On-chain escrow (removes custodian)
