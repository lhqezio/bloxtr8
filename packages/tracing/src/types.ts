/**
 * Trace context interface for distributed tracing
 */
export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  correlationId?: string;
}

/**
 * HTTP headers for trace context propagation
 */
export interface TraceHeaders {
  'X-Trace-Id': string;
  'X-Span-Id': string;
  'X-Parent-Span-Id'?: string;
  'X-Correlation-Id'?: string;
}

/**
 * Kafka message headers for trace context propagation
 */
export type KafkaTraceHeaders = Record<string, string | Buffer>;
