import { PrismaClient, RequirementPriority } from '@prisma/client';

const prisma = new PrismaClient();

function normalizeSubject(raw: string): string {
  return raw
    .replace(/^\s*(re|fw|fwd)\s*:\s*/gi, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}

function extractEmails(raw: any): string[] {
  const txt = JSON.stringify(raw ?? '');
  const matches = txt.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
    const k = m.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(m);
    }
  }
  return out;
}

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

function labeledValue(text: string, labels: string[]): string {
  for (const l of labels) {
    const rx = new RegExp(`(?:^|\\n)\\s*${l}\\s*[:=-]\\s*([^\\n\\r]+)`, 'i');
    const m = text.match(rx);
    if (m?.[1]) return m[1].trim();
  }
  return '';
}

function parseSkills(raw: string): string[] {
  return raw
    .split(/[;,]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseBudget(raw: string): number | null {
  if (!raw) return null;
  const s = raw.replace(/,/g, '').trim().toLowerCase();
  const m = s.match(/(\d+(?:\.\d+)?)(?:\s*)(lpa|lpm|lakh)?/);
  if (!m) return null;
  const n = parseFloat(m[1] || '');
  if (!Number.isFinite(n)) return null;
  if (m[2] && (m[2] === 'lpa' || m[2] === 'lpm' || m[2] === 'lakh')) return n * 100000;
  return n;
}

function parsePriority(subject: string, explicit: string): RequirementPriority {
  const e = explicit.trim().toUpperCase();
  if (e === 'HIGH' || e === 'MEDIUM' || e === 'LOW') return e;
  if (/\burgent\b|\basap\b|\bimmediate\b/i.test(subject)) return 'HIGH';
  return 'MEDIUM';
}

async function getGraphToken(): Promise<string> {
  const tenantId = process.env.GRAPH_TENANT_ID || '';
  const clientId = process.env.GRAPH_CLIENT_ID || '';
  const clientSecret = process.env.GRAPH_CLIENT_SECRET || '';
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
  if (!json.access_token) throw new Error('Unable to get Graph token');
  return json.access_token;
}

async function run(): Promise<void> {
  const mailbox = process.env.GRAPH_FROM_EMAIL || process.env.FROM_EMAIL || process.env.SMTP_USER || '';
  if (!mailbox) throw new Error('Missing mailbox env GRAPH_FROM_EMAIL/FROM_EMAIL/SMTP_USER');

  const token = await getGraphToken();
  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const dayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));

  const url =
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages` +
    `?$top=200&$select=id,subject,from,toRecipients,ccRecipients,bodyPreview,body,receivedDateTime` +
    `&$orderby=receivedDateTime desc&$filter=receivedDateTime ge ${dayStart.toISOString()}`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const json = (await res.json()) as { value?: any[] };
  const messages = json.value || [];

  const requirements = await prisma.requirement.findMany({
    where: {
      isDeleted: false,
      requirementCreatorName: { equals: 'Email Automation', mode: 'insensitive' },
      createdAt: { gte: dayStart, lt: dayEnd },
    },
    select: { id: true, requirementId: true, roleTitle: true, clientJdId: true },
    orderBy: { createdAt: 'desc' },
  });

  const bySubject = new Map<string, any[]>();
  for (const m of messages) {
    const key = normalizeSubject(String(m.subject || ''));
    if (!key) continue;
    if (!bySubject.has(key)) bySubject.set(key, []);
    bySubject.get(key)!.push(m);
  }

  let updated = 0;
  const updatedReqIds: string[] = [];

  for (const req of requirements) {
    const key = normalizeSubject(req.roleTitle || '');
    const candidates = bySubject.get(key) || [];
    const msg = candidates.shift();
    if (!msg) continue;

    const subject = String(msg.subject || '');
    const text = `${subject}\n${String(msg.bodyPreview || '')}\n${String(msg?.body?.content || '')}`;
    const from = extractEmails(msg.from?.emailAddress?.address)[0] || '';
    const to = extractEmails(msg.toRecipients)[0] || mailbox;
    const cc = extractEmails(msg.ccRecipients)[0] || from;

    const experience = labeledValue(text, ['overall experience', 'experience']) || req.roleTitle || 'Not specified';
    const experienceLevel = labeledValue(text, ['experience level']) || 'Not specified';
    const employmentType = labeledValue(text, ['employment type']) || 'Full-time';
    const workMode = labeledValue(text, ['work mode', 'mode of work']) || 'Not specified';
    const location = labeledValue(text, ['location', 'job location']) || 'Not specified';
    const noticePeriod = labeledValue(text, ['notice period']) || 'Not specified';
    const demandType = labeledValue(text, ['type of demand', 'demand type']) || 'Single';
    const positionsRaw = labeledValue(text, ['number of positions', 'open positions', 'positions']);
    const openPositions = positionsRaw && !Number.isNaN(Number(positionsRaw)) ? Math.max(1, parseInt(positionsRaw, 10)) : 1;
    const currency = (labeledValue(text, ['budget currency', 'currency']) || 'INR').toUpperCase().slice(0, 3);
    const mandatory = parseSkills(labeledValue(text, ['mandatory skills', 'must have skills']));
    const skills = parseSkills(labeledValue(text, ['skills', 'core skills']));
    const budgetRaw =
      labeledValue(text, ['yearly budget']) ||
      labeledValue(text, ['monthly budget']) ||
      labeledValue(text, ['budget', 'ctc', 'salary']);
    const parsedBudget = parseBudget(budgetRaw) || 1;
    const clientJdId =
      labeledValue(text, ['client jd-id', 'client jd id', 'jd id']) ||
      req.clientJdId ||
      `${sourceFromEmail(from).replace(/[^A-Za-z0-9]+/g, '').toUpperCase()}-${now.toISOString().slice(0, 10)}-001`;

    await prisma.requirement.update({
      where: { id: req.id },
      data: {
        clientLeadPoc: from || 'Not specified',
        clientPoc: cc || 'Not specified',
        internalPoc: to || 'Email Automation',
        submittingTo: sourceFromEmail(from),
        clientJdId,
        roleTitle: labeledValue(text, ['job title', 'role title', 'position']) || req.roleTitle,
        location,
        experience,
        experienceLevel,
        employmentType,
        workMode,
        budgetCurrency: currency,
        overallBudget: parsedBudget,
        yearlyBudget: /contract/i.test(employmentType) ? null : parsedBudget,
        monthlyBudget: /contract/i.test(employmentType) ? parsedBudget : null,
        noticePeriod,
        demandType,
        openPositions,
        priority: parsePriority(subject, labeledValue(text, ['priority'])),
        technologies: mandatory,
        skills: skills.length ? skills : mandatory,
        assignment: 'UNASSIGNED',
        status: 'OPEN',
      },
    });
    updated += 1;
    updatedReqIds.push(req.requirementId);
  }

  console.log(
    JSON.stringify({
      totalRequirementsToday: requirements.length,
      totalMessagesToday: messages.length,
      updated,
      updatedReqIds,
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

