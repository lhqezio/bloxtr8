import { prisma } from '@bloxtr8/database';
import { type KafkaProducer, isRetryableError } from '@bloxtr8/kafka-client';

import { sendToDLQ, isPermanentError } from './dlq.js';
import {
  markAsPublished,
  checkAlreadyPublished,
  getUnpublishedEventInTransaction,
  markAsPublishedInTransaction,
} from './idempotency.js';
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
 * Process events within transactions to ensure row locks are held during processing.
 * This prevents multiple publisher instances from processing the same events concurrently.
 * Events are processed sequentially, one per transaction.
 */
export async function processEventsInTransaction(
  producer: KafkaProducer,
  config: Required<OutboxPublisherConfig>,
  batchSize: number
): Promise<PublishResult[]> {
  const results: PublishResult[] = [];

  // Process events one-by-one in transactions to hold locks during processing
  for (let i = 0; i < batchSize; i++) {
    try {
      const result = await prisma.$transaction(
        async tx => {
          // Fetch event with lock (lock held until transaction commits)
          const event = await getUnpublishedEventInTransaction(tx);

          if (!event) {
            // No more events available
            return null;
          }

          // Process the event (publish to Kafka, handle errors, etc.)
          // The lock is held during this processing
          const processResult = await processEventInTransaction(
            producer,
            event,
            config,
            tx
          );

          // Mark as published within the same transaction
          // This ensures atomicity: if Kafka publish succeeds, we mark as published
          // If Kafka publish fails and we send to DLQ, we still mark as published
          // For permanent errors, we MUST mark as published even if DLQ fails to prevent infinite retries
          // Note: processEventInTransaction handles all retries internally, so by the time it returns,
          // all retry attempts have been exhausted. We always mark as published to prevent infinite retries.
          await markAsPublishedInTransaction(tx, event.id);

          return processResult;
        },
        {
          // Use read committed isolation level to allow concurrent transactions
          // FOR UPDATE SKIP LOCKED will still prevent duplicate processing
          isolationLevel: 'ReadCommitted',
        }
      );

      if (result === null) {
        // No more events available
        break;
      }

      results.push(result);
    } catch (error) {
      // Transaction failed - log and continue with next event
      console.error('Error processing event in transaction:', error);
      results.push({
        success: false,
        eventId: 'unknown',
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  return results;
}

/**
 * Process a single event within a transaction context.
 * This is similar to processEvent but designed to work within a transaction.
 */
async function processEventInTransaction(
  producer: KafkaProducer,
  event: OutboxEvent,
  config: Required<OutboxPublisherConfig>,
  // eslint-disable-next-line no-unused-vars
  _tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
): Promise<PublishResult> {
  const topic = config.topicMapping[event.eventType];

  if (!topic) {
    // Unmapped event type - treat as permanent error
    const error = new Error(
      `No topic mapping found for event type: ${event.eventType}`
    );

    const fallbackTopic = 'outbox.unmapped';

    if (config.dlqEnabled) {
      try {
        await sendToDLQ(
          producer,
          event,
          fallbackTopic,
          error,
          'PERMANENT',
          0,
          config.dlqTopicSuffix,
          {
            reason: 'unmapped_event_type',
            eventType: event.eventType,
          }
        );
        return {
          success: false,
          eventId: event.id,
          topic: fallbackTopic,
          error,
          sentToDLQ: true,
          isPermanentError: true,
        };
      } catch (dlqError) {
        // DLQ failed, but this is a permanent error - mark as published to prevent infinite retries
        return {
          success: false,
          eventId: event.id,
          topic: fallbackTopic,
          error: dlqError instanceof Error ? dlqError : error,
          sentToDLQ: false,
          isPermanentError: true,
        };
      }
    } else {
      // DLQ disabled, but this is a permanent error - mark as published to prevent infinite retries
      return {
        success: false,
        eventId: event.id,
        topic: fallbackTopic,
        error,
        sentToDLQ: false,
        isPermanentError: true,
      };
    }
  }

  let lastError: Error | undefined;
  let attempt = 0;

  // Retry loop for transient errors
  while (attempt < config.maxRetries) {
    try {
      // Publish to Kafka
      await producer.send(topic, {
        key: event.aggregateId,
        value: Buffer.from(event.payload),
        headers: {
          'content-type': 'application/protobuf',
          'x-event-type': event.eventType,
          'x-event-id': event.id,
          'x-event-version': event.version.toString(),
        },
      });

      // Success
      return {
        success: true,
        eventId: event.id,
        topic,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if it's a permanent error
      if (isPermanentError(lastError)) {
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
            return {
              success: false,
              eventId: event.id,
              topic,
              error: lastError,
              sentToDLQ: true,
              isPermanentError: true,
            };
          } catch (dlqError) {
            // DLQ failed, but this is a permanent error - mark as published to prevent infinite retries
            return {
              success: false,
              eventId: event.id,
              topic,
              error: dlqError instanceof Error ? dlqError : lastError,
              sentToDLQ: false,
              isPermanentError: true,
            };
          }
        } else {
          // DLQ disabled, but this is a permanent error - mark as published to prevent infinite retries
          return {
            success: false,
            eventId: event.id,
            topic,
            error: lastError,
            sentToDLQ: false,
            isPermanentError: true,
          };
        }
      }

      // Check if error is retryable
      if (!isRetryableError(lastError)) {
        // Non-retryable errors are treated as permanent
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
            return {
              success: false,
              eventId: event.id,
              topic,
              error: lastError,
              sentToDLQ: true,
              isPermanentError: true,
            };
          } catch (dlqError) {
            // DLQ failed, but this is a permanent error - mark as published to prevent infinite retries
            return {
              success: false,
              eventId: event.id,
              topic,
              error: dlqError instanceof Error ? dlqError : lastError,
              sentToDLQ: false,
              isPermanentError: true,
            };
          }
        } else {
          // DLQ disabled, but this is a permanent error - mark as published to prevent infinite retries
          return {
            success: false,
            eventId: event.id,
            topic,
            error: lastError,
            sentToDLQ: false,
            isPermanentError: true,
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
  // This is treated as a permanent error state since all retries have been exhausted
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
      return {
        success: false,
        eventId: event.id,
        topic,
        error: lastError,
        sentToDLQ: true,
        isPermanentError: true,
      };
    } catch (dlqError) {
      return {
        success: false,
        eventId: event.id,
        topic,
        error: dlqError instanceof Error ? dlqError : lastError,
        sentToDLQ: false,
        isPermanentError: true,
      };
    }
  }

  return {
    success: false,
    eventId: event.id,
    topic,
    error: lastError,
    sentToDLQ: false,
    isPermanentError: true,
  };
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
    // Unmapped event type - treat as permanent error
    const error = new Error(
      `No topic mapping found for event type: ${event.eventType}`
    );

    // Use a fallback topic for DLQ: outbox.unmapped.dlq
    const fallbackTopic = 'outbox.unmapped';

    // Send to DLQ if enabled
    if (config.dlqEnabled) {
      try {
        await sendToDLQ(
          producer,
          event,
          fallbackTopic,
          error,
          'PERMANENT',
          0,
          config.dlqTopicSuffix,
          {
            reason: 'unmapped_event_type',
            eventType: event.eventType,
          }
        );
        // Mark as published to prevent reprocessing
        await markAsPublished(event.id);
        return {
          success: false,
          eventId: event.id,
          topic: fallbackTopic,
          error,
          sentToDLQ: true,
          isPermanentError: true,
        };
      } catch (dlqError) {
        // DLQ failed - still mark as published to prevent infinite retries
        await markAsPublished(event.id);
        return {
          success: false,
          eventId: event.id,
          topic: fallbackTopic,
          error: dlqError instanceof Error ? dlqError : error,
          sentToDLQ: false,
          isPermanentError: true,
        };
      }
    } else {
      // DLQ disabled - mark as published to prevent infinite retries
      await markAsPublished(event.id);
      return {
        success: false,
        eventId: event.id,
        topic: fallbackTopic,
        error,
        sentToDLQ: false,
        isPermanentError: true,
      };
    }
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
              isPermanentError: true,
            };
          } catch (dlqError) {
            // DLQ failed, but this is a permanent error - mark as published to prevent infinite retries
            await markAsPublished(event.id);
            return {
              success: false,
              eventId: event.id,
              topic,
              error: dlqError instanceof Error ? dlqError : lastError,
              sentToDLQ: false,
              isPermanentError: true,
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
            isPermanentError: true,
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
              isPermanentError: true,
            };
          } catch (dlqError) {
            // DLQ failed, but this is a permanent error - mark as published to prevent infinite retries
            await markAsPublished(event.id);
            return {
              success: false,
              eventId: event.id,
              topic,
              error: dlqError instanceof Error ? dlqError : lastError,
              sentToDLQ: false,
              isPermanentError: true,
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
            isPermanentError: true,
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
  // This is treated as a permanent error state since all retries have been exhausted
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
        isPermanentError: true,
      };
    } catch (dlqError) {
      // DLQ failed, but max retries exceeded - mark as published to prevent infinite retries
      await markAsPublished(event.id);
      return {
        success: false,
        eventId: event.id,
        topic,
        error: dlqError instanceof Error ? dlqError : lastError,
        sentToDLQ: false,
        isPermanentError: true,
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
    isPermanentError: true,
  };
}
