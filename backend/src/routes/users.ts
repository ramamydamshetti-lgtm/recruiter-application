import { Router, Request, Response } from 'express';
import { ResponseHelper } from '@/utils/response';
import { validate, ValidationRules } from '@/utils/validation';
import { asyncHandler } from '@/middleware/errorHandler';
import { authenticate, authorize } from '@/middleware/auth';
import path from 'path';
import fs from 'fs';

const router = Router();
import { prisma } from '@/lib/prisma';

const AVATARS_DIR = path.join(process.cwd(), 'uploads', 'avatars');

/**
 * @route   GET /api/users
 * @desc    Get all users (admin only)
 * @access  Private/Admin
 */
router.get('/', authenticate, authorize('ADMIN'), validate(ValidationRules.pagination), asyncHandler(async (req: Request, res: Response) => {
  // TODO: Implement user listing with pagination
  ResponseHelper.success(res, 'Users retrieved successfully', []);
}));

/**
 * @route   GET /api/users/:id
 * @desc    Get user by ID
 * @access  Private
 */
router.get('/:id', authenticate, validate(ValidationRules.idParam), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  
  // TODO: Implement get user by ID
  ResponseHelper.success(res, 'User retrieved successfully', { id });
}));

/**
 * @route   GET /api/users/:id/avatar
 * @desc    Serve a user's avatar image (for displaying profile photo)
 * @access  Public
 */
router.get('/:id/avatar', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { avatar: true },
  });

  if (!user?.avatar) {
    return ResponseHelper.error(res, 'Avatar not found', 404);
  }

  const safeFile = String(user.avatar).replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = path.join(AVATARS_DIR, safeFile);

  if (!fs.existsSync(filePath)) {
    return ResponseHelper.error(res, 'Avatar file not found', 404);
  }

  res.sendFile(filePath);
}));

/**
 * @route   PUT /api/users/:id
 * @desc    Update user (admin only)
 * @access  Private/Admin
 */
router.put('/:id', authenticate, authorize('ADMIN'), validate(ValidationRules.idParam), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  
  // TODO: Implement user update
  ResponseHelper.success(res, 'User updated successfully', { id, ...req.body });
}));

/**
 * @route   DELETE /api/users/:id
 * @desc    Delete user (admin only)
 * @access  Private/Admin
 */
router.delete('/:id', authenticate, authorize('ADMIN'), validate(ValidationRules.idParam), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  
  // TODO: Implement user deletion
  ResponseHelper.success(res, 'User deleted successfully', { id });
}));

export default router;
