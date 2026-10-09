import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ResponseHelper } from '@/utils/response';
import { emailService, generateSecureToken, generateLoginCode } from '@/services/emailService';
import { authenticate, AuthenticatedRequest } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errorHandler';
import { allocateNextUserId } from '../utils/userPublicId';
import { z } from 'zod';

const router = Router();
import { prisma } from '@/lib/prisma';

// Validation schemas
const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  role: z.enum(['CANDIDATE', 'RECRUITER', 'LEAD']).default('CANDIDATE'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

const loginWithCodeSchema = z.object({
  email: z.string().email('Invalid email format'),
  code: z.string().length(6, 'Code must be 6 digits'),
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email format'),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const setLoginPreferenceSchema = z.object({
  loginPreference: z.enum(['password', 'code']),
});

/**
 * @route   POST /api/auth/register
 * @desc    Register new user with email verification
 * @access   Public
 */
router.post('/register', asyncHandler(async (req: Request, res: Response) => {
  const validatedData = registerSchema.parse(req.body);
  const { email, password, firstName, lastName, role } = validatedData;

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    return ResponseHelper.error(res, 'User with this email already exists', 409);
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 12);

  // Generate verification token
  const verificationToken = generateSecureToken();

  const id = await allocateNextUserId(prisma);

  // Create user
  const user = await prisma.user.create({
    data: {
      id,
      email,
      password: hashedPassword,
      firstName,
      lastName,
      role,
      verificationToken,
      emailVerified: false,
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      emailVerified: true,
      createdAt: true,
    },
  });

  // Send welcome email
  await emailService.sendWelcomeEmail(email, `${firstName} ${lastName}`);
  
  // Send verification email
  await emailService.sendEmailVerification(email, verificationToken);

  ResponseHelper.success(res, 'User registered successfully. Please check your email for verification.', {
    user,
    message: 'Verification email sent. Please check your inbox.',
  });
}));

/**
 * @route   POST /api/auth/login
 * @desc    Login user with password
 * @access   Public
 */
router.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const validatedData = loginSchema.parse(req.body);
  const { email, password } = validatedData;

  // Find user
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    return ResponseHelper.error(res, 'Invalid email or password', 401);
  }

  // Check if user is active
  if (!user.isActive) {
    return ResponseHelper.error(res, 'Account is deactivated', 401);
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    return ResponseHelper.error(res, 'Invalid email or password', 401);
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
    data: { lastLoginAt: new Date() },
  });

  // Send security alert for new login
  await emailService.sendSecurityAlert(user.email, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    location: 'Unknown', // You can integrate IP geolocation service here
  });

  ResponseHelper.success(res, 'Login successful', {
    token,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      emailVerified: user.emailVerified,
      loginPreference: user.loginPreference,
    },
  });
}));

/**
 * @route   POST /api/auth/login-with-code
 * @desc    Login user with email code
 * @access   Public
 */
router.post('/login-with-code', asyncHandler(async (req: Request, res: Response) => {
  const validatedData = loginWithCodeSchema.parse(req.body);
  const { email, code } = validatedData;

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

  // Verify code (you'd need to store this in the database)
  // For now, we'll accept any 6-digit code for demo
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
    data: { lastLoginAt: new Date() },
  });

  ResponseHelper.success(res, 'Login successful', {
    token,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      emailVerified: user.emailVerified,
      loginPreference: user.loginPreference,
    },
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
 * @route   POST /api/auth/forgot-password
 * @desc    Send password reset email
 * @access   Public
 */
router.post('/forgot-password', asyncHandler(async (req: Request, res: Response) => {
  const validatedData = forgotPasswordSchema.parse(req.body);
  const { email } = validatedData;

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    return ResponseHelper.error(res, 'User not found', 404);
  }

  // Generate reset token
  const resetToken = generateSecureToken();
  const resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  // Save reset token
  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetToken,
      resetTokenExpires,
    },
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
  const validatedData = resetPasswordSchema.parse(req.body);
  const { token, password } = validatedData;

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
    },
  });

  ResponseHelper.success(res, 'Password reset successful', {
    message: 'Your password has been reset. You can now login with your new password.',
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
    },
  });

  ResponseHelper.success(res, 'Email verified successfully', {
    message: 'Your email has been verified. You can now login to your account.',
  });
}));

/**
 * @route   POST /api/auth/set-login-preference
 * @desc    Set user login preference
 * @access   Private
 */
router.post('/set-login-preference', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const validatedData = setLoginPreferenceSchema.parse(req.body);
  const { loginPreference } = validatedData;

  await prisma.user.update({
    where: { id: req.user!.id },
    data: { loginPreference },
  });

  ResponseHelper.success(res, 'Login preference updated', {
    loginPreference,
  });
}));

/**
 * @route   GET /api/auth/me
 * @desc    Get current user profile
 * @access   Private
 */
router.get('/me', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
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
      emailVerified: true,
      loginPreference: true,
      createdAt: true,
      lastLoginAt: true,
    },
  });

  ResponseHelper.success(res, 'User profile retrieved', { user });
}));

export default router;
