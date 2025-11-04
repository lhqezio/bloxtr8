# Payments Service Design Document

## Overview

This document defines the complete design for the Payments Service, which serves as the payment processing engine for Bloxtr8. The Payments Service handles payment operations across multiple payment rails (Stripe and Custodian), processes webhooks from payment providers, performs wallet screening for compliance, stores payment artifacts, and emits domain events for downstream consumers.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Stripe Integration Architecture](#stripe-integration-architecture)
3. [Custodian Integration Architecture](#custodian-integration-architecture)
4. [Webhook Processing Patterns](#webhook-processing-patterns)
5. [Wallet Screening Integration](#wallet-screening-integration)
6. [Payment Artifact Storage](#payment-artifact-storage)
7. [Command Handlers](#command-handlers)
8. [Event Emission Patterns](#event-emission-patterns)

## Architecture Overview

### Service Role

The Payments Service is responsible for:

- **Payment Rail Management**: Handles payments via Stripe (≤$10k) and Custodian (USDC on Base, >$10k)
- **Payment Intent Creation**: Creates PaymentIntents (Stripe) or deposit addresses (Custodian)
- **Webhook Processing**: Receives and processes webhooks from Stripe and Custodian providers
- **Wallet Screening**: Screens cryptocurrency wallets using TRM Labs and Chainalysis APIs
- **Fund Transfers**: Transfers funds to sellers and processes refunds to buyers
- **Artifact Storage**: Maintains complete audit trail of all payment artifacts
- **Event Publishing**: Emits payment domain events via transactional outbox pattern
- **Idempotency Management**: Ensures webhook events and commands are processed exactly once

### Technology Stack

- **Runtime**: Node.js 20+ with TypeScript
- **Database**: PostgreSQL 14+ via Prisma ORM
- **Event Bus**: Apache Kafka with Protobuf serialization
- **Payment Providers**:
  - Stripe SDK (Stripe Connect)
  - Custodian API (REST-based)
- **Wallet Screening**:
  - TRM Labs API
  - Chainalysis API
- **Event Publishing**: Transactional Outbox Pattern
- **Web Framework**: Express.js (for webhook endpoints)

### Communication Patterns

```
Escrow Service → Kafka (Commands) → Payments Service → Stripe/Custodian APIs
                                                              ↓
                                                      Webhook Events
                                                              ↓
                                    Payments Service → PostgreSQL → Outbox
                                                              ↓
                                                        Kafka (Events)
                                                              ↓
                                                    Escrow Service
```

### Service Boundaries

The Payments Service operates independently from the Escrow Service:

- **Escrow Service**: Manages escrow state machine and business logic
- **Payments Service**: Handles payment provider interactions and webhook processing
- **Communication**: Via Kafka commands and events
- **Decoupling**: Services can scale independently

### Integration Points

1. **Escrow Service**:
   - Consumes: `CreatePaymentIntent`, `TransferToSeller`, `RefundBuyer` commands
   - Produces: `PaymentIntentCreated`, `PaymentSucceeded`, `TransferSucceeded`, `RefundSucceeded` events

2. **Stripe**:
   - REST API for PaymentIntents, Transfers, Refunds
   - Webhook endpoint for event notifications

3. **Custodian**:
   - REST API for deposit address generation, transfers, refunds
   - Webhook endpoint for deposit/transfer confirmations

4. **Wallet Screening Providers**:
   - TRM Labs API for risk scoring
   - Chainalysis API for sanctions screening

## Stripe Integration Architecture

### Stripe Connect Setup

**Configuration**:

- **Account Type**: Express Connect accounts for sellers
- **Payout Mode**: Manual payouts (platform controls when sellers receive funds)
- **KYC Requirements**: Enabled for all connected accounts
- **Application Fee**: Charged to buyer at payment time
- **Transfer Fee**: Platform fee deducted from seller transfer

**Environment Variables**:

```typescript
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_APPLICATION_FEE_PERCENT=2.9 // Platform fee percentage
STRIPE_CONNECT_CLIENT_ID=ca_...
```

### PaymentIntent Creation Flow

**Command**: `CreatePaymentIntentCommand`

**Command Structure**:

```typescript
interface CreatePaymentIntentCommand {
  commandId: string;
  commandType: 'CREATE_PAYMENT_INTENT';
  escrowId: string;
  timestamp: string;
  payload: {
    escrowId: string;
    amount: string; // BigInt serialized as string (cents)
    currency: 'USD';
    sellerStripeAccountId: string; // Stripe Connect account ID
    buyerFee: number; // Application fee in cents
    metadata?: Record<string, string>;
  };
}
```

**Handler Implementation**:

```typescript
export class CreatePaymentIntentCommandHandler {
  constructor(
    private prisma: PrismaClient,
    private stripe: Stripe,
    private eventEmitter: EventEmitter
  ) {}

  async handle(command: CreatePaymentIntentCommand): Promise<void> {
    return this.executeWithIdempotency(command, async () => {
      await this.prisma.$transaction(async tx => {
        // 1. Load escrow
        const escrow = await tx.escrow.findUnique({
          where: { id: command.payload.escrowId },
          include: { stripeEscrow: true, offer: true },
        });

        if (!escrow) {
          throw new EscrowNotFoundError(
            `Escrow ${command.payload.escrowId} not found`
          );
        }

        if (escrow.rail !== 'STRIPE') {
          throw new ValidationError('Escrow rail must be STRIPE');
        }

        // 2. Validate seller has Stripe Connect account
        const seller = await tx.user.findUnique({
          where: { id: escrow.offer.sellerId },
        });

        if (!seller?.stripeAccountId) {
          throw new ValidationError('Seller must have Stripe Connect account');
        }

        // 3. Create PaymentIntent with Stripe Connect
        const paymentIntent = await this.stripe.paymentIntents.create(
          {
            amount: Number(command.payload.amount),
            currency: command.payload.currency.toLowerCase(),
            application_fee_amount: command.payload.buyerFee,
            transfer_data: {
              destination: command.payload.sellerStripeAccountId,
            },
            metadata: {
              escrowId: escrow.id,
              offerId: escrow.offerId,
              contractId: escrow.contractId,
              ...command.payload.metadata,
            },
            receipt_email: escrow.offer.buyer.email,
            automatic_payment_methods: {
              enabled: true,
            },
          },
          {
            idempotencyKey: command.commandId,
          }
        );

        // 4. Update StripeEscrow record
        if (escrow.stripeEscrow) {
          await tx.stripeEscrow.update({
            where: { escrowId: escrow.id },
            data: {
              paymentIntentId: paymentIntent.id,
            },
          });
        } else {
          await tx.stripeEscrow.create({
            data: {
              escrowId: escrow.id,
              paymentIntentId: paymentIntent.id,
            },
          });
        }

        // 5. Store payment artifact
        await tx.paymentArtifact.create({
          data: {
            escrowId: escrow.id,
            provider: 'stripe',
            providerPaymentId: paymentIntent.id,
            kind: 'INTENT',
            amount: BigInt(command.payload.amount),
            currency: command.payload.currency,
            metadata: {
              clientSecret: paymentIntent.client_secret,
              applicationFeeAmount: command.payload.buyerFee,
              sellerAccountId: command.payload.sellerStripeAccountId,
            },
          },
        });

        // 6. Create outbox event
        await tx.outbox.create({
          data: {
            aggregateId: escrow.id,
            eventType: 'PaymentIntentCreated',
            payload: Buffer.from(
              protobufSerialize({
                escrowId: escrow.id,
                provider: 'stripe',
                providerPaymentId: paymentIntent.id,
                clientSecret: paymentIntent.client_secret,
                amount: command.payload.amount,
                currency: command.payload.currency,
                createdAt: new Date().toISOString(),
              })
            ),
            version: 1,
          },
        });
      });
    });
  }
}
```

**Key Features**:

- **Idempotency**: Uses Stripe idempotency key (commandId)
- **Stripe Connect**: Funds route to seller's connected account
- **Application Fee**: Platform fee collected from buyer
- **Metadata**: Escrow context stored in PaymentIntent metadata

### Transfer to Seller Flow

**Command**: `TransferToSellerCommand`

**Command Structure**:

```typescript
interface TransferToSellerCommand {
  commandId: string;
  commandType: 'TRANSFER_TO_SELLER';
  escrowId: string;
  timestamp: string;
  payload: {
    escrowId: string;
    sellerStripeAccountId: string;
    transferAmount: string; // Net amount after seller fee (cents)
    sellerFee: number; // Platform fee deducted from seller (cents)
    reason?: string;
  };
}
```

**Handler Implementation**:

```typescript
export class TransferToSellerCommandHandler {
  constructor(
    private prisma: PrismaClient,
    private stripe: Stripe,
    private eventEmitter: EventEmitter
  ) {}

  async handle(command: TransferToSellerCommand): Promise<void> {
    return this.executeWithIdempotency(command, async () => {
      await this.prisma.$transaction(async tx => {
        // 1. Load escrow and payment artifact
        const escrow = await tx.escrow.findUnique({
          where: { id: command.payload.escrowId },
          include: { stripeEscrow: true, offer: true },
        });

        if (!escrow || !escrow.stripeEscrow) {
          throw new EscrowNotFoundError(`Escrow or StripeEscrow not found`);
        }

        // 2. Retrieve PaymentIntent and Charge
        const paymentIntent = await this.stripe.paymentIntents.retrieve(
          escrow.stripeEscrow.paymentIntentId
        );

        if (paymentIntent.status !== 'succeeded') {
          throw new ValidationError('PaymentIntent not succeeded');
        }

        const charge = paymentIntent.latest_charge as string;
        if (!charge) {
          throw new ValidationError('PaymentIntent has no charge');
        }

        // 3. Create transfer to seller
        const transfer = await this.stripe.transfers.create(
          {
            amount: Number(command.payload.transferAmount),
            currency: paymentIntent.currency,
            destination: command.payload.sellerStripeAccountId,
            source_transaction: charge,
            metadata: {
              escrowId: escrow.id,
              offerId: escrow.offerId,
              sellerFee: command.payload.sellerFee.toString(),
              reason: command.payload.reason || 'Funds released',
            },
          },
          {
            idempotencyKey: command.commandId,
          }
        );

        // 4. Update StripeEscrow
        await tx.stripeEscrow.update({
          where: { escrowId: escrow.id },
          data: {
            transferId: transfer.id,
          },
        });

        // 5. Store payment artifact
        await tx.paymentArtifact.create({
          data: {
            escrowId: escrow.id,
            provider: 'stripe',
            providerPaymentId: transfer.id,
            kind: 'TRANSFER',
            amount: BigInt(command.payload.transferAmount),
            currency: escrow.currency,
            metadata: {
              chargeId: charge,
              sellerFee: command.payload.sellerFee,
              netAmount: command.payload.transferAmount,
            },
          },
        });

        // 6. Create outbox event
        await tx.outbox.create({
          data: {
            aggregateId: escrow.id,
            eventType: 'TransferSucceeded',
            payload: Buffer.from(
              protobufSerialize({
                escrowId: escrow.id,
                provider: 'stripe',
                transferId: transfer.id,
                amount: command.payload.transferAmount,
                currency: escrow.currency,
                timestamp: new Date().toISOString(),
              })
            ),
            version: 1,
          },
        });
      });
    });
  }
}
```

### Refund Buyer Flow

**Command**: `RefundBuyerCommand`

**Command Structure**:

```typescript
interface RefundBuyerCommand {
  commandId: string;
  commandType: 'REFUND_BUYER';
  escrowId: string;
  timestamp: string;
  payload: {
    escrowId: string;
    refundAmount?: string; // Optional partial refund (cents)
    reason: string;
  };
}
```

**Handler Implementation**:

```typescript
export class RefundBuyerCommandHandler {
  constructor(
    private prisma: PrismaClient,
    private stripe: Stripe,
    private eventEmitter: EventEmitter
  ) {}

  async handle(command: RefundBuyerCommand): Promise<void> {
    return this.executeWithIdempotency(command, async () => {
      await this.prisma.$transaction(async tx => {
        // 1. Load escrow and payment artifact
        const escrow = await tx.escrow.findUnique({
          where: { id: command.payload.escrowId },
          include: { stripeEscrow: true },
        });

        if (!escrow || !escrow.stripeEscrow) {
          throw new EscrowNotFoundError(`Escrow or StripeEscrow not found`);
        }

        // 2. Retrieve PaymentIntent and Charge
        const paymentIntent = await this.stripe.paymentIntents.retrieve(
          escrow.stripeEscrow.paymentIntentId,
          { expand: ['latest_charge'] }
        );

        const charge = paymentIntent.latest_charge as Stripe.Charge;
        if (!charge) {
          throw new ValidationError('PaymentIntent has no charge');
        }

        // 3. Determine refund amount
        const refundAmount = command.payload.refundAmount
          ? Number(command.payload.refundAmount)
          : charge.amount;

        if (refundAmount > charge.amount) {
          throw new ValidationError(
            'Refund amount cannot exceed charge amount'
          );
        }

        // 4. Create refund
        const refund = await this.stripe.refunds.create(
          {
            charge: charge.id,
            amount: refundAmount,
            reason: 'requested_by_customer',
            metadata: {
              escrowId: escrow.id,
              reason: command.payload.reason,
            },
          },
          {
            idempotencyKey: command.commandId,
          }
        );

        // 5. Update StripeEscrow
        await tx.stripeEscrow.update({
          where: { escrowId: escrow.id },
          data: {
            refundId: refund.id,
          },
        });

        // 6. Store payment artifact
        await tx.paymentArtifact.create({
          data: {
            escrowId: escrow.id,
            provider: 'stripe',
            providerPaymentId: refund.id,
            kind: 'REFUND',
            amount: BigInt(refundAmount),
            currency: escrow.currency,
            metadata: {
              chargeId: charge.id,
              refundType: refundAmount === charge.amount ? 'FULL' : 'PARTIAL',
              reason: command.payload.reason,
            },
          },
        });

        // 7. Create outbox event
        await tx.outbox.create({
          data: {
            aggregateId: escrow.id,
            eventType: 'RefundSucceeded',
            payload: Buffer.from(
              protobufSerialize({
                escrowId: escrow.id,
                provider: 'stripe',
                refundId: refund.id,
                refundAmount: refundAmount.toString(),
                currency: escrow.currency,
                timestamp: new Date().toISOString(),
              })
            ),
            version: 1,
          },
        });
      });
    });
  }
}
```

### Stripe Webhook Processing

**Webhook Endpoint**: `POST /api/webhooks/stripe`

**Supported Events**:

- `payment_intent.succeeded` - Payment completed
- `payment_intent.payment_failed` - Payment failed
- `transfer.created` - Transfer to seller initiated
- `transfer.paid` - Transfer completed
- `charge.refunded` - Refund processed

**Handler Implementation**:

```typescript
export class StripeWebhookHandler {
  constructor(
    private prisma: PrismaClient,
    private stripe: Stripe,
    private eventEmitter: EventEmitter
  ) {}

  async handleWebhook(req: Request, res: Response): Promise<void> {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig || !webhookSecret) {
      res.status(400).json({ error: 'Missing signature or webhook secret' });
      return;
    }

    let event: Stripe.Event;

    try {
      // Verify webhook signature
      event = this.stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      res.status(400).json({ error: 'Invalid signature' });
      return;
    }

    // Check idempotency
    const existing = await this.prisma.webhookEvent.findUnique({
      where: { eventId: event.id },
    });

    if (existing) {
      res.json({ received: true, status: 'duplicate' });
      return;
    }

    // Process event
    await this.prisma.$transaction(async tx => {
      // Mark webhook as processed
      await tx.webhookEvent.create({
        data: {
          eventId: event.id,
          provider: 'stripe',
          processed: true,
        },
      });

      // Process based on event type
      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.handlePaymentIntentSucceeded(tx, event);
          break;
        case 'payment_intent.payment_failed':
          await this.handlePaymentIntentFailed(tx, event);
          break;
        case 'transfer.paid':
          await this.handleTransferPaid(tx, event);
          break;
        case 'charge.refunded':
          await this.handleChargeRefunded(tx, event);
          break;
        default:
          console.log(`Unhandled event type: ${event.type}`);
      }
    });

    res.json({ received: true });
  }

  private async handlePaymentIntentSucceeded(
    tx: Prisma.TransactionClient,
    event: Stripe.Event
  ): Promise<void> {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    const escrowId = paymentIntent.metadata.escrowId;

    if (!escrowId) {
      console.warn('PaymentIntent missing escrowId metadata');
      return;
    }

    // Find escrow
    const escrow = await tx.escrow.findUnique({
      where: { id: escrowId },
      include: { stripeEscrow: true },
    });

    if (!escrow) {
      console.warn(`Escrow ${escrowId} not found`);
      return;
    }

    // Update StripeEscrow
    if (escrow.stripeEscrow) {
      await tx.stripeEscrow.update({
        where: { escrowId },
        data: {
          amountCaptured: paymentIntent.amount,
          currency: paymentIntent.currency.toUpperCase() as Currency,
          lastWebhookAt: new Date(),
        },
      });
    }

    // Store payment artifact
    await tx.paymentArtifact.create({
      data: {
        escrowId,
        provider: 'stripe',
        providerPaymentId: paymentIntent.id,
        kind: 'CHARGE',
        amount: BigInt(paymentIntent.amount),
        currency: escrow.currency,
        metadata: {
          chargeId: paymentIntent.latest_charge,
          paymentMethod: paymentIntent.payment_method_types?.[0],
        },
      },
    });

    // Create outbox events
    await tx.outbox.create({
      data: {
        aggregateId: escrowId,
        eventType: 'StripeWebhookValidated',
        payload: Buffer.from(
          protobufSerialize({
            escrowId,
            webhookEventId: event.id,
            eventType: event.type,
            timestamp: new Date().toISOString(),
          })
        ),
        version: 1,
      },
    });

    await tx.outbox.create({
      data: {
        aggregateId: escrowId,
        eventType: 'PaymentSucceeded',
        payload: Buffer.from(
          protobufSerialize({
            escrowId,
            provider: 'stripe',
            providerPaymentId: paymentIntent.id,
            amount: paymentIntent.amount.toString(),
            currency: escrow.currency,
            timestamp: new Date().toISOString(),
          })
        ),
        version: 1,
      },
    });
  }

  private async handlePaymentIntentFailed(
    tx: Prisma.TransactionClient,
    event: Stripe.Event
  ): Promise<void> {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    const escrowId = paymentIntent.metadata.escrowId;

    if (!escrowId) return;

    // Emit payment failed event
    await tx.outbox.create({
      data: {
        aggregateId: escrowId,
        eventType: 'PaymentFailed',
        payload: Buffer.from(
          protobufSerialize({
            escrowId,
            provider: 'stripe',
            providerPaymentId: paymentIntent.id,
            error: paymentIntent.last_payment_error?.message,
            timestamp: new Date().toISOString(),
          })
        ),
        version: 1,
      },
    });
  }

  private async handleTransferPaid(
    tx: Prisma.TransactionClient,
    event: Stripe.Event
  ): Promise<void> {
    const transfer = event.data.object as Stripe.Transfer;
    const escrowId = transfer.metadata?.escrowId;

    if (!escrowId) return;

    // Transfer already processed via command handler
    // This webhook confirms the transfer was paid
    await tx.outbox.create({
      data: {
        aggregateId: escrowId,
        eventType: 'TransferConfirmed',
        payload: Buffer.from(
          protobufSerialize({
            escrowId,
            provider: 'stripe',
            transferId: transfer.id,
            timestamp: new Date().toISOString(),
          })
        ),
        version: 1,
      },
    });
  }

  private async handleChargeRefunded(
    tx: Prisma.TransactionClient,
    event: Stripe.Event
  ): Promise<void> {
    const charge = event.data.object as Stripe.Charge;
    const escrowId = charge.metadata?.escrowId;

    if (!escrowId) return;

    // Refund already processed via command handler
    // This webhook confirms the refund was processed
    await tx.outbox.create({
      data: {
        aggregateId: escrowId,
        eventType: 'RefundConfirmed',
        payload: Buffer.from(
          protobufSerialize({
            escrowId,
            provider: 'stripe',
            chargeId: charge.id,
            refundId: charge.refunds?.data[0]?.id,
            timestamp: new Date().toISOString(),
          })
        ),
        version: 1,
      },
    });
  }
}
```

### Error Handling and Retry Logic

**Stripe API Errors**:

```typescript
export class StripeErrorHandler {
  static isRetryable(error: Stripe.StripeError): boolean {
    // Network errors are retryable
    if (error.type === 'StripeConnectionError') {
      return true;
    }

    // Rate limit errors are retryable
    if (error.type === 'StripeRateLimitError') {
      return true;
    }

    // Server errors are retryable
    if (error.statusCode && error.statusCode >= 500) {
      return true;
    }

    return false;
  }

  static async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        if (!this.isRetryable(error as Stripe.StripeError)) {
          throw error;
        }

        if (attempt < maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError!;
  }
}
```

### Fee Structure

**Buyer Fee**:

- Collected at payment time via `application_fee_amount`
- Percentage-based: 2.9% + $0.30 per transaction
- Stored in PaymentIntent metadata

**Seller Fee**:

- Deducted from transfer amount
- Flat fee: $0.50 per transaction
- Net amount transferred to seller

## Custodian Integration Architecture

### Custodian API Setup

**Configuration**:

- **Provider**: Coinbase Prime (or similar custodian service)
- **Chain**: Base (Ethereum L2)
- **Currency**: USDC
- **API Authentication**: Bearer token (API key)

**Environment Variables**:

```typescript
CUSTODIAN_API_URL=https://api.custodian.com
CUSTODIAN_API_KEY=...
CUSTODIAN_WEBHOOK_SECRET=...
CUSTODIAN_WALLET_ID=... // Platform wallet ID
```

### Deposit Address Generation Flow

**Command**: `CreatePaymentIntentCommand` (for USDC_BASE rail)

**Handler Implementation**:

```typescript
export class CreateCustodianPaymentIntentHandler {
  constructor(
    private prisma: PrismaClient,
    private custodianClient: CustodianClient,
    private eventEmitter: EventEmitter
  ) {}

  async handle(command: CreatePaymentIntentCommand): Promise<void> {
    return this.executeWithIdempotency(command, async () => {
      await this.prisma.$transaction(async tx => {
        // 1. Load escrow
        const escrow = await tx.escrow.findUnique({
          where: { id: command.payload.escrowId },
          include: { stablecoinEscrow: true },
        });

        if (!escrow) {
          throw new EscrowNotFoundError(
            `Escrow ${command.payload.escrowId} not found`
          );
        }

        if (escrow.rail !== 'USDC_BASE') {
          throw new ValidationError('Escrow rail must be USDC_BASE');
        }

        // 2. Generate unique deposit address via Custodian API
        const addressResponse = await this.custodianClient.createDepositAddress(
          {
            chain: 'BASE',
            currency: 'USDC',
            metadata: {
              escrowId: escrow.id,
              offerId: escrow.offerId,
              contractId: escrow.contractId,
            },
          }
        );

        // 3. Update StablecoinEscrow record
        if (escrow.stablecoinEscrow) {
          await tx.stablecoinEscrow.update({
            where: { escrowId: escrow.id },
            data: {
              depositAddr: addressResponse.address,
              custodyProvider: addressResponse.provider,
              custodianBuyerWalletId: addressResponse.walletId,
            },
          });
        } else {
          await tx.stablecoinEscrow.create({
            data: {
              escrowId: escrow.id,
              chain: 'BASE',
              depositAddr: addressResponse.address,
              custodyProvider: addressResponse.provider,
              custodianBuyerWalletId: addressResponse.walletId,
              mintAddress: 'USDC_MINT_BASE',
            },
          });
        }

        // 4. Store payment artifact
        await tx.paymentArtifact.create({
          data: {
            escrowId: escrow.id,
            provider: 'custodian',
            providerPaymentId: addressResponse.address,
            kind: 'DEPOSIT_ADDRESS',
            amount: BigInt(0), // Not known until deposit
            currency: 'USDC',
            metadata: {
              chain: 'BASE',
              provider: addressResponse.provider,
              walletId: addressResponse.walletId,
            },
          },
        });

        // 5. Create outbox event
        await tx.outbox.create({
          data: {
            aggregateId: escrow.id,
            eventType: 'PaymentIntentCreated',
            payload: Buffer.from(
              protobufSerialize({
                escrowId: escrow.id,
                provider: 'custodian',
                depositAddress: addressResponse.address,
                chain: 'BASE',
                currency: 'USDC',
                createdAt: new Date().toISOString(),
              })
            ),
            version: 1,
          },
        });
      });
    });
  }
}
```

### Transfer to Seller Flow

**Command**: `TransferToSellerCommand` (for USDC_BASE rail)

**Handler Implementation**:

```typescript
export class TransferToSellerCustodianHandler {
  constructor(
    private prisma: PrismaClient,
    private custodianClient: CustodianClient,
    private eventEmitter: EventEmitter
  ) {}

  async handle(command: TransferToSellerCommand): Promise<void> {
    return this.executeWithIdempotency(command, async () => {
      await this.prisma.$transaction(async tx => {
        // 1. Load escrow and seller
        const escrow = await tx.escrow.findUnique({
          where: { id: command.payload.escrowId },
          include: { stablecoinEscrow: true, offer: true },
        });

        if (!escrow || !escrow.stablecoinEscrow) {
          throw new EscrowNotFoundError(`Escrow or StablecoinEscrow not found`);
        }

        const seller = await tx.user.findUnique({
          where: { id: escrow.offer.sellerId },
        });

        if (!seller?.walletAddress) {
          throw new ValidationError('Seller must have wallet address');
        }

        // 2. Screen seller wallet before transfer
        const walletRisk = await this.screenWallet(seller.walletAddress);
        if (walletRisk === 'SANCTIONED' || walletRisk === 'HIGH') {
          throw new ValidationError('Seller wallet risk too high for transfer');
        }

        // 3. Create transfer via Custodian API
        const transferResponse = await this.custodianClient.createTransfer({
          from: escrow.stablecoinEscrow.custodianBuyerWalletId,
          to: seller.walletAddress,
          amount: command.payload.transferAmount,
          currency: 'USDC',
          chain: 'BASE',
          metadata: {
            escrowId: escrow.id,
            offerId: escrow.offerId,
            sellerFee: command.payload.sellerFee.toString(),
            reason: command.payload.reason || 'Funds released',
          },
        });

        // 4. Update StablecoinEscrow
        await tx.stablecoinEscrow.update({
          where: { escrowId: escrow.id },
          data: {
            releaseTx: transferResponse.transactionHash,
            custodianSellerWalletId: seller.walletAddress,
            onchainSignature: transferResponse.signature,
            version: { increment: 1 },
          },
        });

        // 5. Store payment artifact
        await tx.paymentArtifact.create({
          data: {
            escrowId: escrow.id,
            provider: 'custodian',
            providerPaymentId: transferResponse.transactionHash,
            kind: 'TRANSFER',
            amount: BigInt(command.payload.transferAmount),
            currency: 'USDC',
            metadata: {
              chain: 'BASE',
              fromAddress: escrow.stablecoinEscrow.depositAddr,
              toAddress: seller.walletAddress,
              transactionHash: transferResponse.transactionHash,
              sellerFee: command.payload.sellerFee,
            },
          },
        });

        // 6. Create outbox event
        await tx.outbox.create({
          data: {
            aggregateId: escrow.id,
            eventType: 'TransferSucceeded',
            payload: Buffer.from(
              protobufSerialize({
                escrowId: escrow.id,
                provider: 'custodian',
                transferId: transferResponse.transactionHash,
                amount: command.payload.transferAmount,
                currency: 'USDC',
                timestamp: new Date().toISOString(),
              })
            ),
            version: 1,
          },
        });
      });
    });
  }
}
```

### Refund Buyer Flow

**Command**: `RefundBuyerCommand` (for USDC_BASE rail)

**Handler Implementation**:

```typescript
export class RefundBuyerCustodianHandler {
  constructor(
    private prisma: PrismaClient,
    private custodianClient: CustodianClient,
    private eventEmitter: EventEmitter
  ) {}

  async handle(command: RefundBuyerCommand): Promise<void> {
    return this.executeWithIdempotency(command, async () => {
      await this.prisma.$transaction(async tx => {
        // 1. Load escrow and buyer
        const escrow = await tx.escrow.findUnique({
          where: { id: command.payload.escrowId },
          include: { stablecoinEscrow: true, offer: true },
        });

        if (!escrow || !escrow.stablecoinEscrow) {
          throw new EscrowNotFoundError(`Escrow or StablecoinEscrow not found`);
        }

        const buyer = await tx.user.findUnique({
          where: { id: escrow.offer.buyerId },
        });

        if (!buyer?.walletAddress) {
          throw new ValidationError('Buyer must have wallet address');
        }

        // 2. Determine refund amount
        const refundAmount = command.payload.refundAmount
          ? BigInt(command.payload.refundAmount)
          : escrow.amount;

        if (refundAmount > escrow.amount) {
          throw new ValidationError(
            'Refund amount cannot exceed escrow amount'
          );
        }

        // 3. Create refund transfer via Custodian API
        const refundResponse = await this.custodianClient.createTransfer({
          from: escrow.stablecoinEscrow.custodianBuyerWalletId,
          to: buyer.walletAddress,
          amount: refundAmount.toString(),
          currency: 'USDC',
          chain: 'BASE',
          metadata: {
            escrowId: escrow.id,
            reason: command.payload.reason,
            refundType: refundAmount === escrow.amount ? 'FULL' : 'PARTIAL',
          },
        });

        // 4. Update StablecoinEscrow
        await tx.stablecoinEscrow.update({
          where: { escrowId: escrow.id },
          data: {
            releaseTx: refundResponse.transactionHash,
            onchainSignature: refundResponse.signature,
            version: { increment: 1 },
          },
        });

        // 5. Store payment artifact
        await tx.paymentArtifact.create({
          data: {
            escrowId: escrow.id,
            provider: 'custodian',
            providerPaymentId: refundResponse.transactionHash,
            kind: 'REFUND',
            amount: refundAmount,
            currency: 'USDC',
            metadata: {
              chain: 'BASE',
              fromAddress: escrow.stablecoinEscrow.depositAddr,
              toAddress: buyer.walletAddress,
              transactionHash: refundResponse.transactionHash,
              refundType: refundAmount === escrow.amount ? 'FULL' : 'PARTIAL',
              reason: command.payload.reason,
            },
          },
        });

        // 6. Create outbox event
        await tx.outbox.create({
          data: {
            aggregateId: escrow.id,
            eventType: 'RefundSucceeded',
            payload: Buffer.from(
              protobufSerialize({
                escrowId: escrow.id,
                provider: 'custodian',
                refundId: refundResponse.transactionHash,
                refundAmount: refundAmount.toString(),
                currency: 'USDC',
                timestamp: new Date().toISOString(),
              })
            ),
            version: 1,
          },
        });
      });
    });
  }
}
```

### Custodian Webhook Processing

**Webhook Endpoint**: `POST /api/webhooks/custodian`

**Supported Events**:

- `deposit.confirmed` - Deposit transaction confirmed
- `deposit.failed` - Deposit transaction failed
- `transfer.completed` - Transfer transaction completed
- `transfer.failed` - Transfer transaction failed

**Handler Implementation**:

```typescript
export class CustodianWebhookHandler {
  constructor(
    private prisma: PrismaClient,
    private custodianClient: CustodianClient,
    private walletScreeningService: WalletScreeningService,
    private eventEmitter: EventEmitter
  ) {}

  async handleWebhook(req: Request, res: Response): Promise<void> {
    const signature = req.headers['x-signature'];
    const webhookSecret = process.env.CUSTODIAN_WEBHOOK_SECRET;

    if (!signature || !webhookSecret) {
      res.status(400).json({ error: 'Missing signature or webhook secret' });
      return;
    }

    // Verify webhook signature (HMAC)
    const isValid = this.verifyWebhookSignature(
      req.body,
      signature,
      webhookSecret
    );

    if (!isValid) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    const event = req.body;

    // Check idempotency
    const existing = await this.prisma.webhookEvent.findUnique({
      where: { eventId: event.id },
    });

    if (existing) {
      res.json({ received: true, status: 'duplicate' });
      return;
    }

    // Process event
    await this.prisma.$transaction(async tx => {
      // Mark webhook as processed
      await tx.webhookEvent.create({
        data: {
          eventId: event.id,
          provider: 'custodian',
          processed: true,
        },
      });

      // Process based on event type
      switch (event.type) {
        case 'deposit.confirmed':
          await this.handleDepositConfirmed(tx, event);
          break;
        case 'deposit.failed':
          await this.handleDepositFailed(tx, event);
          break;
        case 'transfer.completed':
          await this.handleTransferCompleted(tx, event);
          break;
        case 'transfer.failed':
          await this.handleTransferFailed(tx, event);
          break;
        default:
          console.log(`Unhandled event type: ${event.type}`);
      }
    });

    res.json({ received: true });
  }

  private verifyWebhookSignature(
    payload: unknown,
    signature: string,
    secret: string
  ): boolean {
    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', secret);
    const payloadString = JSON.stringify(payload);
    const expectedSignature = hmac.update(payloadString).digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  private async handleDepositConfirmed(
    tx: Prisma.TransactionClient,
    event: CustodianWebhookEvent
  ): Promise<void> {
    const { address, transactionHash, amount, sender, confirmations } =
      event.data;

    // Find escrow by deposit address
    const stablecoinEscrow = await tx.stablecoinEscrow.findFirst({
      where: { depositAddr: address },
      include: { escrow: true },
    });

    if (!stablecoinEscrow) {
      console.warn(`StablecoinEscrow not found for address ${address}`);
      return;
    }

    // Screen sender wallet
    const walletRisk = await this.walletScreeningService.screenWallet(sender);

    if (walletRisk === 'SANCTIONED' || walletRisk === 'HIGH') {
      // Emit domain event: wallet screening failed
      // Note: Escrow Service consumes this event and internally creates RefundBuyerCommand
      await tx.outbox.create({
        data: {
          aggregateId: stablecoinEscrow.escrowId,
          eventType: 'WalletScreeningFailed',
          payload: Buffer.from(
            protobufSerialize({
              escrowId: stablecoinEscrow.escrowId,
              walletAddress: sender,
              riskLevel: walletRisk,
              amount: amount,
              timestamp: new Date().toISOString(),
            })
          ),
          version: 1,
        },
      });

      // Store screening result
      await tx.paymentArtifact.create({
        data: {
          escrowId: stablecoinEscrow.escrowId,
          provider: 'custodian',
          providerPaymentId: transactionHash,
          kind: 'SCREENING_RESULT',
          amount: BigInt(0),
          currency: 'USDC',
          metadata: {
            walletAddress: sender,
            riskLevel: walletRisk,
            action: 'REFUNDED',
            screeningProvider: 'TRM_LABS_CHAINALYSIS',
          },
        },
      });

      return;
    }

    // Update StablecoinEscrow
    await tx.stablecoinEscrow.update({
      where: { escrowId: stablecoinEscrow.escrowId },
      data: {
        depositTx: transactionHash,
        depositConfirmations: confirmations,
        lastWebhookAt: new Date(),
        providerEvent: event,
        version: { increment: 1 },
      },
    });

    // Store payment artifact
    await tx.paymentArtifact.create({
      data: {
        escrowId: stablecoinEscrow.escrowId,
        provider: 'custodian',
        providerPaymentId: transactionHash,
        kind: 'CHARGE',
        amount: BigInt(amount),
        currency: 'USDC',
        metadata: {
          chain: 'BASE',
          fromAddress: sender,
          toAddress: address,
          confirmations,
          walletRisk,
        },
      },
    });

    // Create outbox events
    await tx.outbox.create({
      data: {
        aggregateId: stablecoinEscrow.escrowId,
        eventType: 'CustodianWebhookValidated',
        payload: Buffer.from(
          protobufSerialize({
            escrowId: stablecoinEscrow.escrowId,
            webhookEventId: event.id,
            eventType: event.type,
            timestamp: new Date().toISOString(),
          })
        ),
        version: 1,
      },
    });

    await tx.outbox.create({
      data: {
        aggregateId: stablecoinEscrow.escrowId,
        eventType: 'PaymentSucceeded',
        payload: Buffer.from(
          protobufSerialize({
            escrowId: stablecoinEscrow.escrowId,
            provider: 'custodian',
            providerPaymentId: transactionHash,
            amount: amount,
            currency: 'USDC',
            timestamp: new Date().toISOString(),
          })
        ),
        version: 1,
      },
    });
  }

  private async handleDepositFailed(
    tx: Prisma.TransactionClient,
    event: CustodianWebhookEvent
  ): Promise<void> {
    const { address, transactionHash, error } = event.data;

    const stablecoinEscrow = await tx.stablecoinEscrow.findFirst({
      where: { depositAddr: address },
      include: { escrow: true },
    });

    if (!stablecoinEscrow) return;

    await tx.outbox.create({
      data: {
        aggregateId: stablecoinEscrow.escrowId,
        eventType: 'PaymentFailed',
        payload: Buffer.from(
          protobufSerialize({
            escrowId: stablecoinEscrow.escrowId,
            provider: 'custodian',
            providerPaymentId: transactionHash,
            error: error,
            timestamp: new Date().toISOString(),
          })
        ),
        version: 1,
      },
    });
  }

  private async handleTransferCompleted(
    tx: Prisma.TransactionClient,
    event: CustodianWebhookEvent
  ): Promise<void> {
    const { transactionHash, escrowId } = event.data;

    if (!escrowId) return;

    // Transfer already processed via command handler
    // This webhook confirms the transfer was completed
    await tx.outbox.create({
      data: {
        aggregateId: escrowId,
        eventType: 'TransferConfirmed',
        payload: Buffer.from(
          protobufSerialize({
            escrowId,
            provider: 'custodian',
            transferId: transactionHash,
            timestamp: new Date().toISOString(),
          })
        ),
        version: 1,
      },
    });
  }

  private async handleTransferFailed(
    tx: Prisma.TransactionClient,
    event: CustodianWebhookEvent
  ): Promise<void> {
    const { transactionHash, escrowId, error } = event.data;

    if (!escrowId) return;

    await tx.outbox.create({
      data: {
        aggregateId: escrowId,
        eventType: 'TransferFailed',
        payload: Buffer.from(
          protobufSerialize({
            escrowId,
            provider: 'custodian',
            transferId: transactionHash,
            error: error,
            timestamp: new Date().toISOString(),
          })
        ),
        version: 1,
      },
    });
  }
}
```

### Error Handling and Retry Logic

**Custodian API Errors**:

```typescript
export class CustodianErrorHandler {
  static isRetryable(error: CustodianAPIError): boolean {
    // Network errors are retryable
    if (error.type === 'NETWORK_ERROR') {
      return true;
    }

    // Rate limit errors are retryable
    if (error.statusCode === 429) {
      return true;
    }

    // Server errors are retryable
    if (error.statusCode && error.statusCode >= 500) {
      return true;
    }

    return false;
  }

  static async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        if (!this.isRetryable(error as CustodianAPIError)) {
          throw error;
        }

        if (attempt < maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError!;
  }
}
```

## Webhook Processing Patterns

### Webhook Signature Verification

**Stripe Signature Verification**:

```typescript
export class StripeWebhookVerifier {
  constructor(private stripe: Stripe) {}

  verifySignature(
    payload: Buffer | string,
    signature: string,
    secret: string
  ): Stripe.Event {
    return this.stripe.webhooks.constructEvent(payload, signature, secret);
  }
}
```

**Custodian Signature Verification**:

```typescript
export class CustodianWebhookVerifier {
  verifySignature(
    payload: unknown,
    signature: string,
    secret: string
  ): boolean {
    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', secret);
    const payloadString = JSON.stringify(payload);
    const expectedSignature = hmac.update(payloadString).digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }
}
```

### Idempotency via WebhookEvent Table

**WebhookEvent Model**:

The `WebhookEvent` table ensures idempotency:

```prisma
model WebhookEvent {
  id        String   @id @default(cuid())
  eventId   String   @unique // Provider event ID
  provider  String // 'stripe', 'custodian'
  processed Boolean  @default(false)
  createdAt DateTime @default(now())

  @@index([eventId])
  @@index([provider])
  @@index([processed])
  @@map("webhook_events")
}
```

**Idempotency Check Pattern**:

```typescript
async function processWebhook(
  eventId: string,
  provider: string
): Promise<void> {
  // Check if already processed
  const existing = await prisma.webhookEvent.findUnique({
    where: { eventId },
  });

  if (existing) {
    return; // Already processed, skip
  }

  // Process webhook in transaction
  await prisma.$transaction(async tx => {
    // Mark as processed first (prevents race conditions)
    await tx.webhookEvent.create({
      data: {
        eventId,
        provider,
        processed: true,
      },
    });

    // Process webhook logic
    await processWebhookEvent(event);
  });
}
```

### Event Deduplication Strategies

**Strategy 1: Database-First Deduplication** (Recommended)

- Check `WebhookEvent` table before processing
- Atomic insert prevents race conditions
- Simple and reliable

**Strategy 2: Redis-Based Deduplication** (For High Throughput)

```typescript
async function processWebhookWithRedis(eventId: string): Promise<void> {
  const redis = new Redis(process.env.REDIS_URL);
  const key = `webhook:${eventId}`;

  // Try to acquire lock
  const acquired = await redis.set(key, 'processing', 'EX', 300, 'NX');
  if (!acquired) {
    return; // Another process is handling it
  }

  try {
    await processWebhookEvent(event);
    await redis.set(key, 'completed', 'EX', 3600);
  } finally {
    // Release lock if still processing
    const status = await redis.get(key);
    if (status === 'processing') {
      await redis.del(key);
    }
  }
}
```

### Webhook Handler Architecture

**Base Webhook Handler**:

```typescript
export abstract class BaseWebhookHandler {
  constructor(
    protected prisma: PrismaClient,
    protected eventEmitter: EventEmitter
  ) {}

  abstract verifySignature(
    payload: unknown,
    signature: string,
    secret: string
  ): boolean;

  abstract extractEventId(event: unknown): string;

  async handleWebhook(req: Request, res: Response): Promise<void> {
    try {
      // Verify signature
      const signature = this.extractSignature(req);
      const isValid = this.verifySignature(
        req.body,
        signature,
        this.getSecret()
      );

      if (!isValid) {
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }

      // Check idempotency
      const eventId = this.extractEventId(req.body);
      const existing = await this.prisma.webhookEvent.findUnique({
        where: { eventId },
      });

      if (existing) {
        res.json({ received: true, status: 'duplicate' });
        return;
      }

      // Process event
      await this.processEvent(req.body);

      res.json({ received: true });
    } catch (error) {
      console.error('Webhook processing error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  protected abstract extractSignature(req: Request): string;
  protected abstract getSecret(): string;
  protected abstract processEvent(event: unknown): Promise<void>;
}
```

### Error Handling and Retry Mechanisms

**Webhook Processing Retry**:

```typescript
export class WebhookRetryHandler {
  constructor(private prisma: PrismaClient) {}

  async retryFailedWebhooks(): Promise<void> {
    const failedEvents = await this.prisma.webhookEvent.findMany({
      where: {
        processed: false,
        createdAt: {
          lte: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
        },
      },
      take: 100,
    });

    for (const event of failedEvents) {
      try {
        await this.reprocessWebhook(event);
      } catch (error) {
        console.error(`Failed to retry webhook ${event.eventId}:`, error);
      }
    }
  }
}
```

### Rate Limiting and Security

**Rate Limiting**:

```typescript
import rateLimit from 'express-rate-limit';

export const webhookRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: 'Too many webhook requests',
});
```

**Security Best Practices**:

1. **Signature Verification**: Always verify webhook signatures
2. **HTTPS Only**: Accept webhooks only over HTTPS
3. **IP Whitelisting**: Optionally whitelist provider IPs
4. **Timeout Handling**: Set timeouts for webhook processing
5. **Error Logging**: Log all webhook processing errors

## Wallet Screening Integration

### TRM Labs API Integration

**TRM Labs Client**:

```typescript
export class TRMLabsClient {
  private apiKey: string;
  private baseUrl: string = 'https://api.trmlabs.com/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async screenAddress(address: string): Promise<TRMScreeningResult> {
    const response = await fetch(`${this.baseUrl}/screening/addresses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        address,
        chain: 'base',
      }),
    });

    if (!response.ok) {
      throw new Error(`TRM Labs API error: ${response.statusText}`);
    }

    return await response.json();
  }

  async getRiskScore(address: string): Promise<number> {
    const result = await this.screenAddress(address);
    return result.riskScore || 0;
  }
}
```

### Chainalysis API Integration

**Chainalysis Client**:

```typescript
export class ChainalysisClient {
  private apiKey: string;
  private baseUrl: string = 'https://api.chainalysis.com/api/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async checkSanctions(address: string): Promise<ChainalysisSanctionResult> {
    const response = await fetch(`${this.baseUrl}/sanctions/${address}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Chainalysis API error: ${response.statusText}`);
    }

    return await response.json();
  }

  async isSanctioned(address: string): Promise<boolean> {
    const result = await this.checkSanctions(address);
    return result.isSanctioned || false;
  }
}
```

### Risk Scoring Logic

**Wallet Screening Service**:

```typescript
export class WalletScreeningService {
  constructor(
    private trmClient: TRMLabsClient,
    private chainalysisClient: ChainalysisClient,
    private prisma: PrismaClient
  ) {}

