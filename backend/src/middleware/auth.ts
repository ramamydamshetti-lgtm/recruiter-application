import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { ResponseHelper } from '@/utils/response';
import { AuthenticatedRequest, JwtPayloadExtended } from '@/types';

const prisma = new PrismaClient();

/**
 * JWT Authentication middleware
 */
export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      ResponseHelper.unauthorized(res, 'Access token is required');
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayloadExtended;

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        avatar: true,
        phone: true,
        submittingTo: true,
        location: true,
        bio: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      ResponseHelper.unauthorized(res, 'User not found');
      return;
    }

    if (!user.isActive) {
      ResponseHelper.unauthorized(res, 'User account is deactivated');
      return;
    }

    // Ensure `submittingTo` is always present when the DB column exists.
    // (Some deployments may attach a partial user object.)
    if ((user as any).submittingTo === undefined) {
      const subRow = await prisma.user.findUnique({
        where: { id: user.id },
        select: { submittingTo: true },
      });
      (user as any).submittingTo = subRow?.submittingTo ?? null;
    }

    // Attach user to request
    req.user = user;

    // Update last login time
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      ResponseHelper.unauthorized(res, 'Invalid token');
    } else if (error instanceof jwt.TokenExpiredError) {
      ResponseHelper.unauthorized(res, 'Token expired');
    } else {
      ResponseHelper.unauthorized(res, 'Authentication failed');
    }
  }
};

/**
 * Role-based authorization middleware
 */
export const authorize = (...roles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      ResponseHelper.unauthorized(res, 'Authentication required');
      return;
    }

    if (!roles.includes(req.user.role)) {
      ResponseHelper.forbidden(res, 'Insufficient permissions');
      return;
    }

    next();
  };
};

/**
 * Admin-only middleware
 */
export const adminOnly = authorize('ADMIN');

/**
 * Recruiter-only middleware
 */
export const recruiterOnly = authorize('RECRUITER');

/**
 * Candidate-only middleware
 */
export const candidateOnly = authorize('CANDIDATE');

/**
 * Admin or Recruiter middleware
 */
export const adminOrRecruiterOnly = authorize('ADMIN', 'RECRUITER');

/**
 * Admin or Candidate middleware
 */
export const adminOrCandidateOnly = authorize('ADMIN', 'CANDIDATE');

/**
 * Resource owner middleware - Check if user owns the resource
 */
export const resourceOwner = (resourceIdParam: string = 'id') => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const resourceId = req.params[resourceIdParam];
      
      if (!req.user) {
        ResponseHelper.unauthorized(res, 'Authentication required');
        return;
      }

      // Admin can access any resource
      if (req.user.role === 'ADMIN') {
        next();
        return;
      }

      // Ownership checks for legacy resources are disabled in this simplified backend.
      const isOwner = false;
      
      if (!isOwner) {
        ResponseHelper.forbidden(res, 'Access denied');
        return;
      }

      next();
    } catch (error) {
      ResponseHelper.error(res, 'Authorization check failed', 500);
    }
  };
};

/**
 * Optional authentication middleware
 * Doesn't fail if no token is provided, but attaches user if token is valid
 */
export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next();
      return;
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayloadExtended;

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        avatar: true,
        phone: true,
        submittingTo: true,
        location: true,
        bio: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (user && user.isActive) {
      req.user = user;
    }

    next();
  } catch (error) {
    // Silently ignore errors for optional auth
    next();
  }
};

/**
 * API Key authentication middleware (for external services)
 */
export const authenticateApiKey = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const apiKey = req.headers['x-api-key'] as string;
    
    if (!apiKey) {
      ResponseHelper.unauthorized(res, 'API key is required');
      return;
    }

    // Validate API key (implement your API key validation logic)
    const isValidApiKey = await validateApiKey(apiKey);
    
    if (!isValidApiKey) {
      ResponseHelper.unauthorized(res, 'Invalid API key');
      return;
    }

    next();
  } catch (error) {
    ResponseHelper.unauthorized(res, 'API key authentication failed');
  }
};

/**
 * Validate API key
 */
async function validateApiKey(apiKey: string): Promise<boolean> {
  // Implement your API key validation logic
  // This could be checking against a database table or environment variables
  const validApiKeys = process.env.VALID_API_KEYS?.split(',') || [];
  return validApiKeys.includes(apiKey);
}

/**
 * Email verification middleware
 */
export const emailVerified = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (!req.user) {
    ResponseHelper.unauthorized(res, 'Authentication required');
    return;
  }

  // Implement email verification check
  // This assumes you have an emailVerified field in your user model
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { emailVerified: true },
  });

  if (!user?.emailVerified) {
    ResponseHelper.forbidden(res, 'Email verification required');
    return;
  }

  next();
};

/**
 * Two-factor authentication middleware
 */
export const twoFactorAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (!req.user) {
    ResponseHelper.unauthorized(res, 'Authentication required');
    return;
  }

  // 2FA is not enabled in the current schema; keep middleware as pass-through.
  next();
};
