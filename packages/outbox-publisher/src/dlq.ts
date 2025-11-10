import { type KafkaProducer } from '@bloxtr8/kafka-client';

import { OutboxDLQError } from './errors.js';
import type { DLQMessage, OutboxEvent } from './types.js';

/**
 * Create a DLQ message from a failed event
 */
export function createDLQMessage(
  event: OutboxEvent,
  originalTopic: string,
  error: Error,
  errorType: 'TRANSIENT' | 'PERMANENT' | 'POISON',
  retryCount: number,
  metadata?: Record<string, string>
): DLQMessage {
  return {
    originalTopic,
    originalEventId: event.id,
    originalAggregateId: event.aggregateId,
    originalEventType: event.eventType,
    originalPayload: Buffer.from(event.payload),
    errorType,
    errorMessage: error.message,
    retryCount,
    failedAt: new Date().toISOString(),
    metadata,
  };
}

/**
 * Send a failed event to the DLQ topic
 */
export async function sendToDLQ(
  producer: KafkaProducer,
  event: OutboxEvent,
  originalTopic: string,
  error: Error,
  errorType: 'TRANSIENT' | 'PERMANENT' | 'POISON',
  retryCount: number,
  dlqTopicSuffix: string,
  metadata?: Record<string, string>
): Promise<void> {
  const dlqTopic = `${originalTopic}${dlqTopicSuffix}`;
  const dlqMessage = createDLQMessage(
    event,
    originalTopic,
    error,
    errorType,
    retryCount,
    metadata
  );

  try {
    // Serialize DLQ message as JSON
    const payload = Buffer.from(JSON.stringify(dlqMessage), 'utf-8');

    await producer.send(dlqTopic, {
      key: event.id, // Use event ID as key for ordering
      value: payload,
      headers: {
        'content-type': 'application/json',
        'x-dlq-original-topic': originalTopic,
        'x-dlq-event-id': event.id,
        'x-dlq-error-type': errorType,
      },
    });
  } catch (dlqError) {
    throw new OutboxDLQError(
      `Failed to send event to DLQ: ${dlqError instanceof Error ? dlqError.message : String(dlqError)}`,
      dlqError instanceof Error ? dlqError : undefined,
      {
        eventId: event.id,
        topic: dlqTopic,
        aggregateId: event.aggregateId,
      }
    );
  }
}

/**
 * Check if an error is permanent (should go to DLQ immediately)
 */
export function isPermanentError(error: Error): boolean {
  const errorMessage = error.message.toLowerCase();

  // Permanent errors that won't resolve on retry
  const permanentPatterns = [
    'invalid topic',
    'malformed',
    'serialization',
    'deserialization',
    'invalid payload',
    'unauthorized',
    'forbidden',
    'not found',
    'invalid event type',
  ];

  return permanentPatterns.some(pattern => errorMessage.includes(pattern));
}