  async screenWallet(address: string): Promise<WalletRisk> {
    // Check cache first
    const cached = await this.prisma.user.findFirst({
      where: { walletAddress: address },
      select: { walletRisk: true },
    });

    if (cached && cached.walletRisk !== 'UNKNOWN') {
      return cached.walletRisk;
    }

    // Check sanctions first (fastest, most critical)
    const isSanctioned = await this.chainalysisClient.isSanctioned(address);
    if (isSanctioned) {
      await this.updateUserWalletRisk(address, 'SANCTIONED');
      return 'SANCTIONED';
    }

    // Get TRM Labs risk score
    const riskScore = await this.trmClient.getRiskScore(address);

    // Determine risk level
    let riskLevel: WalletRisk;
    if (riskScore >= 80) {
      riskLevel = 'HIGH';
    } else if (riskScore >= 50) {
      riskLevel = 'MEDIUM';
    } else {
      riskLevel = 'LOW';
    }

    // Update cache
    await this.updateUserWalletRisk(address, riskLevel);

    return riskLevel;
  }

  private async updateUserWalletRisk(
    address: string,
    risk: WalletRisk
  ): Promise<void> {
    await this.prisma.user.updateMany({
      where: { walletAddress: address },
      data: { walletRisk: risk },
    });
  }

