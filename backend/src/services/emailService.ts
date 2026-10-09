import crypto from 'crypto';
import { EmailService } from './email.service';

export interface EmailServiceCompat {
  sendWelcomeEmail(email: string, name: string): Promise<void>;
  sendPasswordResetEmail(email: string, token: string): Promise<void>;
  sendLoginCodeEmail(email: string, code: string): Promise<void>;
  sendSecurityAlert(email: string, details: { userAgent?: string; ip?: string; location?: string }): Promise<void>;
  sendEmailVerification(email: string, token: string): Promise<void>;
}

export const generateSecureToken = (length = 32): string =>
  crypto.randomBytes(length).toString('hex');

export const generateLoginCode = (): string =>
  Math.floor(100000 + Math.random() * 900000).toString();

// Backward-compatible shim: all calls route to the single EmailService provider.
export const emailService: EmailServiceCompat = {
  async sendWelcomeEmail(email: string, name: string): Promise<void> {
    await EmailService.sendWelcomeEmail(email, name);
  },
  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    await EmailService.sendPasswordReset(email, token);
  },
  async sendLoginCodeEmail(email: string, code: string): Promise<void> {
    await EmailService.sendOtpEmail(email, code, 'User');
  },
  async sendSecurityAlert(
    email: string,
    details: { userAgent?: string; ip?: string; location?: string },
  ): Promise<void> {
    await EmailService.sendSecurityAlert(email, details);
  },
  async sendEmailVerification(email: string, token: string): Promise<void> {
    await EmailService.sendEmailVerification(email, token);
  },
};

export default emailService;
