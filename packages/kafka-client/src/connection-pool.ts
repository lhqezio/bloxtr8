import { Kafka } from 'kafkajs';

import type { KafkaClientConfig, ConnectionPoolEntry } from './types.js';

/**
 * Connection pool singleton for managing Kafka client instances
 */
class ConnectionPool {
  private connections: Map<string, ConnectionPoolEntry> = new Map();

  /**
   * Get or create a Kafka client for the given configuration
   */
  getClient(config: KafkaClientConfig): Kafka {
    const key = this.getConnectionKey(config);

    const existing = this.connections.get(key);
    if (existing) {
      existing.lastUsed = Date.now();
      return existing.client;
    }

    const client = new Kafka({
      clientId: config.clientId,
      brokers: config.brokers,
      connectionTimeout: config.connectionTimeout ?? 3000,
      requestTimeout: config.requestTimeout ?? 30000,
      retry: {
        retries: config.retry.maxRetries,
        initialRetryTime: config.retry.initialRetryTimeMs,
        maxRetryTime: config.retry.maxRetryTimeMs,
        multiplier: config.retry.multiplier,
      },
      logLevel: this.mapLogLevel(config.logLevel ?? 'INFO'),
    });

    this.connections.set(key, {
      client,
      config,
      lastUsed: Date.now(),
    });

    return client;
  }

  /**
   * Disconnect all clients
   */
  async disconnectAll(): Promise<void> {
    // KafkaJS clients don't have a disconnect method
    // Producers and consumers manage their own connections
    this.connections.clear();
  }

  /**
   * Get the number of active connections
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Generate connection key from config
   */
  private getConnectionKey(config: KafkaClientConfig): string {
    return `${config.brokers.join(',')}-${config.clientId}`;
  }

  /**
   * Map log level string to KafkaJS log level
   */
  private mapLogLevel(level: string): 0 | 1 | 2 | 4 | 5 {
    switch (level) {
      case 'NOTHING':
        return 0;
      case 'ERROR':
        return 1;
      case 'WARN':
        return 2;
      case 'INFO':
        return 4;
      case 'DEBUG':
        return 5;
      default:
        return 4;
    }
  }
}

/**
 * Singleton instance
 */
export const connectionPool = new ConnectionPool();
