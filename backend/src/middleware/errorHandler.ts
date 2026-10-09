import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { ResponseHelper } from '@/utils/response';
import { 
  CustomError, 
  handlePrismaError, 
  handleJWTError, 
  handleMulterError,
  logError 
} from '@/utils/errors';

/**
 * Global error handler middleware
 */
export const errorHandler = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Log the error
  logError(error, req);

  // Handle known error types
  if (error instanceof CustomError) {
    ResponseHelper.error(res, error.message, error.statusCode);
    return;
  }

  // Handle Prisma errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const prismaError = handlePrismaError(error);
    ResponseHelper.error(res, prismaError.message, prismaError.statusCode);
    return;
  }

  // Handle Prisma validation errors
  if (error instanceof Prisma.PrismaClientValidationError) {
    ResponseHelper.error(res, 'Invalid data provided', 400);
    return;
  }

  // Handle JWT errors
  if (error instanceof jwt.JsonWebTokenError || 
      error instanceof jwt.TokenExpiredError || 
      error instanceof jwt.NotBeforeError) {
    const jwtError = handleJWTError(error);
    ResponseHelper.error(res, jwtError.message, jwtError.statusCode);
    return;
  }

  // Handle Multer errors
  if (error instanceof multer.MulterError) {
    const multerError = handleMulterError(error);
    ResponseHelper.error(res, multerError.message, multerError.statusCode);
    return;
  }

  // Handle validation errors
  if (error.name === 'ValidationError') {
    ResponseHelper.validationError(res, error.message, error.details);
    return;
  }

  // Handle syntax errors
  if (error instanceof SyntaxError && 'body' in error) {
    ResponseHelper.error(res, 'Invalid JSON format', 400);
    return;
  }

  // Handle rate limiting errors
  if (error.status === 429) {
    ResponseHelper.error(res, 'Too many requests, please try again later', 429);
    return;
  }

  // Handle network errors
  if (error.code === 'ECONNREFUSED') {
    ResponseHelper.error(res, 'Service unavailable', 503);
    return;
  }

  // Handle timeout errors
  if (error.code === 'ETIMEDOUT') {
    ResponseHelper.error(res, 'Request timeout', 504);
    return;
  }

  // Default error handler
  const isDevelopment = process.env.NODE_ENV === 'development';
  const statusCode = error.statusCode || 500;
  const message = isDevelopment ? error.message : 'Internal server error';

  if (isDevelopment) {
    // Include stack trace in development
    ResponseHelper.error(res, message, statusCode, error.stack);
  } else {
    // Generic error in production
    ResponseHelper.error(res, message, statusCode);
  }
};

/**
 * Async error wrapper for route handlers
 */
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Handle unhandled promise rejections
 */
export const handleUnhandledRejections = (): void => {
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't crash the server in production
    if (process.env.NODE_ENV === 'development') {
      process.exit(1);
    }
  });
};

/**
 * Handle uncaught exceptions
 */
export const handleUncaughtExceptions = (): void => {
  process.on('uncaughtException', (error: Error) => {
    console.error('Uncaught Exception:', error);
    // Graceful shutdown
    process.exit(1);
  });
};

/**
 * Request logging middleware
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const log = `${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`;
    
    if (res.statusCode >= 400) {
      console.error(`❌ ${log}`);
    } else {
      console.log(`✅ ${log}`);
    }
  });
  
  next();
};

/**
 * Performance monitoring middleware
 */
export const performanceMonitor = (req: Request, res: Response, next: NextFunction): void => {
  const start = process.hrtime();
  
  res.on('finish', () => {
    const [seconds, nanoseconds] = process.hrtime(start);
    const milliseconds = seconds * 1000 + nanoseconds / 1e6;
    
    // Log slow requests
    if (milliseconds > 1000) {
      console.warn(`🐌 Slow request: ${req.method} ${req.originalUrl} took ${milliseconds.toFixed(2)}ms`);
    }
  });
  
  next();
};

/**
 * Security headers middleware
 */
export const securityHeaders = (req: Request, res: Response, next: NextFunction): void => {
  // Remove server information
  res.removeHeader('X-Powered-By');
  
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  next();
};

/**
 * CORS error handler
 */
export const corsErrorHandler = (err: any, req: Request, res: Response, next: NextFunction): void => {
  if (err.message === 'Not allowed by CORS') {
    ResponseHelper.error(res, 'CORS policy violation', 403);
    return;
  }
  next(err);
};

/**
 * Database connection error handler
 */
export const databaseErrorHandler = (error: any, req: Request, res: Response, next: NextFunction): void => {
  if (error.code === 'ECONNREFUSED') {
    ResponseHelper.error(res, 'Database connection failed', 503);
    return;
  }
  if (error.code === 'ETIMEDOUT') {
    ResponseHelper.error(res, 'Database connection timeout', 503);
    return;
  }
  next(error);
};

/**
 * Rate limit error handler
 */
export const rateLimitErrorHandler = (error: any, req: Request, res: Response, next: NextFunction): void => {
  if (error.status === 429) {
    ResponseHelper.error(
      res, 
      'Too many requests, please try again later', 
      429,
      `Rate limit exceeded. Try again in ${error.resetTime ? Math.ceil((error.resetTime - Date.now()) / 1000) : 60} seconds`
    );
    return;
  }
  next(error);
};
