/**
 * Verify outbound mail sending (SMTP or Microsoft Graph) and optionally send a test email.
 *
 * Usage:
 *   cd backend
 *   npx tsx scripts/test-smtp.ts              # connection test only
 *   npx tsx scripts/test-smtp.ts you@outlook.com   # also send one test message
 *
 * If you configured Graph:
 *   set GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, GRAPH_FROM_EMAIL (optional)
 * If you configured SMTP:
 *   set SMTP_* variables in .env
 */
import 'dotenv/config';
import { verifySmtpConnection, sendMailWithRetry, resetTransporterForTests } from '../src/mail/transport';
import { formatFromHeader, getMailConfig } from '../src/mail/config';
import { welcomeTemplate } from '../src/mail/templates';

async function main() {
  const testTo = process.argv[2]?.trim();

  console.log('--- Mail configuration (no secrets shown) ---');
  const cfg = getMailConfig();
  console.log('  SMTP Host:', cfg.host);
  console.log('  SMTP User:', cfg.user || '(missing)');
  console.log('  SMTP Pass:', cfg.pass ? `*** (${cfg.pass.length} chars)` : '(missing)');
  console.log('  From header:', cfg.user ? formatFromHeader(cfg) : '(n/a)');

  const hasGraph =
    !!process.env.GRAPH_TENANT_ID &&
    !!process.env.GRAPH_CLIENT_ID &&
    !!process.env.GRAPH_CLIENT_SECRET;
  console.log('  Graph configured:', hasGraph ? 'yes' : 'no');
  console.log('  MAIL_PROVIDER:', process.env.MAIL_PROVIDER || '(auto)');
  console.log('');

  resetTransporterForTests();

  console.log('--- Verifying connection ---');
  const v = await verifySmtpConnection();
  if (!v.ok) {
    console.error('FAILED:', v.message);
    console.error('');
    console.error('Typical fixes:');
    console.error('  - SMTP path: enable SMTP AUTH + use correct password/app password.');
    console.error('  - Graph path: create an Azure AD app with Mail.Send app permission + admin consent, then set GRAPH_* env vars.');
    process.exit(1);
  }
  console.log('OK:', v.message);
  console.log('');

  if (testTo) {
    console.log(`--- Sending test message to ${testTo} ---`);
    const loginUrl = `${cfg.frontendUrl}/login`;
    await sendMailWithRetry({
      to: testTo,
      subject: '[Test] MetaForge Recruiter — SMTP works',
      html: welcomeTemplate('Recruiter', loginUrl),
    });
    console.log('Sent. Check inbox and Junk folder.');
  } else {
    console.log('Connection OK. To also send a test email, run:');
    console.log('  npx tsx scripts/test-smtp.ts your-email@domain.com');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
