# Kafka Microservice Development Guide

## Overview

This guide covers development practices for Kafka-based microservices in the Bloxtr8 escrow system, specifically focusing on services like Escrow Service and Payments Service. It includes architecture patterns, development setup, utilities, common pitfalls, testing strategies, and best practices.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Development Setup](#development-setup)
3. [Service Structure](#service-structure)
4. [Shared Utilities](#shared-utilities)
5. [Core Patterns](#core-patterns)
6. [Simple Microservice Example](#simple-microservice-example)
7. [Common Pitfalls & Things to Watch Out For](#common-pitfalls--things-to-watch-out-for)
8. [Testing Strategies](#testing-strategies)
9. [Debugging & Troubleshooting](#debugging--troubleshooting)
10. [Best Practices](#best-practices)

## Architecture Overview

### Event-Driven Architecture

The system uses Apache Kafka as the event bus with:

- **Commands**: Direct Kafka publishing for service-to-service communication
- **Events**: Transactional outbox pattern for reliable event publishing
- **Protobuf**: Schema-based serialization for type safety and evolution
- **Partitioning**: Key-based partitioning (escrowId) for ordering guarantees

### Service Boundaries

- **Escrow Service**: Owns escrow state machine and business logic
- **Payments Service**: Handles payment provider integrations (Stripe, Custodian)
- **API Gateway**: Validates requests and emits commands
- **Projections Service**: Builds read models from events

### Communication Flow

```
API Gateway → Kafka (Commands) → Service Consumer → Business Logic →
PostgreSQL + Outbox → Outbox Publisher → Kafka (Events) → Other Services
```

## Development Setup

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- PostgreSQL 14+
- Kafka (via Docker Compose)

### Local Kafka Setup

```bash
# Start Kafka infrastructure
docker compose up -d kafka-1 kafka-2 kafka-3 schema-registry

# Create topics
./scripts/kafka/setup-topics.sh --env development

# Verify topics
kafka-topics --bootstrap-server localhost:9092 --list
```

### Environment Variables

Required environment variables:

- `KAFKA_BROKERS`: Comma-separated broker list (e.g., `localhost:9092`)
- `DATABASE_URL`: PostgreSQL connection string
- `KAFKA_SCHEMA_REGISTRY_URL`: Schema Registry URL (optional)

## Service Structure

### Project Layout

```
service-name/
├── src/
│   ├── handlers/          # Command/event handlers
│   ├── state-machine/     # State machine logic
│   ├── guards/           # Authorization & validation guards
│   ├── events/            # Event definitions
│   ├── commands/          # Command definitions
│   ├── kafka/             # Kafka consumer/producer setup
│   └── index.ts           # Service entry point
├── __tests__/             # Test files
└── package.json
```

## Shared Utilities

### Event Utilities (`@bloxtr8/shared`)

The `event-utils` module provides utilities for generating deterministic event IDs and checking idempotency.

#### `generateCommandEventId`

Generates a deterministic event ID for commands using SHA-256 hashing.

```typescript
import { generateCommandEventId } from '@bloxtr8/shared';

const eventId = generateCommandEventId(
  escrowId,
  'MarkDelivered',
  userId,
  new Date()
);
// Returns: 64-character hexadecimal SHA-256 hash
```

**Formula**: `sha256(length_bytes(escrow_id) || escrow_id_bytes || length_bytes(command_type) || command_type_bytes || length_bytes(actor_id) || actor_id_bytes || length_bytes(timestamp) || timestamp_bytes)`

**Use Case**: Generate unique, deterministic IDs for commands to enable idempotency checks.

#### `generateEventId`

Generates a deterministic event ID for domain events.

```typescript
import { generateEventId } from '@bloxtr8/shared';
import { createHash } from 'crypto';

// First, generate business state hash
const businessState = JSON.stringify({
  amount: 10000,
  currency: 'USD',
  status: 'FUNDS_HELD',
});
const businessStateHash = createHash('sha256')
  .update(businessState)
  .digest('hex');

// Then generate event ID
const eventId = generateEventId(
  escrowId,
  'EscrowFundsHeld',
  businessStateHash,
  new Date()
);
```

**Formula**: `sha256(length_bytes(escrow_id) || escrow_id_bytes || length_bytes(event_type) || event_type_bytes || length_bytes(business_state_hash) || business_state_hash_bytes || length_bytes(occurred_at) || occurred_at_bytes)`

**Use Case**: Generate unique, deterministic IDs for domain events stored in EscrowEvent table.

#### `checkWebhookEventIdempotency`

Checks if a webhook event has already been processed.

```typescript
import { checkWebhookEventIdempotency } from '@bloxtr8/shared';

const isDuplicate = await checkWebhookEventIdempotency(prisma, webhookEventId);
if (isDuplicate) {
  return res.json({ received: true, status: 'duplicate' });
}
```

**Use Case**: Prevent duplicate webhook processing (e.g., Stripe webhooks).

#### `checkEscrowEventIdempotency`

Checks if an escrow event has already been processed.

```typescript
import { checkEscrowEventIdempotency } from '@bloxtr8/shared';

const eventId = generateEventId(
  escrowId,
  eventType,
  businessStateHash,
  occurredAt
);
const isDuplicate = await checkEscrowEventIdempotency(
  prisma,
  eventId,
  escrowId
);
if (isDuplicate) {
  return; // Event already processed
}
```

**Important**: The eventId must be stored in the EscrowEvent payload as either `eventId` or `event_id` for this to work.

#### `createEscrowEventIdempotent`

Atomically creates an escrow event with idempotency protection (prevents race conditions).

```typescript
import { createEscrowEventIdempotent, generateEventId } from '@bloxtr8/shared';

const eventId = generateEventId(
  escrowId,
  eventType,
  businessStateHash,
  occurredAt
);

// Atomically create event with idempotency protection
const event = await createEscrowEventIdempotent(prisma, {
  escrowId,
  eventType: 'ESCROW_CREATED',
  payload: {
    eventId, // Must be included for idempotency
    amount: 10000,
    currency: 'USD',
  },
});
```

**Key Features**:

- Uses row-level locking (`SELECT FOR UPDATE`) to prevent race conditions
- Returns existing event if duplicate detected
- Works within transactions (can use transaction client)
- Automatically wraps in transaction if not already in one

### Environment Validation (`@bloxtr8/shared`)

#### `validateEnvironment`

Validates that required environment variables are set.

```typescript
import { validateEnvironment } from '@bloxtr8/shared';

// Validate default required vars (DATABASE_URL)
validateEnvironment();

// Validate custom required vars
validateEnvironment(['DATABASE_URL', 'KAFKA_BROKERS', 'STRIPE_SECRET_KEY']);
```

#### `getEnvVar`

Gets environment variable with type safety and optional default.

```typescript
import { getEnvVar } from '@bloxtr8/shared';

const kafkaBrokers = getEnvVar('KAFKA_BROKERS', 'localhost:9092');
const dbUrl = getEnvVar('DATABASE_URL'); // Throws if not set
```

#### Environment Helpers

```typescript
import {
  isDevelopment,
  isProduction,
  isTest,
  isDebugMode,
} from '@bloxtr8/shared';

if (isDevelopment()) {
  console.log('Running in development mode');
}

if (isDebugMode()) {
  // Debug-only code
}
```

### Domain Types (`@bloxtr8/shared`)

```typescript
import { EscrowState, ProviderId, Role } from '@bloxtr8/shared';

// Escrow states
const state: EscrowState = EscrowState.FUNDS_HELD;

// Provider IDs
const provider: ProviderId = ProviderId.STRIPE;

// User roles
const role: Role = Role.ADMIN;
```

### Kafka Client Configuration (`@bloxtr8/kafka-client`)

```typescript
import { createConfig } from '@bloxtr8/kafka-client';

// Create config from environment variables
const config = createConfig();

// Override specific settings
const customConfig = createConfig({
  clientId: 'my-service',
  logLevel: 'DEBUG',
  retry: {
    strategy: 'exponential',
    maxRetries: 3,
    initialRetryTimeMs: 200,
  },
});
```

## Core Patterns

### 1. Transactional Outbox Pattern

**Problem**: Database transaction commits but Kafka publish fails → inconsistent state

**Solution**: Write events to outbox table in same transaction, separate publisher process polls and publishes

```typescript
await prisma.$transaction(async tx => {
  // Update business state
  await tx.escrow.update({ where: { id }, data: { status: 'FUNDS_HELD' } });

  // Write event to outbox (same transaction)
  await tx.outbox.create({
    data: {
      aggregateId: escrowId,
      eventType: 'EscrowFundsHeld',
      payload: Buffer.from(protobufSerialize(event)),
    },
  });
});
// Outbox publisher will publish to Kafka asynchronously
```

**Key Points**:

- Events written to outbox in same DB transaction
- Outbox publisher runs as separate process
- Publisher polls for `publishedAt IS NULL` events
- Only marks as published after successful Kafka acknowledgment

### 2. Idempotency Pattern

**Problem**: Duplicate commands/events cause state corruption

**Solution**: Use event utilities to check idempotency before processing

```typescript
import {
  generateCommandEventId,
  checkWebhookEventIdempotency,
} from '@bloxtr8/shared';

async function handleCommand(command: CreateEscrowCommand) {
  // Generate deterministic event ID
  const eventId = generateCommandEventId(
    command.escrowId,
    command.commandType,
    command.actorId,
    command.timestamp
  );

  // Check if already processed
  const existing = await prisma.commandIdempotency.findUnique({
    where: { commandId: eventId },
  });

  if (existing && existing.status === 'completed') {
    return; // Already processed, skip
  }

  // Process command...
}
```

**Idempotency Keys**:

- Commands: Use `generateCommandEventId()` for deterministic IDs
- Webhooks: Use `checkWebhookEventIdempotency()` with provider event ID
- State transitions: Use `generateEventId()` and `checkEscrowEventIdempotency()`

### 3. State Machine Pattern

**Problem**: Invalid state transitions cause data corruption

**Solution**: Enforce state machine with guards

```typescript
class EscrowStateMachine {
  static isValidTransition(current: EscrowStatus, next: EscrowStatus): boolean {
    const validTransitions = {
      AWAIT_FUNDS: ['FUNDS_HELD', 'CANCELLED'],
      FUNDS_HELD: ['DELIVERED', 'REFUNDED', 'DISPUTED'],
      DELIVERED: ['RELEASED', 'DISPUTED'],
      // ...
    };
    return validTransitions[current]?.includes(next) ?? false;
  }

  static async transition(
    prisma: PrismaClient,
    escrowId: string,
    newStatus: EscrowStatus,
    version: number // Optimistic locking
  ) {
    // Validate transition
    const current = await prisma.escrow.findUnique({ where: { id: escrowId } });
    if (!this.isValidTransition(current.status, newStatus)) {
      throw new InvalidStateTransitionError();
    }

    // Update with optimistic locking
    await prisma.escrow.update({
      where: { id: escrowId, version }, // Fails if version changed
      data: { status: newStatus, version: { increment: 1 } },
    });
  }
}
```

**Key Points**:

- Use optimistic locking (`version` field)
- Validate transitions before updating
- Emit events for state changes
- Use database transactions for atomicity

### 4. Command vs Event Pattern

**Commands**: Instructions to perform action (published directly to Kafka)

- Example: `CreateEscrowCommand`, `ReleaseFundsCommand`
- Published directly: `kafkaProducer.send()`
- NOT stored in outbox

**Events**: Facts that occurred (published via outbox)

- Example: `EscrowCreated`, `EscrowReleased`
- Published via outbox pattern
- Stored in outbox table first

## Simple Microservice Example

Here's a complete example of a simple Kafka microservice using all the utilities and patterns:

```typescript
// src/index.ts - Service Entry Point
import { PrismaClient } from '@bloxtr8/database';
import {
  KafkaConsumer,
  KafkaProducer,
  createConfig,
} from '@bloxtr8/kafka-client';
import { createOutboxPublisher } from '@bloxtr8/outbox-publisher';
import {
  validateEnvironment,
  generateCommandEventId,
  generateEventId,
  checkEscrowEventIdempotency,
  createEscrowEventIdempotent,
  EscrowState,
} from '@bloxtr8/shared';
import { createHash } from 'crypto';

// Validate environment
validateEnvironment(['DATABASE_URL', 'KAFKA_BROKERS']);

const prisma = new PrismaClient();
const kafkaConfig = createConfig();

// Create Kafka consumer
const consumer = new KafkaConsumer(kafkaConfig, {
  groupId: 'example-service',
  topics: ['example.commands.v1'],
  dlqEnabled: true,
});

// Create Kafka producer (for commands)
const producer = new KafkaProducer(kafkaConfig);

// Create outbox publisher (for events)
const outboxPublisher = createOutboxPublisher(kafkaConfig, {
  pollIntervalMs: 1000,
  batchSize: 100,
  topicMapping: {
    ExampleCreated: 'example.events.v1',
    ExampleUpdated: 'example.events.v1',
  },
});

// Command handler
async function handleCreateExampleCommand(command: CreateExampleCommand) {
  // Generate deterministic event ID for idempotency
  const commandEventId = generateCommandEventId(
    command.exampleId,
    'CreateExample',
    command.userId,
    command.timestamp
  );

  // Check idempotency
  const existing = await prisma.commandIdempotency.findUnique({
    where: { commandId: commandEventId },
  });

  if (existing && existing.status === 'completed') {
    console.log(`Command ${commandEventId} already processed`);
    return;
  }

  // Process command in transaction
  await prisma.$transaction(async tx => {
    // Create example record
    const example = await tx.example.create({
      data: {
        id: command.exampleId,
        name: command.name,
        status: 'ACTIVE',
        version: 1,
      },
    });

    // Generate business state hash for event ID
    const businessState = JSON.stringify({
      name: example.name,
      status: example.status,
    });
    const businessStateHash = createHash('sha256')
      .update(businessState)
      .digest('hex');

    // Generate event ID
    const eventId = generateEventId(
      example.id,
      'ExampleCreated',
      businessStateHash,
      new Date()
    );

    // Create escrow event atomically with idempotency protection
    await createEscrowEventIdempotent(tx, {
      escrowId: example.id, // Using escrowId field for consistency
      eventType: 'EXAMPLE_CREATED',
      payload: {
        eventId,
        exampleId: example.id,
        name: example.name,
        status: example.status,
      },
    });

    // Write event to outbox for Kafka publishing
    await tx.outbox.create({
      data: {
        aggregateId: example.id,
        eventType: 'ExampleCreated',
        payload: Buffer.from(
          JSON.stringify({
            exampleId: example.id,
            name: example.name,
            status: example.status,
            timestamp: new Date().toISOString(),
          })
        ),
        version: 1,
      },
    });

    // Mark command as completed
    await tx.commandIdempotency.upsert({
      where: { commandId: commandEventId },
      create: {
        commandId: commandEventId,
        commandType: 'CreateExample',
        status: 'completed',
        completedAt: new Date(),
      },
      update: {
        status: 'completed',
        completedAt: new Date(),
      },
    });
  });
}

// Webhook handler example
async function handleWebhook(req: Request, res: Response) {
  const webhookEvent = req.body;

  // Check webhook idempotency
  const isDuplicate = await checkWebhookEventIdempotency(
    prisma,
    webhookEvent.id
  );

  if (isDuplicate) {
    return res.json({ received: true, status: 'duplicate' });
  }

  // Process webhook in transaction
  await prisma.$transaction(async tx => {
    // Mark webhook as processed
    await tx.webhookEvent.create({
      data: {
        eventId: webhookEvent.id,
        provider: 'example-provider',
        processed: true,
      },
    });

    // Process webhook logic...
  });

  res.json({ received: true });
}

// Consumer message handler
async function processMessage(message: KafkaMessage) {
  try {
    const command = JSON.parse(message.value.toString());

    switch (command.commandType) {
      case 'CreateExample':
        await handleCreateExampleCommand(command);
        break;
      default:
        console.warn(`Unknown command type: ${command.commandType}`);
    }
  } catch (error) {
    console.error('Error processing message:', error);
    throw error; // Will be sent to DLQ if retries exhausted
  }
}

// Start service
async function start() {
  console.log('Starting Example Service...');

  // Start Kafka consumer
  await consumer.run(processMessage);
  console.log('✅ Kafka consumer started');

  // Start outbox publisher
  await outboxPublisher.start();
  console.log('✅ Outbox publisher started');

  console.log('✅ Example Service ready');
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await consumer.stop();
  await outboxPublisher.stop();
  await producer.disconnect();
  await prisma.$disconnect();
  process.exit(0);
});

// Start the service
start().catch(error => {
  console.error('Failed to start service:', error);
  process.exit(1);
});
```

### Key Features Demonstrated

1. **Environment Validation**: Validates required environment variables on startup
2. **Kafka Configuration**: Uses `createConfig()` to load Kafka config from environment
3. **Idempotency**: Uses `generateCommandEventId()` and `checkEscrowEventIdempotency()` for idempotent processing
4. **Atomic Event Creation**: Uses `createEscrowEventIdempotent()` to prevent race conditions
5. **Outbox Pattern**: Writes events to outbox table in same transaction as business state
6. **Command vs Event**: Commands processed directly, events published via outbox
7. **Error Handling**: Errors propagate to DLQ after retries exhausted
8. **Graceful Shutdown**: Properly closes connections on SIGTERM

## Common Pitfalls & Things to Watch Out For

### 1. Race Conditions

**Problem**: Concurrent updates cause lost updates

**Solution**: Use optimistic locking

```typescript
// ❌ BAD: No locking
await prisma.escrow.update({
  where: { id: escrowId },
  data: { status: 'FUNDS_HELD' },
});

// ✅ GOOD: Optimistic locking
await prisma.escrow.update({
  where: { id: escrowId, version: currentVersion },
  data: { status: 'FUNDS_HELD', version: { increment: 1 } },
});
```

### 2. Missing Idempotency Checks

**Problem**: Duplicate webhooks/commands processed twice

**Solution**: Always use event utilities

```typescript
// ❌ BAD: No idempotency check
async function handleWebhook(event: StripeEvent) {
  await processPayment(event);
}

// ✅ GOOD: Use utility function
import { checkWebhookEventIdempotency } from '@bloxtr8/shared';

async function handleWebhook(event: StripeEvent) {
  const isDuplicate = await checkWebhookEventIdempotency(prisma, event.id);
  if (isDuplicate) return;

  await prisma.$transaction(async tx => {
    await tx.webhookEvent.create({ data: { eventId: event.id } });
    await processPayment(event);
  });
}
```

### 3. Forgetting Outbox Pattern

**Problem**: Direct Kafka publish fails after DB commit

**Solution**: Always use outbox pattern for events

```typescript
// ❌ BAD: Direct publish
await prisma.escrow.update({ where: { id }, data: { status: 'RELEASED' } });
await kafkaProducer.send({ topic: 'escrow.events', value: event }); // May fail!

// ✅ GOOD: Outbox pattern
await prisma.$transaction(async tx => {
  await tx.escrow.update({ where: { id }, data: { status: 'RELEASED' } });
  await tx.outbox.create({ data: { eventType: 'EscrowReleased', payload } });
});
```

### 4. Not Using Atomic Event Creation

**Problem**: Race condition when creating events concurrently

**Solution**: Use `createEscrowEventIdempotent()`

```typescript
// ❌ BAD: Separate check and create (race condition)
const isDuplicate = await checkEscrowEventIdempotency(
  prisma,
  eventId,
  escrowId
);
if (!isDuplicate) {
  await prisma.escrowEvent.create({ data: { escrowId, eventType, payload } });
}

// ✅ GOOD: Atomic check-and-create
import { createEscrowEventIdempotent } from '@bloxtr8/shared';

await createEscrowEventIdempotent(prisma, {
  escrowId,
  eventType: 'ESCROW_CREATED',
  payload: { eventId, ...otherFields },
});
```

### 5. Invalid State Transitions

**Problem**: State transitions bypass validation

**Solution**: Always validate transitions

```typescript
// ❌ BAD: No validation
await prisma.escrow.update({
  where: { id },
  data: { status: 'RELEASED' }, // Could be invalid!
});

// ✅ GOOD: Validate first
if (!EscrowStateMachine.isValidTransition(current.status, 'RELEASED')) {
  throw new InvalidStateTransitionError();
}
await EscrowStateMachine.transition(prisma, id, 'RELEASED');
```

### 6. Missing Authorization Checks

**Problem**: Users perform unauthorized actions

**Solution**: Check authorization before processing

```typescript
// ❌ BAD: No authorization
async function markDelivered(escrowId: string, userId: string) {
  await prisma.escrow.update({
    where: { id: escrowId },
    data: { status: 'DELIVERED' },
  });
}

// ✅ GOOD: Check authorization
async function markDelivered(escrowId: string, userId: string) {
  const escrow = await prisma.escrow.findUnique({
    where: { id: escrowId },
    include: { offer: true },
  });

  if (escrow.offer.sellerId !== userId) {
    throw new AuthorizationError('Only seller can mark delivered');
  }

  await EscrowStateMachine.transition(prisma, escrowId, 'DELIVERED');
}
```

### 7. Webhook Replay Attacks

**Problem**: Old webhooks replayed cause duplicate processing

**Solution**: Verify signatures and check idempotency

```typescript
// ✅ GOOD: Verify signature + idempotency
import { checkWebhookEventIdempotency } from '@bloxtr8/shared';

async function handleStripeWebhook(req: Request) {
  // 1. Verify signature
  const event = stripe.webhooks.constructEvent(req.body, sig, secret);

  // 2. Check idempotency using utility
  const isDuplicate = await checkWebhookEventIdempotency(prisma, event.id);
  if (isDuplicate) return res.json({ received: true, status: 'duplicate' });

  // 3. Process
  await processWebhook(event);
}
```

### 8. Missing Error Classification

**Problem**: All errors retried indefinitely

**Solution**: Classify errors (transient vs permanent)

```typescript
function isRetryableError(error: Error): boolean {
  // Transient: network errors, rate limits, timeouts
  if (error instanceof NetworkError) return true;
  if (error.statusCode === 429) return true; // Rate limit
  if (error.statusCode >= 500) return true; // Server error

  // Permanent: validation errors, authorization failures
  if (error.statusCode === 400) return false; // Bad request
  if (error.statusCode === 401) return false; // Unauthorized

  return false;
}
```

### 9. Consumer Lag Issues

**Problem**: Consumer falls behind, messages pile up

**Solution**: Monitor lag and scale consumers

```typescript
// Monitor consumer lag
const lag = await consumer.getLag();
if (lag > 1000) {
  // Scale consumers or investigate slow processing
  logger.warn('High consumer lag', { lag });
}
```

### 10. Partition Key Mismatches

**Problem**: Events for same escrow processed out of order

**Solution**: Always use escrowId as partition key

```typescript
// ✅ GOOD: Consistent partition key
await kafkaProducer.send({
  topic: 'escrow.events.v1',
  messages: [
    {
      key: escrowId, // Ensures ordering per escrow
      value: eventPayload,
    },
  ],
});
```

## Testing Strategies

### Unit Tests

Test business logic in isolation:

```typescript
describe('EscrowStateMachine', () => {
  it('should validate state transitions', () => {
    expect(
      EscrowStateMachine.isValidTransition('AWAIT_FUNDS', 'FUNDS_HELD')
    ).toBe(true);
    expect(
      EscrowStateMachine.isValidTransition('AWAIT_FUNDS', 'RELEASED')
    ).toBe(false);
  });
});

describe('Event ID Generation', () => {
  it('should generate deterministic IDs', () => {
    const id1 = generateCommandEventId(
      'esc_1',
      'Create',
      'user_1',
      new Date('2024-01-01')
    );
    const id2 = generateCommandEventId(
      'esc_1',
      'Create',
      'user_1',
      new Date('2024-01-01')
    );
    expect(id1).toBe(id2); // Same inputs = same ID
  });
});
```

### Integration Tests

Test with real database and Kafka:

```typescript
describe('Escrow Service Integration', () => {
  beforeEach(async () => {
    await setupTestDatabase();
    await setupTestKafka();
  });

  it('should process CreateEscrowCommand', async () => {
    const command = createTestCommand();
    await kafkaProducer.send({
      topic: 'escrow.commands.v1',
      messages: [{ value: command }],
    });

    await waitForEvent('EscrowCreated');

    const escrow = await prisma.escrow.findUnique({
      where: { id: command.escrowId },
    });
    expect(escrow.status).toBe('AWAIT_FUNDS');
  });
});
```

### Mocking Kafka

```typescript
jest.mock('@bloxtr8/kafka-client', () => ({
  KafkaProducer: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({}),
  })),
  KafkaConsumer: jest.fn().mockImplementation(() => ({
    run: jest.fn(),
  })),
}));
```

## Debugging & Troubleshooting

### Check Consumer Lag

```bash
kafka-consumer-groups --bootstrap-server localhost:9092 \
  --group escrow-service --describe
```

### Inspect Outbox

```sql
-- Check unpublished events
SELECT * FROM outbox WHERE published_at IS NULL ORDER BY created_at DESC LIMIT 10;

-- Check recent events
SELECT event_type, COUNT(*) FROM outbox
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY event_type;
```

### View Kafka Messages

```bash
# Consume messages from topic
kafka-console-consumer --bootstrap-server localhost:9092 \
  --topic escrow.events.v1 --from-beginning

# With Protobuf deserialization (if configured)
kafka-console-consumer --bootstrap-server localhost:9092 \
  --topic escrow.events.v1 --property print.key=true
```

### Check DLQ

```bash
# List DLQ topics
kafka-topics --bootstrap-server localhost:9092 --list | grep dlq

# Consume DLQ messages
kafka-console-consumer --bootstrap-server localhost:9092 \
  --topic escrow.events.v1.dlq --from-beginning
```

### Trace Flow

Use distributed tracing headers:

```typescript
// Producer: Include trace headers
await kafkaProducer.send({
  topic: 'escrow.commands.v1',
  messages: [
    {
      value: command,
      headers: {
        'X-Trace-Id': traceId,
        'X-Span-Id': spanId,
      },
    },
  ],
});

// Consumer: Extract and continue trace
const traceId = message.headers['X-Trace-Id'];
const spanId = message.headers['X-Span-Id'];
```

## Best Practices

### 1. Always Use Transactions

```typescript
// ✅ GOOD: Atomic operation
await prisma.$transaction(async tx => {
  await tx.escrow.update({ where: { id }, data: { status: 'FUNDS_HELD' } });
  await tx.auditLog.create({ data: { action: 'escrow.funds_held' } });
  await tx.outbox.create({ data: { eventType: 'EscrowFundsHeld', payload } });
});
```

### 2. Validate Early

```typescript
// ✅ GOOD: Validate before processing
function handleCommand(command: CreateEscrowCommand) {
  validateCommand(command); // Throw early if invalid
  checkAuthorization(command); // Check auth before DB access
  // Then process...
}
```

### 3. Use Type-Safe Schemas

```typescript
// ✅ GOOD: Protobuf schemas for type safety
import { EscrowCreated } from './generated/escrow_pb';

const event = new EscrowCreated();
event.setEscrowId(escrowId);
event.setAmount(amount.toString());
```

### 4. Monitor Everything

```typescript
// ✅ GOOD: Emit metrics
metrics.escrowCreated.inc({ rail: escrow.rail });
metrics.escrowStateTransition.observe({
  from: 'AWAIT_FUNDS',
  to: 'FUNDS_HELD',
});
```

### 5. Handle Errors Gracefully

```typescript
// ✅ GOOD: Classify and handle errors
try {
  await processCommand(command);
} catch (error) {
  if (isRetryableError(error)) {
    await retryWithBackoff(() => processCommand(command));
  } else {
    await sendToDLQ(command, error);
  }
}
```

### 6. Log Structured Data

```typescript
// ✅ GOOD: Structured logging
logger.info('Escrow state transition', {
  escrowId,
  fromState: 'AWAIT_FUNDS',
  toState: 'FUNDS_HELD',
  traceId,
  userId,
});
```

### 7. Test Idempotency

```typescript
// ✅ GOOD: Test idempotency
it('should handle duplicate commands', async () => {
  const command = createTestCommand();
  await handleCommand(command);
  await handleCommand(command); // Should be idempotent
  expect(await getEscrow(command.escrowId)).toBeDefined();
});
```

## Related Documentation

- [Escrow System Architecture](../architecture/escrow/escrow-system-architecture.md)
- [Error Handling & Retries](../architecture/escrow/error-handling-retries.md)
- [State Machine](../architecture/escrow/state-machine.md)
- [Observability](../architecture/escrow/observability.md)
- [Escrow Service Design](../design/escrow/escrow-service-design.md)
- [Payments Service Design](../design/escrow/payments-service-design.md)
