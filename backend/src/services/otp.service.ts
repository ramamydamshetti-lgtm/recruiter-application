import bcrypt from 'bcryptjs';
import jwt, { type Secret, type SignOptions } from 'jsonwebtoken';
import { MailService } from '@/mail/mail.service';
import { NotFoundError, UnauthorizedError } from '@/utils/errors';
import { userWhereEmailInsensitive } from '@/utils/userLookup';

import { prisma } from '@/lib/prisma';

export class OtpService {
  private static readonly OTP_EXPIRY_MINUTES = 10;
  private static readonly OTP_LENGTH = 6;

  /**
   * Send a one-time sign-in code to the user's email (Outlook).
   * Stored separately from password-reset tokens.
   */
  static async sendLoginOtp(email: string): Promise<void> {
    const user = await prisma.user.findFirst({
      where: userWhereEmailInsensitive(email),
      select: { id: true, firstName: true, isActive: true, email: true },
    });

    if (!user) {
      throw new NotFoundError('No account found for this email');
    }

    if (!user.isActive) {
      throw new UnauthorizedError('Account is deactivated');
    }

    const otp = this.generateOtp();
    const expiresAt = new Date(Date.now() + this.OTP_EXPIRY_MINUTES * 60 * 1000);
    const loginOtpHash = await bcrypt.hash(otp, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        loginOtpHash,
        loginOtpExpires: expiresAt,
        resetToken: null,
        resetTokenExpires: null,
      },
    });

    await MailService.sendLoginCodeEmail(user.email, user.firstName, otp, this.OTP_EXPIRY_MINUTES);
  }

  static async verifyLoginOtp(email: string, otp: string): Promise<{ user: any; token: string }> {
    const user = await prisma.user.findFirst({
      where: userWhereEmailInsensitive(email),
    });

    if (!user || !user.loginOtpHash || !user.loginOtpExpires) {
      throw new UnauthorizedError('Invalid or expired code. Request a new code.');
    }

    if (user.loginOtpExpires <= new Date()) {
      throw new UnauthorizedError('Code has expired. Request a new one.');
    }

    const match = await bcrypt.compare(otp.trim(), user.loginOtpHash);
    if (!match) {
      throw new UnauthorizedError('Invalid code');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        loginOtpHash: null,
        loginOtpExpires: null,
        lastLoginAt: new Date(),
      },
    });

    const token = this.generateToken(user);
    const { password: _, resetToken: __, resetTokenExpires: ___, loginOtpHash: ____, loginOtpExpires: _____, ...userWithoutPassword } =
      user;

    return {
      user: userWithoutPassword,
      token,
    };
  }

  private static generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private static generateToken(user: { id: string; email: string; role: string }): string {
    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    return jwt.sign(payload, process.env.JWT_SECRET as Secret, {
      expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as SignOptions['expiresIn'],
    });
  }
}
