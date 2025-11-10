import type { Outbox } from '@bloxtr8/database';

/**
 * Mapping from event type to Kafka topic
 */
export type TopicMapping = Record<string, string>;

/**
 * Configuration for the outbox publisher
 */
export interface OutboxPublisherConfig {
  /**
   * Polling interval in milliseconds
   * @default 1000
   */
  pollIntervalMs?: number;

  /**
   * Number of events to process per batch
   * @default 100
   */
  batchSize?: number;

  /**
   * Maximum retry attempts per event
   * @default 5
   */
  maxRetries?: number;

  /**
   * Initial retry backoff in milliseconds
   * @default 100
   */
  retryBackoffMs?: number;

  /**
   * Enable DLQ support
   * @default true
   */
  dlqEnabled?: boolean;

  /**
   * DLQ topic suffix
   * @default '.dlq'
   */
  dlqTopicSuffix?: string;

  /**
   * Mapping from eventType to Kafka topic
   * Required - must map all event types that will be published
   */
  topicMapping: TopicMapping;
}

/**
 * Outbox event record from database
 */
export type OutboxEvent = Outbox;

/**
 * Result of a publish operation
 */
export interface PublishResult {
  success: boolean;
  eventId: string;
  topic?: string;
  error?: Error;
  sentToDLQ?: boolean;
}

/**
 * DLQ message structure
 */
export interface DLQMessage {
  originalTopic: string;
  originalEventId: string;
  originalAggregateId: string;
  originalEventType: string;
  originalPayload: Buffer;
  errorType: 'TRANSIENT' | 'PERMANENT' | 'POISON';
  errorMessage: string;
  retryCount: number;
  failedAt: string; // ISO 8601 timestamp
  traceId?: string;
  metadata?: Record<string, string>;
}

/**
 * Health status of the publisher
 */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

/**
 * Health check result
 */
export interface HealthCheckResult {
  status: HealthStatus;
  database: {
    connected: boolean;
    error?: string;
  };
  kafka: {
    connected: boolean;
    error?: string;
  };
  unpublishedEvents: {
    count: number;
  };
  details?: Record<string, unknown>;
}
