import { Request, Response, NextFunction } from 'express';

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  timestamp: string;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}

export const createProblemDetails = (
  error: Error | AppError,
  req: Request,
  statusCode?: number
): ProblemDetails => {
  const code = statusCode || (error instanceof AppError ? error.statusCode : 500);
  
  return {
    type: `https://bloxtr8.com/problems/${getErrorType(code)}`,
    title: getErrorTitle(code),
    status: code,
    detail: error.message,
    instance: req.originalUrl,
    timestamp: new Date().toISOString(),
  };
};

const getErrorType = (statusCode: number): string => {
  const types: Record<number, string> = {
    400: 'bad-request',
    401: 'unauthorized',
    403: 'forbidden',
    404: 'not-found',
    409: 'conflict',
    422: 'validation-error',
    429: 'rate-limit-exceeded',
    500: 'internal-server-error',
    502: 'bad-gateway',
    503: 'service-unavailable',
  };
  
  return types[statusCode] || 'unknown-error';
};

const getErrorTitle = (statusCode: number): string => {
  const titles: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    422: 'Validation Error',
    429: 'Rate Limit Exceeded',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
  };
  
  return titles[statusCode] || 'Unknown Error';
};

export const errorHandler = (
  error: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const statusCode = error instanceof AppError ? error.statusCode : 500;
  const problemDetails = createProblemDetails(error, req, statusCode);

  // Log error for monitoring
  console.error('API Error:', {
    error: error.message,
    stack: error.stack,
    url: req.originalUrl,
    method: req.method,
    statusCode,
    timestamp: problemDetails.timestamp,
  });

  res.status(statusCode).json(problemDetails);
};

export const notFoundHandler = (req: Request, res: Response): void => {
  const problemDetails: ProblemDetails = {
    type: 'https://bloxtr8.com/problems/not-found',
    title: 'Not Found',
    status: 404,
    detail: `The requested resource ${req.originalUrl} was not found`,
    instance: req.originalUrl,
    timestamp: new Date().toISOString(),
  };

  res.status(404).json(problemDetails);
};
