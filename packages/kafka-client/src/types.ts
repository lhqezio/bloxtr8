/* eslint-disable no-unused-vars */
import type { Message } from '@bufbuild/protobuf';
import type { Kafka } from 'kafkajs';

/**
 * Log levels for Kafka client
 */
export type LogLevel = 'NOTHING' | 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';

/**
 * Retry strategy type
 */
export type RetryStrategy = 'exponential' | 'fixed';

/**
 * Retry configuration
 */
export interface RetryConfig {
  strategy: RetryStrategy;
  maxRetries: number;
  initialRetryTimeMs: number;
  maxRetryTimeMs: number;
  multiplier: number; // For exponential strategy
  fixedIntervalMs: number; // For fixed strategy
}

/**
 * Schema Registry configuration (optional)
 */
export interface SchemaRegistryConfig {
  url: string;
  enabled: boolean;
}

/**
 * Main Kafka client configuration
 */
export interface KafkaClientConfig {
  brokers: string[];
  clientId: string;
  retry: RetryConfig;
  connectionTimeout?: number;
  requestTimeout?: number;
  logLevel?: LogLevel;
  schemaRegistry?: SchemaRegistryConfig;
}

/**
 * Producer message interface
 */
export interface ProducerMessage {
  key: string | Buffer;
  value: Buffer | Message;
  headers?: Record<string, string | Buffer>;
  timestamp?: string | number;
}

/**
 * Consumer message interface
 */
export interface ConsumerMessage {
  topic: string;
  partition: number;
  offset: string;
  key: Buffer | null;
  value: Buffer;
  headers: Record<string, Buffer | undefined>;
  timestamp: string;

  deserialize<T extends Message>(schema: {
    fromBinary: (bytes: Uint8Array) => T;
  }): T;
}

/**
 * Consumer options
 */
export interface ConsumerOptions {
  groupId: string;
  topics: string[];
  fromBeginning?: boolean;
  dlqEnabled?: boolean;
  dlqTopicSuffix?: string;
  maxBytesPerPartition?: number;
  sessionTimeout?: number;
  heartbeatInterval?: number;
}

/**
 * Message handler function type
 */

export type MessageHandler = (message: ConsumerMessage) => Promise<void>;

/**
 * Record metadata returned from producer
 */
export interface RecordMetadata {
  topicName: string;
  partition: number;
  errorCode: number;
  offset: string | undefined;
  timestamp: string | undefined;
}

/**
 * Connection pool entry
 */
export interface ConnectionPoolEntry {
  client: Kafka;
  config: KafkaClientConfig;
  lastUsed: number;
}
