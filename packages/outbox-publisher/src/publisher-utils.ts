import { type KafkaProducer, isRetryableError } from '@bloxtr8/kafka-client';

import { sendToDLQ, isPermanentError } from './dlq.js';
import { markAsPublished, checkAlreadyPublished } from './idempotency.js';
import type {
  OutboxEvent,
  PublishResult,
  OutboxPublisherConfig,
} from './types.js';

/**
 * Calculate exponential backoff delay
 */
function calculateBackoff(attempt: number, baseDelayMs: number): number {
  return Math.min(baseDelayMs * Math.pow(2, attempt), 30000); // Max 30 seconds
}

/**
 * Process a single event: publish to Kafka and mark as published
 */
export async function processEvent(
  producer: KafkaProducer,
  event: OutboxEvent,
  config: Required<OutboxPublisherConfig>
): Promise<PublishResult> {
  const topic = config.topicMapping[event.eventType];

  if (!topic) {
    const error = new Error(
      `No topic mapping found for event type: ${event.eventType}`
    );
    return {
      success: false,
      eventId: event.id,
      error,
    };
  }

  let lastError: Error | undefined;
  let attempt = 0;

  // Retry loop for transient errors
  while (attempt < config.maxRetries) {
    try {
      // Check if already published (idempotency check)
      const alreadyPublished = await checkAlreadyPublished(event.id);
      if (alreadyPublished) {
        // Event was already published by another instance
        return {
          success: true,
          eventId: event.id,
          topic,
        };
      }

      // Publish to Kafka
      await producer.send(topic, {
        key: event.aggregateId, // Use aggregateId as key for partitioning
        value: Buffer.from(event.payload),
        headers: {
          'content-type': 'application/protobuf',
          'x-event-type': event.eventType,
          'x-event-id': event.id,
          'x-event-version': event.version.toString(),
        },
      });

      // Success - mark as published only after successful Kafka acknowledgment
      const marked = await markAsPublished(event.id);
      if (!marked) {
        // Another instance published it - still success
        return {
          success: true,
          eventId: event.id,
          topic,
        };
      }

      return {
        success: true,
        eventId: event.id,
        topic,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if it's a permanent error
      if (isPermanentError(lastError)) {
        // Send to DLQ immediately for permanent errors
        if (config.dlqEnabled) {
          try {
            await sendToDLQ(
              producer,
              event,
              topic,
              lastError,
              'PERMANENT',
              attempt,
              config.dlqTopicSuffix
            );
            // Mark as published to prevent reprocessing
            await markAsPublished(event.id);
            return {
              success: false,
              eventId: event.id,
              topic,
              error: lastError,
              sentToDLQ: true,
            };
          } catch (dlqError) {
            // DLQ failed - log but don't mark as published
            return {
              success: false,
              eventId: event.id,
              topic,
              error: dlqError instanceof Error ? dlqError : lastError,
              sentToDLQ: false,
            };
          }
        } else {
          // DLQ disabled - mark as published to prevent infinite retries
          await markAsPublished(event.id);
          return {
            success: false,
            eventId: event.id,
            topic,
            error: lastError,
            sentToDLQ: false,
          };
        }
      }

      // Check if error is retryable
      if (!isRetryableError(lastError)) {
        // Non-retryable error - send to DLQ
        if (config.dlqEnabled) {
          try {
            await sendToDLQ(
              producer,
              event,
              topic,
              lastError,
              'PERMANENT',
              attempt,
              config.dlqTopicSuffix
            );
            await markAsPublished(event.id);
            return {
              success: false,
              eventId: event.id,
              topic,
              error: lastError,
              sentToDLQ: true,
            };
          } catch (dlqError) {
            return {
              success: false,
              eventId: event.id,
              topic,
              error: dlqError instanceof Error ? dlqError : lastError,
              sentToDLQ: false,
            };
          }
        } else {
          await markAsPublished(event.id);
          return {
            success: false,
            eventId: event.id,
            topic,
            error: lastError,
            sentToDLQ: false,
          };
        }
      }

      // Retryable error - wait and retry
      attempt++;
      if (attempt < config.maxRetries) {
        const backoff = calculateBackoff(attempt - 1, config.retryBackoffMs);
        await new Promise(resolve => setTimeout(resolve, backoff));
      }
    }
  }

  // Max retries exceeded - send to DLQ
  if (config.dlqEnabled && lastError) {
    try {
      await sendToDLQ(
        producer,
        event,
        topic,
        lastError,
        'TRANSIENT',
        attempt,
        config.dlqTopicSuffix
      );
      await markAsPublished(event.id);
      return {
        success: false,
        eventId: event.id,
        topic,
        error: lastError,
        sentToDLQ: true,
      };
    } catch (dlqError) {
      return {
        success: false,
        eventId: event.id,
        topic,
        error: dlqError instanceof Error ? dlqError : lastError,
        sentToDLQ: false,
      };
    }
  }

  // DLQ disabled or failed - mark as published to prevent infinite retries
  await markAsPublished(event.id);
  return {
    success: false,
    eventId: event.id,
    topic,
    error: lastError,
    sentToDLQ: false,
  };
}
