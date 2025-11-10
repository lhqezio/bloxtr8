# @bloxtr8/kafka-client

Shared Kafka client library for Bloxtr8 services providing reusable producer and consumer clients with connection pooling, retry logic, and error handling.

## Features

- **Producer Client**: Send messages with automatic retry and Protobuf serialization
- **Consumer Client**: Consume messages with DLQ support and graceful shutdown
- **Connection Pooling**: Reuse Kafka connections across instances
- **Retry Strategies**: Configurable exponential backoff or fixed interval retries
- **Error Handling**: Comprehensive error classification and context preservation
- **DLQ Support**: Automatic dead letter queue routing for failed messages
- **Protobuf Integration**: Built-in support for Protobuf message serialization

## Installation

This package is part of the Bloxtr8 monorepo and is installed automatically.

## Usage

### Producer

```typescript
import { KafkaProducer, createConfig } from '@bloxtr8/kafka-client';

const config = createConfig();
const producer = new KafkaProducer(config);

await producer.send('escrow.commands.v1', {
  key: 'escrow-123',
  value: myProtobufMessage,
  headers: { 'content-type': 'application/protobuf' },
});

await producer.disconnect();
```

### Consumer

```typescript
import { KafkaConsumer, createConfig } from '@bloxtr8/kafka-client';

const config = createConfig();
const consumer = new KafkaConsumer(config, {
  groupId: 'escrow-service',
  topics: ['escrow.commands.v1'],
  dlqEnabled: true,
});

await consumer.run(async message => {
  const deserialized = message.deserialize(MyProtobufSchema);
  // Process message
});

await consumer.stop();
```

## Configuration

The library reads configuration from environment variables:

- `KAFKA_BROKERS`: Comma-separated broker list (required)
- `KAFKA_CLIENT_ID`: Client identifier (optional)
- `KAFKA_SCHEMA_REGISTRY_URL`: Schema Registry URL (optional)
- `KAFKA_LOG_LEVEL`: Log level (optional, defaults to INFO)

## Environment Variables

See the main README for environment setup instructions.
