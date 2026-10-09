import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { ResponseHelper } from '@/utils/response';
import { validate, ValidationRules } from '@/utils/validation';
import { asyncHandler } from '@/middleware/errorHandler';
import { authenticate, authorize } from '@/middleware/auth';
import { AuthenticatedRequest } from '@/types';

const prisma = new PrismaClient();
const router = Router();

/** Staff roles shown in recruiter pickers, reports, and assignment lists. */
const STAFF_ROLES = ['RECRUITER', 'LEAD', 'ADMIN'] as const;

type StaffUserRow = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  avatar: string | null;
  phone: string | null;
  location: string | null;
  bio: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function toRecruiterPayload(u: StaffUserRow) {
  const name = `${u.firstName} ${u.lastName}`.trim() || u.email;
  const title =
    u.role === 'LEAD' ? 'Lead' : u.role === 'ADMIN' ? 'Admin' : 'Recruiter';
  return {
    id: u.id,
    email: u.email,
    name,
    title,
    firstName: u.firstName,
    lastName: u.lastName,
    role: u.role,
    avatar: u.avatar,
    phone: u.phone,
    location: u.location,
    bio: u.bio,
    isActive: u.isActive,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

const staffUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  avatar: true,
  phone: true,
  location: true,
  bio: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * @route   GET /api/recruiters
 * @desc    Get all active staff for reports / assignment (no 10-row cap by default)
 * @access  Public
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  const rawLimit = String(req.query.limit ?? '').trim().toLowerCase();
  const wantsAll = rawLimit === 'all' || rawLimit === '0';
  const limit = wantsAll
    ? undefined
    : Math.min(500, Math.max(1, parseInt(rawLimit, 10) || 200));

  const where = {
    role: { in: [...STAFF_ROLES] },
    isActive: true,
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: staffUserSelect,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { email: 'asc' }],
      ...(limit ? { skip: (page - 1) * limit, take: limit } : {}),
    }),
    prisma.user.count({ where }),
  ]);

  const recruiters = users.map((u) => toRecruiterPayload(u as StaffUserRow));

  ResponseHelper.success(res, 'Recruiters retrieved successfully', {
    recruiters,
    pagination: limit
      ? {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        }
      : {
          page: 1,
          limit: total,
          total,
          pages: 1,
        },
  });
}));

/**
 * @route   GET /api/recruiters/profile
 * @desc    Get current recruiter profile
 * @access  Private/Recruiter
 */
router.get('/profile', authenticate, authorize('RECRUITER'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;

  const recruiterProfile = await prisma.user.findUnique({
    where: { 
      id: userId,
      role: 'RECRUITER'
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      avatar: true,
      phone: true,
      location: true,
      bio: true,
      isActive: true,
      createdAt: true,
      updatedAt: true
    }
  });

  if (!recruiterProfile) {
    return ResponseHelper.error(res, 'Recruiter profile not found', 404);
  }

  ResponseHelper.success(res, 'Recruiter profile retrieved successfully', recruiterProfile);
}));

/**
 * @route   PUT /api/recruiters/profile
 * @desc    Update recruiter profile
 * @access  Private/Recruiter
 */
router.put('/profile', authenticate, authorize('RECRUITER'), validate([
  require('express-validator').body('firstName').optional().trim().isLength({ min: 2, max: 50 }).withMessage('First name must be between 2 and 50 characters'),
  require('express-validator').body('lastName').optional().trim().isLength({ min: 2, max: 50 }).withMessage('Last name must be between 2 and 50 characters'),
  require('express-validator').body('phone').optional().trim().isLength({ min: 10, max: 20 }).withMessage('Phone number must be between 10 and 20 characters'),
  require('express-validator').body('location').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Location must be between 2 and 100 characters'),
  require('express-validator').body('bio').optional().trim().isLength({ min: 10, max: 500 }).withMessage('Bio must be between 10 and 500 characters'),
]), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const updateData = req.body;

  // Update user profile
  const updatedProfile = await prisma.user.update({
    where: { 
      id: userId,
      role: 'RECRUITER'
    },
    data: updateData,
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      avatar: true,
      phone: true,
      location: true,
      bio: true,
      isActive: true,
      createdAt: true,
      updatedAt: true
    }
  });

  ResponseHelper.success(res, 'Recruiter profile updated successfully', updatedProfile);
}));

/**
 * @route   GET /api/recruiters/:id
 * @desc    Get recruiter by ID
 * @access  Public
 */
router.get('/:id', validate(ValidationRules.idParam), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const recruiter = await prisma.user.findUnique({
    where: { 
      id,
      role: 'RECRUITER',
      isActive: true
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      avatar: true,
      phone: true,
      location: true,
      bio: true,
      isActive: true,
      createdAt: true,
      updatedAt: true
    }
  });

  if (!recruiter) {
    return ResponseHelper.error(res, 'Recruiter not found', 404);
  }

  ResponseHelper.success(res, 'Recruiter retrieved successfully', recruiter);
}));

export default router;
