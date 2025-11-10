import { getEnvVar } from '@bloxtr8/shared';

import type {
  KafkaClientConfig,
  RetryConfig,
  SchemaRegistryConfig,
  LogLevel,
} from './types.js';

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  strategy: 'exponential',
  maxRetries: 5,
  initialRetryTimeMs: 100,
  maxRetryTimeMs: 30000,
  multiplier: 2,
  fixedIntervalMs: 1000,
};

/**
 * Default Kafka client configuration
 */
const DEFAULT_CONFIG: Partial<KafkaClientConfig> = {
  connectionTimeout: 3000,
  requestTimeout: 30000,
  logLevel: 'INFO',
  retry: DEFAULT_RETRY_CONFIG,
};

/**
 * Create Kafka client configuration from environment variables
 */
export function createConfig(
  overrides?: Partial<KafkaClientConfig>
): KafkaClientConfig {
  const brokersEnv = getEnvVar('KAFKA_BROKERS', 'localhost:9092');
  const brokers = brokersEnv.split(',').map((b: string) => b.trim());

  const clientId =
    overrides?.clientId ||
    getEnvVar('KAFKA_CLIENT_ID', '@bloxtr8/kafka-client');

  const logLevel = (overrides?.logLevel ||
    (getEnvVar('KAFKA_LOG_LEVEL', 'INFO') as LogLevel)) as LogLevel;

  const retry: RetryConfig = {
    ...DEFAULT_RETRY_CONFIG,
    ...overrides?.retry,
  };

  const schemaRegistryUrl = process.env.KAFKA_SCHEMA_REGISTRY_URL;
  const schemaRegistry: SchemaRegistryConfig | undefined = schemaRegistryUrl
    ? {
        url: schemaRegistryUrl,
        enabled: overrides?.schemaRegistry?.enabled ?? false,
      }
    : overrides?.schemaRegistry;

  return {
    ...DEFAULT_CONFIG,
    brokers,
    clientId,
    logLevel,
    retry,
    schemaRegistry,
    connectionTimeout:
      overrides?.connectionTimeout ?? DEFAULT_CONFIG.connectionTimeout,
    requestTimeout: overrides?.requestTimeout ?? DEFAULT_CONFIG.requestTimeout,
  } as KafkaClientConfig;
}

/**
 * Get default retry configuration
 */
export function getDefaultRetryConfig(): RetryConfig {
  return { ...DEFAULT_RETRY_CONFIG };
}
