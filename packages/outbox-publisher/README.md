# @bloxtr8/outbox-publisher

Shared outbox publisher service for reliable event publishing to Kafka, ensuring events are published even when Kafka is temporarily unavailable.

## Overview

The outbox publisher implements the transactional outbox pattern, polling the database for unpublished events and reliably publishing them to Kafka. It provides:

- **Reliable Publishing**: Events are guaranteed to be published even if Kafka is temporarily unavailable
- **Idempotent Publishing**: Prevents duplicate event publishing across multiple instances
- **Error Handling**: Automatic retry with exponential backoff for transient errors
- **DLQ Support**: Dead letter queue for events that fail after retries
- **Health Checks**: Built-in health monitoring for database and Kafka connectivity

## Installation

This package is part of the Bloxtr8 monorepo and is installed automatically.

## Usage

### Basic Usage

```typescript
import {
  createOutboxPublisher,
  createOutboxPublisherFromEnv,
} from '@bloxtr8/outbox-publisher';
import { createConfig } from '@bloxtr8/kafka-client';

// Option 1: Create with explicit Kafka config
const kafkaConfig = createConfig();
const publisher = createOutboxPublisher(kafkaConfig, {
  pollIntervalMs: 1000,
  batchSize: 100,
  topicMapping: {
    EscrowCreated: 'escrow.events.v1',
    EscrowFundsHeld: 'escrow.events.v1',
    PaymentSucceeded: 'payments.events.v1',
  },
});

// Option 2: Create with Kafka config from environment
const publisher = createOutboxPublisherFromEnv({
  pollIntervalMs: 1000,
  batchSize: 100,
  topicMapping: {
    EscrowCreated: 'escrow.events.v1',
    PaymentSucceeded: 'payments.events.v1',
  },
});

// Start the publisher
await publisher.start();

// Publisher runs in background, polling and publishing events

// Graceful shutdown
await publisher.stop();
```

### Configuration Options

```typescript
interface OutboxPublisherConfig {
  // Polling interval in milliseconds (default: 1000)
  pollIntervalMs?: number;

  // Number of events to process per batch (default: 100)
  batchSize?: number;

  // Maximum retry attempts per event (default: 5)
  maxRetries?: number;

  // Initial retry backoff in milliseconds (default: 100)
  retryBackoffMs?: number;

  // Enable DLQ support (default: true)
  dlqEnabled?: boolean;

  // DLQ topic suffix (default: '.dlq')
  dlqTopicSuffix?: string;

  // Mapping from eventType to Kafka topic (required)
  topicMapping: Record<string, string>;
}
```

### Health Checks

```typescript
const health = await publisher.getHealth();

if (health.status === 'healthy') {
  console.log('Publisher is healthy');
} else if (health.status === 'degraded') {
  console.warn('Publisher is degraded:', health.details);
} else {
  console.error('Publisher is unhealthy:', health);
}
```

### Manual Polling

For testing or manual triggering:

```typescript
const results = await publisher.pollOnce();
results.forEach(result => {
  if (result.success) {
    console.log(`Published event ${result.eventId} to ${result.topic}`);
  } else {
    console.error(`Failed to publish event ${result.eventId}:`, result.error);
  }
});
```

## Architecture

### Outbox Pattern

The outbox publisher implements the transactional outbox pattern:

1. **Event Insertion**: Services insert events into the `outbox` table within the same database transaction as business state changes
2. **Polling**: The publisher polls for unpublished events (`publishedAt IS NULL`)
3. **Publishing**: Events are published to Kafka using the configured topic mapping
4. **Marking Published**: Events are marked as published only after successful Kafka acknowledgment

### Idempotency

The publisher ensures idempotent publishing using a two-phase transaction approach:

1. **Claim Phase** (within transaction):
   - Uses `FOR UPDATE SKIP LOCKED` to atomically claim events
   - Prevents multiple publisher instances from processing the same events concurrently
   - Uses `ReadCommitted` isolation level to allow concurrent transactions
   - Events are claimed but NOT marked as published yet

2. **Publish Phase** (outside transaction):
   - Publishes to Kafka with retry logic
   - Events are marked as published ONLY after successful Kafka acknowledgment
   - If Kafka succeeds but marking fails, returns success anyway (prevents duplicates)
   - If marking fails after DLQ send, logs warning but continues (DLQ already has the message)

This approach ensures:

- No duplicate publishing if Kafka succeeds but marking fails
- No duplicate processing across multiple publisher instances
- Atomic database updates (`UPDATE ... WHERE published_at IS NULL`)

### Error Handling

**Transient Errors** (network, Kafka unavailable):

