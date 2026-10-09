import { Request, Response, NextFunction } from 'express';
import { ResponseHelper } from '@/utils/response';

/**
 * 404 Not Found middleware
 * This middleware should be placed after all route definitions
 */
export const notFound = (req: Request, res: Response, next: NextFunction): void => {
  const message = `Route ${req.method} ${req.originalUrl} not found`;
  
  // Log the 404 error
  console.warn(`404 - ${message}`);
  
  // Return 404 response
  ResponseHelper.notFound(res, message);
};

/**
 * API endpoint not found middleware
 * Specific for API routes
 */
export const apiNotFound = (req: Request, res: Response, next: NextFunction): void => {
  const message = `API endpoint ${req.method} ${req.originalUrl} not found`;
  
  ResponseHelper.notFound(res, message);
};

/**
 * Resource not found helper
 * Use this in controllers when a specific resource is not found
 */
export const resourceNotFound = (res: Response, resource: string): void => {
  const message = `${resource} not found`;
  ResponseHelper.notFound(res, message);
};

/**
 * User not found helper
 */
export const userNotFound = (res: Response): void => {
  ResponseHelper.notFound(res, 'User not found');
};

/**
 * Job not found helper
 */
export const jobNotFound = (res: Response): void => {
  ResponseHelper.notFound(res, 'Job not found');
};

/**
 * Application not found helper
 */
export const applicationNotFound = (res: Response): void => {
  ResponseHelper.notFound(res, 'Application not found');
};

/**
 * Company not found helper
 */
export const companyNotFound = (res: Response): void => {
  ResponseHelper.notFound(res, 'Company not found');
};

/**
 * Candidate profile not found helper
 */
export const candidateNotFound = (res: Response): void => {
  ResponseHelper.notFound(res, 'Candidate profile not found');
};

/**
 * Recruiter profile not found helper
 */
export const recruiterNotFound = (res: Response): void => {
  ResponseHelper.notFound(res, 'Recruiter profile not found');
};
