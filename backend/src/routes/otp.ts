import { Router } from 'express';
import { OtpService } from '@/services/otp.service';
import { ResponseHelper } from '@/utils/response';
import { validate } from '@/utils/validation';
import { validateEmailDomain } from '@/middleware/emailDomain';
import { asyncHandler } from '@/middleware/errorHandler';

const router = Router();

/**
 * @route   POST /api/otp/send
 * @desc    Send OTP for email login
 * @access  Public
 */
router.post('/send', validateEmailDomain, validate([
  require('express-validator').body('email').isEmail().withMessage('Valid email is required'),
]), asyncHandler(async (req, res) => {
  const { email } = req.body;
  
  await OtpService.sendLoginOtp(email);
  
  ResponseHelper.success(res, 'OTP sent to your email');
}));

/**
 * @route   POST /api/otp/verify
 * @desc    Verify OTP and login
 * @access  Public
 */
router.post('/verify', validate([
  require('express-validator').body('email').isEmail().withMessage('Valid email is required'),
  require('express-validator').body('otp').isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits'),
]), asyncHandler(async (req, res) => {
  const { email, otp } = req.body;
  
  const result = await OtpService.verifyLoginOtp(email, otp);
  
  ResponseHelper.success(res, 'Login successful', result);
}));

export default router;
