# Projections Service Design Document

## Overview

This document defines the complete design for the Projections Service, which serves as the read model builder for Bloxtr8. The Projections Service consumes domain events from Kafka, builds optimized read models for queries, handles projection rebuilds, and provides query-optimized endpoints for the API Gateway.

**Key Design Principles**:

- Event-driven architecture consuming Kafka events
- Denormalized read models optimized for query patterns
- Idempotent projection handlers with version tracking
- Support for full and incremental rebuilds from event store
- Direct database access for API Gateway queries

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Read Model Schema Design](#read-model-schema-design)
3. [Event Projection Handlers](#event-projection-handlers)
4. [Query Optimization Strategies](#query-optimization-strategies)
5. [Rebuild Procedures](#rebuild-procedures)
6. [API Gateway Integration Patterns](#api-gateway-integration-patterns)
7. [Kafka Consumer Implementation](#kafka-consumer-implementation)
8. [Monitoring and Observability](#monitoring-and-observability)

## Architecture Overview

### Service Role

The Projections Service is responsible for:

- **Event Consumption**: Subscribes to domain events from Kafka (`escrow.events.v1` and `payments.events.v1`)
- **Read Model Building**: Maintains denormalized, query-optimized read models in PostgreSQL
- **Projection Handlers**: Processes events and updates read models atomically
- **Rebuild Capability**: Supports full and incremental rebuilds from event store (`EscrowEvent` table)
- **Query Optimization**: Provides optimized indexes, materialized views, and query patterns
- **Idempotency**: Ensures events are processed exactly once using version tracking

### Technology Stack

- **Runtime**: Node.js 20+ with TypeScript
- **Database**: PostgreSQL 14+ via Prisma ORM
- **Event Bus**: Apache Kafka (consumes from `escrow.events.v1` and `payments.events.v1`)
- **Concurrency**: Idempotent projection handlers with event version tracking
- **Rebuild**: Event replay from `EscrowEvent` table
- **Serialization**: Protobuf for event payloads (matching existing services)

### Communication Patterns

```
Escrow Service → Kafka (Events) → Projections Service → PostgreSQL (Read Models)
Payments Service → Kafka (Events) → Projections Service → PostgreSQL (Read Models)
                                                              ↓
                                                    API Gateway → Direct Prisma Queries
```

### Service Boundaries

The Projections Service operates independently:

- **Escrow Service**: Manages escrow state machine and emits domain events
- **Payments Service**: Handles payments and emits payment events
- **Projections Service**: Consumes events and builds read models
- **API Gateway**: Queries read models directly via Prisma (no API calls to Projections Service needed)
- **Communication**: Via Kafka events only (no direct API calls between services)

### Integration Points

1. **Escrow Service**: Consumes `EscrowCreated`, `EscrowFundsHeld`, `EscrowDelivered`, `EscrowReleased`, `EscrowRefunded`, `EscrowDisputed`, `EscrowCancelled` events
2. **Payments Service**: Consumes `PaymentIntentCreated`, `PaymentSucceeded`, `PaymentFailed`, `TransferSucceeded`, `RefundSucceeded` events
3. **Database**: Stores read models in separate tables optimized for queries
4. **Event Store**: Reads from `EscrowEvent` table for rebuilds

## Read Model Schema Design

### EscrowSummary Read Model

Denormalized escrow summary optimized for list queries and filtering:

```prisma
model EscrowSummary {
  id        String       @id // escrowId
  rail      EscrowRail
  amount    BigInt
  currency  Currency
  status    EscrowStatus

  // Denormalized from Offer
  buyerId   String
  buyerName String?
  sellerId  String
  sellerName String?
  listingId String?
  listingTitle String?

  // Denormalized from Contract
  contractId String

  // Timestamps
  createdAt DateTime
  updatedAt DateTime
  fundsHeldAt DateTime?
  deliveredAt DateTime?
  releasedAt DateTime?
  refundedAt DateTime?
  cancelledAt DateTime?
  disputedAt DateTime?

  // Aggregated data
  deliveryCount Int @default(0)
  disputeCount Int @default(0)

  // Last event version processed
  lastEventVersion Int @default(0)
  lastProcessedAt DateTime @default(now())

  @@index([buyerId, status])
  @@index([sellerId, status])
  @@index([status, createdAt])
  @@index([listingId])
  @@index([contractId])
  @@index([lastEventVersion])
  @@map("escrow_summaries")
}
```

**Purpose**:

- Fast list queries by user and status
- Dashboard displays without joins
- Filtering and sorting operations
- Event version tracking for idempotency

**Denormalization Strategy**:

- Store buyer/seller names to avoid joins
- Store listing title for quick display
- Store timestamps for each state transition
- Aggregate counts for quick stats

### UserEscrowHistory Read Model

User-centric view of escrow activity:

```prisma
model UserEscrowHistory {
  id        String   @id @default(cuid())
  userId    String
  escrowId  String
  role      UserEscrowRole // 'BUYER' | 'SELLER'

  // Denormalized escrow data
  amount    BigInt
  currency  Currency
  status    EscrowStatus
  rail      EscrowRail

  // Denormalized counterparty info
  counterpartyId String
  counterpartyName String?

  // Timestamps
  createdAt DateTime
  updatedAt DateTime

  @@unique([userId, escrowId])
  @@index([userId, status])
  @@index([userId, createdAt])
  @@index([userId, role])
  @@index([escrowId])
  @@map("user_escrow_history")
}

enum UserEscrowRole {
  BUYER
  SELLER
}
```

**Purpose**:

- User's complete escrow history in one table
- Fast queries for "my escrows" without filtering buyer/seller
- Role-based filtering (buyer vs seller)
- Chronological ordering

**Index Strategy**:

- Composite index on `(userId, status)` for filtering active/completed escrows
- Composite index on `(userId, createdAt)` for chronological queries
- Composite index on `(userId, role)` for buyer/seller separation

### PaymentHistory Read Model

Payment transaction history:

```prisma
model PaymentHistory {
  id        String   @id @default(cuid())
  escrowId  String
  userId    String   // Buyer or seller depending on transaction type

  // Payment details
  provider  PaymentProvider // 'STRIPE' | 'CUSTODIAN'
  transactionType PaymentTransactionType // 'PAYMENT' | 'TRANSFER' | 'REFUND'
  amount    BigInt
  currency  Currency

  // Provider-specific IDs
  providerTransactionId String

  // Status
  status    PaymentStatus // 'PENDING' | 'COMPLETED' | 'FAILED'

  // Additional metadata
  transactionHash String? // For USDC transactions
  feeAmount BigInt? // Platform fee if applicable

  // Timestamps
  createdAt DateTime
  completedAt DateTime?
  failedAt DateTime?

  @@index([escrowId])
  @@index([userId, transactionType])
  @@index([userId, createdAt])
  @@index([status, createdAt])
  @@index([provider, status])
  @@index([escrowId, transactionType])
  @@map("payment_history")
}

enum PaymentProvider {
  STRIPE
  CUSTODIAN
}

enum PaymentTransactionType {
  PAYMENT
  TRANSFER
  REFUND
}

enum PaymentStatus {
  PENDING
  COMPLETED
  FAILED
}
```

**Purpose**:

- Complete payment audit trail
- User payment history queries
- Transaction lookup by provider ID
- Analytics and reporting

**Index Strategy**:

- Composite index on `(userId, transactionType)` for user payment/transfer/refund queries
- Composite index on `(escrowId, transactionType)` for escrow payment history
- Composite index on `(status, createdAt)` for failed payment monitoring

### EscrowStats Read Model

Aggregated statistics for dashboards:

```prisma
model EscrowStats {
  id        String   @id @default(cuid())
  userId    String
  period    StatsPeriod // 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ALL_TIME'
  periodStart DateTime

  // Statistics
  totalEscrows Int @default(0)
  totalVolume  BigInt @default(0)
  activeEscrows Int @default(0)
  completedEscrows Int @default(0)
  disputedEscrows Int @default(0)
  refundedEscrows Int @default(0)

  // Buyer stats
  buyerEscrows Int @default(0)
  buyerVolume  BigInt @default(0)

  // Seller stats
  sellerEscrows Int @default(0)
  sellerVolume  BigInt @default(0)

  // Average values
  avgEscrowAmount BigInt @default(0)

  updatedAt DateTime @updatedAt

  @@unique([userId, period, periodStart])
  @@index([userId, period])
  @@index([periodStart])
  @@index([userId, period, periodStart])
  @@map("escrow_stats")
}

enum StatsPeriod {
  DAILY
  WEEKLY
  MONTHLY
  ALL_TIME
}
```

**Purpose**:

- Dashboard statistics without real-time aggregation
- Performance metrics for users
- Historical trend analysis
- Reduced query load on main tables

**Update Strategy**:

- Updated incrementally as events are processed
- Recalculated during rebuilds
- Maintained for multiple time periods (daily, weekly, monthly, all-time)

### Event Processing State

Tracks which events have been processed:

```prisma
model EventProcessingState {
  id        String   @id @default(cuid())
  aggregateId String // escrowId
  lastEventId String // Last processed event ID from Kafka
  lastEventVersion Int // Last processed event version
  lastProcessedAt DateTime @default(now())

  @@unique([aggregateId])
  @@index([lastProcessedAt])
  @@map("event_processing_state")
}
```

**Purpose**:

- Track processing state per escrow
- Enable idempotency checks
- Monitor projection lag
- Support incremental rebuilds

## Event Projection Handlers

### Handler Base Class

Base class providing common functionality for all projection handlers:

```typescript
import { PrismaClient, Prisma } from '@prisma/client';

export abstract class ProjectionHandler<TEvent> {
  constructor(protected prisma: PrismaClient) {}

  abstract getEventType(): string;
  abstract handle(
    event: TEvent,
    eventId: string,
    version: number,
    timestamp: string
  ): Promise<void>;

  /**
   * Check if event has already been processed
   */
  protected async checkIdempotency(
    escrowId: string,
    version: number
  ): Promise<boolean> {
    const summary = await this.prisma.escrowSummary.findUnique({
      where: { id: escrowId },
      select: { lastEventVersion: true },
    });

    return summary?.lastEventVersion >= version;
  }

  /**
   * Update last processed event version
   */
  protected async updateLastEventVersion(
    tx: Prisma.TransactionClient,
    escrowId: string,
    version: number
  ): Promise<void> {
    await tx.escrowSummary.update({
      where: { id: escrowId },
      data: {
        lastEventVersion: version,
        lastProcessedAt: new Date(),
      },
    });

    // Also update event processing state
    await tx.eventProcessingState.upsert({
      where: { aggregateId: escrowId },
      create: {
        aggregateId: escrowId,
        lastEventVersion: version,
        lastProcessedAt: new Date(),
      },
      update: {
        lastEventVersion: version,
        lastProcessedAt: new Date(),
      },
    });
  }

  /**
   * Get or create escrow summary
   */
  protected async getEscrowSummary(
    tx: Prisma.TransactionClient,
    escrowId: string
  ): Promise<EscrowSummary> {
    const summary = await tx.escrowSummary.findUnique({
      where: { id: escrowId },
    });

    if (!summary) {
      throw new Error(
        `EscrowSummary ${escrowId} not found. Event may need to be processed in order.`
      );
    }

    return summary;
  }
}
```

### EscrowCreated Handler

Handles `EscrowCreated` event from Escrow Service:

```typescript
interface EscrowCreatedEvent {
  escrowId: string;
  rail: 'STRIPE' | 'USDC_BASE';
  amount: string; // BigInt serialized as string
  currency: 'USD' | 'USDC';
  offerId: string;
  contractId: string;
  timestamp: string;
}

export class EscrowCreatedHandler extends ProjectionHandler<EscrowCreatedEvent> {
  getEventType(): string {
    return 'EscrowCreated';
  }

  async handle(
    event: EscrowCreatedEvent,
    eventId: string,
    version: number,
    timestamp: string
  ): Promise<void> {
    await this.prisma.$transaction(async tx => {
      // Check idempotency
      if (await this.checkIdempotency(event.escrowId, version)) {
        return;
      }

      // Fetch related data from source tables
      const escrow = await tx.escrow.findUnique({
        where: { id: event.escrowId },
        include: {
          offer: {
            include: {
              buyer: { select: { id: true, name: true } },
              seller: { select: { id: true, name: true } },
              listing: { select: { id: true, title: true } },
            },
          },
          contract: { select: { id: true } },
        },
      });

      if (!escrow) {
        throw new Error(`Escrow ${event.escrowId} not found`);
      }

      const eventTimestamp = new Date(timestamp);

      // Create EscrowSummary
      await tx.escrowSummary.create({
        data: {
          id: event.escrowId,
          rail: escrow.rail,
          amount: escrow.amount,
          currency: escrow.currency,
          status: escrow.status,
          buyerId: escrow.offer.buyerId,
          buyerName: escrow.offer.buyer.name,
          sellerId: escrow.offer.sellerId,
          sellerName: escrow.offer.seller.name,
          listingId: escrow.offer.listingId,
          listingTitle: escrow.offer.listing.title,
          contractId: escrow.contractId,
          createdAt: escrow.createdAt,
          updatedAt: escrow.updatedAt,
          lastEventVersion: version,
          lastProcessedAt: eventTimestamp,
        },
      });

      // Create UserEscrowHistory entries for both buyer and seller
      await Promise.all([
        tx.userEscrowHistory.create({
          data: {
            userId: escrow.offer.buyerId,
            escrowId: event.escrowId,
            role: 'BUYER',
            amount: escrow.amount,
            currency: escrow.currency,
            status: escrow.status,
            rail: escrow.rail,
            counterpartyId: escrow.offer.sellerId,
            counterpartyName: escrow.offer.seller.name,
            createdAt: escrow.createdAt,
            updatedAt: escrow.updatedAt,
          },
        }),
        tx.userEscrowHistory.create({
          data: {
            userId: escrow.offer.sellerId,
            escrowId: event.escrowId,
            role: 'SELLER',
            amount: escrow.amount,
            currency: escrow.currency,
            status: escrow.status,
            rail: escrow.rail,
            counterpartyId: escrow.offer.buyerId,
            counterpartyName: escrow.offer.buyer.name,
            createdAt: escrow.createdAt,
            updatedAt: escrow.updatedAt,
          },
        }),
      ]);

      // Initialize stats
      await this.updateStats(
        tx,
        escrow.offer.buyerId,
        'BUYER',
        escrow.amount,
        eventTimestamp
      );
      await this.updateStats(
        tx,
        escrow.offer.sellerId,
        'SELLER',
        escrow.amount,
        eventTimestamp
      );

      // Create event processing state
      await tx.eventProcessingState.create({
        data: {
          aggregateId: event.escrowId,
          lastEventId: eventId,
          lastEventVersion: version,
          lastProcessedAt: eventTimestamp,
        },
      });
    });
  }

  private async updateStats(
    tx: Prisma.TransactionClient,
    userId: string,
    role: 'BUYER' | 'SELLER',
    amount: bigint,
    timestamp: Date
  ): Promise<void> {
    const periods = this.getPeriods(timestamp);

    for (const { period, start } of periods) {
      await tx.escrowStats.upsert({
        where: {
          userId_period_periodStart: {
            userId,
            period,
            periodStart: start,
          },
        },
        create: {
          userId,
          period,
          periodStart: start,
          totalEscrows: 1,
          totalVolume: amount,
          activeEscrows: 1,
          buyerEscrows: role === 'BUYER' ? 1 : 0,
          buyerVolume: role === 'BUYER' ? amount : BigInt(0),
          sellerEscrows: role === 'SELLER' ? 1 : 0,
          sellerVolume: role === 'SELLER' ? amount : BigInt(0),
          avgEscrowAmount: amount,
        },
        update: {
          totalEscrows: { increment: 1 },
          totalVolume: { increment: amount },
          activeEscrows: { increment: 1 },
          buyerEscrows: role === 'BUYER' ? { increment: 1 } : undefined,
          buyerVolume: role === 'BUYER' ? { increment: amount } : undefined,
          sellerEscrows: role === 'SELLER' ? { increment: 1 } : undefined,
          sellerVolume: role === 'SELLER' ? { increment: amount } : undefined,
          // Recalculate average (simplified - in production use more accurate calculation)
          avgEscrowAmount: {
            // This would need to be recalculated properly
          },
        },
      });
    }
  }

  private getPeriods(
    timestamp: Date
  ): Array<{ period: StatsPeriod; start: Date }> {
    const now = timestamp;
    return [
      { period: 'DAILY', start: startOfDay(now) },
      { period: 'WEEKLY', start: startOfWeek(now) },
      { period: 'MONTHLY', start: startOfMonth(now) },
      { period: 'ALL_TIME', start: new Date(0) },
    ];
  }
}

// Helper functions
function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  d.setDate(diff);
  return d;
}

function startOfMonth(date: Date): Date {
  const d = new Date(date);
  d.setDate(1);
  return startOfDay(d);
}
```

### EscrowFundsHeld Handler

Handles `EscrowFundsHeld` event:

```typescript
interface EscrowFundsHeldEvent {
  escrowId: string;
  timestamp: string;
}

export class EscrowFundsHeldHandler extends ProjectionHandler<EscrowFundsHeldEvent> {
  getEventType(): string {
    return 'EscrowFundsHeld';
  }

  async handle(
    event: EscrowFundsHeldEvent,
    eventId: string,
    version: number,
    timestamp: string
  ): Promise<void> {
    await this.prisma.$transaction(async tx => {
      if (await this.checkIdempotency(event.escrowId, version)) {
        return;
      }

      const eventTimestamp = new Date(timestamp);

      // Update EscrowSummary
      await tx.escrowSummary.update({
        where: { id: event.escrowId },
        data: {
          status: 'FUNDS_HELD',
          fundsHeldAt: eventTimestamp,
          updatedAt: eventTimestamp,
          lastEventVersion: version,
          lastProcessedAt: eventTimestamp,
        },
      });

      // Update UserEscrowHistory entries
      await tx.userEscrowHistory.updateMany({
        where: { escrowId: event.escrowId },
        data: {
          status: 'FUNDS_HELD',
          updatedAt: eventTimestamp,
        },
      });

      await this.updateLastEventVersion(tx, event.escrowId, version);
    });
  }
}
```

### EscrowDelivered Handler

Handles `EscrowDelivered` event:

```typescript
interface EscrowDeliveredEvent {
  escrowId: string;
  deliveryId: string;
  timestamp: string;
}

export class EscrowDeliveredHandler extends ProjectionHandler<EscrowDeliveredEvent> {
  getEventType(): string {
    return 'EscrowDelivered';
  }

  async handle(
    event: EscrowDeliveredEvent,
    eventId: string,
    version: number,
    timestamp: string
  ): Promise<void> {
    await this.prisma.$transaction(async tx => {
      if (await this.checkIdempotency(event.escrowId, version)) {
        return;
      }

      const eventTimestamp = new Date(timestamp);

      // Update EscrowSummary
      await tx.escrowSummary.update({
        where: { id: event.escrowId },
        data: {
          status: 'DELIVERED',
          deliveredAt: eventTimestamp,
          updatedAt: eventTimestamp,
          deliveryCount: { increment: 1 },
          lastEventVersion: version,
          lastProcessedAt: eventTimestamp,
        },
      });

      // Update UserEscrowHistory entries
      await tx.userEscrowHistory.updateMany({
        where: { escrowId: event.escrowId },
        data: {
          status: 'DELIVERED',
          updatedAt: eventTimestamp,
        },
      });

      await this.updateLastEventVersion(tx, event.escrowId, version);
    });
  }
}
```

### EscrowReleased Handler

Handles `EscrowReleased` event:

```typescript
interface EscrowReleasedEvent {
  escrowId: string;
  timestamp: string;
}

export class EscrowReleasedHandler extends ProjectionHandler<EscrowReleasedEvent> {
  getEventType(): string {
    return 'EscrowReleased';
  }

  async handle(
    event: EscrowReleasedEvent,
    eventId: string,
    version: number,
    timestamp: string
  ): Promise<void> {
    await this.prisma.$transaction(async tx => {
      if (await this.checkIdempotency(event.escrowId, version)) {
        return;
      }

      const summary = await this.getEscrowSummary(tx, event.escrowId);
      const eventTimestamp = new Date(timestamp);

      // Update EscrowSummary
      await tx.escrowSummary.update({
        where: { id: event.escrowId },
        data: {
          status: 'RELEASED',
          releasedAt: eventTimestamp,
          updatedAt: eventTimestamp,
          lastEventVersion: version,
          lastProcessedAt: eventTimestamp,
        },
      });

      // Update UserEscrowHistory entries
      await tx.userEscrowHistory.updateMany({
        where: { escrowId: event.escrowId },
        data: {
          status: 'RELEASED',
          updatedAt: eventTimestamp,
        },
      });

      // Update stats - mark escrow as completed
      await this.updateStatsForCompletion(
        tx,
        summary.buyerId,
        summary.sellerId,
        summary.amount,
        eventTimestamp
      );

      await this.updateLastEventVersion(tx, event.escrowId, version);
    });
  }

  private async updateStatsForCompletion(
    tx: Prisma.TransactionClient,
    buyerId: string,
    sellerId: string,
    amount: bigint,
    timestamp: Date
  ): Promise<void> {
    const periods = this.getPeriods(timestamp);

    for (const { period, start } of periods) {
      // Update buyer stats
      await tx.escrowStats.updateMany({
        where: {
          userId: buyerId,
          period,
          periodStart: start,
        },
        data: {
          activeEscrows: { decrement: 1 },
          completedEscrows: { increment: 1 },
        },
      });

      // Update seller stats
      await tx.escrowStats.updateMany({
        where: {
          userId: sellerId,
          period,
          periodStart: start,
        },
        data: {
          activeEscrows: { decrement: 1 },
          completedEscrows: { increment: 1 },
        },
      });
    }
  }

  private getPeriods(
    timestamp: Date
  ): Array<{ period: StatsPeriod; start: Date }> {
    // Same implementation as EscrowCreatedHandler
    const now = timestamp;
    return [
      { period: 'DAILY', start: startOfDay(now) },
      { period: 'WEEKLY', start: startOfWeek(now) },
      { period: 'MONTHLY', start: startOfMonth(now) },
      { period: 'ALL_TIME', start: new Date(0) },
    ];
  }
}
```

### EscrowRefunded Handler

Handles `EscrowRefunded` event:

```typescript
interface EscrowRefundedEvent {
  escrowId: string;
  refundAmount?: string; // Optional partial refund
  reason: string;
  timestamp: string;
}

export class EscrowRefundedHandler extends ProjectionHandler<EscrowRefundedEvent> {
  getEventType(): string {
    return 'EscrowRefunded';
  }

  async handle(
    event: EscrowRefundedEvent,
    eventId: string,
    version: number,
    timestamp: string
  ): Promise<void> {
    await this.prisma.$transaction(async tx => {
      if (await this.checkIdempotency(event.escrowId, version)) {
        return;
      }

      const summary = await this.getEscrowSummary(tx, event.escrowId);
      const eventTimestamp = new Date(timestamp);

      // Update EscrowSummary
      // Note: activeEscrows and refundedEscrows fields do NOT exist on EscrowSummary.
      // They only exist on EscrowStats and are updated separately via updateStatsForRefund().
      await tx.escrowSummary.update({
        where: { id: event.escrowId },
        data: {
          status: 'REFUNDED',
          refundedAt: eventTimestamp,
          updatedAt: eventTimestamp,
          lastEventVersion: version,
          lastProcessedAt: eventTimestamp,
        },
      });

      // Update UserEscrowHistory entries
      await tx.userEscrowHistory.updateMany({
        where: { escrowId: event.escrowId },
        data: {
          status: 'REFUNDED',
          updatedAt: eventTimestamp,
        },
      });

      // Update stats
      await this.updateStatsForRefund(
        tx,
        summary.buyerId,
        summary.sellerId,
        summary.amount,
        eventTimestamp
      );

      await this.updateLastEventVersion(tx, event.escrowId, version);
    });
  }

  private async updateStatsForRefund(
    tx: Prisma.TransactionClient,
    buyerId: string,
    sellerId: string,
    amount: bigint,
    timestamp: Date
  ): Promise<void> {
    const periods = this.getPeriods(timestamp);

    for (const { period, start } of periods) {
      await tx.escrowStats.updateMany({
        where: {
          userId: buyerId,
          period,
          periodStart: start,
        },
        data: {
          activeEscrows: { decrement: 1 },
          refundedEscrows: { increment: 1 },
        },
      });

      await tx.escrowStats.updateMany({
        where: {
          userId: sellerId,
          period,
          periodStart: start,
        },
        data: {
          activeEscrows: { decrement: 1 },
          refundedEscrows: { increment: 1 },
        },
      });
    }
  }

  private getPeriods(
    timestamp: Date
  ): Array<{ period: StatsPeriod; start: Date }> {
    // Same implementation as EscrowCreatedHandler
    const now = timestamp;
    return [
      { period: 'DAILY', start: startOfDay(now) },
      { period: 'WEEKLY', start: startOfWeek(now) },
      { period: 'MONTHLY', start: startOfMonth(now) },
      { period: 'ALL_TIME', start: new Date(0) },
    ];
  }
}
```

### EscrowDisputed Handler

Handles `EscrowDisputed` event:

```typescript
interface EscrowDisputedEvent {
  escrowId: string;
  disputeId: string;
  disputedBy: string; // User ID
  reason: string;
  timestamp: string;
}

export class EscrowDisputedHandler extends ProjectionHandler<EscrowDisputedEvent> {
  getEventType(): string {
    return 'EscrowDisputed';
  }

  async handle(
    event: EscrowDisputedEvent,
    eventId: string,
    version: number,
    timestamp: string
  ): Promise<void> {
    await this.prisma.$transaction(async tx => {
      if (await this.checkIdempotency(event.escrowId, version)) {
        return;
      }

      const eventTimestamp = new Date(timestamp);

      // Update EscrowSummary
      await tx.escrowSummary.update({
        where: { id: event.escrowId },
        data: {
          status: 'DISPUTED',
          disputedAt: eventTimestamp,
          updatedAt: eventTimestamp,
          disputeCount: { increment: 1 },
          lastEventVersion: version,
          lastProcessedAt: eventTimestamp,
        },
      });

      // Update UserEscrowHistory entries
      await tx.userEscrowHistory.updateMany({
        where: { escrowId: event.escrowId },
        data: {
          status: 'DISPUTED',
          updatedAt: eventTimestamp,
        },
      });

      // Update stats
      await tx.escrowStats.updateMany({
        where: {
          userId: event.disputedBy,
        },
        data: {
          disputedEscrows: { increment: 1 },
        },
      });

      await this.updateLastEventVersion(tx, event.escrowId, version);
    });
  }
}
```

### EscrowCancelled Handler

Handles `EscrowCancelled` event:

```typescript
interface EscrowCancelledEvent {
  escrowId: string;
  reason: string;
  timestamp: string;
}

export class EscrowCancelledHandler extends ProjectionHandler<EscrowCancelledEvent> {
  getEventType(): string {
    return 'EscrowCancelled';
  }

  async handle(
    event: EscrowCancelledEvent,
    eventId: string,
    version: number,
    timestamp: string
  ): Promise<void> {
    await this.prisma.$transaction(async tx => {
      if (await this.checkIdempotency(event.escrowId, version)) {
        return;
      }

      const summary = await this.getEscrowSummary(tx, event.escrowId);
      const eventTimestamp = new Date(timestamp);

      // Update EscrowSummary
      // Note: activeEscrows field does NOT exist on EscrowSummary.
      // It only exists on EscrowStats and is updated separately via updateStatsForCancellation().
      await tx.escrowSummary.update({
        where: { id: event.escrowId },
        data: {
          status: 'CANCELLED',
          cancelledAt: eventTimestamp,
          updatedAt: eventTimestamp,
          lastEventVersion: version,
          lastProcessedAt: eventTimestamp,
        },
      });

      // Update UserEscrowHistory entries
      await tx.userEscrowHistory.updateMany({
        where: { escrowId: event.escrowId },
        data: {
          status: 'CANCELLED',
          updatedAt: eventTimestamp,
        },
      });

      // Update stats
      await this.updateStatsForCancellation(
        tx,
        summary.buyerId,
        summary.sellerId,
        eventTimestamp
      );

      await this.updateLastEventVersion(tx, event.escrowId, version);
    });
  }

  private async updateStatsForCancellation(
    tx: Prisma.TransactionClient,
    buyerId: string,
    sellerId: string,
    timestamp: Date
  ): Promise<void> {
    const periods = this.getPeriods(timestamp);

    for (const { period, start } of periods) {
      await tx.escrowStats.updateMany({
        where: {
          userId: buyerId,
          period,
          periodStart: start,
        },
        data: {
          activeEscrows: { decrement: 1 },
        },
      });

      await tx.escrowStats.updateMany({
        where: {
          userId: sellerId,
          period,
          periodStart: start,
        },
        data: {
          activeEscrows: { decrement: 1 },
        },
      });
    }
  }

  private getPeriods(
    timestamp: Date
  ): Array<{ period: StatsPeriod; start: Date }> {
    // Same implementation as EscrowCreatedHandler
    const now = timestamp;
    return [
      { period: 'DAILY', start: startOfDay(now) },
      { period: 'WEEKLY', start: startOfWeek(now) },
      { period: 'MONTHLY', start: startOfMonth(now) },
      { period: 'ALL_TIME', start: new Date(0) },
    ];
  }
}
```

### PaymentIntentCreated Handler

Handles `PaymentIntentCreated` event from Payments Service:

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

export class PaymentIntentCreatedHandler extends ProjectionHandler<PaymentIntentCreatedEvent> {
  getEventType(): string {
    return 'PaymentIntentCreated';
  }

  async handle(
    event: PaymentIntentCreatedEvent,
    eventId: string,
    version: number,
    timestamp: string
  ): Promise<void> {
    // PaymentIntentCreated doesn't update read models directly
    // It's tracked in PaymentHistory when payment succeeds
    // This handler is a no-op for projections, but could log for audit
  }
}
```

### PaymentSucceeded Handler

Handles `PaymentSucceeded` event:

```typescript
interface PaymentSucceededEvent {
  escrowId: string;
  provider: 'stripe' | 'custodian';
  providerPaymentId: string;
  amount: string;
  currency: 'USD' | 'USDC';
  timestamp: string;
}

export class PaymentSucceededHandler extends ProjectionHandler<PaymentSucceededEvent> {
  getEventType(): string {
    return 'PaymentSucceeded';
  }

  async handle(
    event: PaymentSucceededEvent,
    eventId: string,
    version: number,
    timestamp: string
  ): Promise<void> {
    await this.prisma.$transaction(async tx => {
      // Fetch escrow to get buyer ID
      const escrow = await tx.escrow.findUnique({
        where: { id: event.escrowId },
        include: { offer: { select: { buyerId: true } } },
      });

      if (!escrow) {
        throw new Error(`Escrow ${event.escrowId} not found`);
      }

      const eventTimestamp = new Date(timestamp);

      // Create payment history entry
      await tx.paymentHistory.create({
        data: {
          escrowId: event.escrowId,
          userId: escrow.offer.buyerId,
          provider: event.provider.toUpperCase() as PaymentProvider,
          transactionType: 'PAYMENT',
          amount: BigInt(event.amount),
          currency: event.currency,
          providerTransactionId: event.providerPaymentId,
          status: 'COMPLETED',
          createdAt: eventTimestamp,
          completedAt: eventTimestamp,
        },
      });

      // Update stats - no direct impact on escrow stats, but could track payment volume
    });
  }
}
```

### TransferSucceeded Handler

Handles `TransferSucceeded` event:

```typescript
interface TransferSucceededEvent {
  escrowId: string;
  provider: 'stripe' | 'custodian';
  transferId: string;
  amount: string;
  currency: 'USD' | 'USDC';
  timestamp: string;
}

export class TransferSucceededHandler extends ProjectionHandler<TransferSucceededEvent> {
  getEventType(): string {
    return 'TransferSucceeded';
  }

  async handle(
    event: TransferSucceededEvent,
    eventId: string,
    version: number,
    timestamp: string
  ): Promise<void> {
    await this.prisma.$transaction(async tx => {
      // Fetch escrow to get seller ID
      const escrow = await tx.escrow.findUnique({
        where: { id: event.escrowId },
        include: { offer: { select: { sellerId: true } } },
      });

      if (!escrow) {
        throw new Error(`Escrow ${event.escrowId} not found`);
      }

      const eventTimestamp = new Date(timestamp);

      // Create payment history entry
      await tx.paymentHistory.create({
        data: {
          escrowId: event.escrowId,
          userId: escrow.offer.sellerId,
          provider: event.provider.toUpperCase() as PaymentProvider,
          transactionType: 'TRANSFER',
          amount: BigInt(event.amount),
          currency: event.currency,
          providerTransactionId: event.transferId,
          status: 'COMPLETED',
          createdAt: eventTimestamp,
          completedAt: eventTimestamp,
        },
      });
    });
  }
}
```

### RefundSucceeded Handler

Handles `RefundSucceeded` event:

```typescript
interface RefundSucceededEvent {
  escrowId: string;
  provider: 'stripe' | 'custodian';
  refundId: string;
  refundAmount: string;
  currency: 'USD' | 'USDC';
  timestamp: string;
}

export class RefundSucceededHandler extends ProjectionHandler<RefundSucceededEvent> {
  getEventType(): string {
    return 'RefundSucceeded';
  }

  async handle(
    event: RefundSucceededEvent,
    eventId: string,
    version: number,
    timestamp: string
  ): Promise<void> {
    await this.prisma.$transaction(async tx => {
      // Fetch escrow to get buyer ID
      const escrow = await tx.escrow.findUnique({
        where: { id: event.escrowId },
        include: { offer: { select: { buyerId: true } } },
      });

      if (!escrow) {
        throw new Error(`Escrow ${event.escrowId} not found`);
      }

      const eventTimestamp = new Date(timestamp);

      // Create payment history entry
      await tx.paymentHistory.create({
        data: {
          escrowId: event.escrowId,
          userId: escrow.offer.buyerId,
          provider: event.provider.toUpperCase() as PaymentProvider,
          transactionType: 'REFUND',
          amount: BigInt(event.refundAmount),
          currency: event.currency,
          providerTransactionId: event.refundId,
          status: 'COMPLETED',
          createdAt: eventTimestamp,
          completedAt: eventTimestamp,
        },
      });
    });
  }
}
```

### PaymentFailed Handler

Handles `PaymentFailed` event:

```typescript
interface PaymentFailedEvent {
  escrowId: string;
  provider: 'stripe' | 'custodian';
  providerPaymentId: string;
  error: string;
  timestamp: string;
}

export class PaymentFailedHandler extends ProjectionHandler<PaymentFailedEvent> {
  getEventType(): string {
    return 'PaymentFailed';
  }

  async handle(
    event: PaymentFailedEvent,
    eventId: string,
    version: number,
    timestamp: string
  ): Promise<void> {
    await this.prisma.$transaction(async tx => {
      // Fetch escrow to get buyer ID
      const escrow = await tx.escrow.findUnique({
        where: { id: event.escrowId },
        include: { offer: { select: { buyerId: true } } },
      });

      if (!escrow) {
        throw new Error(`Escrow ${event.escrowId} not found`);
      }

      const eventTimestamp = new Date(timestamp);

      // Create payment history entry with failed status
      await tx.paymentHistory.create({
        data: {
          escrowId: event.escrowId,
          userId: escrow.offer.buyerId,
          provider: event.provider.toUpperCase() as PaymentProvider,
          transactionType: 'PAYMENT',
          amount: BigInt(0), // Failed payment has no amount
          currency: 'USD', // Default, actual currency from escrow
          providerTransactionId: event.providerPaymentId,
          status: 'FAILED',
          createdAt: eventTimestamp,
          failedAt: eventTimestamp,
        },
      });
    });
  }
}
```

### Handler Registry

Registry for managing all projection handlers:

```typescript
export class HandlerRegistry {
  private handlers: Map<string, ProjectionHandler<unknown>> = new Map();

  constructor(private prisma: PrismaClient) {
    this.registerHandlers();
  }

  private registerHandlers(): void {
    // Escrow event handlers
    this.register(new EscrowCreatedHandler(this.prisma));
    this.register(new EscrowFundsHeldHandler(this.prisma));
    this.register(new EscrowDeliveredHandler(this.prisma));
    this.register(new EscrowReleasedHandler(this.prisma));
    this.register(new EscrowRefundedHandler(this.prisma));
    this.register(new EscrowDisputedHandler(this.prisma));
    this.register(new EscrowCancelledHandler(this.prisma));

    // Payment event handlers
    this.register(new PaymentIntentCreatedHandler(this.prisma));
    this.register(new PaymentSucceededHandler(this.prisma));
    this.register(new PaymentFailedHandler(this.prisma));
    this.register(new TransferSucceededHandler(this.prisma));
    this.register(new RefundSucceededHandler(this.prisma));
  }

  register(handler: ProjectionHandler<unknown>): void {
    this.handlers.set(handler.getEventType(), handler);
  }

  getHandler(eventType: string): ProjectionHandler<unknown> | undefined {
    return this.handlers.get(eventType);
  }

  getAllHandlers(): ProjectionHandler<unknown>[] {
    return Array.from(this.handlers.values());
  }
}
```

## Query Optimization Strategies

### Index Strategy

#### Composite Indexes

Cover common query patterns:

```sql
-- User escrows by status
CREATE INDEX idx_escrow_summary_buyer_status ON escrow_summaries(buyerId, status, createdAt DESC);
CREATE INDEX idx_escrow_summary_seller_status ON escrow_summaries(sellerId, status, createdAt DESC);

-- Escrows by status
CREATE INDEX idx_escrow_summary_status_created ON escrow_summaries(status, createdAt DESC);

-- User escrow history
CREATE INDEX idx_user_escrow_history_user_status ON user_escrow_history(userId, status, createdAt DESC);
CREATE INDEX idx_user_escrow_history_user_role ON user_escrow_history(userId, role, createdAt DESC);

-- Payment history
CREATE INDEX idx_payment_history_user_type ON payment_history(userId, transactionType, createdAt DESC);
CREATE INDEX idx_payment_history_escrow_type ON payment_history(escrowId, transactionType);
```

#### Partial Indexes

For filtered queries on specific subsets:

```sql
-- Active escrows only
CREATE INDEX idx_active_escrows ON escrow_summaries(status, updatedAt)
WHERE status IN ('FUNDS_HELD', 'DELIVERED');

-- Disputed escrows
CREATE INDEX idx_disputed_escrows ON escrow_summaries(disputedAt, status)
WHERE status = 'DISPUTED';

-- Completed payments
CREATE INDEX idx_completed_payments ON payment_history(userId, completedAt)
WHERE status = 'COMPLETED';
```

#### GIN Indexes

For JSON fields (if metadata is stored):

```sql
-- Not applicable for current schema, but if metadata JSON fields are added:
-- CREATE INDEX idx_metadata_gin ON escrow_summaries USING GIN(metadata);
```

### Materialized Views

For complex aggregations:

```sql
-- Dashboard statistics view
CREATE MATERIALIZED VIEW escrow_dashboard_stats AS
SELECT
  buyerId as userId,
  COUNT(*) FILTER (WHERE status = 'FUNDS_HELD') as active_buyer_count,
  COUNT(*) FILTER (WHERE status = 'RELEASED') as completed_buyer_count,
  SUM(amount) FILTER (WHERE status = 'RELEASED') as buyer_total_volume,
  COUNT(*) FILTER (WHERE status = 'DISPUTED') as disputed_buyer_count
FROM escrow_summaries
WHERE buyerId IS NOT NULL
GROUP BY buyerId

UNION ALL

SELECT
  sellerId as userId,
  COUNT(*) FILTER (WHERE status = 'FUNDS_HELD') as active_seller_count,
  COUNT(*) FILTER (WHERE status = 'RELEASED') as completed_seller_count,
  SUM(amount) FILTER (WHERE status = 'RELEASED') as seller_total_volume,
  COUNT(*) FILTER (WHERE status = 'DISPUTED') as disputed_seller_count
FROM escrow_summaries
WHERE sellerId IS NOT NULL
GROUP BY sellerId;

CREATE UNIQUE INDEX ON escrow_dashboard_stats(userId);
```

**Refresh Strategy**:

- Refresh on-demand via API endpoint
- Scheduled refresh every 5 minutes via cron job
- Refresh after rebuilds

```typescript
export class MaterializedViewRefresher {
  constructor(private prisma: PrismaClient) {}

  async refreshDashboardStats(): Promise<void> {
    await this.prisma.$executeRaw`
      REFRESH MATERIALIZED VIEW CONCURRENTLY escrow_dashboard_stats;
    `;
  }

  async refreshAll(): Promise<void> {
    await this.refreshDashboardStats();
  }
}
```

### Query Patterns

#### 1. List Escrows by User

```typescript
export async function getUserEscrows(
  userId: string,
  options: {
    status?: EscrowStatus;
    role?: 'BUYER' | 'SELLER';
    limit?: number;
    offset?: number;
  } = {}
): Promise<EscrowSummary[]> {
  const { status, role, limit = 50, offset = 0 } = options;

  if (role) {
    // Use UserEscrowHistory for role-specific queries
    return await prisma.userEscrowHistory.findMany({
      where: {
        userId,
        ...(status && { status }),
        role,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  // Use EscrowSummary for all escrows
  return await prisma.escrowSummary.findMany({
    where: {
      OR: [{ buyerId: userId }, { sellerId: userId }],
      ...(status && { status }),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
  });
}
```

#### 2. User Escrow History

```typescript
export async function getUserEscrowHistory(
  userId: string,
  options: {
    status?: EscrowStatus;
    role?: 'BUYER' | 'SELLER';
    limit?: number;
    offset?: number;
  } = {}
): Promise<UserEscrowHistory[]> {
  const { status, role, limit = 100, offset = 0 } = options;

  return await prisma.userEscrowHistory.findMany({
    where: {
      userId,
      ...(status && { status }),
      ...(role && { role }),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
  });
}
```

#### 3. Payment History

```typescript
export async function getPaymentHistory(
  userId: string,
  options: {
    transactionType?: PaymentTransactionType;
    status?: PaymentStatus;
    limit?: number;
    offset?: number;
  } = {}
): Promise<PaymentHistory[]> {
  const { transactionType, status, limit = 50, offset = 0 } = options;

  return await prisma.paymentHistory.findMany({
    where: {
      userId,
      ...(transactionType && { transactionType }),
      ...(status && { status }),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
  });
}
```

#### 4. Escrow Statistics

```typescript
export async function getEscrowStats(
  userId: string,
  period: StatsPeriod = 'ALL_TIME'
): Promise<EscrowStats | null> {
  const periodStart = getPeriodStart(period);

  return await prisma.escrowStats.findUnique({
    where: {
      userId_period_periodStart: {
        userId,
        period,
        periodStart,
      },
    },
  });
}

function getPeriodStart(period: StatsPeriod): Date {
  const now = new Date();
  switch (period) {
    case 'DAILY':
      return startOfDay(now);
    case 'WEEKLY':
      return startOfWeek(now);
    case 'MONTHLY':
      return startOfMonth(now);
    case 'ALL_TIME':
      return new Date(0);
  }
}
```

#### 5. Dashboard Query

```typescript
export async function getDashboardData(userId: string): Promise<DashboardData> {
  const [activeEscrows, recentHistory, stats, payments] = await Promise.all([
    // Active escrows
    prisma.escrowSummary.findMany({
      where: {
        OR: [
          { buyerId: userId, status: { in: ['FUNDS_HELD', 'DELIVERED'] } },
          { sellerId: userId, status: { in: ['FUNDS_HELD', 'DELIVERED'] } },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    }),

    // Recent history
    prisma.userEscrowHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),

    // Statistics
    getEscrowStats(userId, 'ALL_TIME'),

    // Recent payments
    prisma.paymentHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ]);

  return {
    activeEscrows,
    recentHistory,
    stats,
    recentPayments: payments,
  };
}
```

### Query Performance Optimization

#### Connection Pooling

Configure Prisma connection pool:

```typescript
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  // Connection pool settings
  // Prisma manages connection pooling automatically
});
```

#### Batch Queries

Use `Promise.all` for parallel queries:

```typescript
// Good: Parallel queries
const [escrows, stats, payments] = await Promise.all([
  getEscrows(userId),
  getStats(userId),
  getPayments(userId),
]);

// Bad: Sequential queries
const escrows = await getEscrows(userId);
const stats = await getStats(userId);
const payments = await getPayments(userId);
```

#### Select Specific Fields

Only select needed fields:

```typescript
// Good: Select only needed fields
const escrows = await prisma.escrowSummary.findMany({
  select: {
    id: true,
    amount: true,
    status: true,
    createdAt: true,
  },
});

// Bad: Select all fields
const escrows = await prisma.escrowSummary.findMany();
```

## Rebuild Procedures

### Full Rebuild

Rebuilds all projections from event store:

```typescript
export class RebuildService {
  constructor(
    private prisma: PrismaClient,
    private handlerRegistry: HandlerRegistry
  ) {}

  async rebuildAll(): Promise<RebuildResult> {
    const startTime = Date.now();
    let eventsProcessed = 0;
    let errors: Error[] = [];

    try {
      // 1. Clear all read models
      await this.prisma.$transaction(async tx => {
        await tx.escrowSummary.deleteMany({});
        await tx.userEscrowHistory.deleteMany({});
        await tx.paymentHistory.deleteMany({});
        await tx.escrowStats.deleteMany({});
        await tx.eventProcessingState.deleteMany({});
      });

      // 2. Replay all events in order
      // Events are ordered by escrowId, then createdAt, then version
      const events = await this.prisma.escrowEvent.findMany({
        orderBy: [
          { escrowId: 'asc' },
          { createdAt: 'asc' },
          { version: 'asc' },
        ],
      });

      console.log(`Rebuilding projections from ${events.length} events...`);

      // 3. Process events through handlers
      for (const event of events) {
        try {
          const handler = this.handlerRegistry.getHandler(event.eventType);

          if (!handler) {
            console.warn(`No handler found for event type: ${event.eventType}`);
            continue;
          }

          // Deserialize payload
          const payload =
            typeof event.payload === 'string'
              ? JSON.parse(event.payload)
              : event.payload;

          // Extract timestamp from payload or use createdAt
          const timestamp = payload.timestamp || event.createdAt.toISOString();

          await handler.handle(payload, event.id, event.version, timestamp);

          eventsProcessed++;

          // Log progress every 1000 events
          if (eventsProcessed % 1000 === 0) {
            console.log(
              `Processed ${eventsProcessed}/${events.length} events...`
            );
          }
        } catch (error) {
          console.error(`Error processing event ${event.id}:`, error);
          errors.push(error as Error);

          // Continue processing other events even if one fails
          // Optionally: stop on error, or collect errors and continue
        }
      }

      // 4. Refresh materialized views
      await this.refreshMaterializedViews();

      const duration = Date.now() - startTime;

      return {
        success: errors.length === 0,
        eventsProcessed,
        totalEvents: events.length,
        errors,
        duration,
      };
    } catch (error) {
      return {
        success: false,
        eventsProcessed,
        totalEvents: 0,
        errors: [error as Error],
        duration: Date.now() - startTime,
      };
    }
  }

  private async refreshMaterializedViews(): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        REFRESH MATERIALIZED VIEW CONCURRENTLY escrow_dashboard_stats;
      `;
    } catch (error) {
      console.error('Error refreshing materialized views:', error);
      // Don't fail rebuild if materialized view refresh fails
    }
  }
}

interface RebuildResult {
  success: boolean;
  eventsProcessed: number;
  totalEvents: number;
  errors: Error[];
  duration: number; // milliseconds
}
```

### Incremental Rebuild

Rebuilds projections for specific escrows:

```typescript
async rebuildEscrow(escrowId: string): Promise<void> {
  // 1. Delete existing projections
  // Note: EscrowStats is NOT deleted here because:
  // - EscrowStats tracks userId, period, and periodStart (not escrowId)
  // - EscrowStats are user-level aggregations shared across multiple escrows
  // - Deleting EscrowStats would require identifying all affected users and their periods,
  //   which is complex and unnecessary since event handlers will update stats correctly
  // - The event replay will trigger handlers that update EscrowStats for affected users
  await this.prisma.$transaction(async tx => {
    await tx.escrowSummary.deleteMany({ where: { id: escrowId } });
    await tx.userEscrowHistory.deleteMany({ where: { escrowId } });
    await tx.paymentHistory.deleteMany({ where: { escrowId } });
    await tx.eventProcessingState.deleteMany({ where: { aggregateId: escrowId } });
    // EscrowStats is intentionally NOT deleted - it will be updated via event handlers during replay
  });

  // 2. Replay events for this escrow
  const events = await this.prisma.escrowEvent.findMany({
    where: { escrowId },
    orderBy: [
      { createdAt: 'asc' },
      { version: 'asc' },
    ],
  });

  if (events.length === 0) {
    console.warn(`No events found for escrow ${escrowId}`);
    return;
  }

  // 3. Process events through handlers
  for (const event of events) {
    const handler = this.handlerRegistry.getHandler(event.eventType);

    if (!handler) {
      console.warn(`No handler found for event type: ${event.eventType}`);
      continue;
    }

    const payload = typeof event.payload === 'string'
      ? JSON.parse(event.payload)
      : event.payload;

    const timestamp = payload.timestamp || event.createdAt.toISOString();

    await handler.handle(
      payload,
      event.id,
      event.version,
      timestamp
    );
  }

  console.log(`Rebuilt projections for escrow ${escrowId} from ${events.length} events`);
}
```

### Rebuild API

```typescript
// POST /api/projections/rebuild
router.post('/rebuild', async (req, res, next) => {
  try {
    const { type, escrowId } = req.body;

    if (!type || (type !== 'FULL' && type !== 'INCREMENTAL')) {
      throw new AppError(
        'Invalid rebuild type. Must be FULL or INCREMENTAL',
        400
      );
    }

    if (type === 'INCREMENTAL' && !escrowId) {
      throw new AppError('escrowId required for incremental rebuild', 400);
    }

    const rebuildService = new RebuildService(prisma, handlerRegistry);

    let result: RebuildResult;

    if (type === 'FULL') {
      result = await rebuildService.rebuildAll();
    } else {
      await rebuildService.rebuildEscrow(escrowId);
      result = {
        success: true,
        eventsProcessed: 0,
        totalEvents: 0,
        errors: [],
        duration: 0,
      };
    }

    res.json({
      success: result.success,
      message:
        type === 'FULL'
          ? `Rebuilt ${result.eventsProcessed} events in ${result.duration}ms`
          : `Rebuilt escrow ${escrowId}`,
      result,
    });
  } catch (error) {
    next(error);
  }
});
```

### Rebuild Scheduling

Optional scheduled rebuilds for consistency checks:

```typescript
export class RebuildScheduler {
  constructor(private rebuildService: RebuildService) {}

  startDailyRebuild(): void {
    // Run full rebuild daily at 2 AM
    cron.schedule('0 2 * * *', async () => {
      console.log('Starting scheduled daily rebuild...');
      try {
        const result = await this.rebuildService.rebuildAll();
        console.log('Daily rebuild completed:', result);
      } catch (error) {
        console.error('Daily rebuild failed:', error);
      }
    });
  }

  startConsistencyCheck(): void {
    // Check consistency every hour
    cron.schedule('0 * * * *', async () => {
      await this.checkConsistency();
    });
  }

  private async checkConsistency(): Promise<void> {
    // Compare projection counts with source data
    // Optionally trigger incremental rebuilds for discrepancies
  }
}
```

## API Gateway Integration Patterns

### Direct Database Queries

API Gateway queries read models directly via Prisma:

```typescript
// In API Gateway (apps/api/src/lib/projections.ts)
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function getUserEscrows(userId: string, status?: string) {
  return await prisma.escrowSummary.findMany({
    where: {
      OR: [{ buyerId: userId }, { sellerId: userId }],
      ...(status && { status }),
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}

export async function getUserEscrowHistory(userId: string, limit = 100) {
  return await prisma.userEscrowHistory.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function getPaymentHistory(userId: string, limit = 50) {
  return await prisma.paymentHistory.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function getEscrowStats(
  userId: string,
  period: string = 'ALL_TIME'
) {
  const periodStart = getPeriodStart(period);

  return await prisma.escrowStats.findUnique({
    where: {
      userId_period_periodStart: {
        userId,
        period,
        periodStart,
      },
    },
  });
}
```

### API Gateway Endpoints

Example endpoints using projection queries:

```typescript
// GET /api/escrow?userId=xxx&status=xxx
router.get('/escrow', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { status } = req.query;

    if (!userId) {
      throw new AppError('User ID required', 401);
    }

    const escrows = await getUserEscrows(userId, status as string);

    res.json({
      success: true,
      data: escrows,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/escrow/history
router.get('/escrow/history', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const limit = parseInt(req.query.limit as string) || 100;

    if (!userId) {
      throw new AppError('User ID required', 401);
    }

    const history = await getUserEscrowHistory(userId, limit);

    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/payments/history
router.get('/payments/history', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const limit = parseInt(req.query.limit as string) || 50;

    if (!userId) {
      throw new AppError('User ID required', 401);
    }

    const payments = await getPaymentHistory(userId, limit);

    res.json({
      success: true,
      data: payments,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/stats
router.get('/stats', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const period = (req.query.period as string) || 'ALL_TIME';

    if (!userId) {
      throw new AppError('User ID required', 401);
    }

    const stats = await getEscrowStats(userId, period);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
});
```

### Query Service Pattern (Optional)

If Projections Service exposes REST endpoints (not required, but possible):

```typescript
// GET /api/projections/escrows?userId=xxx&status=xxx
router.get('/escrows', async (req, res, next) => {
  try {
    const { userId, status } = req.query;

    const escrows = await prisma.escrowSummary.findMany({
      where: {
        OR: [{ buyerId: userId as string }, { sellerId: userId as string }],
        ...(status && { status }),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({
      success: true,
      data: escrows,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/projections/history?userId=xxx&limit=50
router.get('/history', async (req, res, next) => {
  try {
    const { userId, limit = 50 } = req.query;

    const history = await prisma.userEscrowHistory.findMany({
      where: { userId: userId as string },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit as string),
    });

    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/projections/stats?userId=xxx&period=MONTHLY
router.get('/stats', async (req, res, next) => {
  try {
    const { userId, period = 'ALL_TIME' } = req.query;
    const periodStart = getPeriodStart(period as StatsPeriod);

    const stats = await prisma.escrowStats.findUnique({
      where: {
        userId_period_periodStart: {
          userId: userId as string,
          period: period as StatsPeriod,
          periodStart,
        },
      },
    });

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
});
```

### Caching Strategy

#### Redis Cache

Cache frequently accessed projections:

```typescript
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

export class ProjectionCache {
  private readonly TTL_SUMMARY = 5 * 60; // 5 minutes
  private readonly TTL_STATS = 60; // 1 minute

  async getUserEscrows(
    userId: string,
    status?: string
  ): Promise<EscrowSummary[]> {
    const key = `projections:escrows:${userId}:${status || 'all'}`;

    // Try cache first
    const cached = await redis.get(key);
    if (cached) {
      return JSON.parse(cached);
    }

    // Query database
    const escrows = await prisma.escrowSummary.findMany({
      where: {
        OR: [{ buyerId: userId }, { sellerId: userId }],
        ...(status && { status }),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Cache result
    await redis.setex(key, this.TTL_SUMMARY, JSON.stringify(escrows));

    return escrows;
  }

  async getEscrowStats(
    userId: string,
    period: string
  ): Promise<EscrowStats | null> {
    const key = `projections:stats:${userId}:${period}`;

    const cached = await redis.get(key);
    if (cached) {
      return JSON.parse(cached);
    }

    const stats = await getEscrowStats(userId, period);

    if (stats) {
      await redis.setex(key, this.TTL_STATS, JSON.stringify(stats));
    }

    return stats;
  }

  async invalidateEscrow(escrowId: string): Promise<void> {
    // Invalidate all cache keys related to this escrow
    // This would require tracking which users are involved
    const pattern = `projections:*:${escrowId}*`;
    const keys = await redis.keys(pattern);

    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }

  async invalidateUser(userId: string): Promise<void> {
    // Invalidate all cache keys for this user
    const pattern = `projections:*:${userId}*`;
    const keys = await redis.keys(pattern);

    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }
}
```

#### Cache Invalidation

Invalidate cache on projection updates:

```typescript
// In projection handlers, after updating read models
protected async invalidateCache(escrowId: string, userIds: string[]): Promise<void> {
  const cache = new ProjectionCache();

  await Promise.all([
    cache.invalidateEscrow(escrowId),
    ...userIds.map(userId => cache.invalidateUser(userId)),
  ]);
}
```

## Kafka Consumer Implementation

### Consumer Setup

```typescript
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';

export class ProjectionConsumer {
  private consumer: Consumer;
  private handlers: HandlerRegistry;
  private isRunning = false;

  constructor(
    private kafka: Kafka,
    private prisma: PrismaClient
  ) {
    this.consumer = this.kafka.consumer({
      groupId: 'projections-service',
      allowAutoTopicCreation: false,
    });

    this.handlers = new HandlerRegistry(this.prisma);
  }

  async start(): Promise<void> {
    await this.consumer.connect();
    await this.consumer.subscribe({
      topics: ['escrow.events.v1', 'payments.events.v1'],
      fromBeginning: false,
    });

    this.isRunning = true;

    await this.consumer.run({
      autoCommit: false, // Manual commit for at-least-once processing
      eachMessage: async (payload: EachMessagePayload) => {
        await this.handleMessage(payload);
      },
    });
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    await this.consumer.disconnect();
  }

  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    try {
      const event = this.deserializeEvent(payload.message.value);
      const eventId = payload.message.headers?.['event-id'] as string;
      const eventType = payload.message.headers?.['event-type'] as string;
      const aggregateId = payload.message.headers?.['aggregate-id'] as string;
      const version = parseInt(
        (payload.message.headers?.['event-version'] as string) || '1'
      );
      const timestamp =
        (payload.message.headers?.['timestamp'] as string) ||
        new Date().toISOString();

      if (!eventId || !eventType || !aggregateId) {
        console.error('Missing event headers:', payload.message.headers);
        return;
      }

      const handler = this.handlers.getHandler(eventType);
      if (!handler) {
        console.warn(`No handler registered for event type: ${eventType}`);
        // Commit offset even if no handler (to prevent reprocessing)
        await this.commitOffset(payload);
        return;
      }

      // Process event
      await handler.handle(event, eventId, version, timestamp);

      // Commit offset after successful processing
      await this.commitOffset(payload);
    } catch (error) {
      console.error(`Error processing event:`, error);
      // Don't commit offset on error - allows retry
      // Consider dead letter queue for persistent failures
    }
  }

  private async commitOffset(payload: EachMessagePayload): Promise<void> {
    await this.consumer.commitOffsets([
      {
        topic: payload.topic,
        partition: payload.partition,
        offset: (parseInt(payload.message.offset) + 1).toString(),
      },
    ]);
  }

  private deserializeEvent(buffer: Buffer): unknown {
    // Deserialize Protobuf message
    // Implementation depends on Protobuf schema definitions
    // Example using protobufjs:
    const { EscrowCreated } = require('./generated/escrow_pb');
    const message = EscrowCreated.deserializeBinary(buffer);
    return {
      escrowId: message.getEscrowId(),
      rail: message.getRail(),
      amount: message.getAmount(),
      currency: message.getCurrency(),
      timestamp: message.getTimestamp(),
    };
  }
}
```

### Consumer Configuration

```typescript
const kafka = new Kafka({
  brokers: process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092'],
  clientId: 'projections-service',
});

const consumer = kafka.consumer({
  groupId: 'projections-service',
  sessionTimeout: 30000,
  heartbeatInterval: 3000,
  maxBytesPerPartition: 1048576, // 1MB
  minBytes: 1,
  maxBytes: 10485760, // 10MB
  maxWaitTimeInMs: 5000,
});
```

### Error Handling

```typescript
export class ProjectionErrorHandler {
  async handleError(
    error: Error,
    event: unknown,
    eventId: string
  ): Promise<void> {
    // Log error
    console.error(`Error processing event ${eventId}:`, error);

    // Store failed event for retry
    await this.storeFailedEvent(eventId, event, error);

    // Optionally send to dead letter queue
    // await this.sendToDeadLetterQueue(eventId, event, error);
  }

  private async storeFailedEvent(
    eventId: string,
    event: unknown,
    error: Error
  ): Promise<void> {
    // Store in database for manual review/retry
    await prisma.failedEvent.create({
      data: {
        eventId,
        eventType: 'unknown', // Would extract from event
        payload: event as any,
        error: error.message,
        retryCount: 0,
      },
    });
  }
}
```

## Monitoring and Observability

### Metrics

Key metrics to track:

```typescript
export class ProjectionMetrics {
  private projectionLag: number = 0;
  private handlerExecutionTime: Map<string, number[]> = new Map();
  private rebuildDuration: number = 0;
  private queryPerformance: Map<string, number[]> = new Map();
  private errorCount: number = 0;
  private eventsProcessed: number = 0;

  recordHandlerExecution(eventType: string, duration: number): void {
    const times = this.handlerExecutionTime.get(eventType) || [];
    times.push(duration);
    if (times.length > 1000) {
      times.shift();
    }
    this.handlerExecutionTime.set(eventType, times);
  }

  recordQuery(queryType: string, duration: number): void {
    const times = this.queryPerformance.get(queryType) || [];
    times.push(duration);
    if (times.length > 1000) {
      times.shift();
    }
    this.queryPerformance.set(queryType, times);
  }

  recordRebuild(duration: number): void {
    this.rebuildDuration = duration;
  }

  recordError(): void {
    this.errorCount++;
  }

  recordEventProcessed(): void {
    this.eventsProcessed++;
  }

  getMetrics(): MetricsSnapshot {
    return {
      projectionLag: this.projectionLag,
      handlerExecutionTime: Object.fromEntries(
        Array.from(this.handlerExecutionTime.entries()).map(([type, times]) => [
          type,
          {
            avg: times.reduce((a, b) => a + b, 0) / times.length,
            p95: this.percentile(times, 95),
            p99: this.percentile(times, 99),
          },
        ])
      ),
      rebuildDuration: this.rebuildDuration,
      queryPerformance: Object.fromEntries(
        Array.from(this.queryPerformance.entries()).map(([type, times]) => [
          type,
          {
            avg: times.reduce((a, b) => a + b, 0) / times.length,
            p95: this.percentile(times, 95),
            p99: this.percentile(times, 99),
          },
        ])
      ),
      errorCount: this.errorCount,
      eventsProcessed: this.eventsProcessed,
    };
  }

  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    // Sort array in ascending order before calculating percentile
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[index] || 0;
  }
}

interface MetricsSnapshot {
  projectionLag: number;
  handlerExecutionTime: Record<
    string,
    { avg: number; p95: number; p99: number }
  >;
  rebuildDuration: number;
  queryPerformance: Record<string, { avg: number; p95: number; p99: number }>;
  errorCount: number;
  eventsProcessed: number;
}
```

### Health Checks

```typescript
export class HealthCheckService {
  constructor(
    private prisma: PrismaClient,
    private consumer: ProjectionConsumer
  ) {}

  async checkHealth(): Promise<HealthStatus> {
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkKafka(),
      this.checkProjectionLag(),
    ]);

    return {
      status: checks.every(c => c.status === 'fulfilled')
        ? 'healthy'
        : 'unhealthy',
      database: checks[0].status === 'fulfilled' ? 'ok' : 'error',
      kafka: checks[1].status === 'fulfilled' ? 'ok' : 'error',
      projectionLag: checks[2].status === 'fulfilled' ? 'ok' : 'warning',
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDatabase(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }

  private async checkKafka(): Promise<void> {
    if (!this.consumer.isRunning) {
      throw new Error('Kafka consumer not running');
    }
  }

  private async checkProjectionLag(): Promise<void> {
    // Check if projection lag is acceptable
    const lag = await this.calculateProjectionLag();

    if (lag > 1000) {
      throw new Error(`Projection lag too high: ${lag} events`);
    }
  }

  private async calculateProjectionLag(): Promise<number> {
    // Compare last processed event version with latest event version
    // This is a simplified version - actual implementation would compare Kafka offsets
    const latest = await this.prisma.escrowEvent.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { version: true },
    });

    const latestProcessed = await this.prisma.eventProcessingState.findFirst({
      orderBy: { lastProcessedAt: 'desc' },
      select: { lastEventVersion: true },
    });

    if (!latest || !latestProcessed) {
      return 0;
    }

    return latest.version - latestProcessed.lastEventVersion;
  }
}

interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  database: 'ok' | 'error';
  kafka: 'ok' | 'error';
  projectionLag: 'ok' | 'warning';
  timestamp: string;
}
```

### Logging

Structured logging for projection events:

```typescript
export class ProjectionLogger {
  logEventProcessed(
    eventType: string,
    eventId: string,
    escrowId: string,
    duration: number
  ): void {
    console.log(
      JSON.stringify({
        level: 'info',
        event: 'projection_processed',
        eventType,
        eventId,
        escrowId,
        duration,
        timestamp: new Date().toISOString(),
      })
    );
  }

  logEventFailed(eventType: string, eventId: string, error: string): void {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'projection_failed',
        eventType,
        eventId,
        error,
        timestamp: new Date().toISOString(),
      })
    );
  }

  logRebuildStarted(type: string): void {
    console.log(
      JSON.stringify({
        level: 'info',
        event: 'rebuild_started',
        type,
        timestamp: new Date().toISOString(),
      })
    );
  }

  logRebuildCompleted(
    type: string,
    eventsProcessed: number,
    duration: number
  ): void {
    console.log(
      JSON.stringify({
        level: 'info',
        event: 'rebuild_completed',
        type,
        eventsProcessed,
        duration,
        timestamp: new Date().toISOString(),
      })
    );
  }
}
```

### Alerts

Alert conditions:

1. **Projection Lag > 1000 events**: Indicates consumer is falling behind
2. **Rebuild Failures**: Full rebuild failed
3. **Handler Error Rate > 5%**: High error rate in projection handlers
4. **Database Connection Failures**: Cannot connect to database
5. **Kafka Consumer Disconnected**: Consumer is not running

## Summary

This design document provides a complete blueprint for implementing the Projections Service with:

- **Read Model Schemas**: Denormalized tables optimized for queries (EscrowSummary, UserEscrowHistory, PaymentHistory, EscrowStats)
- **Event Projection Handlers**: Idempotent handlers for all escrow and payment events with version tracking
- **Query Optimization**: Comprehensive indexing strategy, materialized views, and query patterns
- **Rebuild Procedures**: Full and incremental rebuild capabilities from event store
- **API Gateway Integration**: Direct database queries via Prisma with optional caching

The service is designed to be:

- **Reliable**: Idempotent processing and version tracking
- **Performant**: Optimized read models with proper indexes
- **Scalable**: Event-driven architecture with Kafka consumer groups
- **Maintainable**: Clear separation of concerns and comprehensive error handling
- **Observable**: Metrics, health checks, and structured logging
