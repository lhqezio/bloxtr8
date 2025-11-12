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

### Distributed Tracing (`@bloxtr8/tracing`)

The `@bloxtr8/tracing` package provides utilities for distributed tracing across HTTP requests and Kafka messages.

#### HTTP Tracing Middleware

Use `tracingMiddleware()` to automatically extract/create trace context from HTTP requests:

```typescript
import { tracingMiddleware } from '@bloxtr8/tracing';
import express from 'express';

const app = express();

// Add tracing middleware (should be early in middleware chain)
app.use(tracingMiddleware());

// Access trace context in route handlers
import { getRequestTraceContext } from '@bloxtr8/tracing';

app.get('/api/example', (req, res) => {
  const traceContext = getRequestTraceContext();
  console.log('Trace ID:', traceContext?.traceId);
  console.log('Span ID:', traceContext?.spanId);
  // ...
});
```

**Features**:

- Automatically extracts trace context from incoming HTTP headers
- Creates new root context if none exists
- Propagates context via AsyncLocalStorage
- Adds trace headers to response

#### Kafka Tracing Utilities

**Inject trace context into Kafka messages**:

```typescript
import { injectTraceContext } from '@bloxtr8/tracing';

// Producer: Automatically injects current trace context
const message = {
  key: escrowId,
  value: commandPayload,
};

// Inject trace context (uses current context from AsyncLocalStorage)
const messageWithTrace = injectTraceContext(message);

await kafkaProducer.send({
  topic: 'escrow.commands.v1',
  messages: [messageWithTrace],
});
```

**Extract trace context from Kafka messages**:

```typescript
import {
  extractTraceContext,
  runWithTraceContextAsync,
} from '@bloxtr8/tracing';

// Consumer: Extract and set trace context
async function processMessage(message: KafkaMessage) {
  // Extract trace context from message headers
  const traceContext = extractTraceContext(message.headers);

  if (traceContext) {
    // Run handler with trace context
    await runWithTraceContextAsync(traceContext, async () => {
      await handleCommand(message);
    });
  } else {
    // No trace context, create new root context
    await handleCommand(message);
  }
}
```

#### Context Management

```typescript
import {
  createTraceContext,
  createChildContext,
  getTraceContext,
  runWithTraceContextAsync,
} from '@bloxtr8/tracing';

// Create root trace context
const rootContext = createTraceContext('correlation-123');

// Create child context (for nested operations)
const childContext = createChildContext(rootContext);

// Get current context (from AsyncLocalStorage)
const currentContext = getTraceContext();

// Run function with trace context
await runWithTraceContextAsync(rootContext, async () => {
  // All async operations here will have access to trace context
  const context = getTraceContext(); // Returns rootContext
  // ...
});
```

**Trace Context Structure**:

```typescript
interface TraceContext {
  traceId: string; // UUID v4 - same across entire request flow
  spanId: string; // UUID v4 - unique per operation
  parentSpanId?: string; // Parent span ID for hierarchy
  correlationId?: string; // Business correlation ID
}
```

**Headers Used**:

- `X-Trace-Id`: Trace identifier (propagated across services)
- `X-Span-Id`: Current span identifier
- `X-Parent-Span-Id`: Parent span identifier
- `X-Correlation-Id`: Business correlation identifier

**Important**: The `KafkaProducer` and `KafkaConsumer` classes automatically handle trace context injection/extraction. You don't need to manually call `injectTraceContext()` or `extractTraceContext()` when using these classes - they handle it internally.

### Kafka Client (`@bloxtr8/kafka-client`)

The Kafka client provides producer and consumer classes with automatic tracing, connection pooling, and error handling.

#### Producer

```typescript
import { KafkaProducer, createConfig } from '@bloxtr8/kafka-client';

const config = createConfig();
const producer = new KafkaProducer(config);

// Connect (optional - auto-connects on first send)
await producer.connect();

// Send single message (trace context automatically injected)
await producer.send('escrow.commands.v1', {
  key: escrowId,
  value: commandPayload, // Buffer or Protobuf Message
  headers: { 'content-type': 'application/protobuf' },
});

// Send batch of messages
await producer.sendBatch('escrow.commands.v1', [
  { key: 'esc_1', value: command1 },
  { key: 'esc_2', value: command2 },
]);

// Disconnect
await producer.disconnect();
```