  async screenWalletWithDetails(
    address: string
  ): Promise<WalletScreeningResult> {
    const [isSanctioned, trmResult] = await Promise.all([
      this.chainalysisClient.isSanctioned(address),
      this.trmClient.screenAddress(address),
    ]);

    return {
      address,
      isSanctioned,
      riskScore: trmResult.riskScore || 0,
      riskLevel: this.calculateRiskLevel(isSanctioned, trmResult.riskScore),
      trmCategories: trmResult.categories || [],
      timestamp: new Date().toISOString(),
    };
  }

  private calculateRiskLevel(
    isSanctioned: boolean,
    riskScore: number
  ): WalletRisk {
    if (isSanctioned) return 'SANCTIONED';
    if (riskScore >= 80) return 'HIGH';
    if (riskScore >= 50) return 'MEDIUM';
    return 'LOW';
  }
}
```

### Sanctioned Wallet Detection

**Automatic Refund Flow**:

```typescript
export class SanctionedWalletHandler {
  constructor(
    private prisma: PrismaClient,
    private walletScreeningService: WalletScreeningService
  ) {}

  async handleSanctionedWallet(
    escrowId: string,
    walletAddress: string
  ): Promise<void> {
    await this.prisma.$transaction(async tx => {
      // Emit domain event: wallet sanctioned
      // Note: Escrow Service consumes this event and internally creates RefundBuyerCommand
      await tx.outbox.create({
        data: {
          aggregateId: escrowId,
          eventType: 'WalletScreeningFailed',
          payload: Buffer.from(
            protobufSerialize({
              escrowId,
              walletAddress,
              riskLevel: 'SANCTIONED',
              timestamp: new Date().toISOString(),
            })
          ),
          version: 1,
        },
      });

      // Store screening artifact
      await tx.paymentArtifact.create({
        data: {
          escrowId,
          provider: 'custodian',
          providerPaymentId: walletAddress,
          kind: 'SCREENING_RESULT',
          amount: BigInt(0),
          currency: 'USDC',
          metadata: {
            walletAddress,
            riskLevel: 'SANCTIONED',
            action: 'REFUNDED',
            screeningProvider: 'CHAINALYSIS',
          },
        },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          action: 'payment.sanctioned_wallet_detected',
          details: {
            escrowId,
            walletAddress,
            action: 'automatic_refund_initiated',
          },
          escrowId,
          referenceType: 'SANCTIONED_WALLET',
          referenceId: walletAddress,
        },
      });
    });
  }
}
```

### Wallet Screening Result Storage

**Screening Result Artifact**:

```typescript
interface ScreeningResultArtifact {
  escrowId: string;
  walletAddress: string;
  riskLevel: WalletRisk;
  riskScore: number;
  isSanctioned: boolean;
  screeningProvider: 'TRM_LABS' | 'CHAINALYSIS' | 'TRM_LABS_CHAINALYSIS';
  timestamp: string;
}
```

**Storage Pattern**:

```typescript
await prisma.paymentArtifact.create({
  data: {
    escrowId,
    provider: 'custodian',
    providerPaymentId: walletAddress,
    kind: 'SCREENING_RESULT',
    amount: BigInt(0),
    currency: 'USDC',
    metadata: {
      walletAddress,
      riskLevel,
      riskScore,
      isSanctioned,
      screeningProvider,
      timestamp: new Date().toISOString(),
    },
  },
});
```

## Payment Artifact Storage

### PaymentArtifact Model Design

**Schema Definition**:

```prisma
model PaymentArtifact {
  id               String   @id @default(cuid())
  escrowId         String
  escrow           Escrow   @relation(fields: [escrowId], references: [id], onDelete: Cascade)

  provider         String   // 'stripe', 'custodian'
  providerPaymentId String // PaymentIntent ID, Transfer ID, Transaction Hash, etc.
  kind             PaymentArtifactKind

  amount           BigInt   // Amount in cents (or smallest unit)
  currency         Currency

  metadata         Json?    // Provider-specific data (clientSecret, transactionHash, etc.)

  createdAt        DateTime @default(now())

  @@index([escrowId])
  @@index([provider])
  @@index([providerPaymentId])
  @@index([kind])
  @@index([escrowId, kind])
  @@map("payment_artifacts")
}

