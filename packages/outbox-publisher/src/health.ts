import { prisma } from '@bloxtr8/database';
import { type KafkaProducer } from '@bloxtr8/kafka-client';

import type { HealthCheckResult } from './types.js';

/**
 * Check the health of the outbox publisher
 */
export async function checkHealth(
  producer: KafkaProducer
): Promise<HealthCheckResult> {
  const result: HealthCheckResult = {
    status: 'healthy',
    database: {
      connected: false,
    },
    kafka: {
      connected: false,
    },
    unpublishedEvents: {
      count: 0,
    },
  };

  // Check database connectivity
  try {
    await prisma.$queryRaw`SELECT 1`;
    result.database.connected = true;
  } catch (error) {
    result.database.connected = false;
    result.database.error =
      error instanceof Error ? error.message : String(error);
    result.status = 'unhealthy';
  }

  // Check Kafka connectivity
  try {
    // Try to connect if not already connected
    await producer.connect();
    result.kafka.connected = true;
  } catch (error) {
    result.kafka.connected = false;
    result.kafka.error = error instanceof Error ? error.message : String(error);
    if (result.status === 'healthy') {
      result.status = 'degraded';
    }
  }

  // Count unpublished events
  try {
    const count = await prisma.outbox.count({
      where: {
        publishedAt: null,
      },
    });
    result.unpublishedEvents.count = count;

    // If there are many unpublished events, consider it degraded
    if (count > 1000 && result.status === 'healthy') {
      result.status = 'degraded';
      result.details = {
        warning: 'High number of unpublished events',
        count,
      };
    }
  } catch (error) {
    // If we can't count, database is unhealthy
    if (result.status === 'healthy') {
      result.status = 'degraded';
    }
    result.details = {
      error: 'Failed to count unpublished events',
      message: error instanceof Error ? error.message : String(error),
    };
  }

  return result;
}
