import { Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult, ValidationChain } from 'express-validator';
import { ResponseHelper } from './response';

/**
 * Validation middleware
 */
export const validate = (validations: ValidationChain[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Run all validations
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    const formattedErrors = errors.array().map(error => ({
      field: error.type === 'field' ? (error as any).path : error.type,
      message: error.msg,
      value: error.type === 'field' ? (error as any).value : undefined,
    }));

    return ResponseHelper.validationError(res, 'Validation failed', formattedErrors);
  };
};

/**
 * Common validation rules
 */
export const ValidationRules = {
  // User validations
  register: [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email address'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters long')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
    body('firstName')
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('First name must be between 2 and 50 characters'),
    body('lastName')
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Last name must be between 2 and 50 characters'),
    body('role')
      .isIn(['RECRUITER', 'CANDIDATE'])
      .withMessage('Role must be either RECRUITER or CANDIDATE'),
  ],

  login: [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email address'),
    body('password')
      .notEmpty()
      .withMessage('Password is required'),
  ],

  // Job posting validations
  createJob: [
    body('title')
      .trim()
      .isLength({ min: 3, max: 200 })
      .withMessage('Job title must be between 3 and 200 characters'),
    body('description')
      .trim()
      .isLength({ min: 10 })
      .withMessage('Job description must be at least 10 characters long'),
    body('location')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Location must be between 2 and 100 characters'),
    body('jobType')
      .isIn(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'FREELANCE', 'TEMPORARY'])
      .withMessage('Invalid job type'),
    body('workMode')
      .isIn(['ONSITE', 'REMOTE', 'HYBRID'])
      .withMessage('Invalid work mode'),
    body('experienceLevel')
      .isIn(['ENTRY_LEVEL', 'JUNIOR', 'MID_LEVEL', 'SENIOR', 'LEAD', 'MANAGER', 'DIRECTOR', 'EXECUTIVE'])
      .withMessage('Invalid experience level'),
    body('salaryMin')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Minimum salary must be a positive number'),
    body('salaryMax')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Maximum salary must be a positive number')
      .custom((value, { req }) => {
        if (value && req.body.salaryMin && value < req.body.salaryMin) {
          throw new Error('Maximum salary must be greater than minimum salary');
        }
        return true;
      }),
    body('skills')
      .isArray()
      .withMessage('Skills must be an array')
      .custom((skills) => {
        if (skills.length === 0) {
          throw new Error('At least one skill is required');
        }
        return true;
      }),
    body('skills.*')
      .trim()
      .isLength({ min: 2 })
      .withMessage('Each skill must be at least 2 characters long'),
  ],

  updateJob: [
    body('title')
      .optional()
      .trim()
      .isLength({ min: 3, max: 200 })
      .withMessage('Job title must be between 3 and 200 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ min: 10 })
      .withMessage('Job description must be at least 10 characters long'),
    body('location')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Location must be between 2 and 100 characters'),
    body('jobType')
      .optional()
      .isIn(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'FREELANCE', 'TEMPORARY'])
      .withMessage('Invalid job type'),
    body('workMode')
      .optional()
      .isIn(['ONSITE', 'REMOTE', 'HYBRID'])
      .withMessage('Invalid work mode'),
    body('experienceLevel')
      .optional()
      .isIn(['ENTRY_LEVEL', 'JUNIOR', 'MID_LEVEL', 'SENIOR', 'LEAD', 'MANAGER', 'DIRECTOR', 'EXECUTIVE'])
      .withMessage('Invalid experience level'),
    body('salaryMin')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Minimum salary must be a positive number'),
    body('salaryMax')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Maximum salary must be a positive number'),
    body('skills')
      .optional()
      .isArray()
      .withMessage('Skills must be an array'),
  ],

  // Application validations
  createApplication: [
    body('coverLetter')
      .optional()
      .trim()
      .isLength({ min: 10, max: 5000 })
      .withMessage('Cover letter must be between 10 and 5000 characters'),
    body('salaryExpectation')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Salary expectation must be a positive number'),
    body('availability')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Availability must be between 2 and 100 characters'),
    body('noticePeriod')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Notice period must be a non-negative integer'),
  ],

  // Candidate profile validations
  updateCandidateProfile: [
    body('headline')
      .optional()
      .trim()
      .isLength({ min: 3, max: 200 })
      .withMessage('Headline must be between 3 and 200 characters'),
    body('summary')
      .optional()
      .trim()
      .isLength({ min: 10, max: 2000 })
      .withMessage('Summary must be between 10 and 2000 characters'),
    body('experienceYears')
      .optional()
      .isFloat({ min: 0, max: 50 })
      .withMessage('Experience years must be between 0 and 50'),
    body('salaryMin')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Minimum salary must be a positive number'),
    body('salaryMax')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Maximum salary must be a positive number'),
    body('skills')
      .optional()
      .isArray()
      .withMessage('Skills must be an array'),
    body('skills.*')
      .optional()
      .trim()
      .isLength({ min: 2 })
      .withMessage('Each skill must be at least 2 characters long'),
  ],

  // Experience validations
  createExperience: [
    body('title')
      .trim()
      .isLength({ min: 3, max: 100 })
      .withMessage('Job title must be between 3 and 100 characters'),
    body('company')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Company name must be between 2 and 100 characters'),
    body('location')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Location must be between 2 and 100 characters'),
    body('startDate')
      .isISO8601()
      .withMessage('Start date must be a valid date'),
    body('endDate')
      .optional()
      .isISO8601()
      .withMessage('End date must be a valid date')
      .custom((value, { req }) => {
        if (value && new Date(value) < new Date(req.body.startDate)) {
          throw new Error('End date must be after start date');
        }
        return true;
      }),
    body('isCurrent')
      .optional()
      .isBoolean()
      .withMessage('isCurrent must be a boolean'),
    body('description')
      .optional()
      .trim()
      .isLength({ min: 10, max: 2000 })
      .withMessage('Description must be between 10 and 2000 characters'),
  ],

  // Education validations
  createEducation: [
    body('institution')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Institution name must be between 2 and 100 characters'),
    body('degree')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Degree must be between 2 and 100 characters'),
    body('field')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Field of study must be between 2 and 100 characters'),
    body('startDate')
      .isISO8601()
      .withMessage('Start date must be a valid date'),
    body('endDate')
      .optional()
      .isISO8601()
      .withMessage('End date must be a valid date'),
    body('gpa')
      .optional()
      .isFloat({ min: 0, max: 4 })
      .withMessage('GPA must be between 0 and 4'),
  ],

  // Interview validations
  createInterview: [
    body('type')
      .isIn(['PHONE', 'VIDEO', 'ONSITE', 'TECHNICAL', 'BEHAVIORAL', 'FINAL'])
      .withMessage('Invalid interview type'),
    body('title')
      .trim()
      .isLength({ min: 3, max: 200 })
      .withMessage('Interview title must be between 3 and 200 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ min: 10, max: 1000 })
      .withMessage('Description must be between 10 and 1000 characters'),
    body('scheduledFor')
      .isISO8601()
      .withMessage('Scheduled date must be a valid date')
      .custom((value) => {
        if (new Date(value) < new Date()) {
          throw new Error('Scheduled date must be in the future');
        }
        return true;
      }),
    body('duration')
      .optional()
      .isInt({ min: 15, max: 480 })
      .withMessage('Duration must be between 15 and 480 minutes'),
    body('location')
      .optional()
      .trim()
      .isLength({ min: 2, max: 200 })
      .withMessage('Location must be between 2 and 200 characters'),
  ],

  // Company validations
  createCompany: [
    body('name')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Company name must be between 2 and 100 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ min: 10, max: 2000 })
      .withMessage('Description must be between 10 and 2000 characters'),
    body('website')
      .optional()
      .isURL()
      .withMessage('Website must be a valid URL'),
    body('industry')
      .optional()
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Industry must be between 2 and 50 characters'),
    body('size')
      .optional()
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Company size must be between 2 and 50 characters'),
    body('foundedYear')
      .optional()
      .isInt({ min: 1800, max: new Date().getFullYear() })
      .withMessage('Founded year must be between 1800 and current year'),
  ],

  // Parameter validations
  idParam: [
    param('id')
      .isUUID()
      .withMessage('Invalid ID format'),
  ],

  /** Prisma `cuid`, UUID, or custom ids (e.g. REQ-YYYY-MM-DD-XXX). Use for Candidate and other cuid-backed models. */
  resourceIdParam: [
    param('id')
      .trim()
      .notEmpty()
      .isLength({ min: 1, max: 128 })
      .matches(/^[-a-zA-Z0-9_.]+$/)
      .withMessage('Invalid ID format'),
  ],

  // Query validations
  pagination: [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('sortBy')
      .optional()
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('Sort field must be between 1 and 50 characters'),
    query('sortOrder')
      .optional()
      .isIn(['asc', 'desc'])
      .withMessage('Sort order must be either asc or desc'),
  ],

  search: [
    query('search')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Search term must be between 2 and 100 characters'),
  ],
};

/**
 * Custom validation helpers
 */
export const CustomValidators = {
  /**
   * Validate that end date is after start date
   */
  endDateAfterStartDate: (value: string, { req }: any) => {
    if (!value || !req.body.startDate) return true;
    return new Date(value) > new Date(req.body.startDate);
  },

  /**
   * Validate salary range
   */
  salaryRange: (value: number, { req }: any) => {
    if (!value || !req.body.salaryMin) return true;
    return value >= req.body.salaryMin;
  },

  /**
   * Validate future date
   */
  futureDate: (value: string) => {
    return new Date(value) > new Date();
  },

  /**
   * Validate skills array
   */
  skillsArray: (value: any) => {
    return Array.isArray(value) && value.length > 0 && value.every((skill: any) => typeof skill === 'string' && skill.trim().length >= 2);
  },
};