**Features**:

- **Automatic Trace Injection**: Trace context from AsyncLocalStorage is automatically injected into message headers
- **Protobuf Support**: Accepts `Buffer` or Protobuf `Message` objects
- **Connection Pooling**: Reuses Kafka connections across instances
- **Automatic Retries**: Configurable retry logic with exponential backoff
- **Idempotent Producer**: Enabled by default (`idempotent: true`)

#### Consumer

```typescript
import { KafkaConsumer, createConfig } from '@bloxtr8/kafka-client';

const config = createConfig();
const consumer = new KafkaConsumer(config, {
  groupId: 'escrow-service',
  topics: ['escrow.commands.v1'],
  fromBeginning: false, // Start from latest offset
  dlqEnabled: true, // Enable dead letter queue
  dlqTopicSuffix: '.dlq', // DLQ topic suffix (default)
  sessionTimeout: 30000, // Session timeout in ms (default: 30000)
  heartbeatInterval: 3000, // Heartbeat interval in ms (default: 3000)
  maxBytesPerPartition: 1048576, // Max bytes per partition (default: 1MB)
});

// Run consumer with message handler
await consumer.run(async message => {
  // Trace context automatically extracted and set in AsyncLocalStorage
  const traceContext = getTraceContext(); // Available here!

  // Deserialize Protobuf message
  const command = message.deserialize(MyProtobufSchema);

  // Or parse JSON
  const jsonCommand = JSON.parse(message.value.toString());

  // Process message...
});

// Stop consumer
await consumer.stop();

// Disconnect
await consumer.disconnect();
```

**Consumer Options**:

- `groupId` (required): Consumer group ID for offset management
- `topics` (required): Array of topic names to subscribe to
- `fromBeginning` (optional): Start from beginning of topic (default: `false`)
- `dlqEnabled` (optional): Enable automatic DLQ routing for failed messages (default: `false`)
- `dlqTopicSuffix` (optional): Suffix for DLQ topics (default: `'.dlq'`)
- `sessionTimeout` (optional): Session timeout in milliseconds (default: `30000`)
- `heartbeatInterval` (optional): Heartbeat interval in milliseconds (default: `3000`)
- `maxBytesPerPartition` (optional): Maximum bytes to fetch per partition (default: `1048576`)

**Features**:

- **Automatic Trace Extraction**: Trace context is automatically extracted from message headers and set in AsyncLocalStorage
- **Automatic DLQ**: Failed messages are automatically sent to DLQ if enabled
- **Protobuf Deserialization**: Built-in `deserialize()` method for Protobuf messages
- **Error Handling**: Errors are caught and routed to DLQ or rethrown for KafkaJS retry handling
- **Graceful Shutdown**: Properly stops consuming and commits offsets

**DLQ Behavior**:

When `dlqEnabled: true`, failed messages are automatically sent to a DLQ topic with format: `{originalTopic}{dlqTopicSuffix}`. DLQ messages include headers:

- `x-original-topic`: Original topic name
- `x-original-partition`: Original partition number
- `x-original-offset`: Original offset
- `x-error-message`: Error message
- `x-error-timestamp`: ISO timestamp of error

### Outbox Publisher (`@bloxtr8/outbox-publisher`)

The outbox publisher polls the database for unpublished events and reliably publishes them to Kafka.

**Important**: The outbox publisher handles Kafka publishing automatically. You only need to write events to the `outbox` table - the publisher handles the rest (including retries, DLQ, and idempotent publishing).

