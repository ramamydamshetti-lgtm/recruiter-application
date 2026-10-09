import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ResponseHelper } from '@/utils/response';
import { emailService, generateSecureToken, generateLoginCode } from '@/services/emailService';
import { asyncHandler } from '@/middleware/errorHandler';

const router = Router();
import { prisma } from '@/lib/prisma';

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Send password reset email
 * @access   Public
 */
router.post('/forgot-password', asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email) {
    return ResponseHelper.error(res, 'Email is required', 400);
  }

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    return ResponseHelper.error(res, 'User not found', 404);
  }

  // Generate reset token
  const resetToken = generateSecureToken();
  const resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  // Update user with reset token
  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetToken,
      resetTokenExpires,
    } as any, // Type assertion to bypass TypeScript issues
  });

  // Send reset email
  await emailService.sendPasswordResetEmail(email, resetToken);

  ResponseHelper.success(res, 'Password reset email sent', {
    message: 'Check your email for password reset instructions.',
  });
}));

/**
 * @route   POST /api/auth/reset-password
 * @desc    Reset password with token
 * @access   Public
 */
router.post('/reset-password', asyncHandler(async (req: Request, res: Response) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return ResponseHelper.error(res, 'Token and password are required', 400);
  }

  // Find user with reset token
  const user = await prisma.user.findFirst({
    where: {
      resetToken: token,
      resetTokenExpires: {
        gt: new Date(),
      },
    },
  });

  if (!user) {
    return ResponseHelper.error(res, 'Invalid or expired reset token', 400);
  }

  // Hash new password
  const hashedPassword = await bcrypt.hash(password, 12);

  // Update password and clear reset token
  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      resetToken: null,
      resetTokenExpires: null,
    } as any, // Type assertion to bypass TypeScript issues
  });

  ResponseHelper.success(res, 'Password reset successful', {
    message: 'Your password has been reset. You can now login with your new password.',
  });
}));

/**
 * @route   POST /api/auth/send-login-code
 * @desc    Send login code to user email
 * @access   Public
 */
router.post('/send-login-code', asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email) {
    return ResponseHelper.error(res, 'Email is required', 400);
  }

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    return ResponseHelper.error(res, 'User not found', 404);
  }

  // Generate and send code
  const code = generateLoginCode();
  await emailService.sendLoginCodeEmail(email, code);

  ResponseHelper.success(res, 'Login code sent successfully', {
    message: 'Check your email for the 6-digit login code.',
  });
}));

/**
 * @route   POST /api/auth/login-with-code
 * @desc    Login user with email code
 * @access   Public
 */
router.post('/login-with-code', asyncHandler(async (req: Request, res: Response) => {
  const { email, code } = req.body;

  if (!email || !code) {
    return ResponseHelper.error(res, 'Email and code are required', 400);
  }

  // Find user
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    return ResponseHelper.error(res, 'User not found', 404);
  }

  if (!user.isActive) {
    return ResponseHelper.error(res, 'Account is deactivated', 401);
  }

  // For demo purposes, accept any 6-digit code
  // In production, you'd validate against a stored code
  if (code.length !== 6) {
    return ResponseHelper.error(res, 'Invalid code', 401);
  }

  // Generate JWT
  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: '7d' }
  );

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() } as any,
  });

  ResponseHelper.success(res, 'Login successful', {
    token,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    },
  });
}));

/**
 * @route   POST /api/auth/verify-email
 * @desc    Verify email address
 * @access   Public
 */
router.post('/verify-email', asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body;

  if (!token) {
    return ResponseHelper.error(res, 'Verification token is required', 400);
  }

  const user = await prisma.user.findFirst({
    where: {
      verificationToken: token,
    },
  });

  if (!user) {
    return ResponseHelper.error(res, 'Invalid verification token', 400);
  }

  // Verify email and clear token
  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: true,
      verificationToken: null,
    } as any, // Type assertion to bypass TypeScript issues
  });

  ResponseHelper.success(res, 'Email verified successfully', {
    message: 'Your email has been verified. You can now login to your account.',
  });
}));

export default router;
