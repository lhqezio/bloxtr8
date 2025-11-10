/* eslint-disable no-unused-vars */
import type { Message } from '@bufbuild/protobuf';
import type { Producer } from 'kafkajs';

import { connectionPool } from './connection-pool.js';
import {
  KafkaProducerError,
  KafkaConnectionError,
  KafkaSerializationError,
  isRetryableError,
} from './errors.js';
import { executeWithRetry } from './retry.js';
import { serializeMessage } from './serialization.js';
import type {
  KafkaClientConfig,
  ProducerMessage,
  RecordMetadata,
} from './types.js';

/**
 * Kafka producer client
 */
export class KafkaProducer {
  private producer: Producer;
  private connected = false;

  constructor(private readonly config: KafkaClientConfig) {
    const client = connectionPool.getClient(config);
    this.producer = client.producer({
      idempotent: true,
      maxInFlightRequests: 1,
      retry: {
        retries: config.retry.maxRetries,
        initialRetryTime: config.retry.initialRetryTimeMs,
        maxRetryTime: config.retry.maxRetryTimeMs,
        multiplier: config.retry.multiplier,
      },
    });
  }

  /**
   * Connect the producer
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      await this.producer.connect();
      this.connected = true;
    } catch (error) {
      throw new KafkaConnectionError(
        `Failed to connect producer: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Send a single message
   */
  async send(topic: string, message: ProducerMessage): Promise<RecordMetadata> {
    await this.ensureConnected();

    const value = this.serializeValue(message.value);

    const key =
      typeof message.key === 'string'
        ? Buffer.from(message.key, 'utf-8')
        : message.key;

    const headers = this.serializeHeaders(message.headers);

    return executeWithRetry(async () => {
      const result = await this.producer.send({
        topic,
        messages: [
          {
            key,
            value,
            headers,
            timestamp: message.timestamp?.toString(),
          },
        ],
      });

      const record = result[0];
      if (!record) {
        throw new KafkaProducerError('No record returned from producer');
      }

      return {
        topicName: record.topicName,
        partition: record.partition,
        errorCode: record.errorCode,
        offset: record.offset ?? '',
        timestamp: record.timestamp ?? '',
      };
    }, this.config.retry).catch(error => {
      if (isRetryableError(error)) {
        throw new KafkaProducerError(
          `Failed to send message after retries: ${error.message}`,
          { topic }
        );
      }
      throw new KafkaProducerError(`Failed to send message: ${error.message}`, {
        topic,
      });
    });
  }

  /**
   * Send multiple messages in a batch
   */
  async sendBatch(
    topic: string,
    messages: ProducerMessage[]
  ): Promise<RecordMetadata[]> {
    await this.ensureConnected();

    const kafkaMessages = messages.map(msg => {
      const value = this.serializeValue(msg.value);

      const key =
        typeof msg.key === 'string' ? Buffer.from(msg.key, 'utf-8') : msg.key;

      const headers = this.serializeHeaders(msg.headers);

      return {
        key,
        value,
        headers,
        timestamp: msg.timestamp?.toString(),
      };
    });

    return executeWithRetry(async () => {
      const result = await this.producer.send({
        topic,
        messages: kafkaMessages,
      });

      return result.map(record => ({
        topicName: record.topicName,
        partition: record.partition,
        errorCode: record.errorCode,
        offset: record.offset ?? '',
        timestamp: record.timestamp ?? '',
      }));
    }, this.config.retry).catch(error => {
      if (isRetryableError(error)) {
        throw new KafkaProducerError(
          `Failed to send batch after retries: ${error.message}`,
          { topic }
        );
      }
      throw new KafkaProducerError(`Failed to send batch: ${error.message}`, {
        topic,
      });
    });
  }

  /**
   * Disconnect the producer
   */
  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    try {
      await this.producer.disconnect();
      this.connected = false;
    } catch (error) {
      throw new KafkaConnectionError(
        `Failed to disconnect producer: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Ensure producer is connected
   */
  private async ensureConnected(): Promise<void> {
    if (!this.connected) {
      await this.connect();
    }
  }

  /**
   * Serialize message value to Buffer
   */
  private serializeValue(value: Buffer | Message): Buffer {
    if (value instanceof Buffer) {
      return value;
    }

    // Try to get schema from Message's $type property (bufbuild/protobuf v2)
    const message = value as Message & {
      $type?: { toBinary: (msg: Message) => Uint8Array };
    };
    if (message.$type && typeof message.$type.toBinary === 'function') {
      return serializeMessage(message, {
        toBinary: message.$type.toBinary,
        fromBinary: () => message, // Not needed for serialization
      });
    }

    // If no $type, throw error asking for Buffer or Message with schema
    throw new KafkaSerializationError(
      'Cannot serialize Message without schema. Pass a Buffer or ensure the Message has a $type property.'
    );
  }

  /**
   * Serialize headers to Kafka format
   */
  private serializeHeaders(
    headers?: Record<string, string | Buffer>
  ): Record<string, Buffer> | undefined {
    if (!headers) {
      return undefined;
    }

    const serialized: Record<string, Buffer> = {};
    for (const [key, value] of Object.entries(headers)) {
      serialized[key] =
        typeof value === 'string' ? Buffer.from(value, 'utf-8') : value;
    }
    return serialized;
  }
}
