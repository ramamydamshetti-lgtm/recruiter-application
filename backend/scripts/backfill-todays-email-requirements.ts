import { PrismaClient, RequirementPriority } from '@prisma/client';

const prisma = new PrismaClient();

function sourceFromEmail(email: string): string {
  const lower = email.toLowerCase();
  if (!lower) return 'Other company / source';
  if (lower.endsWith('@metaforgeit.com')) return 'Metaforge (Internal)';
  if (lower.includes('kpmg')) return 'KPMG';
  if (lower.includes('ust')) return 'UST';
  if (lower.includes('ltts') || lower.includes('lnttechservices')) return 'LTTS';
  if (lower.includes('accenture')) return 'Accenture';
  if (lower.includes('itc')) return 'ITC';
  if (lower.includes('qbruenax')) return 'Qbruenax';
  if (lower.includes('brillio')) return 'Brillio';
  if (lower.includes('happiestminds')) return 'Happiest Minds';
  return 'Other company / source';
}

function getPriority(subject: string): RequirementPriority {
  return /\burgent\b|\basap\b|\bimmediate\b/i.test(subject) ? 'HIGH' : 'MEDIUM';
}

async function getGraphToken(): Promise<string> {
  const tenantId = process.env.GRAPH_TENANT_ID || '';
  const clientId = process.env.GRAPH_CLIENT_ID || '';
  const clientSecret = process.env.GRAPH_CLIENT_SECRET || '';
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Missing GRAPH_TENANT_ID / GRAPH_CLIENT_ID / GRAPH_CLIENT_SECRET in env');
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
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to get Graph token: ${res.status} ${body}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error('Graph token missing access_token');
  return json.access_token;
}

async function run(): Promise<void> {
  const mailbox = process.env.GRAPH_FROM_EMAIL || process.env.FROM_EMAIL || process.env.SMTP_USER || '';
  if (!mailbox) throw new Error('Missing GRAPH_FROM_EMAIL/FROM_EMAIL/SMTP_USER');

  const token = await getGraphToken();
  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const dayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));

  const url =
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages` +
    `?$top=200` +
    `&$select=id,subject,from,toRecipients,ccRecipients,receivedDateTime` +
    `&$orderby=receivedDateTime desc` +
    `&$filter=receivedDateTime ge ${dayStart.toISOString()}`;

  const messagesRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!messagesRes.ok) {
    const body = await messagesRes.text();
    throw new Error(`Failed to fetch mailbox messages: ${messagesRes.status} ${body}`);
  }
  const messagesJson = (await messagesRes.json()) as { value?: Array<any> };
  const messages = messagesJson.value || [];

  const requirements = await prisma.requirement.findMany({
    where: {
      isDeleted: false,
      requirementCreatorName: { equals: 'Email Automation', mode: 'insensitive' },
      createdAt: { gte: dayStart, lt: dayEnd },
    },
    select: { id: true, roleTitle: true, requirementId: true },
    orderBy: { createdAt: 'desc' },
  });

  let updated = 0;

  for (const req of requirements) {
    const match = messages.find(
      (m) =>
        String(m?.subject || '')
          .trim()
          .toLowerCase() === String(req.roleTitle || '').trim().toLowerCase(),
    );
    if (!match) continue;

    const from = String(match?.from?.emailAddress?.address || '').trim();
    const to = String(match?.toRecipients?.[0]?.emailAddress?.address || mailbox).trim();
    const cc = String(match?.ccRecipients?.[0]?.emailAddress?.address || from).trim();

    await prisma.requirement.update({
      where: { id: req.id },
      data: {
        clientLeadPoc: from || 'Not specified',
        clientPoc: cc || from || 'Not specified',
        internalPoc: to || 'Email Automation',
        submittingTo: sourceFromEmail(from),
        priority: getPriority(String(match?.subject || '')),
        demandType: 'Single',
        status: 'OPEN',
        assignment: 'UNASSIGNED',
      },
    });
    updated += 1;
  }

  console.log(
    JSON.stringify({
      totalAutoRequirementsToday: requirements.length,
      messagesFetched: messages.length,
      updatedRequirements: updated,
    }),
  );
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

