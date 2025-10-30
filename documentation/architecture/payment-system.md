# Payment System

Multi-rail payment system supporting Stripe (≤$10k) and USDC on Base (>$10k), implemented with an event-driven architecture using Apache Kafka.

**Architecture**: Event-driven with Kafka for loose coupling and scalability. See [Escrow System Architecture](escrow/escrow-system-architecture.md) for complete details.

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

## Escrow Initialization Flow

### Getting Payment Init Data

After both parties sign a contract, you can fetch the escrow and payment initialization data:

**Endpoint**: `GET /api/contracts/:id/escrow?userId=<userId>`

**Authorization**: Only the buyer or seller of the contract can access this endpoint.

**Response** (Stripe):

```json
{
  "escrowId": "esc_123",
  "rail": "STRIPE",
  "status": "AWAIT_FUNDS",
  "amount": "250000",
  "currency": "USD",
  "paymentInit": {
    "rail": "STRIPE",
    "paymentIntentId": "pi_placeholder_esc_123",
    "clientSecret": "test_client_secret_pi_placeholder_esc_123"
  }
}
```

**Response** (USDC on Base):

```json
{
  "escrowId": "esc_456",
  "rail": "USDC_BASE",
  "status": "AWAIT_FUNDS",
  "amount": "12500000",
  "currency": "USD",
  "paymentInit": {
    "rail": "USDC_BASE",
    "depositAddr": "0x_placeholder_esc_456",
    "qr": "usdc:0x_placeholder_esc_456"
  }
}
```

**Behavior**:

- If both parties have signed and no escrow exists yet, the contract will be executed automatically
- The endpoint is idempotent and safe to call multiple times
- Returns the existing escrow if it already exists

## Stripe Rail - Event-Driven Flow

```
1. Offer accepted → Contract signed
2. Both parties sign → Contract executed
3. Escrow Service → Kafka: CreateEscrow command
4. Escrow Service → Kafka: EscrowCreated + EscrowAwaitFunds events
5. Escrow Service → Kafka: CreatePaymentIntent command
6. Payments Service → Consume CreatePaymentIntent
7. Payments Service → Create PaymentIntent via Stripe API
8. Payments Service → Kafka: PaymentIntentCreated event
9. GET /api/contracts/:id/escrow → Returns payment init data
10. Buyer completes payment (Stripe UI)
11. Stripe → Webhook: payment_intent.succeeded
12. Payments Service → Verify webhook signature
13. Payments Service → Kafka: StripeWebhookValidated event
14. Payments Service → Kafka: PaymentSucceeded event
15. Escrow Service → Consume PaymentSucceeded
16. Escrow Service → Kafka: EscrowFundsHeld event
17. Seller delivers → POST /api/escrow/:id/mark-delivered
18. API Gateway → Kafka: MarkDelivered command
19. Escrow Service → Kafka: EscrowDelivered event
20. Buyer confirms → POST /api/escrow/:id/release
21. API Gateway → Kafka: ReleaseFunds command
22. Escrow Service → Kafka: TransferToSeller command
23. Payments Service → Create Stripe Transfer
24. Payments Service → Kafka: TransferSucceeded event
25. Escrow Service → Kafka: EscrowReleased event
```

**Event Topics**: See [Topic Catalog](escrow/topic-catalog.md) for topic definitions.
**Event Schemas**: See [Event Schemas](escrow/event-schemas.md) for Protobuf definitions.
**Flow Diagrams**: See [Sequence Flows](escrow/sequence-flows.md) for detailed diagrams.

### Implementation - Event-Driven

**Payments Service** processes payment commands from Kafka and emits events:

**Create PaymentIntent**:

