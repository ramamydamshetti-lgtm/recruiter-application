import { Router } from 'express';
import { AuthService } from '@/services/auth.service';
import { OtpService } from '@/services/otp.service';
import { ResponseHelper } from '@/utils/response';
import { validate } from '@/utils/validation';
import { validateEmailDomain } from '@/middleware/emailDomain';
import { asyncHandler } from '@/middleware/errorHandler';

import { prisma } from '@/lib/prisma';
const router = Router();

/**
 * @route   POST /api/login/password
 * @desc    Login with password
 * @access  Public
 */
router.post('/password', validateEmailDomain, validate([
  require('express-validator').body('email').isEmail().withMessage('Valid email is required'),
  require('express-validator').body('password').notEmpty().withMessage('Password is required'),
]), asyncHandler(async (req, res) => {
  const result = await AuthService.login(req.body);
  
  ResponseHelper.success(res, 'Password login successful', result);
}));

/**
 * @route   POST /api/login/otp/send
 * @desc    Send OTP for login
 * @access  Public
 */
router.post('/otp/send', validateEmailDomain, validate([
  require('express-validator').body('email').isEmail().withMessage('Valid email is required'),
]), asyncHandler(async (req, res) => {
  const { email } = req.body;
  
  await OtpService.sendLoginOtp(email);
  
  ResponseHelper.success(res, 'OTP sent to your email');
}));

/**
 * @route   POST /api/login/otp/verify
 * @desc    Login with OTP
 * @access  Public
 */
router.post('/otp/verify', validate([
  require('express-validator').body('email').isEmail().withMessage('Valid email is required'),
  require('express-validator').body('otp').isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits'),
]), asyncHandler(async (req, res) => {
  const { email, otp } = req.body;
  
  const result = await OtpService.verifyLoginOtp(email, otp);
  
  ResponseHelper.success(res, 'OTP login successful', result);
}));

/**
 * @route   GET /api/login/methods
 * @desc    Get available login methods for email
 * @access  Public
 */
router.get('/methods', validateEmailDomain, validate([
  require('express-validator').query('email').isEmail().withMessage('Valid email is required'),
]), asyncHandler(async (req, res) => {
  const { email } = req.query as { email: string };
  
  // Check if user exists
  const user = await prisma.user.findUnique({
    where: { email },
    select: { 
      id: true, 
      email: true, 
      emailVerified: true,
      createdAt: true 
    },
  });

  if (!user) {
    return ResponseHelper.error(res, 'User not found', 404);
  }

  // Return available login methods
  const methods = {
    password: true, // Always available
    otp: user.emailVerified, // Only if email is verified
    user: {
      email: user.email,
      emailVerified: user.emailVerified,
      registeredAt: user.createdAt,
    }
  };
  
  ResponseHelper.success(res, 'Login methods retrieved', methods);
}));

export default router;
