import { prisma } from '@bloxtr8/database';
import { type KafkaProducer, isRetryableError } from '@bloxtr8/kafka-client';

import { sendToDLQ, isPermanentError } from './dlq.js';
import { claimEventInTransaction, markAsPublished } from './idempotency.js';
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
 * Process events using transactions to atomically claim events.
 * This prevents multiple publisher instances from processing the same events concurrently.
 *
 * Flow:
 * 1. Short transaction: Atomically fetch event with lock (but don't mark as published yet)
 *    This ensures only one instance can claim each event, preventing duplicate Kafka publishing
 * 2. Process event outside transaction: Publish to Kafka, then mark as published
 *    Retries with exponential backoff happen here without holding database locks
 *    Events are marked as published AFTER successful Kafka send to prevent duplicates
 */
export async function processEventsInTransaction(
  producer: KafkaProducer,
  config: Required<OutboxPublisherConfig>,
  batchSize: number
): Promise<PublishResult[]> {
  const results: PublishResult[] = [];

  // Process events one-by-one
  for (let i = 0; i < batchSize; i++) {
    let event: OutboxEvent | null = null;

    try {
      // Short transaction: atomically fetch event with lock (but don't mark as published yet)
      // This ensures only one instance can claim each event, preventing race conditions
      event = await prisma.$transaction(
        async tx => {
          return await claimEventInTransaction(tx);
        },
        {
          // Use read committed isolation level to allow concurrent transactions
          // FOR UPDATE SKIP LOCKED will still prevent duplicate processing
          isolationLevel: 'ReadCommitted',
        }
      );

      if (!event) {
        // No more events available
        break;
      }

      // Process the event outside the transaction
      // Retries with exponential backoff happen here without holding database locks
      // The event will be marked as published AFTER successful Kafka send
      const processResult = await processEvent(producer, event, config);

      results.push(processResult);
    } catch (error) {
      // Error fetching event or processing - log and continue
      console.error('Error processing event:', error);
      results.push({
        success: false,
        eventId: event?.id || 'unknown',
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  return results;
}

/**
 * Process a single event: publish to Kafka and mark as published.
 * The event is marked as published AFTER successful Kafka send to prevent duplicate publishing
 * if marking fails after Kafka succeeds. If Kafka send succeeds but marking fails, we still
 * return success to prevent retries (Kafka already has the message).
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
    // Mark as published after DLQ send (or if DLQ disabled) to prevent retries
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
        // Mark as published after successful DLQ send
        try {
          await markAsPublished(event.id);
        } catch (markError) {
          // If marking fails, log but don't fail - DLQ already has the message
          console.warn(
            `Failed to mark event ${event.id} as published after DLQ send:`,
            markError
          );
        }
        return {
          success: false,
          eventId: event.id,
          topic: fallbackTopic,
          error,
          sentToDLQ: true,
          isPermanentError: true,
        };
      } catch (dlqError) {
        // DLQ failed - mark as published to prevent retries
        try {
          await markAsPublished(event.id);
        } catch (markError) {
          // If marking fails, log but continue - we'll mark it on next attempt
          console.warn(
            `Failed to mark event ${event.id} as published after DLQ failure:`,
            markError
          );
        }
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
      // DLQ disabled - mark as published to prevent retries
      try {
        await markAsPublished(event.id);
      } catch (markError) {
        // If marking fails, log but continue - we'll mark it on next attempt
        console.warn(
          `Failed to mark event ${event.id} as published:`,
          markError
        );
      }
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
        key: event.aggregateId, // Use aggregateId as key for partitioning
        value: Buffer.from(event.payload),
        headers: {
          'content-type': 'application/protobuf',
          'x-event-type': event.eventType,
          'x-event-id': event.id,
          'x-event-version': event.version.toString(),
        },
      });

      // Kafka send succeeded - now mark as published
      // If marking fails, we still return success to prevent retries
      // (Kafka already has the message, so we shouldn't publish again)
      try {
        await markAsPublished(event.id);
      } catch (markError) {
        // If marking fails after successful Kafka send, log but return success
        // This prevents duplicate publishing - Kafka already has the message
        console.warn(
          `Kafka send succeeded but failed to mark event ${event.id} as published:`,
          markError
        );
        // Return success anyway - Kafka has the message, so we shouldn't retry
        return {
          success: true,
          eventId: event.id,
          topic,
        };
      }

      // Success - Kafka send succeeded and event marked as published
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
            // Mark as published after successful DLQ send
            try {
              await markAsPublished(event.id);
            } catch (markError) {
              console.warn(
                `Failed to mark event ${event.id} as published after DLQ send:`,
                markError
              );
            }
            return {
              success: false,
              eventId: event.id,
              topic,
              error: lastError,
              sentToDLQ: true,
              isPermanentError: true,
            };
          } catch (dlqError) {
            // DLQ failed - mark as published to prevent retries
            try {
              await markAsPublished(event.id);
            } catch (markError) {
              console.warn(
                `Failed to mark event ${event.id} as published after DLQ failure:`,
                markError
              );
            }
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
          // DLQ disabled - mark as published to prevent retries
          try {
            await markAsPublished(event.id);
          } catch (markError) {
            console.warn(
              `Failed to mark event ${event.id} as published:`,
              markError
            );
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
            // Mark as published after successful DLQ send
            try {
              await markAsPublished(event.id);
            } catch (markError) {
              console.warn(
                `Failed to mark event ${event.id} as published after DLQ send:`,
                markError
              );
            }
            return {
              success: false,
              eventId: event.id,
              topic,
              error: lastError,
              sentToDLQ: true,
              isPermanentError: true,
            };
          } catch (dlqError) {
            // DLQ failed - mark as published to prevent retries
            try {
              await markAsPublished(event.id);
            } catch (markError) {
              console.warn(
                `Failed to mark event ${event.id} as published after DLQ failure:`,
                markError
              );
            }
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
          // DLQ disabled - mark as published to prevent retries
          try {
            await markAsPublished(event.id);
          } catch (markError) {
            console.warn(
              `Failed to mark event ${event.id} as published:`,
              markError
            );
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
      // Mark as published after successful DLQ send
      try {
        await markAsPublished(event.id);
      } catch (markError) {
        console.warn(
          `Failed to mark event ${event.id} as published after DLQ send:`,
          markError
        );
      }
      return {
        success: false,
        eventId: event.id,
        topic,
        error: lastError,
        sentToDLQ: true,
        isPermanentError: true,
      };
    } catch (dlqError) {
      // DLQ failed - mark as published to prevent retries
      try {
        await markAsPublished(event.id);
      } catch (markError) {
        console.warn(
          `Failed to mark event ${event.id} as published after DLQ failure:`,
          markError
        );
      }
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

  // DLQ disabled or failed - mark as published to prevent retries
  try {
    await markAsPublished(event.id);
  } catch (markError) {
    console.warn(`Failed to mark event ${event.id} as published:`, markError);
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