```typescript
import { createOutboxPublisher } from '@bloxtr8/outbox-publisher';
import { createConfig } from '@bloxtr8/kafka-client';

const kafkaConfig = createConfig();
const publisher = createOutboxPublisher(kafkaConfig, {
  pollIntervalMs: 1000, // Poll every 1 second
  batchSize: 100, // Process up to 100 events per poll
  maxRetries: 5, // Max retry attempts per event
  retryBackoffMs: 100, // Initial retry backoff
  dlqEnabled: true, // Enable DLQ for failed events
  dlqTopicSuffix: '.dlq', // DLQ topic suffix
  topicMapping: {
    EscrowCreated: 'escrow.events.v1',
    EscrowFundsHeld: 'escrow.events.v1',
    PaymentSucceeded: 'payments.events.v1',
  },
});

// Start publisher (runs in background)
await publisher.start();

// Check health
const health = await publisher.getHealth();
// Returns: { status: 'healthy' | 'degraded' | 'unhealthy', details: {...} }

// Manual poll (for testing)
const results = await publisher.pollOnce();

// Stop publisher
await publisher.stop();
```

**What the Publisher Handles Automatically**:

- ✅ Polls `outbox` table for unpublished events (`publishedAt IS NULL`)
- ✅ Publishes events to Kafka using topic mapping
- ✅ Marks events as published after successful Kafka acknowledgment
- ✅ Retries failed publishes with exponential backoff
- ✅ Routes failed events to DLQ after max retries
- ✅ Prevents duplicate publishing across multiple publisher instances (using `FOR UPDATE SKIP LOCKED`)

**What You Need to Do**:

- ✅ Write events to `outbox` table in the same transaction as business state changes
- ✅ Set `eventType` to match your `topicMapping` keys
- ✅ Set `aggregateId` (e.g., `escrowId`) for partition key
- ✅ Set `payload` as Buffer (Protobuf or JSON serialized)

**Health Check**:

The publisher provides health monitoring:

- `healthy`: Database and Kafka connected, <1000 unpublished events
- `degraded`: Kafka unavailable OR >1000 unpublished events
- `unhealthy`: Database unavailable

**Configuration Options**:

- `pollIntervalMs`: Polling interval in milliseconds (default: `1000`)
- `batchSize`: Number of events to process per batch (default: `100`)
- `maxRetries`: Maximum retry attempts per event (default: `5`)
- `retryBackoffMs`: Initial retry backoff in milliseconds (default: `100`)
- `dlqEnabled`: Enable DLQ support (default: `true`)
- `dlqTopicSuffix`: DLQ topic suffix (default: `'.dlq'`)
- `topicMapping`: Required mapping from eventType to Kafka topic

