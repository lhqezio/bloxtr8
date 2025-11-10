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

The publisher ensures idempotent publishing:

- Checks if an event is already published before processing
- Uses atomic database updates (`UPDATE ... WHERE published_at IS NULL`)
- Uses `FOR UPDATE SKIP LOCKED` to prevent concurrent processing of the same events

### Error Handling

**Transient Errors** (network, Kafka unavailable):

- Retry with exponential backoff
- Don't mark as published until successful
- Continue processing other events

**Permanent Errors** (malformed payload, invalid topic):

- Send to DLQ immediately
- Mark as published to prevent reprocessing
- Log error for investigation

**Max Retries Exceeded**:

- Send to DLQ
- Mark as published to prevent infinite retries

### DLQ Support

Failed events are sent to a DLQ topic with the format: `{originalTopic}.dlq`

DLQ messages include:

- Original event payload
- Error information
- Retry count
- Timestamp
- Metadata

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
- **Headers**: Event metadata (type, ID, version)

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

- Database connectivity
- Kafka connectivity
- Unpublished event count
- Overall health status (healthy/degraded/unhealthy)

## Related Documentation

- [Escrow System Architecture](../../documentation/architecture/escrow/escrow-system-architecture.md#outbox-pattern)
- [Error Handling & Retries](../../documentation/architecture/escrow/error-handling-retries.md)
- [Kafka Client](../../packages/kafka-client/README.md)
