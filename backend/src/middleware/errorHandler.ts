/**
 * errorHandler.ts
 * Global Express error-handling middleware.
 * Never hides errors — always returns the real message to the client.
 */

import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import logger from '../utils/logger';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const message    = err.message || 'Internal server error';

  // Always log the real error
  if (statusCode >= 500) {
    logger.error(`[ErrorHandler] ${req.method} ${req.path} → ${statusCode}: ${message}`, {
      stack: err.stack,
    });
  } else {
    logger.warn(`[ErrorHandler] ${req.method} ${req.path} → ${statusCode}: ${message}`);
  }

  res.status(statusCode).json({
    success: false,
    error:   message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}
