import { prisma } from '@/lib/prisma';
import { resolveRequirementEmailPayload } from '@/lib/resolveRequirementEmailPayload';
import {
  fetchGraphMessageParticipants,
  findGraphMessageByInternetMessageId,
  findGraphMessageBySubject,
  type EmailRecipient,
} from '@/mail/transport';

function env(name: string): string {
  return String(process.env[name] || '').trim();
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

function defaultGraphMailbox(): string {
  return env('GRAPH_FROM_EMAIL') || env('FROM_EMAIL') || env('SMTP_USER');
}

function dedupeRecipientRows(rows: EmailRecipient[]): EmailRecipient[] {
  const seen = new Set<string>();
  const out: EmailRecipient[] = [];
  for (const row of rows) {
    const address = String(row.address ?? '').trim();
    if (!address) continue;
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ address, ...(row.name?.trim() ? { name: row.name.trim() } : {}) });
  }
  return out;
}

function mergeRecipientRows(...lists: EmailRecipient[][]): EmailRecipient[] {
  const byKey = new Map<string, EmailRecipient>();
  for (const list of lists) {
    for (const row of list) {
      const address = String(row.address ?? '').trim();
      if (!address) continue;
      const key = address.toLowerCase();
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, { address, ...(row.name?.trim() ? { name: row.name.trim() } : {}) });
      } else if (!existing.name && row.name?.trim()) {
        byKey.set(key, { address, name: row.name.trim() });
      }
    }
  }
  return [...byKey.values()];
}

function withoutRecipientRows(list: EmailRecipient[], exclude: Set<string>): EmailRecipient[] {
  return list.filter((row) => !exclude.has(row.address.toLowerCase()));
}

function dedupeRecipients(rows: EmailRecipient[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    const address = String(row.address ?? '').trim();
    if (!address) continue;
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(address);
  }
  return out;
}

function mergeRecipientLists(...lists: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const raw of list) {
      const address = String(raw ?? '').trim();
      if (!address) continue;
      const key = address.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(address);
    }
  }
  return out;
}

/** Extract individual email addresses from strings, arrays, or Graph-style objects. */
function extractEmailsFromPayloadValue(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => extractEmailsFromPayloadValue(item));
  }
  if (typeof value === 'object') {
    const row = value as { emailAddress?: { address?: string }; address?: string };
    const addr = String(row.emailAddress?.address ?? row.address ?? '').trim();
    return addr ? [addr] : [];
  }
  const text = String(value).trim();
  if (!text) return [];
  const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of matches) {
    const email = match.trim();
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(email);
  }
  return out;
}

function defaultOffshoreCcEmail(): string {
  return env('GRAPH_THREAD_CC_OFFSHORE') || 'offshorejobs@metaforgeit.com';
}

function isOffshoreInternalPoc(value: unknown): boolean {
  const text = String(value ?? '').trim().toLowerCase();
  return text.includes('offshore');
}

function supplementalCcFromRequirement(
  payload: Record<string, unknown> | null,
  requirement: {
    clientLeadPoc?: string | null;
    clientPoc?: string | null;
    internalPoc?: string | null;
  },
): string[] {
  const out: string[] = [];
  out.push(...extractEmailsFromPayloadValue(payload?.from));
  out.push(
    ...extractEmailsFromPayloadValue(
      payload?.clientLeadPoc ?? payload?.client_lead_poc ?? requirement.clientLeadPoc,
    ),
  );
  out.push(
    ...extractEmailsFromPayloadValue(payload?.clientPoc ?? payload?.client_poc ?? requirement.clientPoc),
  );
  const internalPoc = firstString(
    payload?.internalPoc,
    payload?.internal_poc,
    requirement.internalPoc,
  );
  if (isOffshoreInternalPoc(internalPoc)) {
    out.push(defaultOffshoreCcEmail());
  }
  return out;
}

function withoutAddresses(list: string[], exclude: Set<string>): string[] {
  return list.filter((address) => !exclude.has(address.toLowerCase()));
}

function recipientsFromStoredPayload(payload: Record<string, unknown> | null): {
  to: string[];
  cc: string[];
  bcc: string[];
} {
  if (!payload) return { to: [], cc: [], bcc: [] };
  return {
    to: extractEmailsFromPayloadValue(payload.to ?? payload.toRecipients),
    cc: extractEmailsFromPayloadValue(payload.cc ?? payload.ccRecipients),
    bcc: extractEmailsFromPayloadValue(payload.bcc ?? payload.bccRecipients),
  };
}

