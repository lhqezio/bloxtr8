/* eslint-disable no-unused-vars */
/**
 * Base error class for Kafka client errors
 */
export class KafkaClientError extends Error {
  constructor(
    message: string,
    public readonly context?: {
      topic?: string;
      partition?: number;
      offset?: string;
      key?: string | Buffer;
    }
  ) {
    super(message);
    this.name = 'KafkaClientError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Connection-related errors
 */
export class KafkaConnectionError extends KafkaClientError {
  constructor(message: string, context?: KafkaClientError['context']) {
    super(message, context);
    this.name = 'KafkaConnectionError';
  }
}

/**
 * Producer-related errors
 */
export class KafkaProducerError extends KafkaClientError {
  constructor(message: string, context?: KafkaClientError['context']) {
    super(message, context);
    this.name = 'KafkaProducerError';
  }
}

/**
 * Consumer-related errors
 */
export class KafkaConsumerError extends KafkaClientError {
  constructor(message: string, context?: KafkaClientError['context']) {
    super(message, context);
    this.name = 'KafkaConsumerError';
  }
}

/**
 * Serialization-related errors
 */
export class KafkaSerializationError extends KafkaClientError {
  constructor(message: string, context?: KafkaClientError['context']) {
    super(message, context);
    this.name = 'KafkaSerializationError';
  }
}

/**
 * Retryable error wrapper
 */
export class KafkaRetryableError extends KafkaClientError {
  constructor(
    message: string,

    public readonly originalError: Error,
    context?: KafkaClientError['context']
  ) {
    super(message, context);
    this.name = 'KafkaRetryableError';
  }
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: Error): boolean {
  // Network errors
  if (isNetworkError(error)) {
    return true;
  }

  // Timeout errors
  if (isTimeoutError(error)) {
    return true;
  }

  // KafkaJS specific retryable errors
  const errorMessage = error.message.toLowerCase();
  const retryablePatterns = [
    'broker not available',
    'connection closed',
    'request timed out',
    'network error',
    'econnrefused',
    'etimedout',
    'econnreset',
    'not leader for partition',
    'leader not available',
  ];

  return retryablePatterns.some(pattern => errorMessage.includes(pattern));
}

/**
 * Check if an error is a network error
 */
export function isNetworkError(error: Error): boolean {
  const errorMessage = error.message.toLowerCase();
  const networkPatterns = [
    'network',
    'connection',
    'econnrefused',
    'econnreset',
    'enotfound',
    'ehostunreach',
  ];

  return networkPatterns.some(pattern => errorMessage.includes(pattern));
}

/**
 * Check if an error is a timeout error
 */
export function isTimeoutError(error: Error): boolean {
  const errorMessage = error.message.toLowerCase();
  return (
    errorMessage.includes('timeout') ||
    errorMessage.includes('timed out') ||
    errorMessage.includes('etimedout')
  );
}
