// Main exports
export {
  OutboxPublisher,
  createOutboxPublisher,
  createOutboxPublisherFromEnv,
} from './publisher.js';

// Configuration
export { createConfig, getDefaultConfig } from './config.js';
export type { OutboxPublisherConfig, TopicMapping } from './types.js';

// Error classes
export {
  OutboxPublisherError,
  OutboxPublishError,
  OutboxDLQError,
} from './errors.js';

// Types
export type {
  OutboxEvent,
  PublishResult,
  DLQMessage,
  HealthStatus,
  HealthCheckResult,
} from './types.js';

// Health check
export { checkHealth } from './health.js';
