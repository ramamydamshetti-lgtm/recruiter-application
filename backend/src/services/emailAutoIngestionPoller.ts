import { htmlToPlainTextForArchive } from '@/lib/emailHtmlToText';

type GraphMessage = {
  id: string;
  subject?: string;
  from?: { emailAddress?: { address?: string } };
  toRecipients?: Array<{ emailAddress?: { address?: string } }>;
  ccRecipients?: Array<{ emailAddress?: { address?: string } }>;
  receivedDateTime?: string;
  internetMessageId?: string;
  bodyPreview?: string;
  body?: { content?: string; contentType?: string };
};

let timer: NodeJS.Timeout | null = null;
let inProgress = false;
let lastSeenReceivedAt: Date | null = null;
const seenMessageIds = new Set<string>();

function env(name: string): string {
  return String(process.env[name] || '').trim();
}

function isEnabled(): boolean {
  const v = env('EMAIL_AUTO_INGEST_ENABLED').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

async function getGraphToken(): Promise<string> {
  const tenantId = env('GRAPH_TENANT_ID');
  const clientId = env('GRAPH_CLIENT_ID');
  const clientSecret = env('GRAPH_CLIENT_SECRET');
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Missing GRAPH_TENANT_ID / GRAPH_CLIENT_ID / GRAPH_CLIENT_SECRET');
  }
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  });
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error('Failed to get Graph token');
  return json.access_token;
}

function toAddressList(list: GraphMessage['toRecipients']): string[] {
  return (list || []).map((x) => x?.emailAddress?.address || '').filter(Boolean);
}

async function fetchFullGraphMessage(
  token: string,
  mailbox: string,
  messageId: string,
): Promise<GraphMessage | null> {
  const url =
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}` +
    `?$select=id,subject,from,toRecipients,ccRecipients,receivedDateTime,internetMessageId,bodyPreview,body`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) return null;
  return (await resp.json()) as GraphMessage;
}

async function pollOnce(): Promise<void> {
  if (inProgress) return;
  inProgress = true;
  try {
    const mailbox = env('GRAPH_FROM_EMAIL') || env('FROM_EMAIL') || env('SMTP_USER');
    const internalKey = env('INTERNAL_AUTOMATION_API_KEY');
    if (!mailbox || !internalKey) return;

    const intervalMs = Math.max(15000, Number(env('EMAIL_AUTO_INGEST_INTERVAL_MS') || 120000));
    const lookbackMinutes = Math.max(5, Number(env('EMAIL_AUTO_INGEST_LOOKBACK_MINUTES') || 30));
    const port = Number(env('PORT') || 8000);

    const now = new Date();
    const since = lastSeenReceivedAt
      ? new Date(lastSeenReceivedAt.getTime() - 60 * 1000)
      : new Date(now.getTime() - lookbackMinutes * 60 * 1000);

    const token = await getGraphToken();
    const filter = `receivedDateTime ge ${since.toISOString()}`;
    const url =
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages` +
      `?$top=100` +
      `&$select=id,subject,from,toRecipients,ccRecipients,receivedDateTime,internetMessageId,bodyPreview,body` +
      `&$orderby=receivedDateTime asc` +
      `&$filter=${encodeURIComponent(filter)}`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const json = (await resp.json()) as { value?: GraphMessage[] };
    const messages = (json.value || []).sort(
      (a, b) => new Date(a.receivedDateTime || 0).getTime() - new Date(b.receivedDateTime || 0).getTime(),
    );

    let processed = 0;
    for (const m of messages) {
      if (!m.id || seenMessageIds.has(m.id)) continue;
      const full = await fetchFullGraphMessage(token, mailbox, m.id);
      const src = full || m;
      const htmlBody = src?.body?.content || '';
      const payload = {
        idempotencyKey: `graph:${m.id}`,
        graphMessageId: m.id,
        mailbox,
        sourceMailbox: mailbox,
        internetMessageId: src.internetMessageId || '',
        receivedDateTime: src.receivedDateTime || '',
        subject: src.subject || '',
        from: src?.from?.emailAddress?.address || '',
        to: toAddressList(src.toRecipients),
        cc: toAddressList(src.ccRecipients),
        bodyPreview: src.bodyPreview || '',
        bodyText: htmlToPlainTextForArchive(htmlBody),
        bodyHtml: htmlBody,
        clientName: '',
      };
      const ingest = await fetch(`http://127.0.0.1:${port}/api/internal/requirements/ingest-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-api-key': internalKey,
        },
        body: JSON.stringify(payload),
      });
      if (ingest.ok) {
        processed += 1;
        seenMessageIds.add(m.id);
      }
      if (m.receivedDateTime) {
        const d = new Date(m.receivedDateTime);
        if (!Number.isNaN(d.getTime()) && (!lastSeenReceivedAt || d > lastSeenReceivedAt)) {
          lastSeenReceivedAt = d;
        }
      }
    }

    if (seenMessageIds.size > 1000) {
      const keep = Array.from(seenMessageIds).slice(-500);
      seenMessageIds.clear();
      keep.forEach((id) => seenMessageIds.add(id));
    }

    if (processed > 0) {
      console.log(`[email-auto-ingest] processed ${processed} message(s) in poll window`);
    }

    // Keep cadence stable regardless of occasional long polls.
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void pollOnce(), intervalMs);
  } catch (error) {
    console.error('[email-auto-ingest] poll failed:', error);
    const intervalMs = Math.max(15000, Number(env('EMAIL_AUTO_INGEST_INTERVAL_MS') || 120000));
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void pollOnce(), intervalMs);
  } finally {
    inProgress = false;
  }
}

export function startEmailAutoIngestionPoller(): void {
  if (!isEnabled()) {
    console.log('[email-auto-ingest] disabled (set EMAIL_AUTO_INGEST_ENABLED=true to enable)');
    return;
  }
  if (timer) return;
  console.log('[email-auto-ingest] starting poller');
  void pollOnce();
}

export function stopEmailAutoIngestionPoller(): void {
  if (!timer) return;
  clearTimeout(timer);
  timer = null;
  console.log('[email-auto-ingest] stopped poller');
}

