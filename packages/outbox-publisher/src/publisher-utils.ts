import { prisma } from '@bloxtr8/database';
import { type KafkaProducer, isRetryableError } from '@bloxtr8/kafka-client';

import { sendToDLQ, isPermanentError } from './dlq.js';
import {
  claimEventInTransaction,
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
 * Process events using transactions to atomically claim and mark events.
 * This prevents multiple publisher instances from processing the same events concurrently.
 *
 * Flow:
 * 1. Transaction: Atomically fetch event with lock AND mark as published in same transaction
 *    This ensures only one instance can claim each event, preventing duplicate Kafka publishing
 *    The lock is held until the transaction commits, ensuring atomicity
 * 2. Process event outside transaction: Publish to Kafka with retries
 *    If Kafka publishing fails, send to DLQ (event is already marked as published to prevent retries)
 *    Retries with exponential backoff happen here without holding database locks
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
      // Transaction: atomically fetch event with lock AND mark as published
      // This ensures only one instance can claim each event, preventing race conditions
      // The lock is held until the transaction commits, ensuring no other instance
      // can claim the same event before it's marked as published
      event = await prisma.$transaction(
        async tx => {
          const claimedEvent = await claimEventInTransaction(tx);
          if (!claimedEvent) {
            return null;
          }

          // Mark as published within the same transaction to prevent duplicate claiming
          // This ensures atomicity: if we claim it, we mark it as published immediately
          // If Kafka publishing fails later, we'll send to DLQ instead of retrying
          const marked = await markAsPublishedInTransaction(
            tx,
            claimedEvent.id
          );
          if (!marked) {
            // Event was already published by another instance (shouldn't happen with lock)
            return null;
          }

          return claimedEvent;
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
      // Event is already marked as published, so if Kafka fails, we send to DLQ
      // Retries with exponential backoff happen here without holding database locks
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
 * Process a single event: publish to Kafka.
 * The event is already marked as published in the transaction that claimed it,
 * preventing duplicate processing by multiple instances. If Kafka publishing fails,
 * the event is sent to DLQ (it's already marked as published to prevent retries).
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
    // Event is already marked as published in the transaction, so no need to mark again
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
        // DLQ failed - event is already marked as published, so it won't be retried
        console.error(
          `Failed to send unmapped event ${event.id} to DLQ:`,
          dlqError
        );
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
      // DLQ disabled - event is already marked as published, so it won't be retried
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

      // Success - Kafka send succeeded
      // Event is already marked as published in the transaction
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
        // Event is already marked as published in the transaction
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
            // DLQ failed - event is already marked as published, so it won't be retried
            console.error(`Failed to send event ${event.id} to DLQ:`, dlqError);
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
          // DLQ disabled - event is already marked as published, so it won't be retried
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
        // Event is already marked as published in the transaction
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
            // DLQ failed - event is already marked as published, so it won't be retried
            console.error(`Failed to send event ${event.id} to DLQ:`, dlqError);
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
          // DLQ disabled - event is already marked as published, so it won't be retried
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
  // Event is already marked as published in the transaction
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
      // DLQ failed - event is already marked as published, so it won't be retried
      console.error(`Failed to send event ${event.id} to DLQ:`, dlqError);
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

  // DLQ disabled or failed - event is already marked as published, so it won't be retried
  return {
    success: false,
    eventId: event.id,
    topic,
    error: lastError,
    sentToDLQ: false,
    isPermanentError: true,
  };
}
