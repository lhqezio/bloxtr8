/* eslint-disable no-unused-vars */
import { isRetryableError, KafkaRetryableError } from './errors.js';
import type { RetryConfig } from './types.js';

/**
 * Retry strategy interface
 */

export interface RetryStrategy {
  calculateDelay(attempt: number): number;
  shouldRetry(attempt: number, error: Error): boolean;
}

/**
 * Exponential backoff retry strategy
 */
export class ExponentialBackoffStrategy implements RetryStrategy {
  constructor(private readonly config: RetryConfig) {}

  calculateDelay(attempt: number): number {
    const delay =
      this.config.initialRetryTimeMs *
      Math.pow(this.config.multiplier, attempt);
    return Math.min(delay, this.config.maxRetryTimeMs);
  }

  shouldRetry(attempt: number, error: Error): boolean {
    if (attempt >= this.config.maxRetries) {
      return false;
    }
    return isRetryableError(error);
  }
}

/**
 * Fixed interval retry strategy
 */
export class FixedIntervalStrategy implements RetryStrategy {
  constructor(private readonly config: RetryConfig) {}

  calculateDelay(_attempt: number): number {
    return this.config.fixedIntervalMs;
  }

  shouldRetry(attempt: number, error: Error): boolean {
    if (attempt >= this.config.maxRetries) {
      return false;
    }
    return isRetryableError(error);
  }
}

/**
 * Create retry strategy from config
 */
export function createRetryStrategy(config: RetryConfig): RetryStrategy {
  switch (config.strategy) {
    case 'exponential':
      return new ExponentialBackoffStrategy(config);
    case 'fixed':
      return new FixedIntervalStrategy(config);
    default:
      return new ExponentialBackoffStrategy(config);
  }
}

/**
 * Execute a function with retry logic
 */
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig
): Promise<T> {
  const strategy = createRetryStrategy(config);
  let lastError: Error | undefined;
  let attempt = 0;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (!strategy.shouldRetry(attempt, lastError)) {
        throw new KafkaRetryableError(
          `Failed after ${attempt + 1} attempts`,
          lastError
        );
      }

      const delay = strategy.calculateDelay(attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
      attempt++;
    }
  }
}