export async function resolveRequirementThreadTarget(requirement: {
  id: string;
  requirementId: string;
  sourceEmailGraphMessageId?: string | null;
  sourceEmailInternetMessageId?: string | null;
  sourceEmailMailbox?: string | null;
  sourceEmailSubject?: string | null;
}): Promise<{ graphMessageId: string; mailbox: string; subject: string } | null> {
  const payload = await resolveRequirementEmailPayload(prisma, requirement);
  const mailbox = firstString(
    requirement.sourceEmailMailbox,
    payload?.mailbox,
    payload?.sourceMailbox,
    payload?.source_mailbox,
    payload?.graphMailbox,
    payload?.graph_mailbox,
    defaultGraphMailbox(),
  );
  const subject = firstString(requirement.sourceEmailSubject, payload?.subject);

  let graphMessageId = firstString(
    requirement.sourceEmailGraphMessageId,
    payload?.graphMessageId,
    payload?.graph_message_id,
    payload?.id,
  );

  const internetMessageId = firstString(
    requirement.sourceEmailInternetMessageId,
    payload?.internetMessageId,
    payload?.internet_message_id,
  );

  if (!graphMessageId) {
    try {
      const prismaAny = prisma as {
        emailIngestionEvent?: {
          findFirst: (args: unknown) => Promise<{ graphMessageId?: string | null } | null>;
        };
      };
      const ev = await prismaAny.emailIngestionEvent?.findFirst({
        where: {
          OR: [{ requirementPk: requirement.id }, { requirementCode: requirement.requirementId }],
        },
        orderBy: { createdAt: 'asc' },
        select: { graphMessageId: true },
      });
      graphMessageId = firstString(ev?.graphMessageId);
    } catch {
      // Best-effort ingestion lookup.
    }
  }

  if (!graphMessageId && internetMessageId && mailbox) {
    const foundByIid = await findGraphMessageByInternetMessageId(mailbox, internetMessageId);
    if (foundByIid?.id) {
      graphMessageId = foundByIid.id;
      try {
        await prisma.requirement.update({
          where: { id: requirement.id },
          data: {
            sourceEmailGraphMessageId: foundByIid.id,
            sourceEmailMailbox: mailbox,
            sourceEmailSubject: foundByIid.subject || subject || null,
            sourceEmailInternetMessageId: foundByIid.internetMessageId || internetMessageId,
          },
        });
      } catch {
        // Linking is best-effort; reply can still proceed with resolved id.
      }
    }
  }

  if (!graphMessageId && subject && mailbox) {
    const found = await findGraphMessageBySubject(mailbox, subject);
    if (found?.id) {
      graphMessageId = found.id;
      try {
        await prisma.requirement.update({
          where: { id: requirement.id },
          data: {
            sourceEmailGraphMessageId: found.id,
            sourceEmailMailbox: mailbox,
            sourceEmailSubject: found.subject || subject,
          },
        });
      } catch {
        // Linking is best-effort; reply can still proceed with resolved id.
      }
    }
  }

  if (!graphMessageId) return null;

  return {
    graphMessageId,
    mailbox,
    subject,
  };
}

export async function fetchRequirementEmailThreadParticipants(requirement: {
  id: string;
  requirementId: string;
  sourceEmailGraphMessageId?: string | null;
  sourceEmailInternetMessageId?: string | null;
  sourceEmailMailbox?: string | null;
  sourceEmailSubject?: string | null;
  clientLeadPoc?: string | null;
  clientPoc?: string | null;
  internalPoc?: string | null;
}) {
  const target = await resolveRequirementThreadTarget(requirement);
  const payload = await resolveRequirementEmailPayload(prisma, requirement);
  const stored = recipientsFromStoredPayload(payload);
  const supplementalCc = supplementalCcFromRequirement(payload, requirement);
  const ownMailbox = defaultGraphMailbox().toLowerCase();
  const excludeSelf = ownMailbox ? new Set([ownMailbox]) : new Set<string>();

  if (!target?.graphMessageId || !target.mailbox) {
    const toRows = withoutRecipientRows(
      mergeRecipientRows(stored.to.map((address) => ({ address }))),
      excludeSelf,
    );
    const to = toRows.map((r) => r.address);
    const toKeys = new Set(to.map((a) => a.toLowerCase()));
    const cc = withoutAddresses(
      mergeRecipientLists(stored.cc, supplementalCc).filter((a) => !toKeys.has(a.toLowerCase())),
      excludeSelf,
    );
    return {
      subject: target?.subject ?? firstString(payload?.subject),
      to,
      toParticipants: toRows,
      cc,
      bcc: withoutAddresses(stored.bcc, excludeSelf),
      graphMessageId: target?.graphMessageId ?? null,
      mailbox: target?.mailbox ?? null,
    };
  }

  let graphParticipants = { subject: '', to: [] as EmailRecipient[], cc: [] as EmailRecipient[], bcc: [] as EmailRecipient[] };
  try {
    graphParticipants = await fetchGraphMessageParticipants(target.mailbox, target.graphMessageId);
  } catch {
    graphParticipants = { subject: '', to: [], cc: [], bcc: [] };
  }

  const graphToRows = dedupeRecipientRows(graphParticipants.to);
  const toRows = withoutRecipientRows(
    mergeRecipientRows(graphToRows, stored.to.map((address) => ({ address }))),
    excludeSelf,
  );
  const to = toRows.map((r) => r.address);
  const toKeys = new Set(to.map((a) => a.toLowerCase()));
  const cc = withoutAddresses(
    mergeRecipientLists(
      dedupeRecipients(graphParticipants.cc),
      stored.cc,
      supplementalCc,
    ).filter((a) => !toKeys.has(a.toLowerCase())),
    excludeSelf,
  );

  return {
    subject: firstString(graphParticipants.subject, target.subject, payload?.subject),
    to,
    toParticipants: toRows,
    cc,
    bcc: withoutAddresses(mergeRecipientLists(dedupeRecipients(graphParticipants.bcc), stored.bcc), excludeSelf),
    graphMessageId: target.graphMessageId,
    mailbox: target.mailbox,
  };
}
