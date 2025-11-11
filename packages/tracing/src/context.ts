import { AsyncLocalStorage } from 'async_hooks';
import { webcrypto } from 'crypto';

import type { TraceContext } from './types.js';

/**
 * AsyncLocalStorage instance for trace context propagation
 */
const traceContextStorage = new AsyncLocalStorage<TraceContext>();

/**
 * Generate a UUID v4 trace ID
 */
export function generateTraceId(): string {
  // Use webcrypto.randomUUID if available (Node.js 18+), otherwise fallback to manual generation
  if (webcrypto && typeof webcrypto.randomUUID === 'function') {
    return webcrypto.randomUUID();
  }

  // Fallback UUID v4 generation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generate a UUID v4 span ID
 */
export function generateSpanId(): string {
  return generateTraceId();
}

/**
 * Create a new root trace context
 */
export function createTraceContext(correlationId?: string): TraceContext {
  return {
    traceId: generateTraceId(),
    spanId: generateSpanId(),
    correlationId,
  };
}

/**
 * Create a child trace context from a parent context
 */
export function createChildContext(
  parent: TraceContext,
  correlationId?: string
): TraceContext {
  return {
    traceId: parent.traceId,
    spanId: generateSpanId(),
    parentSpanId: parent.spanId,
    correlationId: correlationId ?? parent.correlationId,
  };
}

/**
 * Get the current trace context from AsyncLocalStorage
 */
export function getTraceContext(): TraceContext | undefined {
  return traceContextStorage.getStore();
}

/**
 * Set the trace context in AsyncLocalStorage
 * This should typically be called within an async context
 */
export function setTraceContext(context: TraceContext): void {
  traceContextStorage.enterWith(context);
}

/**
 * Run a function with a trace context
 */
export function runWithTraceContext<T>(context: TraceContext, fn: () => T): T {
  return traceContextStorage.run(context, fn);
}

/**
 * Run an async function with a trace context
 */
export async function runWithTraceContextAsync<T>(
  context: TraceContext,
  fn: () => Promise<T>
): Promise<T> {
  return traceContextStorage.run(context, fn);
}

/**
 * Serialize trace context to HTTP headers
 */
export function serializeContext(
  context: TraceContext
): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Trace-Id': context.traceId,
    'X-Span-Id': context.spanId,
  };

  if (context.parentSpanId) {
    headers['X-Parent-Span-Id'] = context.parentSpanId;
  }

  if (context.correlationId) {
    headers['X-Correlation-Id'] = context.correlationId;
  }

  return headers;
}

/**
 * Deserialize trace context from HTTP headers
 */
export function deserializeContext(
  headers: Record<string, string | string[] | undefined>
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
 * Helper to extract header value (handles both string and string[] formats)
 */
function getHeaderValue(
  headers: Record<string, string | string[] | undefined>,
  key: string
): string | undefined {
  const value = headers[key];
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && value.length > 0) {
    return value[0];
  }
  return undefined;
}