```typescript
// Payments Service consumes CreatePaymentIntent command
async function handleCreatePaymentIntent(command: CreatePaymentIntent) {
  const escrow = await getEscrow(command.escrow_id);

  const paymentIntent = await stripe.paymentIntents.create({
    amount: escrow.amount,
    currency: 'usd',
    metadata: {
      escrowId: escrow.id,
    },
  });

  // Store payment artifact
  await prisma.$transaction(async tx => {
    await tx.paymentArtifact.create({
      data: {
        escrowId: escrow.id,
        provider: 'stripe',
        providerPaymentId: paymentIntent.id,
        kind: 'INTENT',
      },
    });

    // Emit event via outbox
    await tx.outbox.create({
      data: {
        aggregateId: escrow.id,
        eventType: 'PaymentIntentCreated',
        payload: protobufSerialize({
          escrow_id: escrow.id,
          provider: 'stripe',
          provider_payment_id: paymentIntent.id,
          client_secret: paymentIntent.client_secret,
        }),
      },
    });
  });
}
```

**Webhook Handler**:

```typescript
// Payments Service webhook endpoint
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

    await prisma.$transaction(async tx => {
      // Mark webhook as processed
      await tx.webhookEvent.create({
        data: {
          eventId: event.id,
          provider: 'stripe',
          processed: true,
        },
      });

      // Emit events via outbox
      await tx.outbox.create({
        data: {
          aggregateId: paymentIntent.metadata.escrowId,
          eventType: 'StripeWebhookValidated',
          payload: protobufSerialize({
            /* ... */
          }),
        },
      });

      await tx.outbox.create({
        data: {
          aggregateId: paymentIntent.metadata.escrowId,
          eventType: 'PaymentSucceeded',
          payload: protobufSerialize({
            escrow_id: paymentIntent.metadata.escrowId,
            provider: 'stripe',
            provider_payment_id: paymentIntent.id,
            amount_cents: paymentIntent.amount,
            currency: paymentIntent.currency,
          }),
        },
      });
    });
  }

  res.json({ received: true });
});
```

**Release Funds**:

```typescript
// Payments Service consumes TransferToSeller command
async function handleTransferToSeller(command: TransferToSeller) {
  const escrow = await getEscrow(command.escrow_id);
  const paymentArtifact = await getPaymentArtifact(escrow.id);

  // Create transfer to seller
  const transfer = await stripe.transfers.create({
    amount: escrow.amount,
    currency: 'usd',
    destination: command.seller_account_id,
    transfer_group: escrow.id,
  });

  // Emit event via outbox
  await prisma.outbox.create({
    data: {
      aggregateId: escrow.id,
      eventType: 'TransferSucceeded',
      payload: protobufSerialize({
        escrow_id: escrow.id,
        provider: 'stripe',
        transfer_id: transfer.id,
      }),
    },
  });
}
```

### Stripe Connect

For marketplace functionality, use Stripe Connect:

1. Sellers create Connected Accounts
2. Platform collects payment
3. Platform transfers to seller (minus fees)

## USDC on Base Rail - Event-Driven Flow

```
1. Offer accepted → Contract signed
2. Escrow Service → Kafka: CreateEscrow command
3. Escrow Service → Kafka: EscrowCreated + EscrowAwaitFunds events
4. Escrow Service → Kafka: CreatePaymentIntent command
5. Payments Service → Generate unique deposit address (custodian API)
6. Payments Service → Kafka: PaymentIntentCreated event
7. Show address + QR code to buyer
8. Buyer sends USDC to address
9. Base network confirms transaction
10. Custodian → Webhook: deposit.confirmed
11. Payments Service → Verify webhook signature
12. Payments Service → Screen wallet (TRM + Chainalysis)
13. If clean → Kafka: CustodianWebhookValidated event
14. Payments Service → Kafka: PaymentSucceeded event
15. Escrow Service → Kafka: EscrowFundsHeld event
16. Seller delivers
17. Buyer confirms
18. Escrow Service → Kafka: TransferToSeller command
19. Payments Service → Transfer USDC to seller wallet
20. Custodian → Webhook: transfer.completed
21. Payments Service → Kafka: TransferSucceeded event
22. Escrow Service → Kafka: EscrowReleased event
```

