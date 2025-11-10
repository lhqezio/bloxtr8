import type { OutboxPublisherConfig } from './types.js';

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<Omit<OutboxPublisherConfig, 'topicMapping'>> = {
  pollIntervalMs: 1000,
  batchSize: 100,
  maxRetries: 5,
  retryBackoffMs: 100,
  dlqEnabled: true,
  dlqTopicSuffix: '.dlq',
};

/**
 * Create configuration with defaults applied
 */
export function createConfig(
  config: OutboxPublisherConfig
): Required<OutboxPublisherConfig> {
  if (!config.topicMapping || Object.keys(config.topicMapping).length === 0) {
    throw new Error('topicMapping is required and must not be empty');
  }

  return {
    ...DEFAULT_CONFIG,
    ...config,
    topicMapping: config.topicMapping,
  };
}

/**
 * Get default configuration values
 */
export function getDefaultConfig(): Required<
  Omit<OutboxPublisherConfig, 'topicMapping'>
> {
  return { ...DEFAULT_CONFIG };
}
