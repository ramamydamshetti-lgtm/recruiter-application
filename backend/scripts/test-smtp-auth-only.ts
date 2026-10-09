/**
 * SMTP-only auth probe (separate from Graph).
 * Usage: npx tsx scripts/test-smtp-auth-only.ts
 */
import 'dotenv/config';
import { resetTransporterForTests } from '../src/mail/transport';
import { getMailConfig } from '../src/mail/config';
import nodemailer from 'nodemailer';

async function main() {
  resetTransporterForTests();
  const cfg = getMailConfig();
  console.log('--- SMTP auth probe (raw nodemailer verify) ---');
  console.log('  Host:', cfg.host);
  console.log('  Port:', cfg.port);
  console.log('  User:', cfg.user);
  console.log('  Pass length:', cfg.pass?.length ?? 0);
  console.log('');

  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    requireTLS: cfg.port === 587,
    logger: true,
    debug: true,
  });

  try {
    await transport.verify();
    console.log('SMTP verify: OK');
  } catch (error) {
    console.error('SMTP verify FAILED:');
    console.error(error instanceof Error ? error.message : String(error));
    if (error && typeof error === 'object' && 'response' in error) {
      console.error('SMTP server response:', (error as { response?: string }).response);
    }
    if (error && typeof error === 'object' && 'responseCode' in error) {
      console.error('SMTP response code:', (error as { responseCode?: number }).responseCode);
    }
    process.exit(1);
  }
}

main();
