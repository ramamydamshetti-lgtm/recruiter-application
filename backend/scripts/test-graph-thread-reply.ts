/**
 * Diagnose Microsoft Graph thread reply (createReplyAll) vs sendMail vs SMTP.
 *
 * Usage:
 *   cd backend
 *   npx tsx scripts/test-graph-thread-reply.ts
 *   npx tsx scripts/test-graph-thread-reply.ts "Mail to test the Recruiter Application"
 */
import 'dotenv/config';
import { findGraphMessageBySubject, verifySmtpConnection } from '../src/mail/transport';
import { getMailConfig } from '../src/mail/config';

function stripEnv(value: string | undefined): string {
  if (!value) return '';
  let s = value.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1);
  }
  return s.trim();
}

async function getGraphAccessToken(): Promise<string> {
  const tenantId = stripEnv(process.env.GRAPH_TENANT_ID);
  const clientId = stripEnv(process.env.GRAPH_CLIENT_ID);
  const clientSecret = stripEnv(process.env.GRAPH_CLIENT_SECRET);
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  const res = await fetch(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const text = await res.text();
  if (!res.ok) throw new Error(`Token failed: ${res.status} ${text}`);
  const json = JSON.parse(text) as { access_token?: string; expires_in?: number };
  console.log('  Token OK, expires_in:', json.expires_in ?? 'n/a');
  return json.access_token!;
}

async function probeCreateReplyAll(token: string, mailbox: string, messageId: string): Promise<void> {
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}/createReplyAll`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const text = await res.text();
  console.log(`  createReplyAll: HTTP ${res.status}`);
  if (!res.ok) {
    console.log('  ', text.slice(0, 500));
    return;
  }
  const draft = JSON.parse(text) as { id?: string };
  console.log('  createReplyAll draft id:', draft.id?.slice(0, 32) ?? '(none)');
  if (draft.id) {
    const delUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(draft.id)}`;
    await fetch(delUrl, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    console.log('  (test draft deleted)');
  }
}

async function main() {
  const subject = process.argv[2]?.trim() || 'Mail to test the Recruiter Application';
  const mailbox =
    stripEnv(process.env.GRAPH_FROM_EMAIL) ||
    stripEnv(process.env.FROM_EMAIL) ||
    stripEnv(process.env.SMTP_USER);

  console.log('--- Graph thread reply diagnostic ---');
  console.log('  Mailbox:', mailbox || '(missing)');
  console.log('  Subject:', subject);
  console.log('  MAIL_PROVIDER:', process.env.MAIL_PROVIDER || '(auto)');
  console.log('  MAIL_GRAPH_FALLBACK_SMTP:', process.env.MAIL_GRAPH_FALLBACK_SMTP ?? '(unset = false)');
  console.log('');

  const cfg = getMailConfig();
  console.log('--- SMTP (only used when MAIL_GRAPH_FALLBACK_SMTP=true) ---');
  console.log('  SMTP_USER:', cfg.user || '(missing)');
  console.log('  SMTP_PASS:', cfg.pass ? `*** (${cfg.pass.length} chars)` : '(missing)');
  const smtp = await verifySmtpConnection();
  console.log('  verify:', smtp.ok ? 'OK' : 'FAIL', smtp.message);
  console.log('');

  console.log('--- Graph token ---');
  const token = await getGraphAccessToken();
  console.log('');

  console.log('--- Find message by subject ---');
  const found = await findGraphMessageBySubject(mailbox, subject);
  if (!found?.id) {
    console.error('  No message found for subject in mailbox.');
    process.exit(1);
  }
  console.log('  messageId:', found.id);
  console.log('  subject:', found.subject);
  console.log('');

  console.log('--- Probe createReplyAll (needs Mail.ReadWrite app permission) ---');
  await probeCreateReplyAll(token, mailbox, found.id);
  console.log('');
  console.log('If createReplyAll is 403 ErrorAccessDenied: add Mail.ReadWrite Application permission + admin consent.');
  console.log('If SMTP verify fails with 535: fix SMTP creds or keep MAIL_GRAPH_FALLBACK_SMTP unset.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
