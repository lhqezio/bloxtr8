// Context management
export {
  createTraceContext,
  createChildContext,
  generateTraceId,
  generateSpanId,
  getTraceContext,
  setTraceContext,
  runWithTraceContext,
  runWithTraceContextAsync,
  serializeContext,
  deserializeContext,
} from './context.js';

// Kafka tracing utilities
export {
  extractTraceContext,
  injectTraceContext,
  type KafkaProducerMessage,
} from './kafka.js';

// HTTP middleware
export { tracingMiddleware, getRequestTraceContext } from './http.js';

// Types
export type { TraceContext, TraceHeaders, KafkaTraceHeaders } from './types.js';
