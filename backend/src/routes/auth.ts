import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { AuthService } from '@/services/auth.service';
import { OtpService } from '@/services/otp.service';
import { EmailService } from '@/services/email.service';
import { ResponseHelper } from '@/utils/response';
import { validate, ValidationRules } from '@/utils/validation';
import { asyncHandler } from '@/middleware/errorHandler';
import { authenticate } from '@/middleware/auth';
import { validateEmailDomain, validateEmailDomainForUpdate } from '@/middleware/emailDomain';

const router = Router();

const AVATARS_DIR = path.join(process.cwd(), 'uploads', 'avatars');

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      try {
        ensureDir(AVATARS_DIR);
        cb(null, AVATARS_DIR);
      } catch (e) {
        cb(e as any, AVATARS_DIR);
      }
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const allowed = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
      const safeExt = allowed.has(ext) ? ext : '.png';
      const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      cb(null, `avatar-${unique}${safeExt}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(null, false);
    cb(null, true);
  },
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
const registerHandler = asyncHandler(async (req, res) => {
  const result = await AuthService.register(req.body);
  ResponseHelper.created(res, 'User registered successfully', result);
});

router.post('/register', validateEmailDomain, validate(ValidationRules.register), registerHandler);
/** Alias used by some clients */
router.post('/signup', validateEmailDomain, validate(ValidationRules.register), registerHandler);

/**
 * @route   POST /api/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post('/login', validateEmailDomain, asyncHandler(async (req, res) => {
  const result = await AuthService.login(req.body);

  ResponseHelper.success(res, 'Login successful', result);
}));

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh JWT token
 * @access  Public
 */
router.post('/refresh', asyncHandler(async (req, res) => {
  const { token } = req.body;
  
  if (!token) {
    return ResponseHelper.error(res, 'Token is required', 400);
  }
  
  const result = await AuthService.refreshToken(token);
  
  ResponseHelper.success(res, 'Token refreshed successfully', result);
}));

/**
 * @route   GET /api/auth/me
 * @desc    Get current user
 * @access  Private
 */
router.get('/me', authenticate, asyncHandler(async (req, res) => {
  const user = req.user!;
  
  ResponseHelper.success(res, 'User retrieved successfully', {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    avatar: user.avatar,
    phone: user.phone,
    location: user.location,
    bio: user.bio,
    submittingTo: user.submittingTo,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  });
}));

/**
 * @route   POST /api/auth/change-password
 * @desc    Change user password
 * @access  Private
 */
router.post('/change-password', authenticate, validate([
  require('express-validator').body('currentPassword').notEmpty().withMessage('Current password is required'),
  require('express-validator').body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters long'),
]), asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user!.id;
  
  await AuthService.changePassword(userId, currentPassword, newPassword);
  
  ResponseHelper.success(res, 'Password changed successfully');
}));

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Request password reset
 * @access  Public
 */
router.post('/forgot-password', validateEmailDomain, validate([
  require('express-validator').body('email').isEmail().withMessage('Valid email is required'),
]), asyncHandler(async (req, res) => {
  const { email } = req.body;
  
  const message = await AuthService.requestPasswordReset(email);
  
  ResponseHelper.success(res, message);
}));

/**
 * @route   POST /api/auth/send-login-code
 * @desc    Send OTP login code to verified email
 * @access  Public
 */
router.post('/send-login-code', validateEmailDomain, validate([
  require('express-validator').body('email').isEmail().withMessage('Valid email is required'),
]), asyncHandler(async (req, res) => {
  const { email } = req.body as { email: string };
  await OtpService.sendLoginOtp(email);
  ResponseHelper.success(res, 'Login code sent successfully');
}));

/**
 * @route   POST /api/auth/login-with-code
 * @desc    Login using OTP code
 * @access  Public
 */
router.post('/login-with-code', validateEmailDomain, validate([
  require('express-validator').body('email').isEmail().withMessage('Valid email is required'),
  require('express-validator').body('code').isLength({ min: 6, max: 6 }).withMessage('Code must be 6 digits'),
]), asyncHandler(async (req, res) => {
  const { email, code } = req.body as { email: string; code: string };
  const result = await OtpService.verifyLoginOtp(email, code);
  ResponseHelper.success(res, 'Login successful', result);
}));

/**
 * @route   POST /api/auth/reset-password
 * @desc    Reset password with token
 * @access  Public
 */
router.post('/reset-password', validate([
  require('express-validator').body('token').notEmpty().withMessage('Reset token is required'),
  require('express-validator').body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters long'),
]), asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;
  
  await AuthService.resetPassword(token, newPassword);
  
  ResponseHelper.success(res, 'Password reset successful');
}));

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user
 * @access  Private
 */
router.post('/logout', authenticate, asyncHandler(async (req, res) => {
  const token = req.headers.authorization?.substring(7);
  
  if (token) {
    await AuthService.logout(token);
  }
  
  ResponseHelper.success(res, 'Logout successful');
}));

/**
 * @route   GET /api/auth/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/me', authenticate, asyncHandler(async (req, res) => {
  const user = req.user!;
  
  ResponseHelper.success(res, 'User profile retrieved successfully', user);
}));

/**
 * @route   PUT /api/auth/me
 * @desc    Update current user profile
 * @access  Private
 */
router.put('/me', authenticate, validateEmailDomainForUpdate, validate([
  require('express-validator').body('firstName').optional().trim().isLength({ min: 2, max: 50 }).withMessage('First name must be between 2 and 50 characters'),
  require('express-validator').body('lastName').optional().trim().isLength({ min: 2, max: 50 }).withMessage('Last name must be between 2 and 50 characters'),
  require('express-validator').body('phone').optional().trim().isLength({ min: 10, max: 20 }).withMessage('Phone number must be between 10 and 20 characters'),
  require('express-validator').body('location').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Location must be between 2 and 100 characters'),
  require('express-validator').body('bio').optional().trim().isLength({ min: 10, max: 500 }).withMessage('Bio must be between 10 and 500 characters'),
  require('express-validator').body('role').optional().isIn(['RECRUITER', 'LEAD', 'Recruiter', 'Lead']).withMessage('Role must be Recruiter or Lead'),
  require('express-validator').body('submittingTo').optional({ nullable: true }).isString(),
]), asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const body = req.body ?? {};
  const patch: Record<string, unknown> = {};

  if (typeof body.firstName === 'string') patch.firstName = body.firstName.trim();
  if (typeof body.lastName === 'string') patch.lastName = body.lastName.trim();
  if (typeof body.email === 'string') patch.email = body.email.trim().toLowerCase();
  if (typeof body.phone === 'string') patch.phone = body.phone.trim();
  if (typeof body.location === 'string') patch.location = body.location.trim();
  if (typeof body.bio === 'string') patch.bio = body.bio.trim();
  if (Object.prototype.hasOwnProperty.call(body, 'submittingTo')) {
    patch.submittingTo =
      typeof body.submittingTo === 'string' && body.submittingTo.trim()
        ? body.submittingTo.trim()
        : null;
  }
  if (typeof body.role === 'string') {
    const roleNorm = body.role.trim().toUpperCase();
    if (roleNorm === 'LEAD' || roleNorm === 'RECRUITER') {
      patch.role = roleNorm;
    }
  }

  const updatedUser = await AuthService.updateProfile(userId, patch as any);

  ResponseHelper.success(res, 'Profile updated successfully', updatedUser);
}));

/**
 * @route   POST /api/auth/me/avatar
 * @desc    Upload/update the authenticated user's profile avatar
 * @access  Private
 */
router.post(
  '/me/avatar',
  authenticate,
  avatarUpload.single('avatar'),
  asyncHandler(async (req, res) => {
    try {
      if (!req.file) {
        return ResponseHelper.error(res, 'avatar file is required', 400);
      }

      const userId = req.user!.id;
      const updatedUser = await AuthService.updateProfile(userId, {
        avatar: req.file.filename,
      } as any);

      ResponseHelper.success(res, 'Avatar uploaded successfully', updatedUser);
    } catch (error: any) {
      ResponseHelper.error(res, error?.message || 'Failed to upload avatar', 500);
    }
  }),
);

/**
 * @route   DELETE /api/auth/me/avatar
 * @desc    Remove the authenticated user's avatar
 * @access  Private
 */
router.delete('/me/avatar', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const user = await AuthService.getUserById(userId);

  // Best-effort delete file from disk.
  if (user?.avatar) {
    const filePath = path.join(AVATARS_DIR, user.avatar);
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (_) {
      // Ignore file deletion failures
    }
  }

  const updatedUser = await AuthService.updateProfile(userId, { avatar: null } as any);
  ResponseHelper.success(res, 'Avatar removed successfully', updatedUser);
}));

/**
 * @route   POST /api/auth/deactivate
 * @desc    Deactivate user account
 * @access  Private
 */
router.post('/deactivate', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  
  await AuthService.deactivateAccount(userId);
  
  ResponseHelper.success(res, 'Account deactivated successfully');
}));

/**
 * @route   DELETE /api/auth/delete
 * @desc    Delete user account
 * @access  Private
 */
router.delete('/delete', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  
  await AuthService.deleteAccount(userId);
  
  ResponseHelper.success(res, 'Account deleted successfully');
}));

/**
 * @route   POST /api/auth/verify-email
 * @desc    Send email verification
 * @access  Private
 */
router.post('/verify-email', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  
  await AuthService.sendEmailVerification(userId);
  
  ResponseHelper.success(res, 'Email verification sent successfully');
}));

/**
 * @route   POST /api/auth/confirm-email
 * @desc    Confirm email verification
 * @access  Public
 */
router.post('/confirm-email', validate([
  require('express-validator').body('token').notEmpty().withMessage('Verification token is required'),
]), asyncHandler(async (req, res) => {
  const { token } = req.body;
  
  const success = await AuthService.confirmEmailVerification(token);
  
  if (success) {
    ResponseHelper.success(res, 'Email verified successfully');
  } else {
    ResponseHelper.error(res, 'Invalid or expired verification token', 400);
  }
}));

/**
 * @route   GET /api/auth/smtp-health
 * @desc    Verify SMTP connectivity
 * @access  Private (Admin/Lead)
 */
router.get('/smtp-health', authenticate, asyncHandler(async (req, res) => {
  if (!['ADMIN', 'LEAD'].includes(req.user!.role)) {
    return ResponseHelper.forbidden(res, 'Insufficient permissions');
  }
  const status = await EmailService.testSmtpConnection();
  if (!status.ok) {
    return ResponseHelper.error(res, status.message, 503);
  }
  ResponseHelper.success(res, status.message, status);
}));

export default router;