enum PaymentArtifactKind {
  INTENT            // PaymentIntent (Stripe) or Deposit Address (Custodian)
  CHARGE            // Successful charge/payment
  TRANSFER          // Transfer to seller
  REFUND            // Refund to buyer
  DEPOSIT_ADDRESS   // Deposit address (Custodian)
  SCREENING_RESULT  // Wallet screening result
}
```

### Artifact Types

**INTENT** (PaymentIntent Created):

```typescript
{
  escrowId: string;
  provider: 'stripe';
  providerPaymentId: string; // PaymentIntent ID
  kind: 'INTENT';
  amount: BigInt; // Payment amount
  currency: 'USD';
  metadata: {
    clientSecret: string;
    applicationFeeAmount: number;
    sellerAccountId: string;
  }
}
```

**CHARGE** (Payment Succeeded):

```typescript
{
  escrowId: string;
  provider: 'stripe' | 'custodian';
  providerPaymentId: string; // PaymentIntent ID or Transaction Hash
  kind: 'CHARGE';
  amount: BigInt; // Captured amount
  currency: 'USD' | 'USDC';
  metadata: {
    chargeId?: string; // Stripe only
    transactionHash?: string; // Custodian only
    confirmations?: number; // Custodian only
    walletRisk?: WalletRisk; // Custodian only
  };
}
```

**TRANSFER** (Funds Released):

```typescript
{
  escrowId: string;
  provider: 'stripe' | 'custodian';
  providerPaymentId: string; // Transfer ID or Transaction Hash
  kind: 'TRANSFER';
  amount: BigInt; // Net amount after fees
  currency: 'USD' | 'USDC';
  metadata: {
    chargeId?: string; // Stripe only
    transactionHash?: string; // Custodian only
    sellerFee: number;
    netAmount: string;
    toAddress?: string; // Custodian only
  };
}
```

**REFUND** (Refund Processed):

```typescript
{
  escrowId: string;
  provider: 'stripe' | 'custodian';
  providerPaymentId: string; // Refund ID or Transaction Hash
  kind: 'REFUND';
  amount: BigInt; // Refund amount
  currency: 'USD' | 'USDC';
  metadata: {
    chargeId?: string; // Stripe only
    transactionHash?: string; // Custodian only
    refundType: 'FULL' | 'PARTIAL';
    reason: string;
  };
}
```

**DEPOSIT_ADDRESS** (Custodian Only):

```typescript
{
  escrowId: string;
  provider: 'custodian';
  providerPaymentId: string; // Deposit address
  kind: 'DEPOSIT_ADDRESS';
  amount: BigInt(0); // Not known until deposit
  currency: 'USDC';
  metadata: {
    chain: 'BASE';
    provider: string;
    walletId: string;
  }
}
```

**SCREENING_RESULT** (Wallet Screening):

```typescript
{
  escrowId: string;
  provider: 'custodian';
  providerPaymentId: string; // Wallet address
  kind: 'SCREENING_RESULT';
  amount: BigInt(0);
  currency: 'USDC';
  metadata: {
    walletAddress: string;
    riskLevel: WalletRisk;
    riskScore: number;
    isSanctioned: boolean;
    screeningProvider: string;
    action?: 'REFUNDED' | 'ALLOWED';
  };
}
```

### Linking Artifacts to Escrows

**Artifact Retrieval**:

```typescript
export class PaymentArtifactRepository {
  constructor(private prisma: PrismaClient) {}

