import { APP_PRODUCT_NAME } from './branding';

/**
 * Central SMTP / sender configuration (reads process.env).
 * Official recruiting mailbox should be set via SMTP_USER / FROM_EMAIL in .env — never hardcode passwords in code.
 */
export type MailConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  /** RFC5322 From — defaults to authenticated mailbox (required by Microsoft 365) */
  from: string;
  /** Display name shown in Outlook */
  fromName: string;
  frontendUrl: string;
};

/** Handles values accidentally wrapped in quotes in .env files */
function stripEnv(value: string | undefined): string {
  if (!value) return '';
  let s = value.trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1);
  }
  return s.trim();
}

export function getMailConfig(): MailConfig {
  const host = stripEnv(process.env.SMTP_HOST) || 'smtp.office365.com';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = process.env.SMTP_SECURE === 'true';
  const user = stripEnv(process.env.SMTP_USER);
  const pass = stripEnv(process.env.SMTP_PASS);
  const fromEmail = stripEnv(process.env.FROM_EMAIL) || user;
  const fromName = stripEnv(process.env.SMTP_FROM_NAME) || APP_PRODUCT_NAME;
  const frontendUrl = (stripEnv(process.env.FRONTEND_URL) || 'http://localhost:3000').replace(
    /\/+$/,
    '',
  );

  return {
    host,
    port,
    secure,
    user,
    pass,
    from: fromEmail || user,
    fromName,
    frontendUrl,
  };
}

export function assertSmtpCredentials(): void {
  const { user, pass } = getMailConfig();
  if (!user || !pass) {
    throw new Error('SMTP is not configured: set SMTP_USER and SMTP_PASS in .env');
  }
}

export function formatFromHeader(cfg: MailConfig): string {
  const addr = cfg.user || cfg.from;
  if (!addr) return cfg.fromName;
  return `"${cfg.fromName.replace(/"/g, '')}" <${addr}>`;
}
