import { Response } from 'express';
import { ApiResponse, PaginatedResponse } from '@/types';

export class ResponseHelper {
  /**
   * Send success response
   */
  static success<T>(
    res: Response,
    message: string,
    data?: T,
    statusCode: number = 200
  ): Response {
    const response: ApiResponse<T> = {
      success: true,
      message,
      data,
    };
    return res.status(statusCode).json(response);
  }

  /**
   * Send paginated response
   */
  static paginated<T>(
    res: Response,
    message: string,
    data: T[],
    page: number,
    limit: number,
    total: number,
    statusCode: number = 200
  ): Response {
    const totalPages = Math.ceil(total / limit);
    
    const response: PaginatedResponse<T> = {
      success: true,
      message,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
    return res.status(statusCode).json(response);
  }

  /**
   * Send error response
   */
  static error(
    res: Response,
    message: string,
    statusCode: number = 500,
    error?: string
  ): Response {
    const response: ApiResponse = {
      success: false,
      message,
      error,
    };
    return res.status(statusCode).json(response);
  }

  /**
   * Send validation error response
   */
  static validationError(
    res: Response,
    message: string,
    errors: any[]
  ): Response {
    const response: ApiResponse = {
      success: false,
      message,
      error: 'Validation failed',
      data: errors,
    };
    return res.status(400).json(response);
  }

  /**
   * Send not found response
   */
  static notFound(res: Response, message: string = 'Resource not found'): Response {
    return this.error(res, message, 404);
  }

  /**
   * Send unauthorized response
   */
  static unauthorized(res: Response, message: string = 'Unauthorized'): Response {
    return this.error(res, message, 401);
  }

  /**
   * Send forbidden response
   */
  static forbidden(res: Response, message: string = 'Forbidden'): Response {
    return this.error(res, message, 403);
  }

  /**
   * Send conflict response
   */
  static conflict(res: Response, message: string = 'Conflict'): Response {
    return this.error(res, message, 409);
  }

  /**
   * Send created response
   */
  static created<T>(res: Response, message: string, data: T): Response {
    return this.success(res, message, data, 201);
  }

  /**
   * Send no content response
   */
  static noContent(res: Response): Response {
    return res.status(204).send();
  }
}

/**
 * Helper function to calculate pagination
 */
export function calculatePagination(page: number = 1, limit: number = 10) {
  const skip = (page - 1) * limit;
  return {
    skip,
    take: limit,
    page,
    limit,
  };
}

/**
 * Helper function to format pagination metadata
 */
export function formatPaginationMetadata(
  page: number,
  limit: number,
  total: number
) {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    hasNext: page * limit < total,
    hasPrev: page > 1,
  };
}
