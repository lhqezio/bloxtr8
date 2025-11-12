/* eslint-disable no-unused-vars */
import {
  createTraceContext,
  extractTraceContext,
  runWithTraceContextAsync,
} from '@bloxtr8/tracing';
import type { Message } from '@bufbuild/protobuf';
import type { Consumer, EachMessagePayload } from 'kafkajs';

import { connectionPool } from './connection-pool.js';
import { KafkaConsumerError, KafkaConnectionError } from './errors.js';
import { deserializeMessage } from './serialization.js';
import type {
  KafkaClientConfig,
  ConsumerOptions,
  ConsumerMessage,
  MessageHandler,
} from './types.js';

/**
 * Kafka consumer client
 */
export class KafkaConsumer {
  private consumer: Consumer;
  private running = false;
  private subscribedTopics: string[] = [];

  constructor(
    private readonly config: KafkaClientConfig,
    private readonly options: ConsumerOptions
  ) {
    const client = connectionPool.getClient(config);
    this.consumer = client.consumer({
      groupId: options.groupId,
      sessionTimeout: options.sessionTimeout ?? 30000,
      heartbeatInterval: options.heartbeatInterval ?? 3000,
      maxBytesPerPartition: options.maxBytesPerPartition ?? 1048576,
    });
  }

  /**
   * Subscribe to topics
   */
  async subscribe(topics: string[]): Promise<void> {
    try {
      await this.consumer.subscribe({
        topics,
        fromBeginning: this.options.fromBeginning ?? false,
      });
      this.subscribedTopics = topics;
    } catch (error) {
      throw new KafkaConsumerError(
        `Failed to subscribe to topics: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Run the consumer with the provided message handler
   */
  async run(handler: MessageHandler): Promise<void> {
    if (this.running) {
      throw new KafkaConsumerError('Consumer is already running');
    }

    if (this.subscribedTopics.length === 0) {
      await this.subscribe(this.options.topics);
    }

    this.running = true;

    try {
      await this.consumer.run({
        eachMessage: async (payload: EachMessagePayload) => {
          try {
            const message = this.createConsumerMessage(payload);

            // Extract trace context from message headers
            const traceContext =
              extractTraceContext(message.headers) ?? createTraceContext();

            // Run handler with trace context in AsyncLocalStorage
            await runWithTraceContextAsync(traceContext, async () => {
              await handler(message);
            });
          } catch (error) {
            const err =
              error instanceof Error ? error : new Error(String(error));
            await this.handleMessageError(err, payload, handler);
          }
        },
      });
    } catch (error) {
      this.running = false;
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new KafkaConsumerError(`Consumer run failed: ${errorMessage}`);
    }
  }

  /**
   * Stop the consumer
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    try {
      await this.consumer.stop();
      this.running = false;
    } catch (error) {
      throw new KafkaConsumerError(
        `Failed to stop consumer: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Disconnect the consumer
   */
  async disconnect(): Promise<void> {
    try {
      await this.consumer.disconnect();
      this.running = false;
    } catch (error) {
      throw new KafkaConnectionError(
        `Failed to disconnect consumer: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Create ConsumerMessage from Kafka payload
   */
  private createConsumerMessage(payload: EachMessagePayload): ConsumerMessage {
    const { topic, partition, message } = payload;

    return {
      topic,
      partition,
      offset: message.offset,
      key: message.key,
      value: message.value ?? Buffer.alloc(0),
      headers: this.convertHeaders(message.headers ?? {}),
      timestamp: message.timestamp,
      deserialize: <T extends Message>(schema: {
        fromBinary: (bytes: Uint8Array) => T;
      }): T => {
        return deserializeMessage(message.value ?? Buffer.alloc(0), {
          fromBinary: schema.fromBinary,
          toBinary: () => new Uint8Array(), // Not needed for deserialization
        });
      },
    };
  }

  /**
   * Handle message processing errors
   */

  private async handleMessageError(
    error: Error,
    payload: EachMessagePayload,
    _handler: MessageHandler
  ): Promise<void> {
    const { topic, partition, message } = payload;

    // Log the error
    console.error(
      `Error processing message from topic ${topic}, partition ${partition}, offset ${message.offset}:`,
      error
    );

    // If DLQ is enabled, send to DLQ
    if (this.options.dlqEnabled === true) {
      const dlqSuccess = await this.sendToDLQ(payload, error);

      // If DLQ send succeeded, don't re-throw to allow offset commit
      // This prevents infinite reprocessing loops
      if (dlqSuccess) {
        return;
      }

      // If DLQ send failed, log and continue to re-throw
      console.error(
        `DLQ send failed for message from topic ${topic}, partition ${partition}, offset ${message.offset}. Message will be reprocessed.`
      );
    }

    // Re-throw to let KafkaJS handle offset management
    // This only happens if DLQ is disabled or DLQ send failed
    throw new KafkaConsumerError(
      `Message processing failed: ${error.message}`,
      {
        topic,
        partition,
        offset: message.offset,
      }
    );
  }

  /**
   * Send failed message to Dead Letter Queue
   * @returns true if message was successfully sent to DLQ, false otherwise
   */
  private async sendToDLQ(
    payload: EachMessagePayload,
    originalError: Error
  ): Promise<boolean> {
    const { topic, message } = payload;
    const dlqTopic = `${topic}${this.options.dlqTopicSuffix ?? '.dlq'}`;

    const client = connectionPool.getClient(this.config);
    const producer = client.producer({
      idempotent: true,
      maxInFlightRequests: 1,
      retry: {
        retries: this.config.retry.maxRetries,
        initialRetryTime: this.config.retry.initialRetryTimeMs,
        maxRetryTime: this.config.retry.maxRetryTimeMs,
        multiplier: this.config.retry.multiplier,
      },
    });

    try {
      await producer.connect();

      await producer.send({
        topic: dlqTopic,
        messages: [
          {
            key: message.key,
            value: message.value ?? Buffer.alloc(0),
            headers: this.convertHeaders({
              ...message.headers,
              'x-original-topic': Buffer.from(topic, 'utf-8'),
              'x-original-partition': Buffer.from(
                String(payload.partition),
                'utf-8'
              ),
              'x-original-offset': Buffer.from(message.offset, 'utf-8'),
              'x-error-message': Buffer.from(originalError.message, 'utf-8'),
              'x-error-timestamp': Buffer.from(
                new Date().toISOString(),
                'utf-8'
              ),
            }),
          },
        ],
      });

      return true;
    } catch (dlqError) {
      // Log DLQ send failure but don't throw - we don't want DLQ failures to stop processing
      console.error(`Failed to send message to DLQ ${dlqTopic}:`, dlqError);
      return false;
    } finally {
      // Always disconnect the producer to prevent resource leaks
      try {
        await producer.disconnect();
      } catch (disconnectError) {
        // Log disconnect errors but don't throw - producer cleanup shouldn't fail the operation
        console.error(`Failed to disconnect DLQ producer:`, disconnectError);
      }
    }
  }

  /**
   * Convert headers to Kafka format
   */
  private convertHeaders(
    headers: Record<string, Buffer | string | (Buffer | string)[] | undefined>
  ): Record<string, Buffer> {
    const converted: Record<string, Buffer> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (value !== undefined) {
        if (Array.isArray(value)) {
          // Take first value if array
          const firstValue = value[0];
          if (firstValue !== undefined) {
            converted[key] =
              typeof firstValue === 'string'
                ? Buffer.from(firstValue, 'utf-8')
                : firstValue;
          }
        } else {
          converted[key] =
            typeof value === 'string' ? Buffer.from(value, 'utf-8') : value;
        }
      }
    }
    return converted;
  }
}