  async getArtifactsByEscrow(escrowId: string): Promise<PaymentArtifact[]> {
    return await this.prisma.paymentArtifact.findMany({
      where: { escrowId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getArtifactByKind(
    escrowId: string,
    kind: PaymentArtifactKind
  ): Promise<PaymentArtifact | null> {
    return await this.prisma.paymentArtifact.findFirst({
      where: {
        escrowId,
        kind,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getArtifactByProviderId(
    providerPaymentId: string
  ): Promise<PaymentArtifact | null> {
    return await this.prisma.paymentArtifact.findFirst({
      where: { providerPaymentId },
    });
  }
}
```

### Audit Trail Requirements

**Complete Payment History**:

```typescript
export class PaymentAuditTrail {
  constructor(private prisma: PrismaClient) {}

  async getPaymentHistory(escrowId: string): Promise<PaymentHistory> {
    const artifacts = await this.prisma.paymentArtifact.findMany({
      where: { escrowId },
      orderBy: { createdAt: 'asc' },
    });

    const webhookEvents = await this.prisma.webhookEvent.findMany({
      where: {
        provider: { in: ['stripe', 'custodian'] },
        // Note: WebhookEvent doesn't have escrowId, would need to join via artifacts
      },
    });

    return {
      escrowId,
      artifacts,
      timeline: this.buildTimeline(artifacts),
    };
  }

  private buildTimeline(artifacts: PaymentArtifact[]): PaymentEvent[] {
    return artifacts.map(artifact => ({
      timestamp: artifact.createdAt,
      type: artifact.kind,
      provider: artifact.provider,
      amount: artifact.amount.toString(),
      currency: artifact.currency,
      metadata: artifact.metadata,
    }));
  }
}
```

### Command Structure Differences

**Important**: Commands have different structures depending on their origin:

**RefundBuyerCommand**:

- **Escrow Service** (Line 1050): Emitted by Escrow Service for internal use

  ```typescript
  {
    userId: string;      // Admin user ID
    refundAmount?: number; // Optional partial refund
    reason: string;
  }
  ```

- **Payments Service** (Line 395): Received by Payments Service from Escrow Service via `EscrowRefunded` event
  ```typescript
  {
    escrowId: string;
    refundAmount?: string; // Optional partial refund (cents, BigInt serialized as string)
    reason: string;
  }
  ```

**Note**: Escrow Service emits `EscrowRefunded` domain event. Payments Service consumes this event and internally creates `RefundBuyerCommand` with the structure shown above.

**TransferToSellerCommand**:

- **Payments Service** (Line 268): Structure used internally by Payments Service

  ```typescript
  {
    escrowId: string;
    sellerStripeAccountId: string;  // For STRIPE rail
    transferAmount: string;          // Net amount after seller fee (cents)
    sellerFee: number;               // Platform fee deducted from seller (cents)
    reason?: string;
  }
  ```

- **Note**: Payments Service constructs this command internally after consuming `EscrowReleased` event from Escrow Service. The `EscrowReleased` event includes all required fields (see Escrow Service Design for event structure).

## Command Handlers

### Command Handler Base Class

```typescript
export abstract class PaymentCommandHandler<TCommand extends PaymentCommand> {
  constructor(
    protected prisma: PrismaClient,
    protected idempotencyManager: IdempotencyManager
  ) {}

  abstract handle(command: TCommand): Promise<void>;

  protected async executeWithIdempotency(
    command: TCommand,
    handler: () => Promise<void>
  ): Promise<void> {
    // Check idempotency
    const existing = await this.idempotencyManager.checkIdempotency(
      command.commandId
    );
    if (existing) {
      return; // Already processed
    }

    try {
      await handler();
      await this.idempotencyManager.storeIdempotency(command.commandId, {
        status: 'completed',
      });
    } catch (error) {
      await this.idempotencyManager.storeIdempotency(command.commandId, {
        status: 'failed',
        error: error.message,
      });
      throw error;
    }
  }
}
```

### CreatePaymentIntentCommand Handler

**Complete Implementation**:

See [Stripe Integration Architecture - PaymentIntent Creation Flow](#paymentintent-creation-flow) and [Custodian Integration Architecture - Deposit Address Generation Flow](#deposit-address-generation-flow) for full implementations.

**Key Points**:

- Handles both STRIPE and USDC_BASE rails
- Creates PaymentIntent or deposit address based on rail
- Stores payment artifacts
- Emits PaymentIntentCreated event

### TransferToSellerCommand Handler

**Complete Implementation**:

See [Stripe Integration Architecture - Transfer to Seller Flow](#transfer-to-seller-flow) and [Custodian Integration Architecture - Transfer to Seller Flow](#transfer-to-seller-flow-1) for full implementations.

**Key Points**:

- Handles both STRIPE and USDC_BASE rails
- Screens seller wallet (Custodian only)
- Creates transfer via provider API
- Stores payment artifacts
- Emits TransferSucceeded event

### RefundBuyerCommand Handler

**Complete Implementation**:

See [Stripe Integration Architecture - Refund Buyer Flow](#refund-buyer-flow) and [Custodian Integration Architecture - Refund Buyer Flow](#refund-buyer-flow-1) for full implementations.

**Key Points**:

- Handles both STRIPE and USDC_BASE rails
- Supports full and partial refunds
- Creates refund via provider API
- Stores payment artifacts
- Emits RefundSucceeded event

### Command Idempotency Patterns

**Idempotency Manager**:

```typescript
export class IdempotencyManager {
  constructor(private prisma: PrismaClient) {}

  async checkIdempotency(commandId: string): Promise<IdempotencyRecord | null> {
    const record = await this.prisma.commandIdempotency.findUnique({
      where: { commandId },
    });

    if (!record) {
      return null;
    }

    return {
      commandId: record.commandId,
      status: record.status,
      result: record.result,
      error: record.error,
    };
  }

  async storeIdempotency(
    commandId: string,
    data: {
      status: 'pending' | 'completed' | 'failed';
      result?: unknown;
      error?: string;
    }
  ): Promise<void> {
    await this.prisma.commandIdempotency.upsert({
      where: { commandId },
      create: {
        commandId,
        status: data.status,
        result: data.result as Prisma.JsonValue,
        error: data.error,
        completedAt: data.status !== 'pending' ? new Date() : null,
      },
      update: {
        status: data.status,
        result: data.result as Prisma.JsonValue,
        error: data.error,
        completedAt: data.status !== 'pending' ? new Date() : null,
      },
    });
  }
}
```

### Error Handling and Validation

**Validation**:

```typescript
export class PaymentCommandValidator {
  static validateCreatePaymentIntent(
    command: CreatePaymentIntentCommand
  ): void {
    if (!command.payload.escrowId) {
      throw new ValidationError('escrowId is required');
    }

    if (!command.payload.amount || Number(command.payload.amount) <= 0) {
      throw new ValidationError('amount must be positive');
    }

    if (
      command.payload.currency !== 'USD' &&
      command.payload.currency !== 'USDC'
    ) {
      throw new ValidationError('currency must be USD or USDC');
    }
  }

  static validateTransferToSeller(command: TransferToSellerCommand): void {
    if (!command.payload.escrowId) {
      throw new ValidationError('escrowId is required');
    }

    if (
      !command.payload.sellerStripeAccountId &&
      !command.payload.sellerWalletAddress
    ) {
      throw new ValidationError(
        'seller account ID or wallet address is required'
      );
    }

    if (Number(command.payload.transferAmount) <= 0) {
      throw new ValidationError('transferAmount must be positive');
    }
  }

  static validateRefundBuyer(command: RefundBuyerCommand): void {
    if (!command.payload.escrowId) {
      throw new ValidationError('escrowId is required');
    }

    if (!command.payload.reason) {
      throw new ValidationError('reason is required');
    }

    if (
      command.payload.refundAmount &&
      Number(command.payload.refundAmount) <= 0
    ) {
      throw new ValidationError('refundAmount must be positive');
    }
  }
}
```

### Integration with Escrow Service State Machine

**Event Flow**:

```
Escrow Service → EscrowReleased event (via outbox)
    ↓
Payments Service → Consumes EscrowReleased event
    ↓
Payments Service → Creates TransferToSellerCommand internally
    ↓
Payments Service → Publishes TransferToSellerCommand directly to Kafka
    ↓
Payments Service → Processes transfer
    ↓
Payments Service → TransferSucceeded event (via outbox)
    ↓
Escrow Service → Consumes TransferSucceeded event
```

**Note**: Commands are published directly to Kafka, not through outbox. Only domain events use the transactional outbox pattern.

**State Validation**:

The Payments Service does not enforce escrow state transitions. It relies on the Escrow Service to emit commands only when appropriate. However, the Payments Service validates that:

1. Escrow exists
2. Escrow has required payment artifacts (PaymentIntent or deposit address)
3. Payment provider confirms operation succeeded

### Commands vs Events Pattern

**Important Distinction**:

- **Commands**: Instructions to perform an action (e.g., `CreatePaymentIntentCommand`, `TransferToSellerCommand`, `RefundBuyerCommand`)
  - Published **directly to Kafka** command topics
  - **NOT** stored in outbox table
  - Used for service-to-service communication
  - Example: Escrow Service → Payments Service command

- **Domain Events**: Facts that have occurred (e.g., `PaymentSucceeded`, `TransferSucceeded`, `EscrowReleased`)
  - Published via **Transactional Outbox Pattern**
  - Stored in outbox table first, then published to Kafka
  - Used for event-driven communication and audit trail
  - Example: Payments Service → Escrow Service event

**Command Publishing Pattern**:

```typescript
// Commands publish directly to Kafka (NOT through outbox)
await kafkaProducer.send({
  topic: 'payments-commands',
  messages: [
    {
      key: command.escrowId,
      value: JSON.stringify(command),
      headers: {
        'command-id': command.commandId,
        'command-type': command.commandType,
      },
    },
  ],
});
```

**Event Publishing Pattern**:

```typescript
// Events use transactional outbox pattern
await tx.outbox.create({
  data: {
    aggregateId: escrowId,
    eventType: 'PaymentSucceeded',
    payload: Buffer.from(protobufSerialize(event)),
    version: 1,
  },
});
// Outbox publisher process will publish to Kafka asynchronously
```

## Event Emission Patterns

### Transactional Outbox Pattern Usage

**Outbox Model**:

```prisma
model Outbox {
  id          String    @id @default(cuid())
  aggregateId String    // escrowId for payment events
  eventType   String    // Kafka event type
  payload     Bytes     // Protobuf-serialized event payload
  createdAt   DateTime  @default(now())
  publishedAt DateTime? // NULL until published to Kafka
  version     Int       @default(1) // Schema version for event

  @@index([publishedAt]) // Partial index for unpublished events
  @@index([aggregateId, createdAt]) // For debugging
  @@map("outbox")
}
```

**Outbox Publisher**:

```typescript
export class OutboxPublisher {
  constructor(
    private prisma: PrismaClient,
    private kafkaProducer: KafkaProducer,
    private pollIntervalMs: number = 1000
  ) {}

  async start(): Promise<void> {
    setInterval(async () => {
      await this.publishPendingEvents();
    }, this.pollIntervalMs);
  }

  private async publishPendingEvents(): Promise<void> {
    const unpublishedEvents = await this.prisma.outbox.findMany({
      where: {
        publishedAt: null,
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: 100, // Batch size
    });

    for (const event of unpublishedEvents) {
      try {
        // Deserialize Protobuf payload
        const eventPayload = this.deserializeProtobuf(event.payload);

        // Publish to Kafka
        await this.kafkaProducer.send({
          topic: `payments.events.v1`,
          messages: [
            {
              key: event.aggregateId, // Partition key (escrowId)
              value: eventPayload,
              headers: {
                'event-id': event.id,
                'event-type': event.eventType,
                'aggregate-id': event.aggregateId,
              },
            },
          ],
        });

        // Mark as published
        await this.prisma.outbox.update({
          where: { id: event.id },
          data: { publishedAt: new Date() },
        });
      } catch (error) {
        console.error(`Failed to publish event ${event.id}:`, error);
        // Retry logic handled by next poll cycle
      }
    }
  }

  private deserializeProtobuf(buffer: Buffer): unknown {
    // Deserialize Protobuf message
    // Implementation depends on Protobuf schema definitions
    // Example using protobufjs or @grpc/proto-loader:
    const { PaymentSucceeded } = require('./generated/payments_pb');
    const message = PaymentSucceeded.deserializeBinary(buffer);
    return {
      escrowId: message.getEscrowId(),
      provider: message.getProvider(),
      providerPaymentId: message.getProviderPaymentId(),
      amount: message.getAmount(),
      currency: message.getCurrency(),
      timestamp: message.getTimestamp(),
    };
  }
}
```

### Event Types

**PaymentIntentCreated**:

```typescript
interface PaymentIntentCreatedEvent {
  escrowId: string;
  provider: 'stripe' | 'custodian';
  providerPaymentId: string;
  clientSecret?: string; // Stripe only
  depositAddress?: string; // Custodian only
  amount: string;
  currency: 'USD' | 'USDC';
  createdAt: string;
}
```

**PaymentSucceeded**:

```typescript
interface PaymentSucceededEvent {
  escrowId: string;
  provider: 'stripe' | 'custodian';
  providerPaymentId: string;
  amount: string;
  currency: 'USD' | 'USDC';
  timestamp: string;
}
```

**TransferSucceeded**:

```typescript
interface TransferSucceededEvent {
  escrowId: string;
  provider: 'stripe' | 'custodian';
  transferId: string;
  amount: string;
  currency: 'USD' | 'USDC';
  timestamp: string;
}
```

**RefundSucceeded**:

```typescript
interface RefundSucceededEvent {
  escrowId: string;
  provider: 'stripe' | 'custodian';
  refundId: string;
  refundAmount: string;
  currency: 'USD' | 'USDC';
  timestamp: string;
}
```

**PaymentFailed**:

```typescript
interface PaymentFailedEvent {
  escrowId: string;
  provider: 'stripe' | 'custodian';
  providerPaymentId: string;
  error: string;
  timestamp: string;
}
```

### Kafka Topic Configuration

**Topic**: `payments.events.v1`

**Configuration**:

- **Partitions**: 12 (supports 12 concurrent consumers)
- **Replication Factor**: 3 (production)
- **Retention**: 90 days
- **Compaction**: Enabled (key-based deduplication)

**Partitioning Strategy**:

- Partition key: `escrowId` (ensures ordering per escrow)
- All events for a single escrow processed in order
- Enables idempotent processing per escrow

### Event Schema (Protobuf)

```protobuf
syntax = "proto3";

message PaymentIntentCreated {
  string escrow_id = 1;
  string provider = 2; // "stripe" | "custodian"
  string provider_payment_id = 3;
  string client_secret = 4; // Stripe only
  string deposit_address = 5; // Custodian only
  string amount = 6;
  string currency = 7; // "USD" | "USDC"
  string created_at = 8;
}

message PaymentSucceeded {
  string escrow_id = 1;
  string provider = 2;
  string provider_payment_id = 3;
  string amount = 4;
  string currency = 5;
  string timestamp = 6;
}

message TransferSucceeded {
  string escrow_id = 1;
  string provider = 2;
  string transfer_id = 3;
  string amount = 4;
  string currency = 5;
  string timestamp = 6;
}

message RefundSucceeded {
  string escrow_id = 1;
  string provider = 2;
  string refund_id = 3;
  string refund_amount = 4;
  string currency = 5;
  string timestamp = 6;
}

message PaymentFailed {
  string escrow_id = 1;
  string provider = 2;
  string provider_payment_id = 3;
  string error = 4;
  string timestamp = 5;
}
```

### Outbox Publisher Process

**Separate Process**:

```typescript
// Separate process/worker
import { PrismaClient } from '@prisma/client';
import { KafkaProducer } from './kafka-producer';
import { OutboxPublisher } from './outbox-publisher';

const prisma = new PrismaClient();
const kafkaProducer = new KafkaProducer({
  brokers: process.env.KAFKA_BROKERS?.split(',') || [],
});

const publisher = new OutboxPublisher(prisma, kafkaProducer, 1000);
publisher.start();

// Graceful shutdown
process.on('SIGTERM', async () => {
  await publisher.stop();
  await kafkaProducer.disconnect();
  await prisma.$disconnect();
});
```

## Summary

This design document provides a complete blueprint for implementing the Payments Service with:

- **Multi-Rail Support**: Stripe (≤$10k) and Custodian (USDC on Base, >$10k)
- **Webhook Processing**: Robust webhook handling with signature verification and idempotency
- **Wallet Screening**: TRM Labs and Chainalysis integration for compliance
- **Payment Artifacts**: Complete audit trail of all payment operations
- **Command Handlers**: Idempotent command processing for payment operations
- **Event Emission**: Transactional outbox pattern for reliable event publishing

The service is designed to be:

- **Reliable**: Transactional consistency and idempotent operations
- **Scalable**: Event-driven architecture with Kafka partitioning
- **Compliant**: Wallet screening and sanctions checking
- **Auditable**: Complete payment artifact storage
- **Maintainable**: Clear separation of concerns and comprehensive error handling
