import {
  createChildContext,
  getTraceContext,
  serializeContext,
} from './context.js';
import type { KafkaTraceHeaders, TraceContext } from './types.js';

/**
 * Minimal interface for Kafka producer message
 * Used to avoid circular dependency with @bloxtr8/kafka-client
 */
export interface KafkaProducerMessage {
  key: string | Buffer;
  value: Buffer | unknown;
  headers?: Record<string, string | Buffer>;
  timestamp?: string | number;
}

/**
 * Extract trace context from Kafka message headers
 */
export function extractTraceContext(
  headers: Record<string, Buffer | undefined>
): TraceContext | null {
  const traceId = getHeaderValue(headers, 'X-Trace-Id');
  const spanId = getHeaderValue(headers, 'X-Span-Id');

  if (!traceId || !spanId) {
    return null;
  }

  const context: TraceContext = {
    traceId,
    spanId,
  };

  const parentSpanId = getHeaderValue(headers, 'X-Parent-Span-Id');
  if (parentSpanId) {
    context.parentSpanId = parentSpanId;
  }

  const correlationId = getHeaderValue(headers, 'X-Correlation-Id');
  if (correlationId) {
    context.correlationId = correlationId;
  }

  return context;
}

/**
 * Inject trace context into Kafka message headers
 * If no context is provided, uses the current context from AsyncLocalStorage
 * Preserves the original message type
 */
export function injectTraceContext<T extends KafkaProducerMessage>(
  message: T,
  context?: TraceContext
): T {
  const traceContext = context ?? getTraceContext();

  if (!traceContext) {
    // No context available, return message as-is
    return message;
  }

  // Create child context for this message
  const childContext = createChildContext(traceContext);

  // Serialize context to headers
  const traceHeaders = serializeContext(childContext);

  // Convert headers to Buffer format for Kafka
  const kafkaHeaders: KafkaTraceHeaders = {};
  for (const [key, value] of Object.entries(traceHeaders)) {
    kafkaHeaders[key] = Buffer.from(value, 'utf-8');
  }

  // Merge with existing headers
  const mergedHeaders = {
    ...(message.headers ?? {}),
    ...kafkaHeaders,
  };

  return {
    ...message,
    headers: mergedHeaders,
  } as T;
}

/**
 * Helper to extract header value from Kafka headers (Buffer format)
 */
function getHeaderValue(
  headers: Record<string, Buffer | undefined>,
  key: string
): string | undefined {
  const buffer = headers[key];
  if (!buffer) {
    return undefined;
  }
  return buffer.toString('utf-8');
}
