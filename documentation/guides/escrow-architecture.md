# Escrow Architecture - Getting Up to Speed

A comprehensive guide to understanding the Bloxtr8 escrow system architecture. This document provides a scannable overview of key concepts, flows, and patterns. For detailed technical specifications, see the [Deep Dive Links](#deep-dive-links) section.

## Overview

The Bloxtr8 Escrow System is an **event-driven microservices architecture** built on **Apache Kafka** that handles payment escrow for high-value Roblox game transactions.

### Key Facts

- **Transaction Volume**: $300M+ annually
- **Architecture**: Event-driven microservices with Kafka
- **Payment Rails**: Stripe (≤$10k) and USDC on Base (>$10k)
- **Consistency**: Strong consistency for escrow state, eventual consistency for read models
- **Observability**: Complete distributed tracing and metrics

### What It Does

Bloxtr8 acts as a neutral third party that:

1. Holds buyer payment securely until seller delivers the Roblox asset
2. Verifies delivery completion
3. Releases funds to seller (or refunds buyer if needed)
4. Handles disputes and maintains complete audit trails

**See also**: [Escrow System Architecture](../architecture/escrow/escrow-system-architecture.md)

## Core Concepts

### Event-Driven Architecture

All state changes flow through **Kafka events** for loose coupling and scalability.

**Pattern**:

- **Commands**: Request to perform an action (e.g., `CreateEscrow`, `MarkDelivered`)
- **Events**: Domain events for state changes (e.g., `EscrowCreated`, `EscrowFundsHeld`)
- **Communication**: Services communicate asynchronously via Kafka topics

**Example Flow**:

```
API Gateway → Kafka Command → Escrow Service → Kafka Event → Multiple Consumers
```

**See also**: [Escrow System Architecture - Communication Patterns](../architecture/escrow/escrow-system-architecture.md#communication-patterns)

**External References**:

- [Event-Driven Architecture](https://martinfowler.com/articles/201701-event-driven.html) - Martin Fowler's article on event-driven patterns

### Kafka Command/Event Pattern

**Commands** (`*.commands.v1`):

- Request-response pattern for state changes
- Partitioned by `escrow_id` for ordering
- Short retention (7 days)

**Events** (`*.events.v1`):

- Domain events emitted after state changes
- Multiple consumers subscribe (Projections, Notifications, etc.)
- Long retention (90 days) with compaction

**Key Topics**:

- `escrow.commands.v1` - Escrow commands
- `escrow.events.v1` - Escrow domain events
- `payments.commands.v1` - Payment commands
- `payments.events.v1` - Payment events

**See also**: [Topic Catalog](../architecture/escrow/topic-catalog.md)

**External References**:

- [Kafka Partitioning](https://kafka.apache.org/documentation/#intro_topics) - How partitioning enables ordering guarantees
- [Kafka Consumer Groups](https://kafka.apache.org/documentation/#consumerconfigs_group.id) - Consumer groups for parallel processing
- [Kafka Log Compaction](https://kafka.apache.org/documentation/#compaction) - Compaction for event topics

### State Machine

Escrow state follows a strict state machine with guarded transitions:

```
AWAIT_FUNDS → FUNDS_HELD → DELIVERED → RELEASED
                ↓
            DISPUTED → REFUNDED or RELEASED
                ↓
            CANCELLED
```

**Key States**:

- `AWAIT_FUNDS`: Escrow created, waiting for payment
- `FUNDS_HELD`: Payment received, funds secured
- `DELIVERED`: Seller marked assets as delivered
- `RELEASED`: Funds transferred to seller (terminal)
- `REFUNDED`: Funds refunded to buyer (terminal)
- `DISPUTED`: Dispute raised, awaiting resolution
- `CANCELLED`: Escrow cancelled before payment (terminal)

**Guards**: Each transition validates actor authorization, state precondition, and business rules.

**See also**: [State Machine](../architecture/escrow/state-machine.md)

### Multi-Rail Payments

**Routing Logic**: Amount ≤ $10,000 → Stripe, Amount > $10,000 → USDC on Base

**Stripe Rail**:

- Credit card payments via Stripe Connect
- Built-in fraud protection
- Fees: 2.9% + $0.30 per transaction

**USDC Rail**:

- Stablecoin payments on Base network
- Much lower fees (~$0.01-0.10 gas)
- Wallet screening required (TRM Labs + Chainalysis)

**See also**: [Payment System](../architecture/payment-system.md)

### Transactional Outbox Pattern

**Problem**: Database transaction commits but Kafka publish fails → inconsistent state

**Solution**: Write business state + event record in single transaction, separate publisher polls and publishes events.

**Process**:

1. Service writes business state + outbox record in single transaction
2. Outbox publisher polls for unpublished events
3. Publisher publishes to Kafka
4. Publisher marks event as published

**Result**: Guaranteed eventual event publishing with atomicity.

**See also**: [Escrow System Architecture - Outbox Pattern](../architecture/escrow/escrow-system-architecture.md#outbox-pattern)

**External References**:

- [Transactional Outbox Pattern](https://microservices.io/patterns/data/transactional-outbox.html) - Detailed explanation of the pattern

## Architecture Components

### High-Level Architecture

```
┌──────────────┐      ┌──────────────┐
│   Discord    │      │   Web App    │
│   Client     │      │  (React)     │
└──────┬───────┘      └──────┬───────┘
       │                     │
       │ REST + JSON         │
       ▼                     ▼
┌─────────────────────────────────┐
│         API Gateway              │
│    (Request Validation, Auth)    │
└──────────────┬──────────────────┘
               │ Kafka Commands
               ▼
┌─────────────────────────────────┐
│      Event Bus (Kafka)           │
│   Commands & Events (Protobuf)   │
└──────┬──────────────┬────────────┘
       │              │
       ▼              ▼
┌──────────────┐  ┌──────────────┐
│   Escrow     │  │   Payments    │
│   Service    │  │   Service     │
└──────┬───────┘  └──────┬────────┘
       │                 │
       ▼                 ▼
┌─────────────────────────────────┐
│      PostgreSQL Database         │
│  Escrow State │ Payment Artifacts│
└─────────────────────────────────┘
```

**See also**: [Escrow System Architecture - High-Level Architecture](../architecture/escrow/escrow-system-architecture.md#high-level-architecture)

### Service Boundaries

#### API Gateway

- **Purpose**: Request validation, authentication, command emission
- **Responsibilities**: Validate REST requests, authenticate users (JWT), authorize actions, emit Kafka commands, query read models
- **Technology**: Express.js, Better Auth, Kafka producer

#### Escrow Service

- **Purpose**: Escrow state machine owner and business logic coordinator
- **Responsibilities**: Maintain escrow state machine, process escrow commands, emit escrow domain events, enforce state transition guards
- **Technology**: Node.js/TypeScript, PostgreSQL, Kafka consumer/producer
- **Owns**: Escrow state transitions, business rules

#### Payments Service

- **Purpose**: Payment provider integration and payment orchestration
- **Responsibilities**: Process payment commands, integrate with Stripe/Custodian, verify webhooks, screen wallets (USDC), emit payment events
- **Technology**: Node.js/TypeScript, PostgreSQL, Stripe SDK, Custodian API
- **Owns**: Payment provider state

#### Notifications Service

- **Purpose**: User notifications via Discord
- **Responsibilities**: Subscribe to escrow/payment events, send Discord DMs, handle notification failures

#### Projections Service

- **Purpose**: Build and maintain read-optimized views
- **Responsibilities**: Subscribe to events, build denormalized read models, serve queries

**See also**: [Escrow System Architecture - Service Boundaries](../architecture/escrow/escrow-system-architecture.md#service-boundaries)

## Escrow Lifecycle (Happy Path)

### Complete Flow

```
1. Contract Executed
   ↓
2. CreateEscrow command → EscrowCreated event
   ↓
3. CreatePaymentIntent command → PaymentIntentCreated event
   ↓
4. Buyer completes payment (Stripe UI or USDC transfer)
   ↓
5. Payment webhook received → PaymentSucceeded event
   ↓
6. EscrowFundsHeld event → Notify seller to deliver
   ↓
7. Seller marks delivered → MarkDelivered command → EscrowDelivered event
   ↓
8. Buyer releases funds → ReleaseFunds command → TransferToSeller command
   ↓
9. Transfer succeeds → TransferSucceeded event → EscrowReleased event
   ↓
10. Transaction complete, notifications sent
```

### Detailed Step-by-Step

#### Step 1: Contract Execution

- Both parties sign contract
- Contract status → `EXECUTED`
- `ContractExecuted` event emitted

#### Step 2: Escrow Creation

- API Gateway consumes `ContractExecuted`
- Emits `CreateEscrow` command
- Escrow Service creates escrow with status `AWAIT_FUNDS`
- Emits `EscrowCreated` and `EscrowAwaitFunds` events

#### Step 3: Payment Intent Creation

- Escrow Service emits `CreatePaymentIntent` command
- Payments Service creates:
  - **Stripe**: PaymentIntent with `client_secret`
  - **USDC**: Deposit address from Custodian
- Emits `PaymentIntentCreated` event

#### Step 4: Payment Completion

- **Stripe**: Buyer completes payment via Stripe Elements
- **USDC**: Buyer sends USDC to deposit address
- Payment provider processes payment

#### Step 5: Payment Webhook

- Provider sends webhook (e.g., `payment_intent.succeeded`)
- Payments Service verifies webhook signature
- Checks idempotency (prevent duplicate processing)
- For USDC: Screens wallet via TRM Labs + Chainalysis
- Emits `PaymentSucceeded` event

#### Step 6: Funds Held

- Escrow Service consumes `PaymentSucceeded`
- Validates guard (status must be `AWAIT_FUNDS`)
- Updates state to `FUNDS_HELD`
- Emits `EscrowFundsHeld` event
- Notifications Service sends DMs to buyer and seller

#### Step 7: Delivery

- Seller submits `MarkDelivered` command
- Escrow Service validates:
  - Actor is seller
  - Status is `FUNDS_HELD`
- Updates state to `DELIVERED`
- Emits `EscrowDelivered` event
- Buyer notified to confirm or dispute

#### Step 8: Release

- Buyer submits `ReleaseFunds` command
- Escrow Service validates:
  - Actor is buyer
  - Status is `DELIVERED`
- Emits `TransferToSeller` command
- Payments Service creates transfer:
  - **Stripe**: Transfer to seller's connected account
  - **USDC**: Transfer from custodian to seller wallet
- Provider confirms transfer
- Emits `TransferSucceeded` event

#### Step 9: Released

- Escrow Service consumes `TransferSucceeded`
- Updates state to `RELEASED` (terminal)
- Emits `EscrowReleased` event
- Notifications sent to both parties

**See also**: [Sequence Flows](../architecture/escrow/sequence-flows.md)

## Key Technical Patterns

### Event-Driven Communication

**Protocol**: Kafka + Protobuf

**Rationale**:

- Small payload size (critical for high-throughput)
- Strong schema evolution via Schema Registry
- Type safety across services
- Backward compatibility guarantees
- Partitioning enables ordering guarantees

**Message Flow**:

```
Producer → Kafka Topic → Consumer Group → Multiple Consumers
```

**See also**: [Escrow System Architecture - Communication Patterns](../architecture/escrow/escrow-system-architecture.md#communication-patterns)

**External References**:

- [Protocol Buffers](https://protobuf.dev/getting-started/) - Efficient serialization format
- [Confluent Schema Registry](https://docs.confluent.io/platform/current/schema-registry/index.html) - Schema management and evolution
- [Schema Compatibility Modes](https://docs.confluent.io/platform/current/schema-registry/avro.html#compatibility-types) - BACKWARD compatibility for schema evolution

### Idempotency Strategy

**Problem**: Duplicate events or retries could cause incorrect state transitions

**Solution**: All operations are idempotent via event ID deduplication

**Implementation**:

- Generate deterministic `event_id` from business state
- Store event IDs in `EscrowEvent` table with unique constraint
- Check event ID before processing state transition
- Skip processing if event already handled

**Event ID Generation**:

```typescript
event_id = sha256(escrow_id + event_type + business_state_hash + occurred_at);
```

**See also**: [State Machine - Idempotency Strategy](../architecture/escrow/state-machine.md#idempotency-strategy)

**External References**:

- [Idempotency in Distributed Systems](https://stripe.com/docs/api/idempotent_requests) - Stripe's guide to idempotent requests (applies to event processing)

### State Machine Guards

Every state transition validates:

1. **Escrow Exists**: Escrow record must exist
2. **Actor Authorization**: User must be authorized for action
   - `MarkDelivered`: Must be seller
   - `ReleaseFunds`: Must be buyer
   - `RaiseDispute`: Must be buyer or seller
3. **Idempotency**: Event ID must not have been processed
4. **State Precondition**: Current state must allow transition

**Example Guard**:

```typescript
From: FUNDS_HELD → To: DELIVERED
Guard: actor_id === escrow.seller_id && status === 'FUNDS_HELD'
```

**See also**: [State Machine - State Transition Guards](../architecture/escrow/state-machine.md#state-transition-guards)

### Error Handling & Retries

**Transient Errors**: Retry with exponential backoff

- Network timeouts, connection errors
- Rate limiting (with backoff)
- Temporary service unavailability

**Permanent Errors**: Reject immediately, send to DLQ

- Invalid data, authorization failures
- Business rule violations
- Malformed messages

**Retry Configuration**:

- Initial Delay: 100ms
- Max Delay: 30 seconds
- Backoff Multiplier: 2
- Max Retries: 5

**Dead Letter Queue (DLQ)**:

- Poison messages sent to `{topic}.dlq`
- Retention: 30 days
- Alert operations team

**See also**: [Error Handling & Retries](../architecture/escrow/error-handling-retries.md)

**External References**:

- [Dead Letter Queue Pattern](https://www.enterpriseintegrationpatterns.com/DeadLetterChannel.html) - Enterprise Integration Patterns: Dead Letter Channel
- [Exponential Backoff Retry](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/) - AWS Architecture Blog on exponential backoff

## Payment Rails

### Stripe Rail (≤$10k)

**Flow**:

1. Create PaymentIntent via Stripe API
2. Return `client_secret` to buyer
3. Buyer completes payment via Stripe Elements (PCI scope: Stripe)
4. Stripe sends webhook: `payment_intent.succeeded`
5. Payments Service verifies webhook signature
6. Emits `PaymentSucceeded` event
7. Escrow transitions to `FUNDS_HELD`

**Transfer to Seller**:

1. Escrow Service emits `TransferToSeller` command
2. Payments Service creates Transfer to seller's connected account
3. Stripe confirms transfer via webhook
4. Emits `TransferSucceeded` event
5. Escrow transitions to `RELEASED`

**See also**: [Payment System - Stripe Rail](../architecture/payment-system.md)

**External References**:

- [Stripe Payment Intents API](https://stripe.com/docs/api/payment_intents/create) - Creating Payment Intents
- [Stripe Webhook Signature Verification](https://stripe.com/docs/webhooks/signatures) - Verifying webhook signatures
- [Stripe Connect Transfers](https://stripe.com/docs/connect/transfers) - Transferring funds to connected accounts
- [Stripe Elements PCI Scope Reduction](https://stripe.com/docs/security/guide#minimizing-your-pci-scope) - PCI scope minimization with Elements

### USDC Rail (>$10k)

**Flow**:

1. Generate deposit address from Custodian API
2. Return deposit address + QR code to buyer
3. Buyer sends USDC to deposit address
4. Custodian detects deposit, sends webhook
5. Payments Service screens wallet:
   - TRM Labs: Risk scoring
   - Chainalysis: Sanctions check
6. If high risk/sanctioned: Automatic refund
7. If low risk: Emit `PaymentSucceeded` event
8. Escrow transitions to `FUNDS_HELD`

**Transfer to Seller**:

1. Escrow Service emits `TransferToSeller` command
2. Payments Service calls Custodian API to transfer USDC
3. Custodian executes blockchain transaction
4. Custodian sends webhook confirming transfer
5. Emits `TransferSucceeded` event
6. Escrow transitions to `RELEASED`

**See also**: [Payment System - USDC Rail](../architecture/payment-system.md)

### Routing Logic

```typescript
function determineRail(amount: number): 'STRIPE' | 'USDC_BASE' {
  return amount <= 10000 ? 'STRIPE' : 'USDC_BASE';
}
```

**Threshold**: $10,000 USD

**Why Two Rails?**

- Stripe: Familiar UX, built-in fraud protection, dispute handling
- USDC: Much lower fees (~$0.01-0.10 vs 2.9%), fast settlement, no chargebacks

**See also**: [Payment System](../architecture/payment-system.md)

## Security & Compliance

### PCI Compliance

**Strategy**: Minimize PCI scope by not storing card data

**Implementation**:

- **No PAN Storage**: Payment card numbers never stored
- **Stripe Elements**: Card input handled by Stripe (PCI scope on Stripe)
- **Tokenization**: Store only Stripe payment intent IDs
- **No Card Data in Logs**: Never log card numbers or CVV

**Result**: System is out of PCI scope for card data handling

**See also**: [Security & Compliance - PCI Compliance](../architecture/escrow/security-compliance.md#pci-compliance)

**External References**:

- [PCI DSS Scope Reduction](https://stripe.com/docs/security/guide#minimizing-your-pci-scope) - Minimizing PCI scope with Stripe Elements
- [PCI DSS Standards](https://www.pcisecuritystandards.org/document_library/) - Official PCI DSS documentation

### KYC/AML Compliance

**KYC Tiers**:

- `TIER_0`: Browse only (no transactions)
- `TIER_1`: Create listings, make offers (Roblox account linked)
- `TIER_2`: Verified seller status (enhanced verification)

**KYC Gates**:

- Escrow creation requires TIER_1+ for buyer and seller
- Verified via Roblox account linking

**AML Screening** (USDC payments):

- Wallet screening via TRM Labs (risk scoring)
- Sanctions screening via Chainalysis
- Automatic refund for sanctioned/high-risk wallets

**Risk Thresholds**:

- SANCTIONED: Automatic refund
- HIGH RISK (>80): Automatic refund
- MEDIUM RISK (50-80): Manual review
- LOW RISK (<50): Accept funds

**See also**: [Security & Compliance - KYC/AML Compliance](../architecture/escrow/security-compliance.md#kycaml-compliance)

**External References**:

- [TRM Labs](https://www.trmlabs.com/products/transaction-monitoring) - Cryptocurrency risk management and wallet screening
- [Chainalysis KYT](https://www.chainalysis.com/kyt/) - Know Your Transaction (KYT) and sanctions screening

### Webhook Security

**Stripe Webhooks**:

- Signature verification using `stripe-signature` header
- Webhook secret stored in AWS Secrets Manager

**Custodian Webhooks**:

- HMAC-SHA256 signature verification
- Webhook secret stored in AWS Secrets Manager

**Idempotency**:

- All webhooks checked against `WebhookEvent` table
- Duplicate webhooks ignored (prevent double processing)

**See also**: [Security & Compliance - Webhook Security](../architecture/escrow/security-compliance.md#webhook-security)

### Audit Logging

**All Actions Logged**:

- Escrow state transitions
- Payment operations
- Webhook processing
- Dispute resolution
- Admin actions

**Retention**: 7 years (financial record retention)

**Storage**: `AuditLog` table (immutable, never updated/deleted)

**See also**: [Security & Compliance - Audit Logging](../architecture/escrow/security-compliance.md#audit-logging)

## Observability

### Distributed Tracing

**Trace Context Propagation**:

- All HTTP requests and Kafka messages include tracing headers
- Standard fields: `trace_id`, `span_id`, `parent_span_id`, `correlation_id`

**Trace Structure**:

```
Request (API Gateway)
  ├─ Command Publish (Kafka Producer)
  │   └─ Command Processing (Escrow Service)
  │       ├─ Database Write
  │       ├─ Event Publish (Kafka Producer)
  │       └─ Payment Command (Payments Service)
```

**Sampling**: 100% in production (all traces)

**See also**: [Observability - Distributed Tracing](../architecture/escrow/observability.md#distributed-tracing)

### Key Metrics

**Business Metrics**:

- `escrow.created` - Escrows created
- `escrow.funds_held` - Escrows with funds held
- `escrow.delivered` - Escrows marked delivered
- `escrow.released` - Escrows released
- `escrow.value.total` - Total escrow value (USD)

**System Metrics**:

- `kafka.consumer.lag` - Consumer lag (messages)
- `service.request.duration` - Request duration (ms)
- `service.error.rate` - Errors per second
- `db.query.duration` - Query duration (ms)

**See also**: [Observability - Metrics](../architecture/escrow/observability.md#metrics)

### Alert Definitions

**Critical Alerts**:

- DLQ Message Count > 100 → Pager alert
- Error Rate > 5% → Pager alert
- Consumer Lag > 5000 → Pager alert
- Reconciliation Discrepancy → Pager alert

**Warning Alerts**:

- DLQ Message Count > 0 → Investigate
- Error Rate > 1% → Investigate
- Consumer Lag > 1000 → Monitor

**See also**: [Observability - Alert Definitions](../architecture/escrow/observability.md#alert-definitions)

### Reconciliation

**Purpose**: Ensure consistency between escrow state (database), payment provider state (Stripe/Custodian), and Kafka event stream

**Daily Reconciliation**:

- Runs daily at 2 AM UTC
- Queries escrows in `FUNDS_HELD` or `DELIVERED` state
- Compares with payment provider state
- Detects discrepancies
- Emits reconciliation events for discrepancies

**Hourly Reconciliation**:

- Runs every hour
- Queries escrows in `AWAIT_FUNDS` > 24 hours
- Verifies payment intent status with provider
- Catches missed webhooks

**See also**: [Observability - Reconciliation](../architecture/escrow/observability.md#reconciliation)

## Common Scenarios

### Creating an Escrow

**Trigger**: Contract executed (both parties signed)

**Flow**:

1. API Gateway consumes `ContractExecuted` event
2. Emits `CreateEscrow` command
3. Escrow Service creates escrow with status `AWAIT_FUNDS`
4. Emits `EscrowCreated` and `EscrowAwaitFunds` events
5. Emits `CreatePaymentIntent` command
6. Payments Service creates payment intent or deposit address
7. Emits `PaymentIntentCreated` event

**API Endpoint**: `GET /api/contracts/:id/escrow?userId=<userId>`

- Returns escrow data + payment initialization data
- Idempotent (safe to call multiple times)

**See also**: [Sequence Flows - Contract Executed → Escrow Creation](../architecture/escrow/sequence-flows.md#contract-executed--escrow-creation-flow)

### Processing Payment

**Stripe Flow**:

1. Buyer fetches `client_secret` from API
2. Buyer completes payment via Stripe Elements
3. Stripe sends webhook: `payment_intent.succeeded`
4. Payments Service verifies signature + idempotency
5. Emits `PaymentSucceeded` event
6. Escrow transitions to `FUNDS_HELD`

**USDC Flow**:

1. Buyer fetches deposit address from API
2. Buyer sends USDC to deposit address
3. Custodian detects deposit, sends webhook
4. Payments Service screens wallet (TRM + Chainalysis)
5. If low risk: Emits `PaymentSucceeded` event
6. Escrow transitions to `FUNDS_HELD`

**See also**: [Sequence Flows - Stripe Payment Flow](../architecture/escrow/sequence-flows.md#stripe-payment-flow)

### Marking as Delivered

**Trigger**: Seller submits delivery confirmation

**Flow**:

1. Seller calls `POST /api/escrow/:id/mark-delivered`
2. API Gateway validates authorization (seller only)
3. Emits `MarkDelivered` command
4. Escrow Service validates:
   - Actor is seller
   - Status is `FUNDS_HELD`
   - Idempotency check
5. Updates state to `DELIVERED`
6. Emits `EscrowDelivered` event
7. Buyer notified to confirm or dispute

**See also**: [Sequence Flows - Delivery Flow](../architecture/escrow/sequence-flows.md#delivery-flow)

### Releasing Funds

**Trigger**: Buyer confirms delivery and releases funds

**Flow**:

1. Buyer calls `POST /api/escrow/:id/release`
2. API Gateway validates authorization (buyer only)
3. Emits `ReleaseFunds` command
4. Escrow Service validates:
   - Actor is buyer
   - Status is `DELIVERED`
5. Emits `TransferToSeller` command
6. Payments Service creates transfer:
   - Stripe: Transfer to seller's connected account
   - USDC: Transfer from custodian to seller wallet
7. Provider confirms transfer
8. Emits `TransferSucceeded` event
9. Escrow transitions to `RELEASED` (terminal)
10. Notifications sent to both parties

**See also**: [Sequence Flows - Release Flow](../architecture/escrow/sequence-flows.md#release-flow-stripe)

### Handling Disputes

**Trigger**: Buyer or seller raises dispute

**Flow**:

1. Buyer/Seller calls `POST /api/escrow/:id/dispute`
2. API Gateway validates authorization
3. Emits `RaiseDispute` command
4. Escrow Service validates:
   - Status is `FUNDS_HELD` or `DELIVERED`
   - Actor is buyer or seller
5. Updates state to `DISPUTED`
6. Emits `EscrowDisputed` event
7. Admin notified

**Resolution**:

- Admin resolves dispute via `POST /api/disputes/:id/resolve`
- If favor seller: Triggers release flow
- If favor buyer: Triggers refund flow

**See also**: [Sequence Flows - Dispute Flow](../architecture/escrow/sequence-flows.md#dispute-flow)

### Error Scenarios

**Payment Failure**:

- Webhook: `payment_intent.payment_failed`
- Escrow status remains `AWAIT_FUNDS`
- Retry count incremented
- If max retries exceeded: Escrow cancelled

**Transfer Failure**:

- Webhook: `transfer.failed`
- Escrow state rolled back to `DELIVERED`
- Retry count incremented
- If max retries exceeded: Alert admin

**Lost Webhook**:

- Hourly reconciliation detects escrow in `AWAIT_FUNDS` > 24h
- Queries payment provider for status
- If payment succeeded: Emits `PaymentSucceeded` event manually

**See also**: [Sequence Flows - Error Handling Flow](../architecture/escrow/sequence-flows.md#error-handling-flow)

## Deep Dive Links

### Internal Documentation

#### Essential Reading (Start Here)

1. [Escrow System Architecture](../architecture/escrow/escrow-system-architecture.md) - Complete architecture overview
2. [State Machine](../architecture/escrow/state-machine.md) - State transitions and guards
3. [Sequence Flows](../architecture/escrow/sequence-flows.md) - Detailed flow diagrams

#### Detailed Specifications

4. [Topic Catalog](../architecture/escrow/topic-catalog.md) - Kafka topics and partitioning
5. [Event Schemas](../architecture/escrow/event-schemas.md) - Protobuf schema definitions
6. [Error Handling & Retries](../architecture/escrow/error-handling-retries.md) - Retry and DLQ strategies
7. [Observability](../architecture/escrow/observability.md) - Metrics, tracing, logging
8. [Security & Compliance](../architecture/escrow/security-compliance.md) - Security requirements

#### Supporting Documentation

9. [Payment System](../architecture/payment-system.md) - Multi-rail payment implementation
10. [Database Schema](../architecture/database-schema.md) - Data models and relationships
11. [Business Flow](../architecture/business-flow.md) - End-to-end transaction flows
12. [System Overview](../architecture/system-overview.md) - High-level system architecture

### External Resources

#### Event-Driven Architecture & Kafka

- **Event-Driven Architecture**: https://martinfowler.com/articles/201701-event-driven.html - Martin Fowler's comprehensive article on event-driven patterns
- **Kafka Partitioning**: https://kafka.apache.org/documentation/#intro_topics - How partitioning enables ordering guarantees
- **Kafka Consumer Groups**: https://kafka.apache.org/documentation/#consumerconfigs_group.id - Consumer groups for parallel processing
- **Kafka Log Compaction**: https://kafka.apache.org/documentation/#compaction - Compaction for event topics (key-based deduplication)
- **Kafka Producer Acks**: https://kafka.apache.org/documentation/#producerconfigs_acks - Producer acknowledgment modes (acks=all for durability)
- **Transactional Outbox Pattern**: https://microservices.io/patterns/data/transactional-outbox.html - Detailed explanation of the pattern
- **Confluent Schema Registry**: https://docs.confluent.io/platform/current/schema-registry/index.html - Schema management and evolution
- **Schema Compatibility Modes**: https://docs.confluent.io/platform/current/schema-registry/avro.html#compatibility-types - BACKWARD compatibility for schema evolution
- **Protocol Buffers**: https://protobuf.dev/getting-started/ - Efficient serialization format

#### Payment Systems

- **Stripe Payment Intents API**: https://stripe.com/docs/api/payment_intents/create - Creating Payment Intents
- **Stripe Webhook Signature Verification**: https://stripe.com/docs/webhooks/signatures - Verifying webhook signatures
- **Stripe Idempotency Keys**: https://stripe.com/docs/api/idempotent_requests - Making idempotent requests
- **Stripe Connect Transfers**: https://stripe.com/docs/connect/transfers - Transferring funds to connected accounts
- **Stripe Elements PCI Scope**: https://stripe.com/docs/security/guide#minimizing-your-pci-scope - PCI scope minimization with Elements
- **Base Network Documentation**: https://docs.base.org/ - Base network Layer 2 documentation
- **USDC Stablecoin**: Understanding stablecoins and custodial wallet concepts

#### Security & Compliance

- **PCI DSS Scope Reduction**: https://stripe.com/docs/security/guide#minimizing-your-pci-scope - Minimizing PCI scope with Stripe Elements
- **PCI DSS Standards**: https://www.pcisecuritystandards.org/document_library/ - Official PCI DSS documentation
- **TRM Labs Transaction Monitoring**: https://www.trmlabs.com/products/transaction-monitoring - Cryptocurrency risk management and wallet screening
- **Chainalysis KYT**: https://www.chainalysis.com/kyt/ - Know Your Transaction (KYT) and sanctions screening

#### Architecture Patterns

- **Idempotency in Distributed Systems**: https://stripe.com/docs/api/idempotent_requests - Idempotent request patterns (applies to event processing)
- **Dead Letter Queue Pattern**: https://www.enterpriseintegrationpatterns.com/DeadLetterChannel.html - Enterprise Integration Patterns: Dead Letter Channel
- **Exponential Backoff Retry**: https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/ - AWS Architecture Blog on exponential backoff
- **State Machine Pattern**: https://refactoring.guru/design-patterns/state - State design pattern in software engineering
- **Saga Pattern**: https://microservices.io/patterns/data/saga.html - Saga pattern for distributed transactions
- **CQRS Pattern**: https://martinfowler.com/bliki/CQRS.html - Command Query Responsibility Segregation pattern

### Recommended Reading Order

**Week 1: Foundation**

- Day 1-2: Internal docs #1-3 (Architecture, State Machine, Sequence Flows)
- Day 3-4: Kafka intro + event-driven architecture articles
- Day 5: Internal docs #4-5 (Topic Catalog, Event Schemas)

**Week 2: Deep Dive**

- Day 1-2: Internal docs #6-7 (Error Handling, Observability)
- Day 3: Stripe Connect docs
- Day 4-5: Internal docs #8-9 (Security, Payment System)

**Week 3: Operations & Integration**

- Day 1-2: Internal docs #10-11 (Database Schema, Business Flow)
- Day 3: PCI DSS basics
- Day 4-5: Review sequence flows and error handling

## Quick Reference

### State Machine Transitions

| From State  | To State    | Trigger           | Guard                          |
| ----------- | ----------- | ----------------- | ------------------------------ |
| -           | AWAIT_FUNDS | ContractExecuted  | None (initial state)           |
| AWAIT_FUNDS | FUNDS_HELD  | PaymentSucceeded  | Payment confirmed by provider  |
| FUNDS_HELD  | DELIVERED   | MarkDelivered     | Actor is seller                |
| DELIVERED   | RELEASED    | TransferSucceeded | Actor is buyer OR auto-release |
| FUNDS_HELD  | REFUNDED    | RefundSucceeded   | Refund reason valid            |
| FUNDS_HELD  | DISPUTED    | RaiseDispute      | Actor is buyer or seller       |
| DELIVERED   | DISPUTED    | RaiseDispute      | Actor is buyer                 |
| DISPUTED    | RELEASED    | ResolveDispute    | Resolution favors seller       |
| DISPUTED    | REFUNDED    | ResolveDispute    | Resolution favors buyer        |
| AWAIT_FUNDS | CANCELLED   | CancelEscrow      | Timeout or manual cancellation |

**See also**: [State Machine](../architecture/escrow/state-machine.md)

### Kafka Topics Quick Reference

| Topic                  | Type    | Key                   | Retention | Consumers                          |
| ---------------------- | ------- | --------------------- | --------- | ---------------------------------- |
| `escrow.commands.v1`   | Command | `escrow_id`           | 7 days    | Escrow Service                     |
| `escrow.events.v1`     | Event   | `escrow_id`           | 90 days   | Projections, Notifications         |
| `payments.commands.v1` | Command | `escrow_id`           | 7 days    | Payments Service                   |
| `payments.events.v1`   | Event   | `escrow_id`           | 90 days   | Escrow, Projections, Notifications |
| `webhook.events.v1`    | Event   | `provider_payment_id` | 90 days   | Payments Service                   |

**See also**: [Topic Catalog](../architecture/escrow/topic-catalog.md)

### API Endpoints Overview

| Endpoint                              | Method | Purpose                   | Auth Required |
| ------------------------------------- | ------ | ------------------------- | ------------- |
| `GET /api/contracts/:id/escrow`       | GET    | Get escrow + payment init | Buyer/Seller  |
| `POST /api/escrow/:id/mark-delivered` | POST   | Mark assets as delivered  | Seller only   |
| `POST /api/escrow/:id/release`        | POST   | Release funds to seller   | Buyer only    |
| `POST /api/escrow/:id/dispute`        | POST   | Raise dispute             | Buyer/Seller  |
| `POST /api/disputes/:id/resolve`      | POST   | Resolve dispute           | Admin only    |

**See also**: [API Reference](../api/README.md)

### Database Schema Highlights

**Escrow Table**:

- `id`: Unique identifier
- `rail`: `STRIPE` or `USDC_BASE`
- `amount`: Amount in cents (BigInt)
- `status`: Escrow state (AWAIT_FUNDS, FUNDS_HELD, etc.)
- `version`: Optimistic locking version

**StripeEscrow Table**:

- `paymentIntentId`: Stripe payment intent ID
- `transferId`: Stripe transfer ID (after release)
- `refundId`: Stripe refund ID (if refunded)

**StablecoinEscrow Table**:

- `depositAddr`: Deposit address for USDC
- `depositTx`: Transaction hash of deposit
- `releaseTx`: Transaction hash of release

**See also**: [Database Schema](../architecture/database-schema.md)

### Key Metrics to Monitor

**Business Metrics**:

- `escrow.created` - Escrows created
- `escrow.funds_held` - Escrows with funds held
- `escrow.released` - Escrows released
- `escrow.value.total` - Total escrow value (USD)

**System Metrics**:

- `kafka.consumer.lag` - Consumer lag (messages)
- `service.error.rate` - Errors per second
- `dlq.message.count` - DLQ message count

**See also**: [Observability - Metrics](../architecture/escrow/observability.md#metrics)

---

## Next Steps

1. **Set up local development**: See [Getting Started](getting-started.md)
2. **Explore the codebase**: Start with the Escrow Service
3. **Review detailed docs**: Follow the [Deep Dive Links](#deep-dive-links) reading order
4. **Understand the flows**: Study [Sequence Flows](../architecture/escrow/sequence-flows.md)
5. **Monitor production**: Check dashboards and alerts

For questions or clarifications, refer to the detailed architecture documentation or reach out to the team.
