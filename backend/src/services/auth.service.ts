import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { LoginRequest, RegisterRequest, AuthResponse, User } from '@/types';
import { ConflictError, UnauthorizedError, NotFoundError } from '@/utils/errors';
import { EmailService } from './email.service';
import { allocateNextUserId } from '../utils/userPublicId';
import { userWhereEmailInsensitive } from '@/utils/userLookup';

import { prisma } from '@/lib/prisma';

export class AuthService {
  /**
   * Register a new user
   */
  static async register(userData: RegisterRequest): Promise<AuthResponse> {
    const email = userData.email.trim().toLowerCase();
    const { password, firstName, lastName, role } = userData;

    // Check if user already exists (case-insensitive; stored email is normalized)
    const existingUser = await prisma.user.findFirst({
      where: userWhereEmailInsensitive(email),
    });

    if (existingUser) {
      throw new ConflictError('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

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
        isActive: true,
        emailVerified: true, // Auto-verify for now
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!/^user-\d{3,}$/.test(user.id)) {
      throw new Error(
        'User id was not stored as user-###. Stop the API, run: npx prisma db execute --file prisma/sql/ensure_user_id_generator.sql && npx prisma generate && npm run build',
      );
    }

    // Generate JWT token
    const token = this.generateToken(user);

    let welcomeEmailSent = false;
    try {
      await EmailService.sendWelcomeEmail(email, firstName);
      welcomeEmailSent = true;
    } catch (error) {
      console.error('Welcome email send failed:', error);
    }

    return {
      user,
      token,
      welcomeEmailSent,
    };
  }

  /**
   * Login user
   */
  static async login(loginData: LoginRequest): Promise<AuthResponse> {
    const { password } = loginData;
    const email = loginData.email.trim().toLowerCase();

    // Find user (case-insensitive match for legacy rows with mixed-case email)
    const user = await prisma.user.findFirst({
      where: userWhereEmailInsensitive(email),
      select: {
        id: true,
        email: true,
        password: true,
        firstName: true,
        lastName: true,
        role: true,
        avatar: true,
        phone: true,
        submittingTo: true,
        location: true,
        bio: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedError('Account is deactivated');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Remove password from user object
    const { password: _, ...userWithoutPassword } = user;

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Generate JWT token
    const token = this.generateToken(userWithoutPassword as User);

    return {
      user: userWithoutPassword as User,
      token,
    };
  }

  /**
   * Generate JWT token
   */
  static generateToken(user: User): string {
    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    return jwt.sign(payload, process.env.JWT_SECRET as jwt.Secret, {
      expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'],
    });
  }

  /**
   * Verify JWT token
   */
  static verifyToken(token: string): any {
    try {
      return jwt.verify(token, process.env.JWT_SECRET!);
    } catch (error) {
      throw new UnauthorizedError('Invalid token');
    }
  }

  /**
   * Refresh token
   */
  static async refreshToken(token: string): Promise<AuthResponse> {
    const decoded = this.verifyToken(token);

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        avatar: true,
        phone: true,
        submittingTo: true,
        location: true,
        bio: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (!user.isActive) {
      throw new UnauthorizedError('Account is deactivated');
    }

    // Generate new token
    const newToken = this.generateToken(user);

    return {
      user,
      token: newToken,
    };
  }

  /**
   * Change password
   */
  static async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    // Get user with password
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);

    if (!isCurrentPasswordValid) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword },
    });
  }

  /**
   * Reset password request
   */
  static async requestPasswordReset(email: string): Promise<string> {
    const user = await prisma.user.findFirst({
      where: userWhereEmailInsensitive(email),
    });

    if (!user) {
      // Don't reveal if user exists or not
      return 'If an account with that email exists, a password reset link has been sent.';
    }

    // Generate reset token
    const resetToken = this.generateResetToken();
    const resetTokenExpires = new Date(Date.now() + 3600000); // 1 hour

    // Save reset token; clear any pending login code
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken,
        resetTokenExpires,
        loginOtpHash: null,
        loginOtpExpires: null,
      },
    });

    // Send password reset link via SMTP email.
    try {
      await EmailService.sendPasswordReset(email, resetToken);
    } catch (error) {
      console.error('Password reset email send failed:', error);
      throw new Error('Failed to send password reset email');
    }

    return 'If an account with that email exists, a password reset link has been sent.';
  }

  /**
   * Reset password
   */
  static async resetPassword(token: string, newPassword: string): Promise<void> {
    // Find user with valid reset token
    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpires: {
          gt: new Date(),
        },
      },
    });

    if (!user) {
      throw new UnauthorizedError('Invalid or expired reset token');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password and clear reset + login code fields
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpires: null,
        loginOtpHash: null,
        loginOtpExpires: null,
      },
    });
  }

  /**
   * Generate password reset token
   */
  private static generateResetToken(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  /**
   * Logout user (invalidate token)
   */
  static async logout(token: string): Promise<void> {
    // In a real application, you might want to implement token blacklisting
    // For now, we'll just return success
    // The client should delete the token from their storage
  }

  /**
   * Get user by ID
   */
  static async getUserById(userId: string): Promise<User | null> {
    return await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        avatar: true,
        phone: true,
        submittingTo: true,
        location: true,
        bio: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Update user profile
   */
  static async updateProfile(userId: string, updateData: Partial<User>): Promise<User> {
    const { id, createdAt, updatedAt, password, emailVerified, ...rest } = updateData;
    const dataToUpdate: Record<string, unknown> = {};
    const allowedKeys = [
      'firstName',
      'lastName',
      'email',
      'phone',
      'location',
      'bio',
      'avatar',
      'submittingTo',
      'role',
    ] as const;
    for (const key of allowedKeys) {
      if (Object.prototype.hasOwnProperty.call(rest, key)) {
        dataToUpdate[key] = (rest as Record<string, unknown>)[key];
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: dataToUpdate,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        avatar: true,
        phone: true,
        submittingTo: true,
        location: true,
        bio: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return updatedUser;
  }

  /**
   * Deactivate user account
   */
  static async deactivateAccount(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });
  }

  /**
   * Delete user account
   */
  static async deleteAccount(userId: string): Promise<void> {
    // This would need to handle cascading deletes for related data
    await prisma.user.delete({
      where: { id: userId },
    });
  }

  /**
   * Send email verification
   */
  static async sendEmailVerification(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const token = await EmailService.generateVerificationToken(userId);
    await EmailService.sendEmailVerification(user.email, token);
  }

  /**
   * Confirm email verification
   */
  static async confirmEmailVerification(token: string): Promise<boolean> {
    return await EmailService.verifyEmailToken(token);
  }
}
