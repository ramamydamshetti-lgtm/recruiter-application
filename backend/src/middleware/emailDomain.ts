import { Request, Response, NextFunction } from 'express';
import { validateEmail } from '@/utils/emailValidator';
import { ResponseHelper } from '@/utils/response';

/**
 * Middleware to validate email domain restriction when ALLOWED_EMAIL_DOMAINS is set.
 * If unset or *, any valid email format is allowed.
 */
export const validateEmailDomain = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Check email in request body (for registration)
  if (req.body.email) {
    const validation = validateEmail(req.body.email);
    
    if (!validation.isValid) {
      ResponseHelper.error(res, validation.error!, 400);
      return;
    }
    
    // Normalize email
    req.body.email = req.body.email.toLowerCase().trim();
  }

  // Check email in query params (for forgot password, etc.)
  if (req.query.email) {
    const validation = validateEmail(req.query.email as string);
    
    if (!validation.isValid) {
      ResponseHelper.error(res, validation.error!, 400);
      return;
    }
    
    // Normalize email
    req.query.email = req.query.email.toString().toLowerCase().trim();
  }

  next();
};

/**
 * Middleware to validate email domain for authenticated users
 * Used for profile updates and email changes
 */
export const validateEmailDomainForUpdate = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Check if email is being updated
  if (req.body.email) {
    const validation = validateEmail(req.body.email);
    
    if (!validation.isValid) {
      ResponseHelper.error(res, validation.error!, 400);
      return;
    }
    
    // Normalize email
    req.body.email = req.body.email.toLowerCase().trim();
  }

  next();
};
