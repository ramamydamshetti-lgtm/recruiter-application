import type { MailLogPayload } from '@/services/communicationLogWriter';
import { APP_PRODUCT_NAME } from './branding';
import { getMailConfig } from './config';
import {
  sendGraphReplyAllToMessage,
  sendMailWithRetry,
  verifySmtpConnection,
  type EmailRecipient,
  type MailAttachment,
} from './transport';
import { buildSubmissionSenderIdentity, type SubmissionSenderIdentity } from './submissionSender';
import {
  interviewNotificationSubject,
  interviewNotificationTemplate,
  type InterviewNotificationDetails,
  type InterviewRecruiterSignature,
  loginCodeTemplate,
  offerLetterReleasedEmailHtml,
  type OfferLetterEmailDetails,
  passwordResetTemplate,
  securityAlertTemplate,
  verifyEmailTemplate,
  welcomeTemplate,
} from './templates';

import { prisma } from '@/lib/prisma';

/**
 * Application mail: welcome, login codes, password reset, verification.
 * Configure SMTP via .env (SMTP_USER = official sender mailbox, SMTP_PASS = app password or mailbox password).
 */
export class MailService {
  static async testSmtpConnection(): Promise<{ ok: boolean; message: string }> {
    return verifySmtpConnection();
  }

  static async sendWelcomeEmail(to: string, firstName: string): Promise<void> {
    const cfg = getMailConfig();
    const loginUrl = `${cfg.frontendUrl}/login`;
    await sendMailWithRetry({
      to,
      subject: `Welcome — ${APP_PRODUCT_NAME}`,
      html: welcomeTemplate(firstName, loginUrl),
    });
  }

  /** @deprecated Use sendWelcomeEmail */
  static async sendCongratulationsEmail(
    to: string,
    firstName: string,
    _lastName: string,
  ): Promise<void> {
    await this.sendWelcomeEmail(to, firstName);
  }

  static async sendLoginCodeEmail(to: string, firstName: string, code: string, minutesValid: number): Promise<void> {
    await sendMailWithRetry({
      to,
      subject: `Your sign-in code — ${APP_PRODUCT_NAME}`,
      html: loginCodeTemplate(firstName, code, minutesValid),
    });
  }

  /** @deprecated Prefer sendLoginCodeEmail */
  static async sendOtpEmail(to: string, otp: string, firstName: string): Promise<void> {
    await this.sendLoginCodeEmail(to, firstName, otp, 10);
  }

  static async sendPasswordReset(to: string, token: string): Promise<void> {
    const cfg = getMailConfig();
    const resetUrl = `${cfg.frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
    await sendMailWithRetry({
      to,
      subject: `Reset your password — ${APP_PRODUCT_NAME}`,
      html: passwordResetTemplate(resetUrl),
    });
  }

  static async sendEmailVerification(to: string, token: string): Promise<void> {
    const cfg = getMailConfig();
    const verifyUrl = `${cfg.frontendUrl}/verify-email?token=${encodeURIComponent(token)}`;
    await sendMailWithRetry({
      to,
      subject: `Verify your email — ${APP_PRODUCT_NAME}`,
      html: verifyEmailTemplate(verifyUrl),
    });
  }

  static async sendSecurityAlert(
    to: string,
    details: { userAgent?: string; ip?: string; location?: string },
  ): Promise<void> {
    await sendMailWithRetry({
      to,
      subject: `New sign-in — ${APP_PRODUCT_NAME}`,
      html: securityAlertTemplate({ ip: details.ip, userAgent: details.userAgent }),
    });
  }

  /** Notify a candidate about an interview (uses SMTP or Microsoft Graph from .env). */
  static async sendInterviewNotificationEmail(
    to: string,
    candidateName: string,
    details: InterviewNotificationDetails,
    recruiter: InterviewRecruiterSignature,
    mailLog?: MailLogPayload,
  ): Promise<void> {
    await sendMailWithRetry({
      to,
      subject: interviewNotificationSubject(details),
      html: interviewNotificationTemplate(candidateName, details, recruiter),
      ...(mailLog ? { mailLog } : {}),
    });
  }

  /** Email a client with candidate summary and resume file attachments (when stored on server). */
  static async sendClientSubmissionEmail(
    to: string,
    subject: string,
    html: string,
    attachments: MailAttachment[],
    mailLog?: MailLogPayload,
    submissionSender?: SubmissionSenderIdentity,
  ): Promise<void> {
    await sendMailWithRetry({
      to,
      subject,
      html,
      attachments: attachments.length ? attachments : undefined,
      submissionSender,
      ...(mailLog ? { mailLog } : {}),
    });
  }

  /** Reply inside the original requirement email thread with candidate summary + resumes. */
  static async replyToRequirementThreadWithClientSubmission(input: {
    mailbox?: string;
    graphMessageId: string;
    html: string;
    attachments: MailAttachment[];
    mailLog?: MailLogPayload & { subject?: string; recipient?: string };
    toRecipients?: EmailRecipient[];
    ccRecipients?: EmailRecipient[];
    bccRecipients?: EmailRecipient[];
    replySubject?: string;
    submissionSender?: SubmissionSenderIdentity;
  }): Promise<void> {
    await sendGraphReplyAllToMessage({
      mailbox: input.mailbox,
      messageId: input.graphMessageId,
      html: input.html,
      attachments: input.attachments.length ? input.attachments : undefined,
      toRecipients: input.toRecipients,
      ccRecipients: input.ccRecipients,
      bccRecipients: input.bccRecipients,
      replySubject: input.replySubject,
      submissionSender: input.submissionSender,
      ...(input.mailLog ? { mailLog: input.mailLog } : {}),
    });
  }

  static buildSubmissionSenderFromUser(user: {
    firstName: string;
    lastName: string;
    email: string;
  }, displayNameOverride?: string): SubmissionSenderIdentity {
    return buildSubmissionSenderIdentity({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      displayNameOverride,
    });
  }

  /** Email the candidate when an offer letter is released (same transport as interview notifications). */
  static async sendOfferLetterReleasedEmail(
    to: string,
    candidateName: string,
    details: OfferLetterEmailDetails,
    mailLog?: MailLogPayload,
  ): Promise<void> {
    const pos = details.positionTitle?.trim() || details.roleTitle?.trim();
    const subject = pos
      ? `Formal offer — ${pos} — Metaforge IT Solutions`
      : 'Formal offer — Metaforge IT Solutions';
    await sendMailWithRetry({
      to,
      subject,
      html: offerLetterReleasedEmailHtml(candidateName, details),
      ...(mailLog ? { mailLog } : {}),
    });
  }

  static async generateVerificationToken(userId: string): Promise<string> {
    const token =
      Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    await prisma.user.update({
      where: { id: userId },
      data: { verificationToken: token },
    });
    return token;
  }

  static async verifyEmailToken(token: string): Promise<boolean> {
    try {
      const user = await prisma.user.findFirst({
        where: { verificationToken: token },
        select: { id: true },
      });
      if (!user) return false;
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true, verificationToken: null },
      });
      return true;
    } catch (e) {
      console.error('[mail] verifyEmailToken', e);
      return false;
    }
  }

  static async isEmailVerified(userId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { emailVerified: true },
    });
    return user?.emailVerified ?? false;
  }
}
