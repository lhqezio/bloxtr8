import {
  KafkaProducer,
  createConfig as createKafkaConfig,
  type KafkaClientConfig,
} from '@bloxtr8/kafka-client';

import { createConfig } from './config.js';
import { checkHealth } from './health.js';
import { processEventsInTransaction } from './publisher-utils.js';
import type {
  OutboxPublisherConfig,
  PublishResult,
  HealthCheckResult,
} from './types.js';

/**
 * Outbox publisher service
 * Polls the database for unpublished events and publishes them to Kafka
 */
export class OutboxPublisher {
  private producer: KafkaProducer;
  private config: Required<OutboxPublisherConfig>;
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private shutdownRequested = false;

  constructor(kafkaConfig: KafkaClientConfig, config: OutboxPublisherConfig) {
    this.config = createConfig(config);
    this.producer = new KafkaProducer(kafkaConfig);
  }

  /**
   * Start the publisher polling loop
   */
  async start(): Promise<void> {
    if (this.running) {
      throw new Error('Publisher is already running');
    }

    this.running = true;
    this.shutdownRequested = false;

    // Connect producer
    await this.producer.connect();

    // Start polling loop
    this.pollingInterval = setInterval(() => {
      this.poll().catch(error => {
        console.error('Error in polling loop:', error);
      });
    }, this.config.pollIntervalMs);

    // Initial poll
    await this.poll();
  }

  /**
   * Stop the publisher gracefully
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.shutdownRequested = true;

    // Stop polling
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    // Wait for current batch to finish
    // Note: In production, you might want to add a timeout here
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Disconnect producer
    try {
      await this.producer.disconnect();
    } catch (error) {
      console.error('Error disconnecting producer:', error);
    }

    this.running = false;
  }

  /**
   * Check health status
   */
  async getHealth(): Promise<HealthCheckResult> {
    return checkHealth(this.producer);
  }

  /**
   * Poll for unpublished events and process them
   * Uses transactions to ensure row locks are held during processing,
   * preventing multiple publisher instances from processing the same events concurrently.
   */
  private async poll(): Promise<void> {
    if (this.shutdownRequested) {
      return;
    }

    try {
      // Process events within transactions to hold locks during processing
      // This prevents concurrent processing by multiple publisher instances
      const results = await processEventsInTransaction(
        this.producer,
        this.config,
        this.config.batchSize
      );

      if (results.length === 0) {
        return; // No events to process
      }

      // Log results
      const successful = results.filter(r => r.success).length;
      const failed = results.length - successful;

      if (failed > 0) {
        console.warn(
          `Processed ${results.length} events: ${successful} successful, ${failed} failed`
        );
      }
    } catch (error) {
      console.error('Error polling for events:', error);
    }
  }

  /**
   * Manually trigger a poll (useful for testing)
   * Uses transactions to ensure proper concurrency protection
   */
  async pollOnce(): Promise<PublishResult[]> {
    return processEventsInTransaction(
      this.producer,
      this.config,
      this.config.batchSize
    );
  }
}

/**
 * Create an outbox publisher instance
 */
export function createOutboxPublisher(
  kafkaConfig: KafkaClientConfig,
  config: OutboxPublisherConfig
): OutboxPublisher {
  return new OutboxPublisher(kafkaConfig, config);
}

/**
 * Create an outbox publisher with default Kafka config from environment
 */
export function createOutboxPublisherFromEnv(
  config: OutboxPublisherConfig
): OutboxPublisher {
  const kafkaConfig = createKafkaConfig();
  return new OutboxPublisher(kafkaConfig, config);
}