**Event Topics**: See [Topic Catalog](escrow/topic-catalog.md) for topic definitions.
**Event Schemas**: See [Event Schemas](escrow/event-schemas.md) for Protobuf definitions.
**Flow Diagrams**: See [Sequence Flows](escrow/sequence-flows.md) for detailed diagrams.

### Implementation - Event-Driven

**Payments Service** processes payment commands and emits events:

**Generate Deposit Address**:

```typescript
// Payments Service consumes CreatePaymentIntent command
async function handleCreatePaymentIntent(command: CreatePaymentIntent) {
  const escrow = await getEscrow(command.escrow_id);

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

  // Store payment artifact and emit event via outbox
  await prisma.$transaction(async tx => {
    await tx.paymentArtifact.create({
      data: {
        escrowId: escrow.id,
        provider: 'custodian',
        providerPaymentId: address,
        kind: 'DEPOSIT_ADDRESS',
      },
    });

    await tx.outbox.create({
      data: {
        aggregateId: escrow.id,
        eventType: 'PaymentIntentCreated',
        payload: protobufSerialize({
          escrow_id: escrow.id,
          provider: 'custodian',
          deposit_address: address,
        }),
      },
    });
  });
}
```

**Webhook Handler**:

```typescript
// Payments Service webhook endpoint
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
    const { address, transactionHash, amount, sender } = event.data;

    // Find escrow
    const paymentArtifact = await prisma.paymentArtifact.findFirst({
      where: { providerPaymentId: address },
      include: { escrow: true },
    });

    // Screen wallet
    const riskScore = await screenWallet(sender);

    if (riskScore === 'SANCTIONED' || riskScore === 'HIGH') {
      // Initiate refund
      await emitRefundCommand(paymentArtifact.escrowId);
      return res.json({ received: true, action: 'refunded' });
    }

    // Emit events via outbox
    await prisma.$transaction(async tx => {
      await tx.webhookEvent.create({
        data: {
          eventId: event.id,
          provider: 'custodian',
          processed: true,
        },
      });

      await tx.outbox.create({
        data: {
          aggregateId: paymentArtifact.escrowId,
          eventType: 'CustodianWebhookValidated',
          payload: protobufSerialize({
            /* ... */
          }),
        },
      });

      await tx.outbox.create({
        data: {
          aggregateId: paymentArtifact.escrowId,
          eventType: 'PaymentSucceeded',
          payload: protobufSerialize({
            escrow_id: paymentArtifact.escrowId,
            provider: 'custodian',
            provider_payment_id: transactionHash,
            amount_cents: parseInt(amount),
            currency: 'USDC',
          }),
        },
      });
    });
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
// Payments Service consumes TransferToSeller command
async function handleTransferToSeller(command: TransferToSeller) {
  const escrow = await getEscrow(command.escrow_id);
  const paymentArtifact = await getPaymentArtifact(escrow.id);

  // Transfer USDC to seller
  const response = await fetch(`${CUSTODIAN_API}/transfers`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.CUSTODIAN_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: paymentArtifact.providerPaymentId,
      to: command.seller_account_id,
      amount: escrow.amount,
      currency: 'USDC',
      chain: 'BASE',
      metadata: {
        escrowId: escrow.id,
      },
    }),
  });

  const { transactionHash } = await response.json();

  // Emit event via outbox
  await prisma.outbox.create({
    data: {
      aggregateId: escrow.id,
      eventType: 'TransferSucceeded',
      payload: protobufSerialize({
        escrow_id: escrow.id,
        provider: 'custodian',
        transfer_id: transactionHash,
      }),
    },
  });
}
```

## Event-Driven Architecture

The payment system is implemented using an event-driven architecture with Apache Kafka. See:

- [Escrow System Architecture](escrow/escrow-system-architecture.md) - Complete architecture overview
- [Topic Catalog](escrow/topic-catalog.md) - Kafka topic definitions for payments
- [Event Schemas](escrow/event-schemas.md) - Protobuf schemas for payment events
- [Sequence Flows](escrow/sequence-flows.md) - Detailed flow diagrams
- [Error Handling](escrow/error-handling-retries.md) - Retry and DLQ strategies

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
