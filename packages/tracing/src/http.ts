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
    // Wrap next() in a Promise to keep AsyncLocalStorage context active
    // until the response finishes or errors
    await runWithTraceContextAsync(context, async () => {
      return new Promise<void>((resolve, reject) => {
        // Resolve when response finishes successfully
        res.once('finish', resolve);
        // Reject if response errors
        res.once('error', reject);
        // Call next() synchronously - Express will handle async route handlers
        // Wrap in try-catch to handle synchronous errors from next()
        try {
          next();
        } catch (error) {
          reject(error);
        }
      });
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