- Retry with exponential backoff (capped at 30 seconds)
- Don't mark as published until successful
- Continue processing other events
- Uses `isRetryableError()` from `@bloxtr8/kafka-client` to determine retryability

**Permanent Errors** (malformed payload, invalid topic, unmapped event type):

- Detected via `isPermanentError()` which checks for patterns like:
  - Invalid topic, malformed payload, serialization errors
  - Unauthorized, forbidden, not found errors
- Send to DLQ immediately (no retries)
- Mark as published to prevent reprocessing
- Log error for investigation

**Unmapped Event Types**:

- Events with no topic mapping are sent to fallback DLQ topic: `outbox.unmapped.dlq`
- Treated as permanent errors
- Includes metadata indicating the unmapped event type

**Max Retries Exceeded**:

- After `maxRetries` attempts, send to DLQ with error type `TRANSIENT`
- Mark as published to prevent infinite retries
- Treated as permanent error state (all retries exhausted)

**Error Recovery**:

- If Kafka send succeeds but marking fails: Returns success (prevents duplicate publishing)
- If DLQ send succeeds but marking fails: Logs warning but continues (DLQ has the message)
- If DLQ send fails: Marks as published anyway to prevent infinite retry loops

### DLQ Support

Failed events are sent to a DLQ topic with the format: `{originalTopic}.dlq`

DLQ messages are JSON-serialized and include:

```typescript
{
  originalTopic: string;           // Original Kafka topic
  originalEventId: string;          // Outbox event ID
  originalAggregateId: string;      // Aggregate ID (e.g., escrowId)
  originalEventType: string;        // Event type name
  originalPayload: Buffer;           // Original Protobuf payload
  errorType: 'TRANSIENT' | 'PERMANENT' | 'POISON';
  errorMessage: string;              // Error message
  retryCount: number;                // Number of retry attempts
  failedAt: string;                  // ISO 8601 timestamp
  traceId?: string;                  // Optional trace ID
  metadata?: Record<string, string>; // Additional metadata
}
```

DLQ Kafka messages include headers:

- `content-type: application/json`
- `x-dlq-original-topic`: Original topic name
- `x-dlq-event-id`: Event ID
- `x-dlq-error-type`: Error type (TRANSIENT/PERMANENT/POISON)

## Database Schema

The publisher uses the `Outbox` table:

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

## Kafka Integration

The publisher uses `@bloxtr8/kafka-client` for Kafka operations:

- **Topic**: Determined by `topicMapping[eventType]`
- **Key**: `aggregateId` (for partitioning)
- **Value**: `payload` (Protobuf-serialized bytes)
- **Headers**:
  - `content-type: application/protobuf`
  - `x-event-type`: Event type name
  - `x-event-id`: Outbox event ID
  - `x-event-version`: Schema version number

## Error Classes

```typescript
// Base error class
class OutboxPublisherError extends Error {
  context?: {
    eventId?: string;
    topic?: string;
    aggregateId?: string;
  };
}

// Publishing failure
class OutboxPublishError extends OutboxPublisherError {}

// DLQ publishing failure
class OutboxDLQError extends OutboxPublisherError {}
```

## Monitoring

The publisher provides health checks that monitor:

- **Database connectivity**: Tests with `SELECT 1` query
- **Kafka connectivity**: Attempts to connect if not already connected
- **Unpublished event count**: Counts events where `publishedAt IS NULL`
- **Overall health status**:
  - `healthy`: Database and Kafka connected, <1000 unpublished events
  - `degraded`: Kafka unavailable (but DB connected) OR >1000 unpublished events
  - `unhealthy`: Database unavailable

The `checkHealth()` function is also exported for standalone health checks:

```typescript
import { checkHealth } from '@bloxtr8/outbox-publisher';
import { KafkaProducer, createConfig } from '@bloxtr8/kafka-client';

const producer = new KafkaProducer(createConfig());
const health = await checkHealth(producer);
```

## Exports

The package exports:

- **Classes**: `OutboxPublisher`
- **Factory Functions**: `createOutboxPublisher`, `createOutboxPublisherFromEnv`
- **Configuration**: `createConfig`, `getDefaultConfig`
- **Types**: `OutboxPublisherConfig`, `TopicMapping`, `OutboxEvent`, `PublishResult`, `DLQMessage`, `HealthStatus`, `HealthCheckResult`
- **Error Classes**: `OutboxPublisherError`, `OutboxPublishError`, `OutboxDLQError`
- **Utilities**: `checkHealth`

## Related Documentation

- [Escrow System Architecture](../../documentation/architecture/escrow/escrow-system-architecture.md#outbox-pattern)
- [Error Handling & Retries](../../documentation/architecture/escrow/error-handling-retries.md)
- [Kafka Client](../../packages/kafka-client/README.md)