**Note**: The outbox publisher does NOT use the event utilities (`generateEventId`, `createEscrowEventIdempotent`). Those utilities are for the `EscrowEvent` table (domain event log), which is separate from the `outbox` table (Kafka publishing). See [Domain Events vs Kafka Events](#domain-events-vs-kafka-events) below.

## Core Patterns

### Domain Events vs Kafka Events

**Important Distinction**: There are two types of events in the system:

1. **Domain Events** (stored in `EscrowEvent` table):
   - Event sourcing/audit trail for escrow state changes
   - Use `createEscrowEventIdempotent()` utility for atomic creation
   - Use `generateEventId()` to generate deterministic event IDs
   - Stored for historical tracking and debugging
   - **You must use event utilities manually**

2. **Kafka Events** (stored in `outbox` table):
   - Published to Kafka for inter-service communication
   - Written to `outbox` table, published automatically by outbox publisher
   - **Outbox publisher handles everything automatically - no utilities needed**

**When to Use Each**:

```typescript
// Domain Event (EscrowEvent table) - Use utilities
import { generateEventId, createEscrowEventIdempotent } from '@bloxtr8/shared';

const eventId = generateEventId(
  escrowId,
  'ESCROW_CREATED',
  businessStateHash,
  new Date()
);

await createEscrowEventIdempotent(prisma, {
  escrowId,
  eventType: 'ESCROW_CREATED',
  payload: { eventId, ...otherFields },
});

// Kafka Event (outbox table) - No utilities needed, publisher handles it
await prisma.$transaction(async tx => {
  await tx.escrow.update({ where: { id }, data: { status: 'FUNDS_HELD' } });

  // Just write to outbox - publisher handles Kafka publishing
  await tx.outbox.create({
    data: {
      aggregateId: escrowId,
      eventType: 'EscrowFundsHeld', // Must match topicMapping key
      payload: Buffer.from(protobufSerialize(event)),
    },
  });
});
```

**Summary**:

- **EscrowEvent utilities**: Use manually when creating domain events
- **Outbox publisher**: Handles Kafka publishing automatically - just write to `outbox` table

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
import {
  injectTraceContext,
  extractTraceContext,
  runWithTraceContextAsync,
  getTraceContext,
  createTraceContext,
} from '@bloxtr8/tracing';
import { createHash } from 'crypto';

// Validate environment
validateEnvironment(['DATABASE_URL', 'KAFKA_BROKERS']);

const prisma = new PrismaClient();
const kafkaConfig = createConfig();

// Create Kafka consumer
// Note: Consumer automatically extracts trace context and sets it in AsyncLocalStorage
const consumer = new KafkaConsumer(kafkaConfig, {
  groupId: 'example-service',
  topics: ['example.commands.v1'],
  dlqEnabled: true, // Failed messages go to example.commands.v1.dlq
  fromBeginning: false, // Start from latest offset
});

// Create Kafka producer (for commands)
// Note: Producer automatically injects trace context from AsyncLocalStorage
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
// Note: KafkaConsumer automatically extracts trace context and sets it in AsyncLocalStorage
// So getTraceContext() is available directly without manual extraction
async function processMessage(message: ConsumerMessage) {
  try {
    // Trace context is already available from AsyncLocalStorage
    const context = getTraceContext();

    const command = JSON.parse(message.value.toString());

    console.log('Processing command', {
      traceId: context?.traceId,
      spanId: context?.spanId,
      commandType: command.commandType,
    });

    switch (command.commandType) {
      case 'CreateExample':
        await handleCreateExampleCommand(command);
        break;
      default:
        console.warn(`Unknown command type: ${command.commandType}`);
    }
  } catch (error) {
    const context = getTraceContext();
    console.error('Error processing message', {
      traceId: context?.traceId,
      spanId: context?.spanId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error; // Will be sent to DLQ automatically if dlqEnabled: true
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
3. **Automatic Tracing**: Producer and Consumer automatically handle trace context injection/extraction
4. **Idempotency**: Uses `generateCommandEventId()` and `checkEscrowEventIdempotency()` for idempotent processing
5. **Atomic Event Creation**: Uses `createEscrowEventIdempotent()` to prevent race conditions
6. **Outbox Pattern**: Writes events to outbox table in same transaction as business state
7. **Command vs Event**: Commands processed directly, events published via outbox
8. **Automatic DLQ**: Consumer automatically routes failed messages to DLQ when `dlqEnabled: true`
9. **Error Handling**: Errors propagate to DLQ after retries exhausted
10. **Graceful Shutdown**: Properly closes connections on SIGTERM

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
// ✅ GOOD: Consistent partition key with tracing
import { injectTraceContext } from '@bloxtr8/tracing';

const message = injectTraceContext({
  key: escrowId, // Ensures ordering per escrow
  value: eventPayload,
});

await kafkaProducer.send({
  topic: 'escrow.events.v1',
  messages: [message],
});
```

### 11. Missing Trace Context Propagation

**Problem**: Trace context lost when crossing service boundaries

**Solution**: KafkaProducer and KafkaConsumer automatically handle tracing - no manual work needed!

```typescript
// ❌ BAD: Manual header management (error-prone and unnecessary)
await kafkaProducer.send({
  topic: 'escrow.commands.v1',
  messages: [
    {
      value: command,
      headers: {
        'X-Trace-Id': traceId, // Manual, can be forgotten
        'X-Span-Id': spanId,
      },
    },
  ],
});

// ✅ GOOD: KafkaProducer automatically injects trace context
// Just use the producer normally - tracing is handled automatically!
await producer.send('escrow.commands.v1', {
  key: escrowId,
  value: command,
  // Trace context from AsyncLocalStorage is automatically injected
});

// ✅ GOOD: KafkaConsumer automatically extracts trace context
await consumer.run(async message => {
  // Trace context is already available in AsyncLocalStorage
  const context = getTraceContext(); // Works automatically!
  // Process message...
});
```

**Note**: If you're using `KafkaProducer` or `KafkaConsumer` classes, you don't need to manually call `injectTraceContext()` or `extractTraceContext()` - they handle it automatically. Only use the tracing utilities directly if you're working with raw KafkaJS clients.

### 12. Not Using Batch Sending

**Problem**: Sending messages one-by-one is inefficient

**Solution**: Use `sendBatch()` for multiple messages

```typescript
// ❌ BAD: Multiple individual sends
for (const command of commands) {
  await producer.send('escrow.commands.v1', {
    key: command.escrowId,
    value: command,
  });
}

// ✅ GOOD: Batch send
await producer.sendBatch(
  'escrow.commands.v1',
  commands.map(cmd => ({ key: cmd.escrowId, value: cmd }))
);
```

### 13. Not Monitoring Outbox Publisher Health

**Problem**: Unpublished events pile up without detection

**Solution**: Monitor publisher health

```typescript
// ✅ GOOD: Check publisher health
const health = await publisher.getHealth();

if (health.status === 'degraded') {
  logger.warn('Publisher degraded', health.details);
  // Alert monitoring system
}

if (health.status === 'unhealthy') {
  logger.error('Publisher unhealthy', health.details);
  // Trigger alert
}
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

**Important**: `KafkaProducer` and `KafkaConsumer` automatically handle trace context - no manual work needed!

```typescript
import {
  KafkaProducer,
  KafkaConsumer,
  createConfig,
} from '@bloxtr8/kafka-client';
import { getTraceContext } from '@bloxtr8/tracing';

const config = createConfig();

// Producer: Trace context automatically injected from AsyncLocalStorage
const producer = new KafkaProducer(config);
await producer.send('escrow.commands.v1', {
  key: escrowId,
  value: command,
  // Trace context automatically injected - no manual work needed!
});

// Consumer: Trace context automatically extracted and set in AsyncLocalStorage
const consumer = new KafkaConsumer(config, {
  groupId: 'escrow-service',
  topics: ['escrow.commands.v1'],
});

await consumer.run(async message => {
  // Trace context is already available in AsyncLocalStorage
  const context = getTraceContext();

  console.log('Processing command', {
    traceId: context?.traceId,
    spanId: context?.spanId,
  });

  await handleCommand(message);
});
```

**Manual Tracing** (only if using raw KafkaJS clients):

```typescript
import {
  injectTraceContext,
  extractTraceContext,
  runWithTraceContextAsync,
} from '@bloxtr8/tracing';

// Only needed if NOT using KafkaProducer/KafkaConsumer classes
const message = injectTraceContext({
  key: escrowId,
  value: command,
});

// Consumer handler with manual extraction
async function processMessage(message: KafkaMessage) {
  const traceContext = extractTraceContext(message.headers);

  await runWithTraceContextAsync(
    traceContext ?? createTraceContext(),
    async () => {
      await handleCommand(message);
    }
  );
}
```

## Advanced Topics

### Schema Registry & Protobuf Evolution

The system uses Confluent Schema Registry for Protobuf schema management and evolution.

#### Setting Up Schema Registry

```bash
# Start Schema Registry (via Docker Compose)
docker compose up -d schema-registry

# Register schemas
./scripts/infrastructure/setup-schema-registry.sh --env development
```

#### Schema Evolution Best Practices

**Backward Compatibility**:

- **Add fields**: Always add optional fields (not required)
- **Remove fields**: Mark as deprecated first, remove later
- **Rename fields**: Use field numbers, not names (Protobuf handles this)
- **Change types**: Not recommended - create new field instead

**Example**:

```protobuf
// Version 1
message EscrowCreated {
  string escrow_id = 1;
  int64 amount = 2;
}

// Version 2 (backward compatible - added optional field)
message EscrowCreated {
  string escrow_id = 1;
  int64 amount = 2;
  string currency = 3; // New optional field
}
```

**Schema Registry Configuration**:

- Compatibility mode: `BACKWARD` (consumers can read older schemas)
- Schema Registry validates compatibility before allowing schema updates
- Failed compatibility checks prevent breaking changes

### Message Ordering Guarantees

**When Ordering Matters**:

- Events for the same escrow must be processed in order
- State transitions must happen sequentially
- Commands affecting the same resource need ordering

**Ensuring Ordering**:

```typescript
// ✅ GOOD: Use escrowId as partition key
await producer.send('escrow.commands.v1', {
  key: escrowId, // Same escrowId → same partition → ordering guaranteed
  value: command,
});

// ❌ BAD: No key or random key
await producer.send('escrow.commands.v1', {
  value: command, // Messages may be processed out of order
});
```

**Key Points**:

- Messages with the same partition key are processed in order within a partition
- Different partitions can process messages concurrently
- Consumer group ensures one consumer per partition (within a group)

### Consumer Rebalancing

**What Happens During Rebalancing**:

1. Consumer joins/leaves group
2. Kafka reassigns partitions to consumers
3. Consumers commit offsets before rebalancing
4. New assignments processed after rebalancing

**Handling Rebalancing**:

```typescript
// Consumer automatically handles rebalancing
const consumer = new KafkaConsumer(config, {
  groupId: 'escrow-service',
  topics: ['escrow.commands.v1'],
  sessionTimeout: 30000, // Timeout before rebalancing
  heartbeatInterval: 3000, // Heartbeat frequency
});

// Ensure idempotent processing (handles duplicate processing during rebalancing)
await consumer.run(async message => {
  // Use idempotency checks - messages may be reprocessed during rebalancing
  const commandId = generateCommandEventId(...);
  const existing = await checkIdempotency(commandId);
  if (existing) return; // Already processed

  await processCommand(message);
});
```

**Best Practices**:

- Keep processing time short (< sessionTimeout)
- Use idempotency checks (messages may be reprocessed)
- Commit offsets frequently (automatic with KafkaConsumer)
- Handle graceful shutdown (commit offsets before stopping)

### Offset Management

**Automatic Offset Commits**:

`KafkaConsumer` automatically commits offsets after successful message processing.

**Manual Offset Management** (if needed):

```typescript
// Consumer automatically commits offsets
// Manual commits only needed for custom error handling

// Reset consumer group offset (for reprocessing)
kafka-consumer-groups --bootstrap-server localhost:9092 \
  --group escrow-service \
  --topic escrow.commands.v1 \
  --reset-offsets \
  --to-earliest \
  --execute
```

**Offset Reset Scenarios**:

- **Reprocessing**: Reset to earliest offset to reprocess all messages
- **Skip Poison Messages**: Reset to latest offset to skip problematic messages
- **Testing**: Reset to specific offset for testing specific scenarios

### Performance Tuning

#### Producer Performance

```typescript
// Batch configuration for better throughput
const producer = new KafkaProducer(config);

// Send multiple messages in batch (more efficient)
await producer.sendBatch('escrow.commands.v1', [
  { key: 'esc_1', value: cmd1 },
  { key: 'esc_2', value: cmd2 },
  { key: 'esc_3', value: cmd3 },
]);
```

**Producer Settings**:

- `idempotent: true` (default) - Ensures exactly-once semantics
- `maxInFlightRequests: 1` (default) - Ensures ordering
- Batch size: Controlled by KafkaJS (automatic batching)

#### Consumer Performance

```typescript
const consumer = new KafkaConsumer(config, {
  groupId: 'escrow-service',
  topics: ['escrow.commands.v1'],
  maxBytesPerPartition: 1048576, // 1MB per partition (default)
  // Larger values = more throughput, more memory
});
```

**Scaling Consumers**:

- **Horizontal Scaling**: Add more consumer instances (same groupId)
- **Partition Count**: More partitions = more parallelism
- **Processing Speed**: Optimize message processing logic

**Example Scaling**:

```bash
# Topic has 12 partitions
# Run 3 consumer instances → each handles ~4 partitions
# Run 6 consumer instances → each handles ~2 partitions
# Run 12 consumer instances → each handles 1 partition (optimal)
```

### Topic Configuration

**Partition Strategy**:

- **Commands**: 12 partitions (high throughput, parallel processing)
- **Events**: 12 partitions (multiple consumers, parallel processing)
- **DLQ**: 1 partition (low volume, sequential processing)

**Retention Policies**:

```bash
# Commands: 7 days (short retention, high volume)
# Events: 90 days (long retention, audit trail)
# DLQ: 90 days (long retention, debugging)
```

**Replication Factor**:

- **Development**: 1 replica (single broker)
- **Production**: 3 replicas (high availability)

### Graceful Shutdown Patterns

**Complete Shutdown Handler**:

```typescript
let shutdownInProgress = false;

async function gracefulShutdown(signal: string) {
  if (shutdownInProgress) {
    console.log('Shutdown already in progress, forcing exit...');
    process.exit(1);
  }

  shutdownInProgress = true;
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  try {
    // 1. Stop accepting new messages
    console.log('Stopping consumer...');
    await consumer.stop(); // Stops fetching new messages, commits offsets

    // 2. Stop outbox publisher
    console.log('Stopping outbox publisher...');
    await outboxPublisher.stop(); // Finishes current batch, stops polling

    // 3. Wait for in-flight operations to complete
    console.log('Waiting for in-flight operations...');
    await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second grace period

    // 4. Disconnect producers
    console.log('Disconnecting producer...');
    await producer.disconnect();

    // 5. Close database connections
    console.log('Closing database connections...');
    await prisma.$disconnect();

    console.log('✅ Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});
```

**Key Points**:

1. Stop accepting new work first
2. Wait for in-flight operations to complete
3. Commit offsets/flush buffers
4. Close connections gracefully
5. Set timeout to prevent hanging

### Local Development Tips

**Common Issues**:

1. **Consumer Not Consuming**:

   ```bash
   # Check consumer group status
   kafka-consumer-groups --bootstrap-server localhost:9092 \
     --group escrow-service --describe

   # Check if consumer is actually running
   # Check logs for errors
   ```

2. **Outbox Not Publishing**:

   ```sql
   -- Check for unpublished events
   SELECT * FROM outbox WHERE published_at IS NULL ORDER BY created_at DESC LIMIT 10;

   -- Check publisher health
   # In your service, call publisher.getHealth()
   ```

3. **Schema Registry Connection Issues**:

   ```bash
   # Verify Schema Registry is running
   curl http://localhost:8081/subjects

   # Check Docker logs
   docker logs schema-registry
   ```

4. **Port Conflicts**:
   ```bash
   # Check if ports are in use
   lsof -i :9092 # Kafka
   lsof -i :8081 # Schema Registry
   ```

**Development Workflow**:

```bash
# 1. Start infrastructure
docker compose up -d kafka-1 kafka-2 kafka-3 schema-registry test-db

# 2. Wait for services to be ready
./scripts/dev-setup.sh

# 3. Create topics
./scripts/kafka/setup-topics.sh --env development

# 4. Register schemas
./scripts/infrastructure/setup-schema-registry.sh --env development

# 5. Start your service
pnpm dev
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

### 6. Log Structured Data with Tracing

```typescript
// ✅ GOOD: Structured logging with trace context
import { getTraceContext } from '@bloxtr8/tracing';

logger.info('Escrow state transition', {
  escrowId,
  fromState: 'AWAIT_FUNDS',
  toState: 'FUNDS_HELD',
  traceId: getTraceContext()?.traceId,
  spanId: getTraceContext()?.spanId,
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
