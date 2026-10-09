import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { query } from './db';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  title: string;
  role: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export class AuthService {
  private static readonly JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';
  private static readonly JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

  static async hashPassword(password: string): Promise<string> {
    const saltRounds = 12;
    return bcrypt.hash(password, saltRounds);
  }

  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  static generateToken(user: AuthUser): string {
    return jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      this.JWT_SECRET,
      { expiresIn: this.JWT_EXPIRES_IN }
    );
  }

  static verifyToken(token: string): any {
    try {
      return jwt.verify(token, this.JWT_SECRET);
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  static async login(credentials: LoginCredentials): Promise<{ user: AuthUser; token: string }> {
    const { email, password } = credentials;

    // Find user by email
    const result = await query(
      'SELECT id, name, email, password_hash, title, role, is_active FROM recruiters WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      throw new Error('Invalid credentials');
    }

    const user = result.rows[0];

    if (!user.is_active) {
      throw new Error('Account is deactivated');
    }

    // Verify password
    const isPasswordValid = await this.verifyPassword(password, user.password_hash);
    if (!isPasswordValid) {
      throw new Error('Invalid credentials');
    }

    // Update last login
    await query(
      'UPDATE recruiters SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );

    // Create session
    const sessionToken = this.generateToken({
      id: user.id,
      name: user.name,
      email: user.email,
      title: user.title,
      role: user.role,
    });

    // Store session in database
    await query(
      'INSERT INTO user_sessions (recruiter_id, session_token, expires_at) VALUES ($1, $2, $3)',
      [user.id, sessionToken, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)] // 7 days
    );

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        title: user.title,
        role: user.role,
      },
      token: sessionToken,
    };
  }

  static async logout(token: string): Promise<void> {
    await query('DELETE FROM user_sessions WHERE session_token = $1', [token]);
  }

  static async getCurrentUser(token: string): Promise<AuthUser | null> {
    try {
      const decoded = this.verifyToken(token);
      
      // Check if session exists and is valid
      const sessionResult = await query(
        'SELECT recruiter_id FROM user_sessions WHERE session_token = $1 AND expires_at > CURRENT_TIMESTAMP',
        [token]
      );

      if (sessionResult.rows.length === 0) {
        return null;
      }

      // Get user details
      const userResult = await query(
        'SELECT id, name, email, title, role, is_active FROM recruiters WHERE id = $1',
        [decoded.id]
      );

      if (userResult.rows.length === 0 || !userResult.rows[0].is_active) {
        return null;
      }

      const user = userResult.rows[0];
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        title: user.title,
        role: user.role,
      };
    } catch (error) {
      return null;
    }
  }

  static async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    // Get current password hash
    const result = await query(
      'SELECT password_hash FROM recruiters WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    const currentHash = result.rows[0].password_hash;
    
    // Verify current password
    const isCurrentPasswordValid = await this.verifyPassword(currentPassword, currentHash);
    if (!isCurrentPasswordValid) {
      throw new Error('Current password is incorrect');
    }

    // Hash new password
    const newHash = await this.hashPassword(newPassword);

    // Update password
    await query(
      'UPDATE recruiters SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newHash, userId]
    );

    // Invalidate all sessions for this user (force re-login)
    await query('DELETE FROM user_sessions WHERE recruiter_id = $1', [userId]);
  }

  static async cleanupExpiredSessions(): Promise<void> {
    await query('DELETE FROM user_sessions WHERE expires_at <= CURRENT_TIMESTAMP');
  }
}
