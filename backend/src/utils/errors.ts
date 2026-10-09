import { AppError } from '@/types';

/**
 * Custom error class for application errors
 */
export class CustomError extends Error implements AppError {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Bad Request Error (400)
 */
export class BadRequestError extends CustomError {
  constructor(message: string = 'Bad Request') {
    super(message, 400);
  }
}

/**
 * Unauthorized Error (401)
 */
export class UnauthorizedError extends CustomError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401);
  }
}

/**
 * Forbidden Error (403)
 */
export class ForbiddenError extends CustomError {
  constructor(message: string = 'Forbidden') {
    super(message, 403);
  }
}

/**
 * Not Found Error (404)
 */
export class NotFoundError extends CustomError {
  constructor(message: string = 'Resource not found') {
    super(message, 404);
  }
}

/**
 * Conflict Error (409)
 */
export class ConflictError extends CustomError {
  constructor(message: string = 'Conflict') {
    super(message, 409);
  }
}

/**
 * Unprocessable Entity Error (422)
 */
export class UnprocessableEntityError extends CustomError {
  constructor(message: string = 'Unprocessable Entity') {
    super(message, 422);
  }
}

/**
 * Too Many Requests Error (429)
 */
export class TooManyRequestsError extends CustomError {
  constructor(message: string = 'Too Many Requests') {
    super(message, 429);
  }
}

/**
 * Internal Server Error (500)
 */
export class InternalServerError extends CustomError {
  constructor(message: string = 'Internal Server Error') {
    super(message, 500);
  }
}

/**
 * Service Unavailable Error (503)
 */
export class ServiceUnavailableError extends CustomError {
  constructor(message: string = 'Service Unavailable') {
    super(message, 503);
  }
}

/**
 * Database Error
 */
export class DatabaseError extends CustomError {
  constructor(message: string = 'Database operation failed') {
    super(message, 500);
  }
}

/**
 * Validation Error
 */
export class ValidationError extends CustomError {
  constructor(message: string = 'Validation failed') {
    super(message, 400);
  }
}

/**
 * Authentication Error
 */
export class AuthenticationError extends CustomError {
  constructor(message: string = 'Authentication failed') {
    super(message, 401);
  }
}

/**
 * Authorization Error
 */
export class AuthorizationError extends CustomError {
  constructor(message: string = 'Access denied') {
    super(message, 403);
  }
}

/**
 * File Upload Error
 */
export class FileUploadError extends CustomError {
  constructor(message: string = 'File upload failed') {
    super(message, 400);
  }
}

/**
 * Email Error
 */
export class EmailError extends CustomError {
  constructor(message: string = 'Email operation failed') {
    super(message, 500);
  }
}

/**
 * External API Error
 */
export class ExternalAPIError extends CustomError {
  constructor(message: string = 'External API request failed') {
    super(message, 502);
  }
}

/**
 * Error factory function
 */
export const createError = (message: string, statusCode: number = 500): CustomError => {
  return new CustomError(message, statusCode);
};

/**
 * Async error wrapper
 */
export const asyncHandler = (fn: Function) => {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Handle Prisma errors
 */
export const handlePrismaError = (error: any): CustomError => {
  switch (error.code) {
    case 'P2002':
      // Unique constraint violation
      const target = error.meta?.target;
      if (target?.includes('email')) {
        return new ConflictError('Email already exists');
      }
      return new ConflictError('Resource already exists');

    case 'P2025':
      // Record not found
      return new NotFoundError('Record not found');

    case 'P2003':
      // Foreign key constraint violation
      return new BadRequestError('Invalid reference');

    case 'P2014':
      // Invalid relation
      return new BadRequestError('Invalid relation');

    case 'P2021':
      // Table does not exist
      return new DatabaseError('Database table not found');

    case 'P2022':
      // Column does not exist
      return new DatabaseError('Database column not found');

    default:
      // Generic database error
      console.error('Prisma Error:', error);
      return new DatabaseError('Database operation failed');
  }
};

/**
 * Handle JWT errors
 */
export const handleJWTError = (error: any): CustomError => {
  if (error.name === 'JsonWebTokenError') {
    return new AuthenticationError('Invalid token');
  }
  if (error.name === 'TokenExpiredError') {
    return new AuthenticationError('Token expired');
  }
  if (error.name === 'NotBeforeError') {
    return new AuthenticationError('Token not active');
  }
  return new AuthenticationError('Authentication failed');
};

/**
 * Handle Multer errors
 */
export const handleMulterError = (error: any): CustomError => {
  if (error.code === 'LIMIT_FILE_SIZE') {
    return new FileUploadError('File too large');
  }
  if (error.code === 'LIMIT_FILE_COUNT') {
    return new FileUploadError('Too many files');
  }
  if (error.code === 'LIMIT_UNEXPECTED_FILE') {
    return new FileUploadError('Unexpected file field');
  }
  return new FileUploadError('File upload failed');
};

/**
 * Log error for debugging
 */
export const logError = (error: any, req?: any): void => {
  const errorData = {
    message: error.message,
    stack: error.stack,
    statusCode: error.statusCode || 500,
    url: req?.url,
    method: req?.method,
    ip: req?.ip,
    userAgent: req?.get('User-Agent'),
    timestamp: new Date().toISOString(),
  };

  console.error('Application Error:', JSON.stringify(errorData, null, 2));
};
