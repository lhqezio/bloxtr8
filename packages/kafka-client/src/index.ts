// Main exports
export { KafkaProducer } from './producer.js';
export { KafkaConsumer } from './consumer.js';

// Configuration
export { createConfig, getDefaultRetryConfig } from './config.js';
export type {
  KafkaClientConfig,
  RetryConfig,
  SchemaRegistryConfig,
  LogLevel,
  RetryStrategy,
} from './types.js';

// Error classes
export {
  KafkaClientError,
  KafkaConnectionError,
  KafkaProducerError,
  KafkaConsumerError,
  KafkaSerializationError,
  KafkaRetryableError,
  isRetryableError,
  isNetworkError,
  isTimeoutError,
} from './errors.js';

// Types
export type {
  ProducerMessage,
  ConsumerMessage,
  ConsumerOptions,
  MessageHandler,
  RecordMetadata,
} from './types.js';

// Connection pool (for advanced usage)
export { connectionPool } from './connection-pool.js';
