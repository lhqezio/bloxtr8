import type { Request, Response, NextFunction } from 'express';

import {
  createTraceContext,
  createChildContext,
  deserializeContext,
  getTraceContext,
  runWithTraceContextAsync,
  serializeContext,
} from './context.js';
import type { TraceContext } from './types.js';

/**
 * Express middleware for distributed tracing
 *
 * Extracts trace context from incoming HTTP headers or creates a new one.
 * Sets the context in AsyncLocalStorage and adds trace headers to the response.
 */
export function tracingMiddleware() {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    // Extract trace context from request headers
    const incomingContext = deserializeContext(req.headers);

    // Create context: use incoming context or create new root context
    const context: TraceContext = incomingContext
      ? createChildContext(incomingContext)
      : createTraceContext();

    // Add trace headers to response
    const traceHeaders = serializeContext(context);
    for (const [key, value] of Object.entries(traceHeaders)) {
      res.setHeader(key, value);
    }

    // Run the request handler with trace context
    await runWithTraceContextAsync(context, async () => {
      next();
    });
  };
}

/**
 * Get the current trace context from the request context
 * Useful for accessing trace information in route handlers
 */
export function getRequestTraceContext(): TraceContext | undefined {
  return getTraceContext();
}
