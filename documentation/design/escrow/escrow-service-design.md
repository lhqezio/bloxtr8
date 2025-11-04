# Escrow Service Design Document

## Overview

This document defines the complete design for the Escrow Service, which serves as the core business logic engine for managing escrow transactions in Bloxtr8. The Escrow Service is an event-driven microservice that processes commands, maintains escrow state machine, enforces business rules, and emits domain events for downstream consumers.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [State Machine Implementation](#state-machine-implementation)
3. [Database Schema](#database-schema)
4. [Command Handlers](#command-handlers)
5. [Event Emission Patterns](#event-emission-patterns)
6. [Idempotency Implementation](#idempotency-implementation)
7. [State Transition Guards](#state-transition-guards)
8. [Timeout Handling](#timeout-handling)

## Architecture Overview

### Service Role

The Escrow Service is responsible for:

- **State Machine Owner**: Maintains authoritative escrow state and enforces valid transitions
- **Command Processor**: Consumes commands from Kafka and applies business logic
- **Event Publisher**: Emits domain events via transactional outbox pattern
- **Business Rules Enforcer**: Validates authorization, business rules, and transition guards
- **Idempotency Manager**: Ensures commands are processed exactly once

### Technology Stack

- **Runtime**: Node.js 20+ with TypeScript
- **Database**: PostgreSQL 14+ via Prisma ORM
- **Event Bus**: Apache Kafka with Protobuf serialization
- **Concurrency Control**: Optimistic locking using `version` field
- **Event Publishing**: Transactional Outbox Pattern

### Communication Patterns

```
API Gateway → Kafka (Commands) → Escrow Service → PostgreSQL → Outbox
                                                      ↓
                                                Kafka (Events)
```

## State Machine Implementation

### State Definitions

The escrow lifecycle follows these states:

```typescript
enum EscrowStatus {
  AWAIT_FUNDS = 'AWAIT_FUNDS', // Initial state, waiting for payment
  FUNDS_HELD = 'FUNDS_HELD', // Payment received, funds held in escrow
  DELIVERED = 'DELIVERED', // Seller marked delivery as complete
  RELEASED = 'RELEASED', // Funds released to seller (terminal)
  DISPUTED = 'DISPUTED', // Dispute opened by buyer or seller
  REFUNDED = 'REFUNDED', // Funds refunded to buyer (terminal)
  CANCELLED = 'CANCELLED', // Escrow cancelled before payment (terminal)
}
```

### Valid State Transitions

```typescript
const VALID_TRANSITIONS: Record<EscrowStatus, EscrowStatus[]> = {
  AWAIT_FUNDS: ['FUNDS_HELD', 'CANCELLED'],
  FUNDS_HELD: ['DELIVERED', 'DISPUTED', 'REFUNDED'],
  DELIVERED: ['RELEASED', 'DISPUTED', 'REFUNDED'],
  DISPUTED: ['RELEASED', 'REFUNDED'],
  RELEASED: [], // Terminal state
  REFUNDED: [], // Terminal state
  CANCELLED: [], // Terminal state
};
```

### State Transition Diagram

```
┌─────────────┐
│AWAIT_FUNDS  │
└──────┬──────┘
       │
       ├──(payment received)──→ ┌─────────────┐
       │                         │FUNDS_HELD   │
       │                         └──────┬──────┘
       │                                │
       │                                ├──(delivery marked)──→ ┌─────────────┐
       │                                │                       │DELIVERED    │
       │                                │                       └──────┬──────┘
       │                                │                              │
       │                                │                              ├──(buyer confirms)──→ ┌─────────────┐
       │                                │                              │                      │RELEASED     │
       │                                │                              └──(dispute)──────────→└─────────────┘
       │                                │                                                  ┌─────────────┐
       │                                ├──(dispute)──→ ┌─────────────┐                  │DISPUTED     │
       │                                │               │DISPUTED     │                  └──────┬──────┘
       │                                │               └──────┬──────┘                         │
       │                                │                      │                                 │
       │                                │                      ├──(admin resolves)──→ ┌─────────────┐
       │                                │                      │                      │RELEASED     │
       │                                │                      │    or                 │REFUNDED    │
       │                                │                      └──(admin resolves)──→ └─────────────┘
       │                                │
       │                                └──(refund)──→ ┌─────────────┐
       │                                               │REFUNDED     │
       │                                               └─────────────┘
       │
       └──(cancelled)──→ ┌─────────────┐
                         │CANCELLED    │
                         └─────────────┘
```

### State Machine Class Structure

```typescript
export class EscrowStateMachine {
  private static readonly VALID_TRANSITIONS = {
    AWAIT_FUNDS: ['FUNDS_HELD', 'CANCELLED'],
    FUNDS_HELD: ['DELIVERED', 'DISPUTED', 'REFUNDED'],
    DELIVERED: ['RELEASED', 'DISPUTED', 'REFUNDED'],
    DISPUTED: ['RELEASED', 'REFUNDED'],
    RELEASED: [],
    REFUNDED: [],
    CANCELLED: [],
  };

  /**
   * Validates if a state transition is allowed
   */
  static isValidTransition(
    currentStatus: EscrowStatus,
    newStatus: EscrowStatus
  ): boolean {
    const allowedTransitions = this.VALID_TRANSITIONS[currentStatus];
    return allowedTransitions?.includes(newStatus) ?? false;
  }

  /**
   * Transitions escrow to new state with optimistic locking
   */
  static async transition(
    prisma: PrismaClient,
    escrowId: string,
    newStatus: EscrowStatus,
    userId: string,
    reason?: string,
    metadata?: Record<string, unknown>
  ): Promise<Escrow> {
    return await prisma.$transaction(async tx => {
      // Load current state with version for optimistic locking
      const current = await tx.escrow.findUnique({
        where: { id: escrowId },
        select: {
          id: true,
          status: true,
          version: true,
          metadata: true,
          offer: {
            select: {
              buyerId: true,
              sellerId: true,
            },
          },
        },
      });

      if (!current) {
        throw new EscrowNotFoundError(`Escrow ${escrowId} not found`);
      }

      // Validate transition
      if (!this.isValidTransition(current.status, newStatus)) {
        throw new InvalidStateTransitionError(
          `Invalid transition from ${current.status} to ${newStatus}`
        );
      }

      // Update state with version check
      const updated = await tx.escrow.update({
        where: {
          id: escrowId,
          version: current.version, // Optimistic locking
        },
        data: {
          status: newStatus,
          version: { increment: 1 },
          updatedAt: new Date(),
          metadata: metadata
            ? {
                ...(current.metadata &&
                typeof current.metadata === 'object' &&
                current.metadata !== null &&
                !Array.isArray(current.metadata)
                  ? current.metadata
                  : {}),
                ...metadata,
              }
            : current.metadata,
        },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          action: `escrow.${newStatus.toLowerCase()}`,
          details: {
            escrowId,
            previousStatus: current.status,
            newStatus,
            reason,
            userId,
          },
          userId,
          escrowId,
          referenceType: 'ESCROW_TRANSITION',
          referenceId: escrowId,
        },
      });

      // Create escrow event record
      await tx.escrowEvent.create({
        data: {
          escrowId,
          eventType: `${newStatus}_TRANSITIONED`,
          payload: {
            previousStatus: current.status,
            newStatus,
            reason,
            userId,
            timestamp: new Date().toISOString(),
          },
          version: updated.version,
        },
      });

      return updated;
    });
  }

  /**
   * Checks if escrow is in a terminal state
   */
  static isTerminalState(status: EscrowStatus): boolean {
    return ['RELEASED', 'REFUNDED', 'CANCELLED'].includes(status);
  }

  /**
   * Checks if escrow can accept payment
   */
  static canAcceptPayment(status: EscrowStatus): boolean {
    return status === 'AWAIT_FUNDS';
  }

  /**
   * Checks if escrow can be released
   */
  static canRelease(status: EscrowStatus): boolean {
    return ['DELIVERED', 'DISPUTED'].includes(status);
  }

  /**
   * Checks if escrow can be refunded
   */
  static canRefund(status: EscrowStatus): boolean {
    return ['FUNDS_HELD', 'DELIVERED', 'DISPUTED'].includes(status);
  }
}
```

### Optimistic Locking Mechanism

Optimistic locking prevents concurrent modification conflicts:

1. **Read Phase**: Load escrow with current `version` field
2. **Validation Phase**: Check state transition validity
3. **Write Phase**: Update with `WHERE version = currentVersion` condition
4. **Conflict Detection**: If `version` changed, transaction fails and retries

```typescript
// Example: Concurrent update protection
const escrow = await prisma.escrow.findUnique({
  where: { id: escrowId },
  select: { version: true, status: true },
});

// Later update will fail if version changed
await prisma.escrow.update({
  where: {
    id: escrowId,
    version: escrow.version, // Must match current version
  },
  data: {
    status: 'FUNDS_HELD',
    version: { increment: 1 },
  },
});
```

### Error Handling

```typescript
export class EscrowError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = 'EscrowError';
  }
}

export class EscrowNotFoundError extends EscrowError {
  constructor(message: string) {
    super(message, 'ESCROW_NOT_FOUND', 404);
  }
}

export class InvalidStateTransitionError extends EscrowError {
  constructor(message: string) {
    super(message, 'INVALID_STATE_TRANSITION', 409);
  }
}

export class OptimisticLockError extends EscrowError {
  constructor(message: string) {
    super(message, 'OPTIMISTIC_LOCK_FAILED', 409);
  }
}
```

## Database Schema

### Escrow Table

The `Escrow` table is the source of truth for escrow state:

```prisma
model Escrow {
  id        String       @id @default(cuid())
  rail      EscrowRail   // STRIPE | USDC_BASE
  amount    BigInt       // Amount in cents (BigInt to support large escrows)
  currency  Currency     @default(USD) // USD | USDC
  status    EscrowStatus @default(AWAIT_FUNDS)
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt

  // Timeout fields
  expiresAt     DateTime? // Auto refund deadline for AWAIT_FUNDS
  autoRefundAt  DateTime? // Automatic release after delivery confirmation

  // Concurrency and metadata
  version   Int       @default(1) // Optimistic locking version
  metadata  Json?     // Rails-agnostic references (refund reasons, proofs, custodian IDs)

  // Relations
  offerId    String
  offer      Offer    @relation(fields: [offerId], references: [id])
  contractId String
  contract   Contract @relation(fields: [contractId], references: [id])

  // Rail-specific data
  stripeEscrow     StripeEscrow?
  stablecoinEscrow StablecoinEscrow?
  milestoneEscrow  MilestoneEscrow[]

  // Audit and related records
  auditLogs  AuditLog[]
  deliveries Delivery[]
  disputes   Dispute[]
  events     EscrowEvent[]

  @@index([offerId])
  @@index([contractId])
  @@index([status])
  @@index([rail])
  @@index([expiresAt]) // For timeout queries
  @@index([autoRefundAt]) // For auto-release queries
  @@map("escrows")
}
```

**Key Fields**:

- `version`: Incremented on each update for optimistic locking
- `expiresAt`: Deadline for AWAIT_FUNDS state (auto-refund if not paid)
- `autoRefundAt`: Deadline for DELIVERED state (auto-release if buyer doesn't confirm)
- `metadata`: JSON field for rail-agnostic data storage

### EscrowEvent Table

Append-only event log for audit trail and event sourcing:

```prisma
model EscrowEvent {
  id        String   @id @default(cuid())
  escrowId  String
  escrow    Escrow   @relation(fields: [escrowId], references: [id], onDelete: Cascade)

  eventType String   // e.g., 'ESCROW_CREATED', 'FUNDS_HELD', 'DELIVERED', etc.
  payload   Json     // Event payload (flexible JSON structure)

  createdAt DateTime @default(now())
  version   Int      // Event version (matches Escrow.version at time of event)

  @@index([escrowId])
  @@index([eventType])
  @@index([createdAt])
  @@index([escrowId, createdAt]) // Composite for event replay
  @@map("escrow_events")
}
```

**Purpose**:

- Complete audit trail of all escrow state changes
- Event sourcing for rebuilding state
- Debugging and compliance reporting
- Event replay for recovery scenarios

**Event Types**:

- `ESCROW_CREATED`
- `PAYMENT_CONFIRMED`
- `FUNDS_HELD`
- `DELIVERY_MARKED`
- `DELIVERY_CONFIRMED`
- `FUNDS_RELEASED`
- `REFUND_INITIATED`
- `REFUND_COMPLETED`
- `DISPUTE_OPENED`
- `DISPUTE_RESOLVED`
- `ESCROW_CANCELLED`
- `ESCROW_EXPIRED`

### Outbox Table

Transactional event publishing using Outbox Pattern:

```prisma
model Outbox {
  id          String    @id @default(cuid())
  aggregateId String    // escrowId for escrow events
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

**Purpose**:

- Ensures atomicity: database transaction and event publishing
- Prevents lost events (database committed but Kafka publish failed)
- Prevents orphaned events (database rolled back but Kafka message sent)

**Publishing Process**:

1. Service writes business state + outbox record in single transaction
2. Separate outbox publisher process polls for `publishedAt IS NULL`
3. Publisher deserializes Protobuf payload and publishes to Kafka
4. Publisher marks event as published (`publishedAt = NOW()`)

**Index Strategy**:

- Partial index on `publishedAt IS NULL` for efficient polling
- Composite index on `aggregateId, createdAt` for debugging

### Database Relationships

```
Escrow
  ├── offer (Offer)
  ├── contract (Contract)
  ├── stripeEscrow (StripeEscrow, optional)
  ├── stablecoinEscrow (StablecoinEscrow, optional)
  ├── milestoneEscrow[] (MilestoneEscrow[])
  ├── auditLogs[] (AuditLog[])
  ├── deliveries[] (Delivery[])
  ├── disputes[] (Dispute[])
  └── events[] (EscrowEvent[])
```

## Command Handlers

### Command Processing Flow

```
Kafka Command → Command Handler → Validate → Check Idempotency → Apply Business Logic →
Update Database → Emit Event → Commit Transaction
```

### Command Handler Base Class

```typescript
export abstract class EscrowCommandHandler<TCommand extends EscrowCommand> {
  constructor(
    protected prisma: PrismaClient,
    protected stateMachine: EscrowStateMachine,
    protected eventEmitter: EventEmitter
  ) {}

  abstract handle(command: TCommand): Promise<void>;

  protected async executeWithIdempotency(
    command: TCommand,
    handler: () => Promise<void>
  ): Promise<void> {
    // Check idempotency (see Idempotency Implementation section)
    const existing = await this.checkIdempotency(command.commandId);
    if (existing) {
      return; // Already processed
    }

    try {
      await handler();
      await this.storeIdempotency(command.commandId, { status: 'completed' });
    } catch (error) {
      await this.storeIdempotency(command.commandId, {
        status: 'failed',
        error: error.message,
      });
      throw error;
    }
  }
}
```

### CreateEscrowCommand Handler

**Command Structure**:

```typescript
interface CreateEscrowCommand {
  commandId: string;
  commandType: 'CREATE_ESCROW';
  escrowId: string;
  timestamp: string;
  payload: {
    offerId: string;
    contractId: string;
    rail: 'STRIPE' | 'USDC_BASE';
    amount: string; // BigInt serialized as string
    currency: 'USD' | 'USDC';
    sellerStripeAccountId?: string; // Required for STRIPE rail
    buyerFee?: number;
    sellerFee?: number;
  };
}
```

**Handler Implementation**:

```typescript
export class CreateEscrowCommandHandler extends EscrowCommandHandler<CreateEscrowCommand> {
  async handle(command: CreateEscrowCommand): Promise<void> {
    return this.executeWithIdempotency(command, async () => {
      // 1. Validate offer and contract exist and are in correct state
      const offer = await this.prisma.offer.findUnique({
        where: { id: command.payload.offerId },
        include: { buyer: true, seller: true },
      });

      if (!offer || offer.status !== 'ACCEPTED') {
        throw new ValidationError('Offer must be ACCEPTED to create escrow');
      }

      const contract = await this.prisma.contract.findUnique({
        where: { id: command.payload.contractId },
      });

      if (!contract || contract.status !== 'EXECUTED') {
        throw new ValidationError('Contract must be EXECUTED to create escrow');
      }

      // 2. Validate KYC requirements for high-value escrows
      const amountInDollars = Number(command.payload.amount) / 100;
      if (amountInDollars > 10000) {
        if (!offer.buyer.kycVerified || offer.buyer.kycTier < 'TIER_1') {
          throw new ValidationError(
            'KYC verification required for escrows > $10k'
          );
        }
        if (!offer.seller.kycVerified || offer.seller.kycTier < 'TIER_1') {
          throw new ValidationError(
            'KYC verification required for escrows > $10k'
          );
        }
      }

      // 3. Create escrow record
      const escrow = await this.prisma.$transaction(async tx => {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 days to pay

        const escrow = await tx.escrow.create({
          data: {
            id: command.escrowId,
            offerId: command.payload.offerId,
            contractId: command.payload.contractId,
            rail: command.payload.rail,
            amount: BigInt(command.payload.amount),
            currency: command.payload.currency,
            status: 'AWAIT_FUNDS',
            expiresAt,
            version: 1,
          },
        });

        // Create rail-specific record
        if (command.payload.rail === 'STRIPE') {
          await tx.stripeEscrow.create({
            data: {
              escrowId: escrow.id,
              paymentIntentId: '', // Will be set by Payments Service
            },
          });
        } else {
          await tx.stablecoinEscrow.create({
            data: {
              escrowId: escrow.id,
              depositAddr: '', // Will be set by Payments Service
              mintAddress:
                command.payload.currency === 'USDC' ? 'USDC_MINT_BASE' : '',
            },
          });
        }

        // Create escrow event
        await tx.escrowEvent.create({
          data: {
            escrowId: escrow.id,
            eventType: 'ESCROW_CREATED',
            payload: {
              rail: command.payload.rail,
              amount: command.payload.amount,
              currency: command.payload.currency,
            },
            version: 1,
          },
        });

        // Create outbox event
        await tx.outbox.create({
          data: {
            aggregateId: escrow.id,
            eventType: 'EscrowCreated',
            payload: Buffer.from(
              JSON.stringify({
                escrowId: escrow.id,
                offerId: command.payload.offerId,
                contractId: command.payload.contractId,
                rail: command.payload.rail,
                amount: command.payload.amount,
                currency: command.payload.currency,
                createdAt: escrow.createdAt.toISOString(),
              })
            ),
            version: 1,
          },
        });

        return escrow;
      });

      // 4. Emit event (outbox publisher will handle Kafka publishing)
      this.eventEmitter.emit('escrow.created', escrow);
    });
  }
}
```

### ConfirmPaymentCommand Handler

**Command Structure**:

```typescript
interface ConfirmPaymentCommand {
  commandId: string;
  commandType: 'CONFIRM_PAYMENT';
  escrowId: string;
  timestamp: string;
  payload: {
    transactionId: string;
    evidence?: string;
    userId: string;
  };
}
```

**Handler Implementation**:

```typescript
export class ConfirmPaymentCommandHandler extends EscrowCommandHandler<ConfirmPaymentCommand> {
  async handle(command: ConfirmPaymentCommand): Promise<void> {
    return this.executeWithIdempotency(command, async () => {
      await this.prisma.$transaction(async tx => {
        const escrow = await tx.escrow.findUnique({
          where: { id: command.escrowId },
          include: { stripeEscrow: true, stablecoinEscrow: true },
        });

        if (!escrow) {
          throw new EscrowNotFoundError(`Escrow ${command.escrowId} not found`);
        }

        // State guard: must be in AWAIT_FUNDS
        if (!this.stateMachine.canAcceptPayment(escrow.status)) {
          throw new InvalidStateTransitionError(
            `Cannot confirm payment in ${escrow.status} state`
          );
        }

        // Transition to FUNDS_HELD
        const updated = await this.stateMachine.transition(
          tx,
          command.escrowId,
          'FUNDS_HELD',
          command.payload.userId,
          'Payment confirmed',
          {
            transactionId: command.payload.transactionId,
            evidence: command.payload.evidence,
          }
        );

        // Update rail-specific records
        if (escrow.rail === 'STRIPE' && escrow.stripeEscrow) {
          await tx.stripeEscrow.update({
            where: { escrowId: command.escrowId },
            data: {
              lastWebhookAt: new Date(),
            },
          });
        } else if (escrow.rail === 'USDC_BASE' && escrow.stablecoinEscrow) {
          await tx.stablecoinEscrow.update({
            where: { escrowId: command.escrowId },
            data: {
              depositTx: command.payload.transactionId,
              depositConfirmations: 1,
              lastWebhookAt: new Date(),
            },
          });
        }

        // Create outbox event
        await tx.outbox.create({
          data: {
            aggregateId: command.escrowId,
            eventType: 'EscrowFundsHeld',
            payload: Buffer.from(
              JSON.stringify({
                escrowId: command.escrowId,
                transactionId: command.payload.transactionId,
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

### MarkDeliveredCommand Handler

**Command Structure**:

```typescript
interface MarkDeliveredCommand {
  commandId: string;
  commandType: 'MARK_DELIVERED';
  escrowId: string;
  timestamp: string;
  payload: {
    title: string;
    description?: string;
    evidence?: Record<string, unknown>;
    userId: string; // Must be seller
  };
}
```

**Handler Implementation**:

```typescript
export class MarkDeliveredCommandHandler extends EscrowCommandHandler<MarkDeliveredCommand> {
  async handle(command: MarkDeliveredCommand): Promise<void> {
    return this.executeWithIdempotency(command, async () => {
      await this.prisma.$transaction(async tx => {
        const escrow = await tx.escrow.findUnique({
          where: { id: command.escrowId },
          include: { offer: true },
        });

        if (!escrow) {
          throw new EscrowNotFoundError(`Escrow ${command.escrowId} not found`);
        }

        // Authorization guard: must be seller
        if (escrow.offer.sellerId !== command.payload.userId) {
          throw new AuthorizationError('Only seller can mark delivery');
        }

        // State guard: must be in FUNDS_HELD
        if (escrow.status !== 'FUNDS_HELD') {
          throw new InvalidStateTransitionError(
            `Cannot mark delivery in ${escrow.status} state`
          );
        }

        // Create delivery record
        const delivery = await tx.delivery.create({
          data: {
            escrowId: command.escrowId,
            offerId: escrow.offerId,
            contractId: escrow.contractId,
            listingId: escrow.offer.listingId,
            title: command.payload.title,
            description: command.payload.description,
            status: 'DELIVERED',
            deliveredBy: command.payload.userId,
            deliveredAt: new Date(),
            evidence: command.payload.evidence,
          },
        });

        // Set auto-refund deadline (7 days from delivery)
        const autoRefundAt = new Date();
        autoRefundAt.setDate(autoRefundAt.getDate() + 7);

        // Transition to DELIVERED
        await this.stateMachine.transition(
          tx,
          command.escrowId,
          'DELIVERED',
          command.payload.userId,
          `Delivery marked: ${command.payload.title}`,
          {
            deliveryId: delivery.id,
            autoRefundAt: autoRefundAt.toISOString(),
          }
        );

        // Update escrow with auto-refund deadline
        await tx.escrow.update({
          where: { id: command.escrowId },
          data: { autoRefundAt },
        });

        // Create outbox event
        await tx.outbox.create({
          data: {
            aggregateId: command.escrowId,
            eventType: 'EscrowDelivered',
            payload: Buffer.from(
              JSON.stringify({
                escrowId: command.escrowId,
                deliveryId: delivery.id,
                deliveredBy: command.payload.userId,
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

### ConfirmDeliveryCommand Handler

**Command Structure**:

```typescript
interface ConfirmDeliveryCommand {
  commandId: string;
  commandType: 'CONFIRM_DELIVERY';
  escrowId: string;
  timestamp: string;
  payload: {
    userId: string; // Must be buyer
  };
}
```

**Handler Implementation**:

```typescript
export class ConfirmDeliveryCommandHandler extends EscrowCommandHandler<ConfirmDeliveryCommand> {
  async handle(command: ConfirmDeliveryCommand): Promise<void> {
    return this.executeWithIdempotency(command, async () => {
      await this.prisma.$transaction(async tx => {
        const escrow = await tx.escrow.findUnique({
          where: { id: command.escrowId },
          include: { offer: true, deliveries: true },
        });

        if (!escrow) {
          throw new EscrowNotFoundError(`Escrow ${command.escrowId} not found`);
        }

        // Authorization guard: must be buyer
        if (escrow.offer.buyerId !== command.payload.userId) {
          throw new AuthorizationError('Only buyer can confirm delivery');
        }

        // State guard: must be in DELIVERED
        if (escrow.status !== 'DELIVERED') {
          throw new InvalidStateTransitionError(
            `Cannot confirm delivery in ${escrow.status} state`
          );
        }

        // Update delivery status
        const latestDelivery = escrow.deliveries.sort(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
        )[0];

        if (latestDelivery) {
          await tx.delivery.update({
            where: { id: latestDelivery.id },
            data: { status: 'CONFIRMED' },
          });
        }

        // Clear auto-refund deadline
        await tx.escrow.update({
          where: { id: command.escrowId },
          data: { autoRefundAt: null },
        });

        // Emit command to Payments Service to release funds
        // (This will be handled by separate ReleaseFundsCommand)
        await tx.outbox.create({
          data: {
            aggregateId: command.escrowId,
            eventType: 'ReleaseFundsCommand',
            payload: Buffer.from(
              JSON.stringify({
                escrowId: command.escrowId,
                reason: 'Buyer confirmed delivery',
                userId: command.payload.userId,
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

### ReleaseFundsCommand Handler

**Command Structure**:

```typescript
interface ReleaseFundsCommand {
  commandId: string;
  commandType: 'RELEASE_FUNDS';
  escrowId: string;
  timestamp: string;
  payload: {
    userId: string; // Admin or buyer (after confirmation)
    reason?: string;
  };
}
```

**Handler Implementation**:

```typescript
export class ReleaseFundsCommandHandler extends EscrowCommandHandler<ReleaseFundsCommand> {
  async handle(command: ReleaseFundsCommand): Promise<void> {
    return this.executeWithIdempotency(command, async () => {
      await this.prisma.$transaction(async tx => {
        const escrow = await tx.escrow.findUnique({
          where: { id: command.escrowId },
          include: { offer: true },
        });

        if (!escrow) {
          throw new EscrowNotFoundError(`Escrow ${command.escrowId} not found`);
        }

        // State guard: must be in DELIVERED or DISPUTED
        if (!this.stateMachine.canRelease(escrow.status)) {
          throw new InvalidStateTransitionError(
            `Cannot release funds in ${escrow.status} state`
          );
        }

        // Authorization guard: must be admin, buyer, or automated (after confirmation)
        const isAdmin = await this.isAdmin(command.payload.userId);
        const isBuyer = escrow.offer.buyerId === command.payload.userId;

        if (!isAdmin && !isBuyer && escrow.status !== 'DELIVERED') {
          throw new AuthorizationError('Only admin or buyer can release funds');
        }

        // Transition to RELEASED
        await this.stateMachine.transition(
          tx,
          command.escrowId,
          'RELEASED',
          command.payload.userId,
          command.payload.reason || 'Funds released'
        );

        // Emit command to Payments Service to transfer funds
        await tx.outbox.create({
          data: {
            aggregateId: command.escrowId,
            eventType: 'TransferToSellerCommand',
            payload: Buffer.from(
              JSON.stringify({
                escrowId: command.escrowId,
                rail: escrow.rail,
                amount: escrow.amount.toString(),
                currency: escrow.currency,
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

### RefundBuyerCommand Handler

**Command Structure**:

```typescript
interface RefundBuyerCommand {
  commandId: string;
  commandType: 'REFUND_BUYER';
  escrowId: string;
  timestamp: string;
  payload: {
    userId: string; // Admin only
    refundAmount?: number; // Optional partial refund
    reason: string;
  };
}
```

**Handler Implementation**:

```typescript
export class RefundBuyerCommandHandler extends EscrowCommandHandler<RefundBuyerCommand> {
  async handle(command: RefundBuyerCommand): Promise<void> {
    return this.executeWithIdempotency(command, async () => {
      await this.prisma.$transaction(async tx => {
        const escrow = await tx.escrow.findUnique({
          where: { id: command.escrowId },
          include: { offer: true },
        });

        if (!escrow) {
          throw new EscrowNotFoundError(`Escrow ${command.escrowId} not found`);
        }

        // Authorization guard: must be admin
        if (!(await this.isAdmin(command.payload.userId))) {
          throw new AuthorizationError('Only admin can refund buyer');
        }

        // State guard: must be in refundable state
        if (!this.stateMachine.canRefund(escrow.status)) {
          throw new InvalidStateTransitionError(
            `Cannot refund in ${escrow.status} state`
          );
        }

        // Validate refund amount
        const refundAmount = command.payload.refundAmount
          ? BigInt(command.payload.refundAmount)
          : escrow.amount;

        if (refundAmount > escrow.amount) {
          throw new ValidationError(
            'Refund amount cannot exceed escrow amount'
          );
        }

        // Transition to REFUNDED
        await this.stateMachine.transition(
          tx,
          command.escrowId,
          'REFUNDED',
          command.payload.userId,
          command.payload.reason,
          {
            refundAmount: refundAmount.toString(),
            refundType: refundAmount === escrow.amount ? 'FULL' : 'PARTIAL',
          }
        );

        // Emit command to Payments Service to process refund
        await tx.outbox.create({
          data: {
            aggregateId: command.escrowId,
            eventType: 'RefundBuyerCommand',
            payload: Buffer.from(
              JSON.stringify({
                escrowId: command.escrowId,
                rail: escrow.rail,
                refundAmount: refundAmount.toString(),
                currency: escrow.currency,
                reason: command.payload.reason,
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

### CreateDisputeCommand Handler

**Command Structure**:

```typescript
interface CreateDisputeCommand {
  commandId: string;
  commandType: 'CREATE_DISPUTE';
  escrowId: string;
  timestamp: string;
  payload: {
    userId: string; // Buyer or seller
    reason: string;
    description: string;
    evidence: Array<Record<string, unknown>>;
  };
}
```

**Handler Implementation**:

```typescript
export class CreateDisputeCommandHandler extends EscrowCommandHandler<CreateDisputeCommand> {
  async handle(command: CreateDisputeCommand): Promise<void> {
    return this.executeWithIdempotency(command, async () => {
      await this.prisma.$transaction(async tx => {
        const escrow = await tx.escrow.findUnique({
          where: { id: command.escrowId },
          include: { offer: true, disputes: true },
        });

        if (!escrow) {
          throw new EscrowNotFoundError(`Escrow ${command.escrowId} not found`);
        }

        // Authorization guard: must be buyer or seller
        const isBuyer = escrow.offer.buyerId === command.payload.userId;
        const isSeller = escrow.offer.sellerId === command.payload.userId;

        if (!isBuyer && !isSeller) {
          throw new AuthorizationError('Only buyer or seller can open dispute');
        }

        // State guard: cannot dispute if already in terminal state
        if (this.stateMachine.isTerminalState(escrow.status)) {
          throw new InvalidStateTransitionError(
            `Cannot open dispute in terminal state ${escrow.status}`
          );
        }

        // Check if dispute already exists
        const existingDispute = escrow.disputes.find(
          d => d.status === 'OPEN' || d.status === 'IN_REVIEW'
        );

        if (existingDispute) {
          throw new ValidationError(
            'Active dispute already exists for this escrow'
          );
        }

        // Create dispute record
        const dispute = await tx.dispute.create({
          data: {
            escrowId: command.escrowId,
            userId: command.payload.userId,
            title: command.payload.reason,
            description: command.payload.description,
            status: 'OPEN',
          },
        });

        // Transition to DISPUTED if not already
        if (escrow.status !== 'DISPUTED') {
          await this.stateMachine.transition(
            tx,
            command.escrowId,
            'DISPUTED',
            command.payload.userId,
            `Dispute opened: ${command.payload.reason}`,
            {
              disputeId: dispute.id,
            }
          );
        }

        // Create outbox event
        await tx.outbox.create({
          data: {
            aggregateId: command.escrowId,
            eventType: 'DisputeOpened',
            payload: Buffer.from(
              JSON.stringify({
                escrowId: command.escrowId,
                disputeId: dispute.id,
                openedBy: command.payload.userId,
                reason: command.payload.reason,
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

### ResolveDisputeCommand Handler

**Command Structure**:

```typescript
interface ResolveDisputeCommand {
  commandId: string;
  commandType: 'RESOLVE_DISPUTE';
  escrowId: string;
  timestamp: string;
  payload: {
    disputeId: string;
    userId: string; // Admin only
    resolution: 'RELEASE' | 'REFUND';
    reason: string;
  };
}
```

**Handler Implementation**:

```typescript
export class ResolveDisputeCommandHandler extends EscrowCommandHandler<ResolveDisputeCommand> {
  async handle(command: ResolveDisputeCommand): Promise<void> {
    return this.executeWithIdempotency(command, async () => {
      await this.prisma.$transaction(async tx => {
        const escrow = await tx.escrow.findUnique({
          where: { id: command.escrowId },
          include: { disputes: true },
        });

        if (!escrow) {
          throw new EscrowNotFoundError(`Escrow ${command.escrowId} not found`);
        }

        // Authorization guard: must be admin
        if (!(await this.isAdmin(command.payload.userId))) {
          throw new AuthorizationError('Only admin can resolve dispute');
        }

        // State guard: must be in DISPUTED
        if (escrow.status !== 'DISPUTED') {
          throw new InvalidStateTransitionError(
            `Cannot resolve dispute in ${escrow.status} state`
          );
        }

        // Find dispute
        const dispute = escrow.disputes.find(
          d => d.id === command.payload.disputeId
        );
        if (!dispute) {
          throw new ValidationError(
            `Dispute ${command.payload.disputeId} not found`
          );
        }

        // Update dispute status
        await tx.dispute.update({
          where: { id: command.payload.disputeId },
          data: {
            status: 'RESOLVED',
            resolution: command.payload.reason,
            resolvedAt: new Date(),
          },
        });

        // Transition based on resolution
        const newStatus =
          command.payload.resolution === 'RELEASE' ? 'RELEASED' : 'REFUNDED';

        await this.stateMachine.transition(
          tx,
          command.escrowId,
          newStatus,
          command.payload.userId,
          `Dispute resolved: ${command.payload.reason}`,
          {
            disputeId: command.payload.disputeId,
            resolution: command.payload.resolution,
          }
        );

        // Emit command to Payments Service if needed
        if (command.payload.resolution === 'RELEASE') {
          await tx.outbox.create({
            data: {
              aggregateId: command.escrowId,
              eventType: 'TransferToSellerCommand',
              payload: Buffer.from(
                JSON.stringify({
                  escrowId: command.escrowId,
                  rail: escrow.rail,
                  amount: escrow.amount.toString(),
                  currency: escrow.currency,
                })
              ),
              version: 1,
            },
          });
        } else {
          await tx.outbox.create({
            data: {
              aggregateId: command.escrowId,
              eventType: 'RefundBuyerCommand',
              payload: Buffer.from(
                JSON.stringify({
                  escrowId: command.escrowId,
                  rail: escrow.rail,
                  refundAmount: escrow.amount.toString(),
                  currency: escrow.currency,
                  reason: command.payload.reason,
                })
              ),
              version: 1,
            },
          });
        }
      });
    });
  }
}
```

### CancelEscrowCommand Handler

**Command Structure**:

```typescript
interface CancelEscrowCommand {
  commandId: string;
  commandType: 'CANCEL_ESCROW';
  escrowId: string;
  timestamp: string;
  payload: {
    userId: string; // Buyer, seller, or admin
    reason?: string;
  };
}
```

**Handler Implementation**:

```typescript
export class CancelEscrowCommandHandler extends EscrowCommandHandler<CancelEscrowCommand> {
  async handle(command: CancelEscrowCommand): Promise<void> {
    return this.executeWithIdempotency(command, async () => {
      await this.prisma.$transaction(async tx => {
        const escrow = await tx.escrow.findUnique({
          where: { id: command.escrowId },
          include: { offer: true },
        });

        if (!escrow) {
          throw new EscrowNotFoundError(`Escrow ${command.escrowId} not found`);
        }

        // Authorization guard: must be buyer, seller, or admin
        const isBuyer = escrow.offer.buyerId === command.payload.userId;
        const isSeller = escrow.offer.sellerId === command.payload.userId;
        const isAdmin = await this.isAdmin(command.payload.userId);

        if (!isBuyer && !isSeller && !isAdmin) {
          throw new AuthorizationError(
            'Only buyer, seller, or admin can cancel escrow'
          );
        }

        // State guard: can only cancel in AWAIT_FUNDS
        if (escrow.status !== 'AWAIT_FUNDS') {
          throw new InvalidStateTransitionError(
            `Cannot cancel escrow in ${escrow.status} state`
          );
        }

        // Transition to CANCELLED
        await this.stateMachine.transition(
          tx,
          command.escrowId,
          'CANCELLED',
          command.payload.userId,
          command.payload.reason || 'Escrow cancelled'
        );

        // Create outbox event
        await tx.outbox.create({
          data: {
            aggregateId: command.escrowId,
            eventType: 'EscrowCancelled',
            payload: Buffer.from(
              JSON.stringify({
                escrowId: command.escrowId,
                cancelledBy: command.payload.userId,
                reason: command.payload.reason,
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

## Event Emission Patterns

### Outbox Pattern Implementation

The Outbox Pattern ensures transactional consistency between database updates and event publishing:

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
          topic: `escrow.events.v1`,
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
    // Implementation depends on Protobuf schema
    return JSON.parse(buffer.toString());
  }
}
```

### Event Types

Domain events emitted by Escrow Service:

1. **EscrowCreated**: Escrow record created
2. **EscrowFundsHeld**: Payment confirmed, funds held
3. **EscrowDelivered**: Seller marked delivery complete
4. **EscrowReleased**: Funds released to seller
5. **EscrowRefunded**: Funds refunded to buyer
6. **DisputeOpened**: Dispute opened by buyer or seller
7. **DisputeResolved**: Dispute resolved by admin
8. **EscrowCancelled**: Escrow cancelled before payment
9. **EscrowExpired**: Escrow expired (timeout)

### Kafka Topic Configuration

**Topic**: `escrow.events.v1`

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

message EscrowCreated {
  string escrow_id = 1;
  string offer_id = 2;
  string contract_id = 3;
  string rail = 4; // "STRIPE" | "USDC_BASE"
  string amount = 5; // BigInt serialized as string
  string currency = 6; // "USD" | "USDC"
  string created_at = 7; // ISO8601 timestamp
}

message EscrowFundsHeld {
  string escrow_id = 1;
  string transaction_id = 2;
  string timestamp = 3;
}

message EscrowDelivered {
  string escrow_id = 1;
  string delivery_id = 2;
  string delivered_by = 3;
  string timestamp = 4;
}

message EscrowReleased {
  string escrow_id = 1;
  string transfer_id = 2;
  string released_by = 3;
  string timestamp = 4;
}

message EscrowRefunded {
  string escrow_id = 1;
  string refund_id = 2;
  string refund_amount = 3;
  string refunded_by = 4;
  string timestamp = 5;
}
```

### Event Publisher Process

The outbox publisher runs as a separate background process:

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

## Idempotency Implementation

### Command-Level Idempotency

Every command includes a unique `commandId` for idempotency:

```typescript
interface EscrowCommand {
  commandId: string; // UUID, unique per command
  commandType: string;
  escrowId: string;
  timestamp: string;
  payload: Record<string, unknown>;
}
```

### Idempotency Storage

**Option 1: Database Table** (Recommended for strong consistency)

```prisma
model CommandIdempotency {
  id          String   @id @default(cuid())
  commandId   String   @unique
  commandType String
  escrowId    String
  status      String   // 'pending' | 'completed' | 'failed'
  result      Json?    // Cached command result
  error       String?
  createdAt   DateTime @default(now())
  completedAt DateTime?

  @@index([commandId])
  @@index([escrowId, createdAt])
  @@map("command_idempotency")
}
```

**Option 2: Redis** (For high-throughput scenarios)

```typescript
interface IdempotencyRecord {
  commandId: string;
  status: 'pending' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
  ttl: number; // Time-to-live in seconds
}
```

### Idempotency Check Flow

```typescript
export class IdempotencyManager {
  constructor(
    private prisma: PrismaClient,
    private redis?: RedisClient
  ) {}

  async checkIdempotency(commandId: string): Promise<IdempotencyRecord | null> {
    // Try Redis first (faster)
    if (this.redis) {
      const cached = await this.redis.get(`idempotency:${commandId}`);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    // Fallback to database
    const record = await this.prisma.commandIdempotency.findUnique({
      where: { commandId },
    });

    if (record) {
      // Cache in Redis for future lookups
      if (this.redis && record.status === 'completed') {
        await this.redis.setex(
          `idempotency:${commandId}`,
          3600, // 1 hour TTL
          JSON.stringify({
            commandId: record.commandId,
            status: record.status,
            result: record.result,
          })
        );
      }

      return {
        commandId: record.commandId,
        status: record.status,
        result: record.result,
        error: record.error,
      };
    }

    return null;
  }

  async storeIdempotency(
    commandId: string,
    data: {
      commandType: string;
      escrowId: string;
      status: 'pending' | 'completed' | 'failed';
      result?: unknown;
      error?: string;
    }
  ): Promise<void> {
    await this.prisma.$transaction(async tx => {
      // Check if already exists (race condition protection)
      const existing = await tx.commandIdempotency.findUnique({
        where: { commandId },
      });

      if (existing) {
        // Update existing record
        await tx.commandIdempotency.update({
          where: { commandId },
          data: {
            status: data.status,
            result: data.result as Prisma.JsonValue,
            error: data.error,
            completedAt: data.status !== 'pending' ? new Date() : null,
          },
        });
      } else {
        // Create new record
        await tx.commandIdempotency.create({
          data: {
            commandId,
            commandType: data.commandType,
            escrowId: data.escrowId,
            status: data.status,
            result: data.result as Prisma.JsonValue,
            error: data.error,
            completedAt: data.status !== 'pending' ? new Date() : null,
          },
        });
      }

      // Cache in Redis if completed
      if (this.redis && data.status === 'completed') {
        await this.redis.setex(
          `idempotency:${commandId}`,
          3600,
          JSON.stringify({
            commandId,
            status: data.status,
            result: data.result,
          })
        );
      }
    });
  }
}
```

### Idempotency in Command Handler

```typescript
export abstract class EscrowCommandHandler<TCommand extends EscrowCommand> {
  constructor(
    protected idempotencyManager: IdempotencyManager,
    protected prisma: PrismaClient
  ) {}

  async handle(command: TCommand): Promise<unknown> {
    // 1. Check idempotency
    const existing = await this.idempotencyManager.checkIdempotency(
      command.commandId
    );
    if (existing) {
      if (existing.status === 'completed') {
        return existing.result; // Return cached result
      }
      if (existing.status === 'failed') {
        throw new Error(`Command failed previously: ${existing.error}`);
      }
      // If pending, wait or retry (implementation depends on strategy)
      throw new Error('Command is currently being processed');
    }

    // 2. Mark as pending
    await this.idempotencyManager.storeIdempotency(command.commandId, {
      commandType: command.commandType,
      escrowId: command.escrowId,
      status: 'pending',
    });

    try {
      // 3. Execute command handler
      const result = await this.execute(command);

      // 4. Mark as completed
      await this.idempotencyManager.storeIdempotency(command.commandId, {
        commandType: command.commandType,
        escrowId: command.escrowId,
        status: 'completed',
        result,
      });

      return result;
    } catch (error) {
      // 5. Mark as failed
      await this.idempotencyManager.storeIdempotency(command.commandId, {
        commandType: command.commandType,
        escrowId: command.escrowId,
        status: 'failed',
        error: error.message,
      });

      throw error;
    }
  }

  protected abstract execute(command: TCommand): Promise<unknown>;
}
```

### TTL Management

Idempotency records expire after a configurable period:

```typescript
// Cleanup job (runs daily)
export async function cleanupExpiredIdempotency(
  prisma: PrismaClient
): Promise<void> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 7); // 7 days retention

  await prisma.commandIdempotency.deleteMany({
    where: {
      completedAt: {
        lt: cutoffDate,
      },
    },
  });
}
```

## State Transition Guards

### Guard Types

State transition guards ensure:

1. **Authorization**: User has permission to perform action
2. **Business Rules**: Business logic constraints are satisfied
3. **State Validity**: Escrow is in correct state for transition

### Authorization Guards

```typescript
export class AuthorizationGuard {
  constructor(private prisma: PrismaClient) {}

  async checkEscrowAccess(
    escrowId: string,
    userId: string,
    requiredRole: 'buyer' | 'seller' | 'admin'
  ): Promise<boolean> {
    const escrow = await this.prisma.escrow.findUnique({
      where: { id: escrowId },
      include: { offer: true },
    });

    if (!escrow) {
      return false;
    }

    const isBuyer = escrow.offer.buyerId === userId;
    const isSeller = escrow.offer.sellerId === userId;
    const isAdmin = await this.isAdmin(userId);

    switch (requiredRole) {
      case 'buyer':
        return isBuyer || isAdmin;
      case 'seller':
        return isSeller || isAdmin;
      case 'admin':
        return isAdmin;
      default:
        return false;
    }
  }

  async isAdmin(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    return user?.role === 'ADMIN';
  }
}
```

### Business Rule Guards

```typescript
export class BusinessRuleGuard {
  constructor(private prisma: PrismaClient) {}

  async validateKYCRequirements(escrowId: string): Promise<void> {
    const escrow = await this.prisma.escrow.findUnique({
      where: { id: escrowId },
      include: {
        offer: {
          include: {
            buyer: true,
            seller: true,
          },
        },
      },
    });

    if (!escrow) {
      throw new EscrowNotFoundError(`Escrow ${escrowId} not found`);
    }

    const amountInDollars = Number(escrow.amount) / 100;

    // High-value escrows require KYC
    if (amountInDollars > 10000) {
      if (
        !escrow.offer.buyer.kycVerified ||
        escrow.offer.buyer.kycTier < 'TIER_1'
      ) {
        throw new ValidationError(
          'Buyer KYC verification required for escrows > $10k'
        );
      }

      if (
        !escrow.offer.seller.kycVerified ||
        escrow.offer.seller.kycTier < 'TIER_1'
      ) {
        throw new ValidationError(
          'Seller KYC verification required for escrows > $10k'
        );
      }
    }
  }

  async validateWalletRisk(escrowId: string): Promise<void> {
    const escrow = await this.prisma.escrow.findUnique({
      where: { id: escrowId },
      include: {
        offer: {
          include: {
            buyer: true,
            seller: true,
          },
        },
      },
    });

    if (!escrow) {
      throw new EscrowNotFoundError(`Escrow ${escrowId} not found`);
    }

    // Block high-risk or sanctioned wallets
    if (
      escrow.offer.buyer.walletRisk === 'SANCTIONED' ||
      escrow.offer.buyer.walletRisk === 'HIGH'
    ) {
      throw new ValidationError('Buyer wallet risk too high');
    }

    if (
      escrow.offer.seller.walletRisk === 'SANCTIONED' ||
      escrow.offer.seller.walletRisk === 'HIGH'
    ) {
      throw new ValidationError('Seller wallet risk too high');
    }
  }

  async validateOfferExpiry(escrowId: string): Promise<void> {
    const escrow = await this.prisma.escrow.findUnique({
      where: { id: escrowId },
      include: { offer: true },
    });

    if (!escrow) {
      throw new EscrowNotFoundError(`Escrow ${escrowId} not found`);
    }

    if (escrow.offer.expiry < new Date()) {
      throw new ValidationError('Offer has expired');
    }
  }
}
```

### Pre-Transition Guards

```typescript
export class PreTransitionGuard {
  constructor(
    private authorizationGuard: AuthorizationGuard,
    private businessRuleGuard: BusinessRuleGuard,
    private stateMachine: EscrowStateMachine
  ) {}

  async validateTransition(
    escrowId: string,
    newStatus: EscrowStatus,
    userId: string,
    context: {
      requiredRole?: 'buyer' | 'seller' | 'admin';
      validateKYC?: boolean;
      validateWalletRisk?: boolean;
      validateOfferExpiry?: boolean;
    }
  ): Promise<void> {
    const escrow = await this.prisma.escrow.findUnique({
      where: { id: escrowId },
    });

    if (!escrow) {
      throw new EscrowNotFoundError(`Escrow ${escrowId} not found`);
    }

    // 1. State transition validation
    if (!this.stateMachine.isValidTransition(escrow.status, newStatus)) {
      throw new InvalidStateTransitionError(
        `Invalid transition from ${escrow.status} to ${newStatus}`
      );
    }

    // 2. Authorization check
    if (context.requiredRole) {
      const hasAccess = await this.authorizationGuard.checkEscrowAccess(
        escrowId,
        userId,
        context.requiredRole
      );

      if (!hasAccess) {
        throw new AuthorizationError(
          `User ${userId} does not have ${context.requiredRole} access`
        );
      }
    }

    // 3. Business rule validations
    if (context.validateKYC) {
      await this.businessRuleGuard.validateKYCRequirements(escrowId);
    }

    if (context.validateWalletRisk) {
      await this.businessRuleGuard.validateWalletRisk(escrowId);
    }

    if (context.validateOfferExpiry) {
      await this.businessRuleGuard.validateOfferExpiry(escrowId);
    }
  }
}
```

### Post-Transition Actions

```typescript
export class PostTransitionAction {
  constructor(private prisma: PrismaClient) {}

  async execute(
    escrowId: string,
    newStatus: EscrowStatus,
    previousStatus: EscrowStatus
  ): Promise<void> {
    // Update related entities based on state transition
    switch (newStatus) {
      case 'RELEASED':
        await this.onEscrowReleased(escrowId);
        break;
      case 'REFUNDED':
        await this.onEscrowRefunded(escrowId);
        break;
      case 'CANCELLED':
        await this.onEscrowCancelled(escrowId);
        break;
      case 'DISPUTED':
        await this.onEscrowDisputed(escrowId);
        break;
    }
  }

  private async onEscrowReleased(escrowId: string): Promise<void> {
    // Update contract status
    const escrow = await this.prisma.escrow.findUnique({
      where: { id: escrowId },
      select: { contractId: true },
    });

    if (escrow) {
      await this.prisma.contract.update({
        where: { id: escrow.contractId },
        data: { status: 'EXECUTED' },
      });
    }
  }

  private async onEscrowRefunded(escrowId: string): Promise<void> {
    // Update offer status
    const escrow = await this.prisma.escrow.findUnique({
      where: { id: escrowId },
      select: { offerId: true },
    });

    if (escrow) {
      await this.prisma.offer.update({
        where: { id: escrow.offerId },
        data: { status: 'DECLINED' },
      });
    }
  }

  private async onEscrowCancelled(escrowId: string): Promise<void> {
    // Cleanup and notify
    // Implementation depends on requirements
  }

  private async onEscrowDisputed(escrowId: string): Promise<void> {
    // Notify moderators
    // Implementation depends on notification system
  }
}
```

### Guard Failure Handling

```typescript
export class GuardFailureHandler {
  handle(error: Error): void {
    if (error instanceof AuthorizationError) {
      // Log security event
      console.warn(`Authorization failed: ${error.message}`);
      // Optionally notify security team
    } else if (error instanceof InvalidStateTransitionError) {
      // Log state transition failure
      console.warn(`Invalid state transition: ${error.message}`);
      // Optionally alert operations team
    } else if (error instanceof ValidationError) {
      // Log validation failure
      console.warn(`Validation failed: ${error.message}`);
    }

    // Re-throw to be handled by caller
    throw error;
  }
}
```

## Timeout Handling

### Escrow Expiration (`expiresAt`)

Escrows in `AWAIT_FUNDS` state expire after a configurable period (default: 7 days):

```typescript
export class EscrowExpirationProcessor {
  constructor(
    private prisma: PrismaClient,
    private stateMachine: EscrowStateMachine,
    private eventEmitter: EventEmitter
  ) {}

  async processExpiredEscrows(): Promise<void> {
    const expiredEscrows = await this.prisma.escrow.findMany({
      where: {
        status: 'AWAIT_FUNDS',
        expiresAt: {
          lte: new Date(),
        },
      },
      include: {
        offer: true,
      },
    });

    for (const escrow of expiredEscrows) {
      try {
        await this.expireEscrow(escrow.id);
      } catch (error) {
        console.error(`Failed to expire escrow ${escrow.id}:`, error);
        // Continue processing other escrows
      }
    }
  }

  private async expireEscrow(escrowId: string): Promise<void> {
    await this.prisma.$transaction(async tx => {
      // Transition to CANCELLED
      await this.stateMachine.transition(
        tx,
        escrowId,
        'CANCELLED',
        'system', // System-initiated
        'Escrow expired - payment not received within deadline'
      );

      // Create outbox event
      await tx.outbox.create({
        data: {
          aggregateId: escrowId,
          eventType: 'EscrowExpired',
          payload: Buffer.from(
            JSON.stringify({
              escrowId,
              expiredAt: new Date().toISOString(),
              reason: 'Payment deadline exceeded',
            })
          ),
          version: 1,
        },
      });

      // Update offer status
      const escrow = await tx.escrow.findUnique({
        where: { id: escrowId },
        select: { offerId: true },
      });

      if (escrow) {
        await tx.offer.update({
          where: { id: escrow.offerId },
          data: { status: 'EXPIRED' },
        });
      }
    });
  }
}
```

### Auto-Refund Mechanism (`autoRefundAt`)

Escrows in `DELIVERED` state automatically refund if buyer doesn't confirm within deadline:

```typescript
export class AutoRefundProcessor {
  constructor(
    private prisma: PrismaClient,
    private stateMachine: EscrowStateMachine,
    private eventEmitter: EventEmitter
  ) {}

  async processAutoRefunds(): Promise<void> {
    const escrowsToRefund = await this.prisma.escrow.findMany({
      where: {
        status: 'DELIVERED',
        autoRefundAt: {
          lte: new Date(),
        },
      },
      include: {
        offer: true,
      },
    });

    for (const escrow of escrowsToRefund) {
      try {
        await this.processAutoRefund(escrow.id, escrow.amount);
      } catch (error) {
        console.error(`Failed to auto-refund escrow ${escrow.id}:`, error);
        // Continue processing other escrows
      }
    }
  }

  private async processAutoRefund(
    escrowId: string,
    refundAmount: Decimal
  ): Promise<void> {
    await this.prisma.$transaction(async tx => {
      // Transition to REFUNDED
      await this.stateMachine.transition(
        tx,
        escrowId,
        'REFUNDED',
        'system', // System-initiated
        'Auto-refund - buyer did not confirm delivery within deadline',
        {
          refundType: 'AUTO',
          reason: 'Buyer confirmation timeout',
        }
      );

      // Create outbox event to trigger refund
      await tx.outbox.create({
        data: {
          aggregateId: escrowId,
          eventType: 'RefundBuyerCommand',
          payload: Buffer.from(
            JSON.stringify({
              escrowId,
              refundAmount: refundAmount.toString(),
              reason: 'Buyer confirmation timeout',
              autoRefund: true,
            })
          ),
          version: 1,
        },
      });
    });
  }
}
```

### Background Job Scheduler

```typescript
import cron from 'node-cron';

export class EscrowTimeoutScheduler {
  private expirationProcessor: EscrowExpirationProcessor;
  private autoRefundProcessor: AutoRefundProcessor;
  private expirationTask: ScheduledTask | null = null;
  private autoRefundTask: ScheduledTask | null = null;

  constructor(
    private prisma: PrismaClient,
    private stateMachine: EscrowStateMachine,
    private eventEmitter: EventEmitter
  ) {
    this.expirationProcessor = new EscrowExpirationProcessor(
      prisma,
      stateMachine,
      eventEmitter
    );
    this.autoRefundProcessor = new AutoRefundProcessor(
      prisma,
      stateMachine,
      eventEmitter
    );
  }

  start(): void {
    // Process expired escrows every 5 minutes
    this.expirationTask = cron.schedule('*/5 * * * *', async () => {
      try {
        console.log('[Escrow Timeout] Processing expired escrows...');
        await this.expirationProcessor.processExpiredEscrows();
      } catch (error) {
        console.error(
          '[Escrow Timeout] Error processing expired escrows:',
          error
        );
      }
    });

    // Process auto-refunds every 5 minutes
    this.autoRefundTask = cron.schedule('*/5 * * * *', async () => {
      try {
        console.log('[Escrow Timeout] Processing auto-refunds...');
        await this.autoRefundProcessor.processAutoRefunds();
      } catch (error) {
        console.error('[Escrow Timeout] Error processing auto-refunds:', error);
      }
    });

    console.log('[Escrow Timeout] Scheduler started');
  }

  stop(): void {
    if (this.expirationTask) {
      this.expirationTask.stop();
      this.expirationTask = null;
    }

    if (this.autoRefundTask) {
      this.autoRefundTask.stop();
      this.autoRefundTask = null;
    }

    console.log('[Escrow Timeout] Scheduler stopped');
  }
}
```

### Timeout Configuration

```typescript
export const ESCROW_TIMEOUT_CONFIG = {
  // Payment deadline (AWAIT_FUNDS → CANCELLED)
  PAYMENT_DEADLINE_DAYS: 7,

  // Auto-refund deadline (DELIVERED → REFUNDED)
  AUTO_REFUND_DEADLINE_DAYS: 7,

  // Background job polling interval
  POLL_INTERVAL_MINUTES: 5,
};
```

### Graceful Handling of Expired Escrows

```typescript
export class EscrowExpirationHandler {
  async handleExpiration(escrowId: string): Promise<void> {
    try {
      // Attempt to expire escrow
      await this.expirationProcessor.expireEscrow(escrowId);

      // Notify stakeholders
      await this.notifyStakeholders(escrowId, 'EXPIRED');

      // Log success
      console.log(`Escrow ${escrowId} expired successfully`);
    } catch (error) {
      // Handle errors gracefully
      if (error instanceof OptimisticLockError) {
        // Another process handled it, log and continue
        console.log(`Escrow ${escrowId} already processed by another instance`);
      } else if (error instanceof InvalidStateTransitionError) {
        // Escrow already transitioned, skip
        console.log(`Escrow ${escrowId} no longer in AWAIT_FUNDS state`);
      } else {
        // Unexpected error, alert operations
        console.error(`Failed to expire escrow ${escrowId}:`, error);
        // Optionally send alert to operations team
      }
    }
  }

  private async notifyStakeholders(
    escrowId: string,
    reason: string
  ): Promise<void> {
    // Implementation depends on notification system
    // Emit event for Notifications Service to consume
  }
}
```

### Indexes for Timeout Queries

Efficient queries for timeout processing require indexes:

```prisma
model Escrow {
  // ... other fields

  @@index([status, expiresAt]) // Composite index for expiration queries
  @@index([status, autoRefundAt]) // Composite index for auto-refund queries
}
```

## Summary

This design document provides a complete blueprint for implementing the Escrow Service with:

- **State Machine**: Enforces valid transitions with optimistic locking
- **Database Schema**: Escrow, EscrowEvent, and Outbox tables with proper indexes
- **Command Handlers**: All escrow commands with validation and idempotency
- **Event Emission**: Transactional outbox pattern for reliable event publishing
- **Idempotency**: Command-level deduplication for safe retries
- **State Transition Guards**: Authorization and business rule validation
- **Timeout Handling**: Background jobs for expiration and auto-refund

The service is designed to be:

- **Reliable**: Transactional consistency and idempotent operations
- **Scalable**: Event-driven architecture with Kafka partitioning
- **Maintainable**: Clear separation of concerns and comprehensive error handling
- **Observable**: Complete audit trail via EscrowEvent table
