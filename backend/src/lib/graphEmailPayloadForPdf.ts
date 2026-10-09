/**
 * Optional: build an ingest-shaped payload from Microsoft Graph when the DB
 * never stored EmailIngestionEvent.payload (legacy rows, failed writes, etc.).
 * No-op if Graph app credentials or mailbox env are missing.
 */
import { htmlToPlainTextForArchive } from '@/lib/emailHtmlToText';

function env(name: string): string {
  return String(process.env[name] || '').trim();
}

export async function tryFetchGraphMessagePayload(graphMessageId: string): Promise<Record<string, unknown> | null> {
  const id = String(graphMessageId || '').trim();
  if (!id) return null;

  const tenantId = env('GRAPH_TENANT_ID');
  const clientId = env('GRAPH_CLIENT_ID');
  const clientSecret = env('GRAPH_CLIENT_SECRET');
  const mailbox = env('GRAPH_FROM_EMAIL') || env('FROM_EMAIL') || env('SMTP_USER');
  if (!tenantId || !clientId || !clientSecret || !mailbox) return null;

  try {
    const tokenRes = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    });
    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    if (!tokenJson.access_token) return null;

    const url =
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(id)}` +
      `?$select=subject,body,bodyPreview,from,toRecipients,ccRecipients,receivedDateTime,internetMessageId`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${tokenJson.access_token}` } });
    if (!resp.ok) return null;

    const m = (await resp.json()) as {
      subject?: string;
      body?: { content?: string };
      bodyPreview?: string;
      from?: { emailAddress?: { address?: string } };
      toRecipients?: Array<{ emailAddress?: { address?: string } }>;
      ccRecipients?: Array<{ emailAddress?: { address?: string } }>;
      receivedDateTime?: string;
      internetMessageId?: string;
    };

    const html = m?.body?.content || '';
    return {
      subject: String(m.subject || ''),
      bodyHtml: html,
      bodyText: htmlToPlainTextForArchive(html),
      bodyPreview: String(m.bodyPreview || ''),
      from: m?.from?.emailAddress?.address || '',
      to: (m.toRecipients || []).map((x) => x?.emailAddress?.address || '').filter(Boolean),
      cc: (m.ccRecipients || []).map((x) => x?.emailAddress?.address || '').filter(Boolean),
      graphMessageId: id,
      internetMessageId: m.internetMessageId || '',
      receivedDateTime: m.receivedDateTime || '',
    };
  } catch {
    return null;
  }
}
