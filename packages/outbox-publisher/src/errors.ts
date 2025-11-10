/**
 * Base error class for outbox publisher errors
 */
export class OutboxPublisherError extends Error {
  constructor(
    message: string,
    // eslint-disable-next-line no-unused-vars
    public readonly context?: {
      eventId?: string;
      topic?: string;
      aggregateId?: string;
    }
  ) {
    super(message);
    this.name = 'OutboxPublisherError';
    // Error.captureStackTrace is a Node.js-specific feature
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error thrown when publishing fails
 */
export class OutboxPublishError extends OutboxPublisherError {
  constructor(
    message: string,
    // eslint-disable-next-line no-unused-vars
    public readonly originalError?: Error,
    context?: OutboxPublisherError['context']
  ) {
    super(message, context);
    this.name = 'OutboxPublishError';
  }
}

/**
 * Error thrown when DLQ publishing fails
 */
export class OutboxDLQError extends OutboxPublisherError {
  constructor(
    message: string,
    // eslint-disable-next-line no-unused-vars
    public readonly originalError?: Error,
    context?: OutboxPublisherError['context']
  ) {
    super(message, context);
    this.name = 'OutboxDLQError';
  }
}
