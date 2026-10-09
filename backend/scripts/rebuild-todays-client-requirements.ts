import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import {
  getRequirementCalendarTz,
  zonedCalendarDayRangeForInstant,
} from '../src/lib/requirementCalendar';

const prisma = new PrismaClient();

async function getGraphToken(): Promise<string> {
  const tenantId = process.env.GRAPH_TENANT_ID || '';
  const clientId = process.env.GRAPH_CLIENT_ID || '';
  const clientSecret = process.env.GRAPH_CLIENT_SECRET || '';
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

async function run(): Promise<void> {
  const mailbox = process.env.GRAPH_FROM_EMAIL || process.env.FROM_EMAIL || process.env.SMTP_USER || '';
  const internalKey = process.env.INTERNAL_AUTOMATION_API_KEY || '';
  if (!mailbox) throw new Error('Missing mailbox env GRAPH_FROM_EMAIL/FROM_EMAIL/SMTP_USER');
  if (!internalKey) throw new Error('Missing INTERNAL_AUTOMATION_API_KEY');

  const now = new Date();
  const tz = getRequirementCalendarTz();
  const { start, end } = zonedCalendarDayRangeForInstant(now, tz);

  // 1) Remove this calendar day's auto-created rows (same TZ as REQ- ids / API "today").
  const deleted = await prisma.requirement.deleteMany({
    where: {
      requirementCreatorName: { equals: 'Email Automation', mode: 'insensitive' },
      createdAt: { gte: start, lt: end },
    },
  });

  // 2) Pull mailbox messages for the same calendar day (bounded filter).
  const token = await getGraphToken();
  const filter = `receivedDateTime ge ${start.toISOString()} and receivedDateTime lt ${end.toISOString()}`;
  const url =
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages` +
    `?$top=200` +
    `&$select=id,subject,from,toRecipients,ccRecipients,receivedDateTime,internetMessageId,bodyPreview,body` +
    `&$orderby=receivedDateTime asc` +
    `&$filter=${encodeURIComponent(filter)}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const json = (await resp.json()) as { value?: any[] };
  const messages = (json.value || []).sort(
    (a, b) => new Date(a.receivedDateTime).getTime() - new Date(b.receivedDateTime).getTime(),
  );

  // 3) Re-ingest in exact arrival order; backend classifier filters non-requirement emails.
  let created = 0;
  let ignored = 0;
  const createdIds: string[] = [];

  for (const m of messages) {
    const payload = {
      idempotencyKey: `graph:${m.id}`,
      graphMessageId: m.id,
      internetMessageId: m.internetMessageId,
      receivedDateTime: m.receivedDateTime,
      subject: m.subject,
      from: m?.from?.emailAddress?.address || '',
      to: (m?.toRecipients || []).map((x: any) => x?.emailAddress?.address).filter(Boolean),
      cc: (m?.ccRecipients || []).map((x: any) => x?.emailAddress?.address).filter(Boolean),
      bodyPreview: m.bodyPreview || '',
      bodyText: (m?.body?.content || '').replace(/<[^>]+>/g, ' '),
      bodyHtml: m?.body?.content || '',
      clientName: '',
    };

    const ingest = await fetch('http://localhost:8000/api/internal/requirements/ingest-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-api-key': internalKey,
      },
      body: JSON.stringify(payload),
    });
    const ingJson = (await ingest.json()) as any;
    if (ingJson?.data?.ignored) {
      ignored += 1;
      continue;
    }
    if (ingJson?.data?.requirementId) {
      created += 1;
      createdIds.push(ingJson.data.requirementId);
    }
  }

  console.log(
    JSON.stringify({
      calendarTimeZone: tz,
      windowStartUtc: start.toISOString(),
      windowEndUtc: end.toISOString(),
      removedOldAutoRows: deleted.count,
      mailboxMessagesInWindow: messages.length,
      created,
      ignored,
      createdIds,
    }),
  );
}

run()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

