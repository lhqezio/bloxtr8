import {
  KafkaProducer,
  createConfig as createKafkaConfig,
  type KafkaClientConfig,
} from '@bloxtr8/kafka-client';

import { createConfig } from './config.js';
import { checkHealth } from './health.js';
import { getUnpublishedEvents } from './idempotency.js';
import { processEvent } from './publisher-utils.js';
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
   */
  private async poll(): Promise<void> {
    if (this.shutdownRequested) {
      return;
    }

    try {
      const events = await getUnpublishedEvents(this.config.batchSize);

      if (events.length === 0) {
        return; // No events to process
      }

      // Process events in parallel (with concurrency limit)
      const results = await Promise.allSettled(
        events.map(event => processEvent(this.producer, event, this.config))
      );

      // Log results
      const successful = results.filter(
        r => r.status === 'fulfilled' && r.value.success
      ).length;
      const failed = results.length - successful;

      if (failed > 0) {
        console.warn(
          `Processed ${events.length} events: ${successful} successful, ${failed} failed`
        );
      }
    } catch (error) {
      console.error('Error polling for events:', error);
    }
  }

  /**
   * Manually trigger a poll (useful for testing)
   */
  async pollOnce(): Promise<PublishResult[]> {
    const events = await getUnpublishedEvents(this.config.batchSize);
    const results = await Promise.allSettled(
      events.map(event => processEvent(this.producer, event, this.config))
    );

    return results.map(result => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          success: false,
          eventId: 'unknown',
          error:
            result.reason instanceof Error
              ? result.reason
              : new Error(String(result.reason)),
        };
      }
    });
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
