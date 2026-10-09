import { Router, Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import {
  Prisma,
  PrismaClient,
  type RequirementAssignmentStatus,
  type RequirementStatus,
} from '@prisma/client';
import { asyncHandler } from '@/middleware/errorHandler';
import { ResponseHelper } from '@/utils/response';
import { logRequirementActivity } from '@/services/requirementActivityLog';
import {
  calendarDateInTimeZone,
  getRequirementCalendarTz,
  zonedCalendarDayRangeForInstant,
} from '@/lib/requirementCalendar';
import { writeRequirementSourceEmailPdf } from '@/services/requirementSourceEmailPdf';

const router = Router();
import { prisma } from '@/lib/prisma';
const prismaAny = prisma as any;

function authenticateInternalAutomation(req: Request, res: Response, next: NextFunction): void {
  const configuredKey = (process.env.INTERNAL_AUTOMATION_API_KEY || '').trim();
  if (!configuredKey) {
    ResponseHelper.error(res, 'Internal automation API key is not configured.', 500);
    return;
  }

  const authHeader = String(req.headers.authorization || '').trim();
  const headerKey = String(req.headers['x-internal-api-key'] || '').trim();
  const bearerKey = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  const presentedKey = headerKey || bearerKey;

  if (!presentedKey || presentedKey !== configuredKey) {
    ResponseHelper.unauthorized(res, 'Invalid internal automation credentials.');
    return;
  }
  next();
}

function parseRequirementStatus(raw: unknown): RequirementStatus {
  const s = String(raw ?? 'OPEN').trim().toUpperCase();
  const allowed: RequirementStatus[] = [
    'OPEN',
    'ASSIGNED',
    'SUBMITTED',
    'INTERVIEW',
    'SELECTED',
    'REJECTED',
    'CLOSED',
  ];
  return allowed.includes(s as RequirementStatus) ? (s as RequirementStatus) : 'OPEN';
}

function parseAssignment(raw: unknown): RequirementAssignmentStatus {
  const s = String(raw ?? 'UNASSIGNED').trim().toUpperCase();
  return s === 'ASSIGNED' ? 'ASSIGNED' : 'UNASSIGNED';
}

type EmailDerivedFields = {
  clientLeadPoc?: string;
  clientPoc?: string;
  roleTitle?: string;
  location?: string;
  experience?: string;
  experienceLevel?: string;
  employmentType?: 'Full-time' | 'Contract';
  workMode?: string;
  budgetCurrency?: string;
  overallBudget?: number | null;
  noticePeriod?: string;
  mandatorySkills?: string[];
  skills?: string[];
  technologies?: string[];
  priority?: 'HIGH' | 'MEDIUM' | 'LOW';
  openPositions?: number;
  submittingTo?: string;
  internalPoc?: string;
  demandType?: 'Single' | 'Multiple' | 'Bulk';
};

type IngestionDecision = {
  allow: boolean;
  reason?: string;
  decisionTag?: string;
  confidence: number;
};

type IngestionAudit = {
  senderDomain: string;
  isReplyOrForward: boolean;
  isVerifiedClientDomain: boolean;
  matchedHardSignals: string[];
  matchedRequirementSignals: string[];
  confidence: number;
  allow: boolean;
  reason?: string;
  decisionTag?: string;
};

type ClientRegistryEntry = {
  displayName: string;
  emailDomains: string[];
  subjectKeywords: string[];
  bodyKeywords: string[];
};

const CLIENT_REGISTRY: ClientRegistryEntry[] = [
  { displayName: 'LTTS', emailDomains: ['ltts.com'], subjectKeywords: ['ltts', 'l&t technology'], bodyKeywords: ['l&t technology services', 'ltts.com'] },
  { displayName: 'ITC', emailDomains: ['itcinfotech.com'], subjectKeywords: ['itc', 'itc infotech'], bodyKeywords: ['itc infotech', 'itcinfotech'] },
  { displayName: 'KPMG', emailDomains: ['kpmg.com'], subjectKeywords: ['kpmg'], bodyKeywords: ['kpmg'] },
  { displayName: 'UST', emailDomains: ['ust.com', 'ust-global.com'], subjectKeywords: ['ust'], bodyKeywords: ['ust global', 'ust-global'] },
  { displayName: 'Accenture', emailDomains: ['accenture.com'], subjectKeywords: ['accenture'], bodyKeywords: ['accenture'] },
  { displayName: 'Qbruenax', emailDomains: ['qbruenax.com'], subjectKeywords: ['qbruenax'], bodyKeywords: ['qbruenax'] },
  { displayName: 'Brillio', emailDomains: ['brillio.com'], subjectKeywords: ['brillio'], bodyKeywords: ['brillio'] },
  { displayName: 'Happiest Minds', emailDomains: ['happiestminds.com'], subjectKeywords: ['happiest minds', 'happiestminds'], bodyKeywords: ['happiest minds'] },
  { displayName: 'Metaforge (Internal)', emailDomains: ['metaforgeit.com'], subjectKeywords: ['metaforge'], bodyKeywords: ['metaforge'] },
];

const KNOWN_REQUIREMENT_SOURCES = [
  'ITC',
  'KPMG',
  'UST',
  'LTTS',
  'ACCENTURE',
  'QBRUENAX',
  'BRILLIO',
  'HAPPIEST MINDS',
  'METAFORGE (INTERNAL)',
] as const;

const HARD_SIGNAL_RULES: Array<{ label: string; rx: RegExp }> = [
  { label: 'bill_rate', rx: /\bbill rate\b/i },
  // LTTS TPC templates use "TPC Rates" rather than "bill rate"
  { label: 'tpc_rates', rx: /\btpc\s+rates?\b/i },
  // LTTS uses "Overall exp – 3 - 5 Years" (not always "years of experience")
  { label: 'overall_exp', rx: /\boverall\s+exp\b/i },
  { label: 'years_of_experience', rx: /\byears?\s+of\s+(?:exp|experience)\b/i },
  // ITC style mails often use "Urgent openings" instead of "Open Positions"
  { label: 'openings', rx: /\bopenings?\b/i },
  { label: 'open_positions', rx: /\bopen positions?\b/i },
  // Budget often appears as "25LPA" / "18 LPA"
  { label: 'lpa_budget', rx: /\b\d+(?:\.\d+)?\s*lpa\b/i },
  // ITC requirement mails include "SO ID- PCIIL_..."
  { label: 'so_id', rx: /\bso\s*id\s*[:\-]?\s*[a-z0-9_\/-]+/i },
  // Some mails use "location-Bangalore"
  { label: 'location_inline', rx: /\blocation\s*[:\-–—]\s*[a-z]/i },
  { label: 'work_location', rx: /\bwork location\b/i },
  { label: 'job_location', rx: /\bjob location\b/i },
  { label: 'mandatory_skills', rx: /\bmandatory skills?\b/i },
  { label: 'skills_field', rx: /\bskills?\s*[:=\-–—]/i },
  { label: 'experience_field', rx: /\bexperience\s*[:=\-–—]/i },
  { label: 'job_title_field', rx: /\bjob title\s*[:=-]/i },
  { label: 'role_title_field', rx: /\brole title\s*[:=-]/i },
  { label: 'role_purpose', rx: /\brole purpose\b/i },
  { label: 'must_have_section', rx: /\bmust have\b/i },
  // Inline "Requirement – Title" blocks common in partner emails
  { label: 'requirement_label', rx: /\brequirement\s*[–\-—:]\s*\S+/i },
];

const REQUIREMENT_SIGNAL_RULES: Array<{ label: string; rx: RegExp }> = [
  { label: 'requirement', rx: /\brequirement\b/i },
  { label: 'jd', rx: /\bjd\b/i },
  { label: 'job_description', rx: /\bjob description\b/i },
  { label: 'position', rx: /\bposition\b/i },
  { label: 'opening', rx: /\bopenings?\b/i },
  { label: 'role', rx: /\brole\b/i },
  { label: 'skills', rx: /\bskills?\b/i },
];

function toText(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

function firstNonEmpty(...values: unknown[]): string {
  for (const v of values) {
    const s = toText(v);
    if (s) return s;
  }
  return '';
}

function stripHtmlTags(raw: string): string {
  return raw
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractLatestMessageBlock(text: string): string {
  if (!text) return '';
  const markers = [
    /\n\s*from:\s.+/i,
    /\n\s*sent:\s.+/i,
    /\n\s*-----original message-----/i,
    /\n\s*_{5,}\s*\n/i,
    /\n\s*on .+ wrote:/i,
    /[\r\n]+\s*caution:\s*\*{2,}/i,
    /[\r\n]+\s*/u,
  ];
  let cutAt = text.length;
  for (const marker of markers) {
    const m = marker.exec(text);
    if (m && typeof m.index === 'number') {
      cutAt = Math.min(cutAt, m.index);
    }
  }
  return text.slice(0, cutAt).trim();
}

type RequirementEvidence = {
  hardSignalHits: number;
  corporateRequirementMarkers: number;
  requirementTableLikeSignals: number;
  hasAnyRequirementSignal: boolean;
  hasStrongRequirementContext: boolean;
  hasReplyThreadRequirementEvidence: boolean;
};

function requirementEvidenceFromText(source: string): RequirementEvidence {
  const hardSignalHits = HARD_SIGNAL_RULES.filter((x) => x.rx.test(source)).length;
  const corporateRequirementMarkers = [
    /\brequirement\b/i,
    /\bopenings?\b/i,
    /\bso\s*id\s*[:\-]?\s*[a-z0-9_\/-]+/i,
    /\bmandatory\s+skills?\b/i,
    /\b\d+(?:\.\d+)?\s*lpa\b/i,
  ].filter((rx) => rx.test(source)).length;
  const hasAnyRequirementSignal = REQUIREMENT_SIGNAL_RULES.some((x) => x.rx.test(source));
  const requirementTableLikeSignals = [
    /\brole\s*(?:\||\t| {2,})\s*experience\s*(?:\||\t| {2,})\s*location\b/i,
    /\bjob summary\b/i,
    /\bkey responsibilities\b/i,
    /\brole purpose\b/i,
    /\brole title\s*:/i,
    /\bmust have\b/i,
    /\brequired skills(?:\s*&\s*experience)?\b/i,
    /\bkindly share (?:the )?profiles\b/i,
    /\bplease share (?:the )?(?:suitable )?profiles\b/i,
  ].filter((rx) => rx.test(source)).length;
  const hasStrongRequirementContext =
    hardSignalHits >= 2 || corporateRequirementMarkers >= 2 || requirementTableLikeSignals >= 1;
  const hasReplyThreadRequirementEvidence =
    hasStrongRequirementContext ||
    hasAnyRequirementSignal ||
    hardSignalHits >= 1 ||
    corporateRequirementMarkers >= 1;
  return {
    hardSignalHits,
    corporateRequirementMarkers,
    requirementTableLikeSignals,
    hasAnyRequirementSignal,
    hasStrongRequirementContext,
    hasReplyThreadRequirementEvidence,
  };
}

function isShortReplyAcknowledgment(replyBodyOnlyRaw: string): boolean {
  const core = toText(replyBodyOnlyRaw)
    .replace(/[^a-z0-9\s]/gi, ' ')
    .trim();
  if (!core) return true;
  return /^(?:done|noted|ok(?:ay)?|thanks(?:\s+you)?|thank\s+you|received|will\s+do|completed|confirmed)\.?$/i.test(
    core,
  );
}

function isOperationalReplyCoordination(replyBodyOnlyText: string): boolean {
  return [
    /\bkindly\s+tag\b/i,
    /\b(?:please|kindly)\s+tag\s+the\s+below\b/i,
    /\btag\s+the\s+below\s+so\b/i,
    /\bbelow\s+so\b/i,
    /\b(?:map|link|attach|update)\s+(?:the\s+)?(?:below\s+)?so\b/i,
    /\bservice\s+order\s+(?:id|#|number)\b/i,
    /\b(?:for\s+)?(?:your\s+)?(?:reference|info)\s+only\b/i,
    /\blooping\s+you\s+in\b/i,
    /\bno\s+action\s+(?:needed|required)\b/i,
  ].some((rx) => rx.test(replyBodyOnlyText));
}

function extractLabeledValue(text: string, labels: string[]): string {
  if (!text) return '';
  for (const label of labels) {
    const rx = new RegExp(`(?:^|\\n)\\s*${label}\\s*[:=-]\\s*([^\\n\\r]+)`, 'i');
    const m = text.match(rx);
    if (m?.[1]) return normalizeExtractedValue(m[1]);
  }
  return '';
}

function normalizeExtractedValue(raw: string): string {
  return raw
    .replace(/\u00a0/g, ' ')
    .replace(/^[\s\-•*]+/, '')
    .replace(/[|]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/[;,.]+$/, '')
    .trim();
}

function escapeRegex(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clipAtNextLabel(raw: string, nextLabels: string[]): string {
  const clean = normalizeExtractedValue(raw);
  if (!clean || nextLabels.length === 0) return clean;
  const token = nextLabels.map((x) => escapeRegex(x)).join('|');
  const rx = new RegExp(`\\b(?:${token})\\b\\s*[:=\\-–]`, 'i');
  const m = rx.exec(clean);
  if (!m || typeof m.index !== 'number') return clean;
  return normalizeExtractedValue(clean.slice(0, m.index));
}

function sanitizeCompactField(raw: string, maxLen = 140): string {
  let out = normalizeExtractedValue(raw);
  if (!out) return '';
  out = out
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  out = clipAtNextLabel(out, [
    'location',
    'job location',
    'overall exp',
    'overall experience',
    'experience',
    'open positions',
    'positions',
    'mandatory skills',
    'skills',
    'bill rate',
    'budget',
    'requirement',
    'key responsibilities',
    'required skills',
    'good-to-have',
    'regards',
  ]);
  const lower = out.toLowerCase();
  const footerStarts = ['dear ', 'regards', 'thanks', 'this email may contain', 'privacy notice'];
  for (const marker of footerStarts) {
    const idx = lower.indexOf(marker);
    if (idx > 0) {
      out = out.slice(0, idx).trim();
      break;
    }
  }
  if (out.length > maxLen) out = `${out.slice(0, maxLen).trim()}...`;
  return normalizeExtractedValue(out);
}

function extractInlineFieldValue(text: string, labels: string[], nextLabels: string[]): string {
  if (!text) return '';
  for (const label of labels) {
    const rx = new RegExp(`\\b${escapeRegex(label)}\\b\\s*[:=\\-–]\\s*([^\\n\\r]+)`, 'i');
    const m = text.match(rx);
    if (!m?.[1]) continue;
    const clipped = clipAtNextLabel(m[1], nextLabels);
    if (clipped) return clipped;
  }
  return '';
}

function extractLabeledMultilineValue(text: string, labels: string[]): string {
  if (!text) return '';
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] || '';
    for (const label of labels) {
      const rx = new RegExp(`^\\s*${label}\\s*[:=-]?\\s*(.*)$`, 'i');
      const m = line.match(rx);
      if (!m) continue;
      const collected: string[] = [];
      const first = clipAtNextLabel(m[1] || '', [
        'location',
        'job location',
        'work location',
        'overall exp',
        'overall experience',
        'experience',
        'open positions',
        'positions',
        'mandatory skills',
        'skills',
        'budget',
        'bill rate',
        'notice period',
        'qualification',
      ]);
      if (first) collected.push(first);
      for (let j = i + 1; j < lines.length; j += 1) {
        const nextLine = normalizeExtractedValue(lines[j] || '');
        if (!nextLine) break;
        if (/^(from|to|cc|subject|thanks|regards|best regards)\s*[:\-]/i.test(nextLine)) break;
        if (/\b(this email may contain|privacy notice|www\.)\b/i.test(nextLine)) break;
        // Stop at next likely label to avoid bleeding into unrelated fields.
        if (/^[a-z][a-z\s/]{1,30}\s*[:=-]/i.test(nextLine)) break;
        collected.push(nextLine);
      }
      if (collected.length) return normalizeExtractedValue(collected.join(', '));
    }
  }
  return '';
}

function parseAddressList(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.flatMap((x) => parseAddressList(x));
  }
  const text = String(raw);
  const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
    const email = m.trim();
    const key = email.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(email);
    }
  }
  return out;
}

function titleCaseWords(raw: string): string {
  return raw
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => {
      const first = w.charAt(0).toUpperCase();
      return first + w.slice(1).toLowerCase();
    })
    .join(' ');
}

function sourceFromSenderEmail(senderEmail: string): string {
  const lower = senderEmail.toLowerCase();
  if (!lower) return 'Other company / source';
  if (lower.endsWith('@metaforgeit.com')) return 'Metaforge (Internal)';
  if (lower.includes('kpmg')) return 'KPMG';
  if (lower.includes('ust')) return 'UST';
  if (lower.includes('ltts') || lower.includes('lnttechservices')) return 'LTTS';
  if (lower.includes('accenture')) return 'Accenture';
  if (lower.includes('itc')) return 'ITC';
  if (lower.includes('brillio')) return 'Brillio';
  if (lower.includes('happiestminds')) return 'Happiest Minds';
  if (lower.includes('qbruenax')) return 'Qbruenax';
  return 'Other company / source';
}

function detectClientFromRegistry(fromEmail: string, subject: string, body: string): { client: string; confidence: number } {
  const fromLower = fromEmail.toLowerCase();
  const domain = fromLower.includes('@') ? fromLower.split('@').pop() || '' : '';
  const subjectLower = subject.toLowerCase();
  const bodyLower = body.toLowerCase();
  let best = { client: sourceFromSenderEmail(fromEmail), confidence: 40 };
  for (const c of CLIENT_REGISTRY) {
    let score = 0;
    if (c.emailDomains.some((d) => domain.includes(d))) score += 70;
    if (c.subjectKeywords.some((k) => subjectLower.includes(k.toLowerCase()))) score += 20;
    if (c.bodyKeywords.some((k) => bodyLower.includes(k.toLowerCase()))) score += 10;
    if (score > best.confidence) {
      best = { client: c.displayName, confidence: score };
    }
  }
  return best;
}

function normalizeRequirementSource(raw: unknown, senderEmail: string): string {
  const explicit = String(raw ?? '').trim();
  if (explicit) {
    const upper = explicit.toUpperCase();
    for (const src of KNOWN_REQUIREMENT_SOURCES) {
      if (upper === src || upper.includes(src)) return src;
    }
    return explicit;
  }
  return sourceFromSenderEmail(senderEmail);
}

function parsePriority(raw: unknown, referenceText: string): 'HIGH' | 'MEDIUM' | 'LOW' {
  const explicit = String(raw ?? '').trim().toUpperCase();
  if (explicit === 'HIGH' || explicit === 'MEDIUM' || explicit === 'LOW') return explicit;
  const lower = referenceText.toLowerCase();
  if (/\burgent\b|\bimmediate\b|\basap\b/.test(lower)) return 'HIGH';
  if (/\blow\b/.test(lower)) return 'LOW';
  return 'MEDIUM';
}

function parseDemandType(raw: unknown, openPositions: number): 'Single' | 'Multiple' | 'Bulk' {
  const explicit = String(raw ?? '').trim().toLowerCase();
  if (explicit === 'single') return 'Single';
  if (explicit === 'multiple') return 'Multiple';
  if (explicit === 'bulk') return 'Bulk';
  if (openPositions >= 10) return 'Bulk';
  if (openPositions >= 2) return 'Multiple';
  return 'Single';
}

function parseOpenPositions(raw: unknown, text: string): number {
  if (raw != null && !Number.isNaN(Number(raw))) {
    return Math.max(1, parseInt(String(raw), 10));
  }
  const labeled = extractLabeledValue(text, [
    'number of positions',
    'open positions',
    'positions',
    'openings',
    'headcount',
  ]);
  if (labeled && !Number.isNaN(Number(labeled))) {
    return Math.max(1, parseInt(labeled, 10));
  }
  const m = text.match(/(\d{1,3})\s*(?:positions?|openings?)/i);
  if (!m && /\b(multiple|bulk|many)\b/.test(text.toLowerCase())) return 2;
  if (!m) return 1;
  return Math.max(1, parseInt(m[1] || '1', 10));
}

function parseNoticePeriod(raw: unknown, text: string): string {
  const explicit = toText(raw);
  if (explicit) return explicit;
  const labeled = extractInlineFieldValue(text, ['notice period'], [
    'location',
    'open positions',
    'skills',
    'budget',
    'bill rate',
  ]) || extractLabeledValue(text, ['notice period']);
  if (labeled) return labeled;
  const m = text.match(/\b(immediate|join(?:ing)?\s*immediately|\d{1,3}\s*(?:day|days|month|months))\b/i);
  return m ? titleCaseWords(m[1] || '') : 'Not specified';
}

function parseWorkMode(raw: unknown, text: string): string {
  const explicit = toText(raw);
  if (explicit) return explicit;
  const labeled = extractLabeledValue(text, ['work mode', 'mode of work']);
  if (labeled) return titleCaseWords(labeled);
  const lower = text.toLowerCase();
  if (/\bhybrid\b/.test(lower)) return 'Hybrid';
  if (/\bremote\b|\bwfh\b/.test(lower)) return 'Remote';
  if (/\bon[\s-]?site\b/.test(lower)) return 'On-site';
  return 'Not specified';
}

function parseLocation(raw: unknown, subject: string, text: string): string {
  const explicit = toText(raw);
  if (explicit) return explicit;
  const labeled = extractInlineFieldValue(
    text,
    ['location', 'job location', 'work location', 'base location'],
    [
      'overall exp',
      'overall experience',
      'experience',
      'open positions',
      'positions',
      'mandatory skills',
      'skills',
      'bill rate',
      'budget',
      'notice period',
      'qualification',
      'role overview',
      'key responsibilities',
      'required skills',
      'good-to-have',
      'regards',
    ],
  ) || extractLabeledMultilineValue(text, ['location', 'job location', 'work location', 'base location']);
  if (labeled) return labeled;
  const locInSubject = subject.match(/\b(?:at|location)\s*[:\-]?\s*([A-Za-z][A-Za-z\s,&/.-]{2,})$/i);
  if (locInSubject?.[1]) return normalizeExtractedValue(locInSubject[1]);
  const m = subject.match(/-\s*([A-Za-z][A-Za-z\s,]+)$/);
  if (m?.[1]) return m[1].trim();
  return 'Not specified';
}

function parseExperience(raw: unknown, text: string): { overall: string; level: string } {
  const explicit = toText(raw);
  const labeled = extractInlineFieldValue(
    text,
    ['overall experience', 'experience', 'exp', 'experience required', 'overall exp'],
    ['open positions', 'positions', 'skills', 'bill rate', 'budget', 'qualification', 'location'],
  ) || extractLabeledMultilineValue(text, ['overall experience', 'experience', 'exp', 'experience required']);
  if (labeled) {
    const low = labeled.toLowerCase();
    const level = /\bjunior\b/.test(low)
      ? 'Junior'
      : /\bsenior\b|\blead\b|\barchitect\b/.test(low)
        ? 'Senior'
        : 'Mid Senior';
    return { overall: labeled, level };
  }
  const m = text.match(/(\d{1,2}\s*(?:\+)?\s*(?:to|-)\s*\d{1,2}\s*(?:\+)?\s*(?:years?|yrs?))/i)
    || text.match(/(\d{1,2}\s*(?:\+)?\s*(?:years?|yrs?))/i)
    || text.match(/(\d{1,2}\s*-\s*\d{1,2}\s*y(?:ea)?rs?)/i);
  const overall = explicit || (m?.[1] ? m[1].replace(/\s+/g, ' ').trim() : 'Not specified');
  const lower = `${overall} ${text}`.toLowerCase();
  let level = 'Mid Senior';
  if (/\bjunior\b/.test(lower) || /\b0[-\s]?2\b/.test(lower)) level = 'Junior';
  else if (/\bsenior\b|\blead\b|\barchitect\b/.test(lower)) level = 'Senior';
  return { overall, level };
}

function parseEmployment(raw: unknown, text: string): 'Full-time' | 'Contract' {
  const explicit = normalizeEmploymentType(raw);
  if (explicit) return explicit;
  const labeled = extractLabeledValue(text, ['employment type', 'type']);
  const normalizedLabeled = normalizeEmploymentType(labeled);
  if (normalizedLabeled) return normalizedLabeled;
  const lower = text.toLowerCase();
  if (/\bcontract\b|\bc2c\b|\bmonthly\b|\bcontract-to-hire\b|\bcth\b/.test(lower)) return 'Contract';
  return 'Full-time';
}

function parseCurrency(raw: unknown, text: string): string {
  const explicit = normalizeBudgetCurrency(raw);
  if (String(raw ?? '').trim()) return explicit;
  const labeled = extractLabeledValue(text, ['budget currency', 'currency']);
  if (labeled) return normalizeBudgetCurrency(labeled);
  if (/\busd\b|\$/.test(text)) return 'USD';
  if (/\beur\b|€/.test(text)) return 'EUR';
  return 'INR';
}

function parseBudgetFromText(raw: unknown, text: string): number | null {
  const explicit = parseBudget(raw);
  if (explicit && explicit > 0) return explicit;
  const labeledBudget =
    extractLabeledValue(text, ['yearly budget', 'monthly budget', 'budget', 'ctc', 'salary']) ||
    '';
  const parsedLabeled = parseBudget(labeledBudget);
  if (parsedLabeled && parsedLabeled > 0) return parsedLabeled;
  const amountLine =
    text.match(/\b(?:budget|ctc|salary|compensation)\s*[:=-]?\s*([0-9.,]+)\s*(lpa|lpm|lakhs?)?/i) ||
    text.match(/\b([0-9]+(?:\.[0-9]+)?)\s*(lpa|lpm|lakhs?)\b/i) ||
    text.match(/₹\s*([0-9.,]+)\s*(lpa|lpm|lakhs?)?/i);
  if (!amountLine) return null;
  const n = parseFloat((amountLine[1] || '').replace(/,/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = String(amountLine[2] || '').toLowerCase();
  if (unit.startsWith('lp') || unit.startsWith('lakh')) return n * 100000;
  return n;
}

function parseSkills(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((x) => String(x).trim()).filter(Boolean);
  const txt = toText(raw);
  if (!txt) return [];
  return txt
    .replace(/\r/g, '\n')
    .split(/[;,\n]|(?:\s+\/\s+)|(?:\s+\|\s+)|(?:\s+\band\b\s+)/i)
    .map((x) => normalizeExtractedValue(x))
    .filter((x) => x.length >= 2)
    .filter((x, idx, arr) => arr.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === idx);
}

function parseSkillsFromText(text: string): { mandatorySkills: string[]; skills: string[] } {
  const mandatorySection = extractLabeledMultilineValue(text, ['mandatory skills', 'must have skills', 'required skills']);
  const skillsSection = extractLabeledMultilineValue(text, ['skills', 'core skills', 'technical skills', 'primary skills']);
  const mandatory = parseSkills(mandatorySection);
  const generic = parseSkills(skillsSection);
  const base = generic.length ? generic : mandatory;
  return {
    mandatorySkills: mandatory.length ? mandatory : base,
    skills: base,
  };
}


function extractFromEmailContent(body: any): EmailDerivedFields {
  const subjectRaw = firstNonEmpty(body.subject, body.job_title, body.roleTitle);
  const bodyPreview = firstNonEmpty(body.bodyPreview, body.preview, body.emailBody, body.description);
  const plainBody = firstNonEmpty(body.bodyText, body.text, body.body, body.content);
  const htmlBody = firstNonEmpty(body.bodyHtml, body.html, body.messageHtml);
  const mergedTextAll = `${subjectRaw}\n${bodyPreview}\n${plainBody}\n${stripHtmlTags(htmlBody)}`;
  const mergedLatestOnly = extractLatestMessageBlock(mergedTextAll);
  const latestTokenCount = mergedLatestOnly
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  const fullLower = mergedTextAll.toLowerCase();
  /** Recruiter Re:/Fwd: often leaves only a short top wrapper; JD lives in the quoted thread below. */
  const quotedThreadHasJdCues =
    /\b(?:mandatory skills|job description|bill rate|tpc\s+rates|overall\s+exp|open positions|key responsibilities|required skills)\b/i.test(
      fullLower,
    ) ||
    /\b(?:please share|kindly share)\b/i.test(fullLower) ||
    /\b\d+(?:\.\d+)?\s*lpa\b/i.test(fullLower);
  const mergedText =
    latestTokenCount < 55 &&
    quotedThreadHasJdCues &&
    mergedTextAll.trim().length > mergedLatestOnly.trim().length + 120
      ? mergedTextAll
      : mergedLatestOnly;
  const subject = subjectRaw.replace(/^\s*(re|fw|fwd)\s*:\s*/i, '').trim();
  const labeledTitle = extractLabeledMultilineValue(mergedText, [
    'job title',
    'role title',
    'position',
    'designation',
    'role',
  ]);
  const roleTitle = sanitizeCompactField(labeledTitle || subject, 120);

  const fromEmail = parseAddressList(body.from ?? body.fromEmail ?? body.senderEmail)[0] || '';
  const toEmails = parseAddressList(body.to ?? body.toEmail ?? body.recipientsTo);
  const toEmail = toEmails[0] || '';
  const ccEmail = parseAddressList(body.cc ?? body.ccEmail ?? body.recipientsCc)[0] || '';

  const openPositions = parseOpenPositions(body.openPositions ?? body.number_of_positions, mergedText);
  const experience = parseExperience(
    body.overallExperienceCustom ?? body.overall_experience ?? body.experience,
    mergedText,
  );
  const labeledExperienceLevel = extractLabeledValue(mergedText, ['experience level']);
  const employmentType = parseEmployment(body.employmentType ?? body.employment_type, mergedText);
  const inferredSkills = parseSkillsFromText(mergedText);
  const labeledDemandType = extractLabeledValue(mergedText, ['type of demand', 'demand type']);
  const labeledPriority = extractLabeledValue(mergedText, ['priority']);

  const detectedClient = detectClientFromRegistry(fromEmail, subjectRaw, mergedText);

  return {
    clientLeadPoc: fromEmail || undefined,
    clientPoc: ccEmail || fromEmail || undefined,
    roleTitle: roleTitle || undefined,
    location: sanitizeCompactField(parseLocation(body.location, roleTitle || subject, mergedText), 120),
    experience: experience.overall,
    experienceLevel: body.experienceLevel || labeledExperienceLevel || experience.level,
    employmentType,
    workMode: parseWorkMode(body.workMode ?? body.work_mode, mergedText),
    budgetCurrency: parseCurrency(body.budgetCurrency ?? body.budget_currency, mergedText),
    overallBudget: parseBudgetFromText(body.overallBudget ?? body.yearly_budget ?? body.monthly_budget, mergedText),
    noticePeriod: parseNoticePeriod(body.noticePeriod ?? body.notice_period, mergedText),
    mandatorySkills: parseSkills(body.mandatorySkills ?? body.mandatory_skills).length
      ? parseSkills(body.mandatorySkills ?? body.mandatory_skills)
      : inferredSkills.mandatorySkills,
    skills: parseSkills(body.skills).length ? parseSkills(body.skills) : inferredSkills.skills,
    technologies: parseSkills(body.technologies).length
      ? parseSkills(body.technologies)
      : inferredSkills.mandatorySkills,
    priority: parsePriority(body.priority || labeledPriority, mergedText),
    openPositions,
    submittingTo:
      normalizeRequirementSource(
        body.submittingTo ?? body.requirement_from ?? body.clientName ?? detectedClient.client,
        fromEmail,
      ) || detectedClient.client,
    internalPoc: toEmail || toText(body.internalPoc) || 'Email Automation',
    demandType: parseDemandType(body.demandType ?? body.type_of_demand ?? labeledDemandType, openPositions),
  };
}

/** Pre-extracted payloads from the Python email pipeline (role already parsed). */
export function isPipelineExtractedPayload(body: any): boolean {
  if (body?.pipelineExtracted === true || body?.pipeline_extracted === true) {
    const role = String(body?.job_title ?? body?.jobTitle ?? body?.roleTitle ?? '').trim();
    return Boolean(role);
  }
  const jobId = String(body?.job_id ?? body?.jobId ?? '').trim();
  const role = String(body?.job_title ?? body?.jobTitle ?? body?.roleTitle ?? '').trim();
  if (jobId && role) return true;
  // Re-sync path: job_id stripped so API assigns sequential REQ-…-001, 002, … on the target DB.
  const graphId = String(body?.graphMessageId ?? body?.graph_message_id ?? '').trim();
  const clientLead = String(body?.client_lead_poc ?? body?.clientLeadPoc ?? '').trim();
  const hasSkills =
    Array.isArray(body?.mandatory_skills) ||
    Array.isArray(body?.skills) ||
    Array.isArray(body?.mandatorySkills);
  return Boolean(role && graphId && clientLead && hasSkills);
}

/** Exported for unit tests (KPMG-style vendor RE: threads, etc.). */
export function shouldIngestRequirementEmail(body: any, derived: EmailDerivedFields): IngestionDecision {
  // Strict internal recruiter block — must run before client registry / verified-domain shortcuts.
  const senderParsedEarly = parseAddressList(
    body.fromEmail ?? body.from ?? body.senderEmail ?? derived.clientLeadPoc,
  );
  const senderEarly = toText(
    senderParsedEarly[0] || body.fromEmail || body.from || body.senderEmail || derived.clientLeadPoc,
  ).toLowerCase();
  if (senderEarly.includes('@metaforgeit.com')) {
    return {
      allow: false,
      reason: `Strict block: ignoring internal team/recruiter email (${senderEarly}) to prevent loop or self-ingestion.`,
      decisionTag: 'INTERNAL_RECRUITER_BLOCK',
      confidence: 0,
    };
  }

  const rawSubject = toText(body.subject || derived.roleTitle);
  const subject = rawSubject.toLowerCase();
  const isReply = /^\s*(re)\s*:/i.test(rawSubject);
  const rawBodyText = toText(body.bodyText || body.text || body.body || body.content);
  const rawPreview = toText(body.bodyPreview || body.preview || body.description);
  const bodyText = rawBodyText.toLowerCase();
  const preview = rawPreview.toLowerCase();
  const text = `${subject}\n${preview}\n${bodyText}`;
  const rawMergedBody = `${rawPreview}\n${rawBodyText}`;
  const replyBodyOnlyRaw = isReply ? extractLatestMessageBlock(rawMergedBody) : rawMergedBody;
  const replyBodyOnlyText = replyBodyOnlyRaw.toLowerCase();
  // Full-thread JD cues (includes quoted client blocks below recruiter wrappers).
  const fullThreadStrongRequirementContext =
    HARD_SIGNAL_RULES.filter((x) => x.rx.test(text)).length >= 2 ||
    [
      /\brequirement\b/i,
      /\bopenings?\b/i,
      /\bso\s*id\s*[:\-]?\s*[a-z0-9_\/-]+/i,
      /\bmandatory\s+skills?\b/i,
      /\b\d+(?:\.\d+)?\s*lpa\b/i,
    ].filter((rx) => rx.test(text)).length >= 2 ||
    [
      /\brole\s*(?:\||\t| {2,})\s*experience\s*(?:\||\t| {2,})\s*location\b/i,
      /\bjob summary\b/i,
      /\bkey responsibilities\b/i,
      /\brequired skills(?:\s*&\s*experience)?\b/i,
      /\bkindly share (?:the )?profiles\b/i,
      /\bplease share (?:the )?(?:suitable )?profiles\b/i,
    ].some((rx) => rx.test(text));
  // Normalize "Display Name <email@domain>" style sender values before domain checks.
  const senderParsed = parseAddressList(
    body.fromEmail ?? body.from ?? body.senderEmail ?? derived.clientLeadPoc,
  );
  const sender = toText(
    senderParsed[0] || body.fromEmail || body.from || body.senderEmail || derived.clientLeadPoc,
  ).toLowerCase();
  const senderDomain = sender.includes('@') ? sender.split('@').pop() || '' : '';
  const normalizedSenderDomain = senderDomain.replace(/[^a-z0-9.-]/gi, '').toLowerCase().trim();
  const isInternalSender = sender.endsWith('@metaforgeit.com');
  const isForward = /^\s*(fw|fwd)\s*:/i.test(rawSubject);
  const latestWrapperBlock = extractLatestMessageBlock(`${rawPreview}\n${rawBodyText}`).toLowerCase();
  const latestWrapperTokenCount = latestWrapperBlock
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  const wrapperNudgeSignals = [
    /\bfyi\b/i,
    /\bfor your info\b/i,
    /\bplease check\b/i,
    /\bpls check\b/i,
    /\bkindly check\b/i,
    /\bnoted\b/i,
    /\bbelow\b/i,
    /\bsharing\b/i,
  ].filter((rx) => rx.test(latestWrapperBlock)).length;
  const allMentionedEmails = parseAddressList(`${rawSubject}\n${rawPreview}\n${rawBodyText}`);
  const hasQuotedExternalSender = allMentionedEmails.some(
    (e) => e.includes('@') && !e.toLowerCase().endsWith('@metaforgeit.com'),
  );
  const freeMailDomains = new Set([
    'gmail.com',
    'googlemail.com',
    'yahoo.com',
    'yahoo.co.in',
    'outlook.com',
    'hotmail.com',
    'live.com',
    'msn.com',
    'icloud.com',
    'me.com',
    'protonmail.com',
    'proton.me',
    'aol.com',
  ]);

  /** Lone personal / portfolio domains (e.g. firstnamelastname.in) need explicit client-demand language. */
  function isProbablyPersonalPortfolioDomain(domain: string): boolean {
    const d = domain.toLowerCase().trim();
    if (!d || freeMailDomains.has(d)) return true;
    const parts = d.split('.');
    if (parts.length < 2) return false;
    const tld = parts[parts.length - 1] || '';
    const sld = parts[parts.length - 2] || '';
    // e.g. hemanttyagi.in — long single-token SLD on .in often individual sites, not client corp mail
    if (tld === 'in' && sld.length >= 10 && /^[a-z]+$/i.test(sld) && !sld.includes('-')) return true;
    return false;
  }

  // ──────────────────────────────────────────────────────────────────
  // 0) HARD-SKIP: senders that NEVER send requirements (notification services, AI recap bots).
  // These produce false positives that contaminate the requirement queue.
  // Run BEFORE every other heuristic so they cannot leak through.
  // ──────────────────────────────────────────────────────────────────
  const noiseSenderDomains = [
    'otter.ai',
    'e.otter.ai',
    'read.ai',
    'e.read.ai',
    'calendly.com',
    'zoom.us',
    'webex.com',
    'gotomeeting.com',
    'docusign.net',
    'mailchimp.com',
    'sendgrid.net',
  ];
  const isNoiseDomain = noiseSenderDomains.some(
    (d) => normalizedSenderDomain === d || normalizedSenderDomain.endsWith(`.${d}`),
  );
  if (isNoiseDomain) {
    return {
      allow: false,
      reason: `Ignoring notification/meeting-bot sender (${normalizedSenderDomain}).`,
      confidence: 0,
    };
  }

  // Subject/body markers that uniquely identify automated meeting recap or share emails.
  const noiseSubjectMarkers = [
    /\bvia otter\.ai\b/i,
    /\bvia read ai\b/i,
    /\bshared a conversation with you\b/i,
    /\bpre-read for your upcoming meeting\b/i,
    /\bread meeting report\b/i,
    /\bmeeting recap\b/i,
    /\bmeeting summary\b/i,
    /\botter\.ai logo\b/i,
    /\bopen in otter\b/i,
  ];
  if (noiseSubjectMarkers.some((rx) => rx.test(text))) {
    return {
      allow: false,
      reason: 'Ignoring meeting recap / share notification email (Otter.ai, Read.ai, etc.).',
      confidence: 0,
    };
  }

  // Internal recruiter wrappers ("FYI", "please check") often forward the original
  // client requirement thread inline. Creating a new requirement from this wrapper
  // causes false ownership (e.g., pavani@metaforgeit.com). Skip these wrappers and
  // rely on the original client mail ingestion — UNLESS the quoted thread clearly
  // contains JD/demand content (Charlie/Pavani forwards); then ingest and extract.
  if (
    isInternalSender &&
    isForward &&
    hasQuotedExternalSender &&
    wrapperNudgeSignals >= 1 &&
    latestWrapperTokenCount <= 40 &&
    !fullThreadStrongRequirementContext
  ) {
    return {
      allow: false,
      reason: 'Ignoring short internal forward wrapper around external client thread.',
      confidence: 0,
    };
  }

  const verifiedClientDomain = CLIENT_REGISTRY.some((c) =>
    c.emailDomains.some((d) => {
      const dom = d.toLowerCase().trim();
      return normalizedSenderDomain === dom || normalizedSenderDomain.endsWith(`.${dom}`);
    }),
  );
  const fullEvidence = requirementEvidenceFromText(text);
  const replyEvidence = requirementEvidenceFromText(replyBodyOnlyText);
  const ingestEvidence = isReply ? replyEvidence : fullEvidence;
  const {
    hardSignalHits,
    corporateRequirementMarkers,
    hasAnyRequirementSignal,
    requirementTableLikeSignals,
    hasStrongRequirementContext,
    hasReplyThreadRequirementEvidence,
  } = fullEvidence;
  const operationalNonRequirementSignals = [
    /\breceived\s+(?:sufficient|enough)\s+profiles\b/i,
    /\bkindly\s+hold\s+(?:on|off)?\s*(?:to)?\s*(?:sending|sharing|submitting)\s+profiles\b/i,
    /\bhold\s+on\s+to\s+sending\s+profiles\b/i,
    /\bdo\s+not\s+(?:send|share|submit)\s+profiles\b/i,
    /\bstop\s+(?:sending|sharing|submitting)\s+profiles\b/i,
    /\bshare\s+profiles\s+accordingly\b/i,
    /\bplease\s+note\b[\s\S]{0,140}\bnot\b[\s\S]{0,80}\bprofiles?\b/i,
    /\bawaiting\s+feedback\b/i,
    /\brequest\s+for\s+feedback\b/i,
  ].filter((rx) => rx.test(text)).length;

  // 1a) Trivial / near-empty mail guard.
  // Examples: "." body, single-line acknowledgements, or routing stubs.
  // Even for verified client domains, do NOT ingest unless requirement signals exist.
  const bodyCore = bodyText.replace(/[^a-z0-9]+/gi, '').trim();
  const previewCore = preview.replace(/[^a-z0-9]+/gi, '').trim();
  const tokenCount = text
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  const isTrivialLowContent =
    (bodyCore.length <= 2 && previewCore.length <= 10) ||
    tokenCount <= 6 ||
    /^[\s.\-_/|,:;()]+$/.test(toText(body.bodyText || body.text || body.body || body.content));
  if (isTrivialLowContent && !hasAnyRequirementSignal && hardSignalHits === 0 && corporateRequirementMarkers === 0) {
    return {
      allow: false,
      reason: 'Ignoring empty/trivial email without requirement content.',
      confidence: 0,
    };
  }

  const meetingInviteSignals = [
    /\bmicrosoft teams meeting\b/i,
    /\bjoin:\s*https?:\/\/teams\.microsoft\.com\b/i,
    /https?:\/\/teams\.microsoft\.com\/meet\//i,
    /https?:\/\/(?:[\w-]+\.)?zoom\.us\/(?:j|my)\//i,
    /https?:\/\/meet\.google\.com\//i,
    /\bmeeting id\b/i,
    /\bpasscode\b/i,
    /\bneed help\?\s*\|\s*system reference\b/i,
    /\bplease join (?:below |the )?(?:link|meeting)\b/i,
  ].filter((rx) => rx.test(text)).length;

  const candidateSubmissionSignals = [
    /\bplease find (?:the )?(?:attached|attachments?)\s+(?:resume|tracker|profile|details)\b/i,
    /\bname of candidate\b/i,
    /\bcandidate name\b/i,
    /\bemail id\b/i,
    /\bcontact number\b/i,
    /\brate card\b/i,
    /\bimmediate joiner\b/i,
    /\bcurrent ctc\b/i,
    /\bexpected ctc\b/i,
    /\btotal exp\b/i,
    /\brelevant exp\b/i,
    /\bnotice period\b.*\b(serving|lwd)\b/i,
  ].filter((rx) => rx.test(text)).length;

  // 3a) Consolidated candidate status/feedback trackers are NOT new requirement demands.
  const candidateFeedbackTrackerSignals = [
    /\bconsolidated\s+candidate\s+report\b/i,
    /\brequest\s+for\s+feedback\b/i,
    /\bshare\s+your\s+(?:latest\s+)?feedback\b/i,
    /\bawaiting\s+feedback\b/i,
    /\bsubmitted\s+date\b/i,
    /\bcandidate\s+name\b/i,
    /\bsno\b/i,
  ].filter((rx) => rx.test(text)).length;
  if (candidateFeedbackTrackerSignals >= 3) {
    return {
      allow: false,
      reason: 'Ignoring consolidated candidate status/feedback tracker email.',
      confidence: 0,
    };
  }

  // 2) Meeting invite filter with "requirement-first" override.
  //    If verified client + strong requirement signals exist, do NOT hard-skip
  //    just because a Teams/Zoom footer exists in the email.
  const isShortBody = bodyText.length < 500;
  // 1a-reply) Status/coordination replies — judge latest message only (ignore quoted JD below).
  if (isReply) {
    const replyTokenCount = replyBodyOnlyText
      .replace(/[^a-z0-9]+/gi, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;

    if (isShortReplyAcknowledgment(replyBodyOnlyRaw)) {
      return {
        allow: false,
        reason:
          'Ignoring short reply acknowledgment (e.g. Done/Noted) — not a new client requirement demand.',
        decisionTag: 'OPERATIONAL_REPLY_OR_COORDINATION',
        confidence: 0,
      };
    }

    if (
      isOperationalReplyCoordination(replyBodyOnlyText) &&
      !replyEvidence.hasReplyThreadRequirementEvidence
    ) {
      return {
        allow: false,
        reason:
          'Ignoring operational reply (SO tagging / coordination) without new requirement content in latest message.',
        decisionTag: 'OPERATIONAL_REPLY_OR_COORDINATION',
        confidence: 0,
      };
    }

    if (replyTokenCount <= 14 && !replyEvidence.hasReplyThreadRequirementEvidence) {
      return {
        allow: false,
        reason:
          'Ignoring short reply thread without new requirement content in latest message (quoted history ignored).',
        decisionTag: 'OPERATIONAL_REPLY_OR_COORDINATION',
        confidence: 0,
      };
    }
  }

  // 1b) Interview scheduling / availability coordination / interview-tracker tables.
  // Must run BEFORE reply-thread gates: those RE: threads often lack JD cues but are still not
  // new requirements. Also prevents verified-client shortcuts from ingesting LTTS↔Metaforge ops mail.
  const interviewCoordinationStrong =
    /\binterview\s+tracker\b/i.test(text) ||
    /\binterview\s+to\s+be\s+scheduled\b/i.test(text) ||
    /\bplease\s+check\s+the\s+availability\s+of\s+the\s+below\b/i.test(text) ||
    /\bavailability\s+of\s+the\s+below\b/i.test(text) ||
    /\bcandidates?\s+availability\b/i.test(text) ||
    /\bavailability\s+and\s+interview\s+tracker\b/i.test(text) ||
    /\bavailability\s+of\s+the\s+candidate\b/i.test(text);

  const interviewCoordinationTable =
    /\bmail\s+id\b/i.test(text) &&
    /\bphone\s+number\b/i.test(text) &&
    /\binterview\b/i.test(text) &&
    (/\bname\s+of\s+the\s+candidate\b/i.test(text) || /\bqualifications\b/i.test(text));

  const tpcCoordinationSubject =
    /^\s*re:\s*tpc\s*[-–—]/i.test(rawSubject.trim()) &&
    (interviewCoordinationStrong ||
      interviewCoordinationTable ||
      /\binvite\s+sent\b/i.test(text));

  if (interviewCoordinationStrong || interviewCoordinationTable || tpcCoordinationSubject) {
    return {
      allow: false,
      reason:
        'Ignoring interview scheduling, availability coordination, or interview-tracker email (not a client requirement demand).',
      decisionTag: 'INTERVIEW_COORDINATION_OR_TRACKER',
      confidence: 0,
    };
  }

  // Short “Invite sent” stubs from corporate mailboxes (calendar acknowledgments).
  if (
    verifiedClientDomain &&
    /\binvite\s+sent\b/i.test(latestWrapperBlock) &&
    latestWrapperTokenCount <= 48 &&
    !hasStrongRequirementContext
  ) {
    return {
      allow: false,
      reason: 'Ignoring meeting invite acknowledgment (Invite sent).',
      decisionTag: 'INVITE_SENT_ACK',
      confidence: 0,
    };
  }

  // Unknown / non-client domains: keep strict RE: gate (latest message only).
  if (isReply && !verifiedClientDomain && !replyEvidence.hasStrongRequirementContext) {
    return { allow: false, reason: 'Ignoring reply thread email without clear new requirement content.', confidence: 0 };
  }
  // Verified clients (e.g. KPMG/ITC): RE: demands must include JD cues in the latest message, not only in quotes.
  if (isReply && verifiedClientDomain && !isTrivialLowContent && !replyEvidence.hasReplyThreadRequirementEvidence) {
    return { allow: false, reason: 'Ignoring reply thread email without clear new requirement content.', confidence: 0 };
  }
  if (
    verifiedClientDomain &&
    operationalNonRequirementSignals >= 1 &&
    !hasStrongRequirementContext &&
    corporateRequirementMarkers <= 1
  ) {
    return {
      allow: false,
      reason: 'Ignoring profile status/feedback/correction email (not a fresh requirement demand).',
      confidence: 0,
    };
  }
  const meetingOnlyCandidate = meetingInviteSignals >= 2 && (isShortBody || meetingInviteSignals >= 3);
  if (meetingOnlyCandidate && !(verifiedClientDomain && hasStrongRequirementContext)) {
    return {
      allow: false,
      reason: 'Ignoring meeting invite / Teams-link email (not a requirement demand).',
      confidence: 0,
    };
  }

  // 3) Candidate tracker / vendor submission email — block regardless of sender.
  if (candidateSubmissionSignals >= 3) {
    return {
      allow: false,
      reason: 'Ignoring candidate profile/tracker submission (not a client requirement demand).',
      confidence: 0,
    };
  }
  if (verifiedClientDomain && candidateSubmissionSignals >= 2) {
    return {
      allow: false,
      reason: 'Ignoring candidate profile/resume submission email from verified domain.',
      confidence: 0,
    };
  }

  // 3b) Vendor/partner portal activation invites are NOT requirement demands.
  // Must execute before verified-client allowlist shortcuts.
  const isVendorPortalInvite =
    /\bhas been activated for candidate profile\b/i.test(text) ||
    /\bcandidate profile submission\b/i.test(text) ||
    /\buploading relevant candidate profiles\b/i.test(text) ||
    (/\blogging into the system\b/i.test(text) && /\bcandidate profiles?\b/i.test(text)) ||
    /\bkindly request your assistance in logging into the system\b/i.test(text) ||
    (/\bpleased to inform you\b/i.test(text) &&
      /\bjob opportunity\b/i.test(text) &&
      /\bhas been activated\b/i.test(text) &&
      /\b(login|candidate profile|upload)\b/i.test(text));
  if (isVendorPortalInvite) {
    return {
      allow: false,
      reason: 'Ignoring vendor portal job activation / partner submission invite (not a client requirement email).',
      confidence: 0,
    };
  }

  // 3c) ITC portal notification filter:
  // Specific blocker for Recruitment.Team@itcinfotech.com style "upload profiles" alerts.
  // This runs BEFORE verified-client allowlist fallback to avoid false requirement creation.
  const normalizedSender = sender.replace(/\s+/g, '');
  const isItcRecruitmentTeamSender =
    normalizedSender.includes('recruitment.team@itcinfotech.com') ||
    (normalizedSender.endsWith('@itcinfotech.com') &&
      /\brecruitment(\.|_|-)?team\b/i.test(normalizedSender));
  const itcPortalSignals = [
    /\brequest to upload relevant profiles\b/i,
    /\bhas been activated for candidate profile submission\b/i,
    /\bactivated for candidate profile submission\b/i,
    /\buploading relevant candidate profiles against\b/i,
    /\blogging into the system\b/i,
    /\blogin\b/i,
    /\boffshore jobs\b/i,
  ].filter((rx) => rx.test(text)).length;
  const hasRequirementDetails =
    [/\bjob description\b/i, /\bkey responsibilities\b/i, /\brequired skills?\b/i].some((rx) =>
      rx.test(text),
    ) ||
    [/\bskills?\s*[:=\-–—]/i, /\bexperience\s*[:=\-–—]/i, /\bnotice period\s*[:=\-–—]/i].filter(
      (rx) => rx.test(text),
    ).length >= 2;
  if (isItcRecruitmentTeamSender && itcPortalSignals >= 2 && !hasRequirementDetails) {
    return {
      allow: false,
      reason:
        'Ignoring ITC portal notification email (candidate-profile upload alert, not a requirement demand).',
      decisionTag: 'NOTIFICATION_ONLY_ITC_PORTAL',
      confidence: 0,
    };
  }

  // 4) Job applications from candidates ("Application for X position" + first-person pitch).
  const isJobApplicationSubject =
    /\bapplication for\b/i.test(rawSubject) && /\b(position|role|opening|job)\b/i.test(rawSubject);
  const jobApplicationBodySignals =
    (/\b(?:i am|i'm|i’m)\s+writing\s+to\s+apply\b/i.test(text) ? 1 : 0) +
    (/\bdear hiring manager\b/i.test(text) ? 1 : 0) +
    (/\battached\s+(?:my\s+)?resume\b/i.test(text) ? 1 : 0) +
    (/\bopportunity\s+to\s+(?:discuss|interview)\b/i.test(text) ? 1 : 0) +
    (/\bsincerely\b[\s,]/i.test(text) ? 1 : 0);
  if (isJobApplicationSubject && jobApplicationBodySignals >= 2) {
    return {
      allow: false,
      reason: 'Ignoring candidate job application email.',
      confidence: 0,
    };
  }

  // Smart whitelist for known clients: if this is a new inbound (not reply) and body contains
  // strong requirement markers, do not let stricter portal/invite heuristics suppress ingestion.
  if (verifiedClientDomain && ingestEvidence.hardSignalHits >= 2) {
    return { allow: true, confidence: 92 };
  }
  // Corporate-safe fallback: known client + at least one explicit requirement marker.
  // This prevents false skips on real requirements that vary in phrasing.
  if (verifiedClientDomain && ingestEvidence.corporateRequirementMarkers >= 2) {
    return { allow: true, confidence: 86 };
  }

  // PROCESS-FIRST for known clients on *new* inbound mail (not RE: coordination).
  // RE: threads are gated above using latest-message evidence only.
  if (verifiedClientDomain && !isReply) {
    return { allow: true, confidence: 80 };
  }
  if (verifiedClientDomain && isReply && ingestEvidence.hasReplyThreadRequirementEvidence) {
    return { allow: true, confidence: 78 };
  }
  if (verifiedClientDomain && isReply) {
    return {
      allow: false,
      reason:
        'Ignoring verified-client reply without requirement content in latest message (quoted thread ignored).',
      decisionTag: 'OPERATIONAL_REPLY_OR_COORDINATION',
      confidence: 0,
    };
  }

  if (freeMailDomains.has(senderDomain)) {
    return { allow: false, reason: 'Ignoring generic/free-mail sender for client requirement extraction.', confidence: 0 };
  }

  // NOTE: Vendor portal activation invites are blocked earlier as isVendorPortalInvite.

  // Candidate / job-seeker email (resume, "I am…", "Dear Hiring Manager" + personal pitch) — not a client sending a demand.
  const hasClientDemandCue =
    /\b(?:our client|client name|vendor requirement|opening (?:at|for) (?:client|the)|(?:please|kindly)\s+(?:share|submit|refer)\s+(?:cvs?|profiles?)|we (?:have|are) (?:looking|hiring)|mandatory skills for (?:the )?role|bill rate|rate card)\b/i.test(
      text,
    );
  const resumeOrCvPitch =
    /\battached (?:my |updated )?(?:cv|resume)\b/i.test(text) ||
    /\bmy (?:updated )?resume (?:for your reference|is attached|attached)\b/i.test(text) ||
    /\bplease find (?:attached )?(?:my )?(?:cv|resume|updated cv)\b/i.test(text);
  const jobSeekerIntro =
    /\breaching out to explore\b/i.test(text) ||
    /\bexplore (?:senior )?(?:development|technical leadership|opportunities)\b/i.test(text) ||
    (/\b(?:i am|i'm|i’m)\s+\w+/i.test(text) &&
      /\b(?:years of (?:hands-on )?experience|my background|certified scrum master|updated resume)\b/i.test(text));
  const hiringManagerSelfPitch =
    /\bdear hiring manager\b/i.test(text) &&
    /\b(?:i am|i'm|i’m)\s+.+\b(?:experience|application development|currently (?:leading|serving))\b/i.test(text);

  if (!hasClientDemandCue && (resumeOrCvPitch || (jobSeekerIntro && /\b(i am|i'm|i’m)\b/i.test(text)) || hiringManagerSelfPitch)) {
    return {
      allow: false,
      reason:
        'Ignoring candidate job application / resume submission — email reads as a job seeker, not a client requirement.',
      confidence: 0,
    };
  }

  // Hard skip common non-requirement patterns.
  // NOTE: do NOT include `\bmeeting\b` here — many valid requirements mention
  // "meeting" in passing (e.g. "post our meeting on Friday"). Meeting INVITE
  // emails are already hard-skipped earlier via `meetingInviteSignals`.
  if (
    /\bquick check-?in\b/.test(text) ||
    /\bany new hiring requirements\b/.test(text) ||
    /\bnewsletter\b|\bpromotion(?:al)?\b|\breminder\b/.test(text)
  ) {
    return { allow: false, reason: 'Ignoring non-requirement email pattern.', confidence: 10 };
  }

  const structuredFieldHits = [
    /\bjob title\s*[:=-]/i,
    /\bskills?\s*[:=-]/i,
    /\bexperience\s*[:=-]/i,
    /\bnotice period\s*[:=-]/i,
    /\bbudget|ctc|lpa|lpm|salary|bill rate/i,
    /\blocation\s*[:=-]/i,
  ].filter((rx) => rx.test(text)).length;

  // Require requirement-like signal in subject/body.
  const hasSignal = REQUIREMENT_SIGNAL_RULES.some((x) => x.rx.test(text));
  if (!hasSignal) {
    return { allow: false, reason: 'Ignoring email without requirement signals.', confidence: 20 };
  }

  const strongRequirementSignals = [
    /\brequirement\b/,
    /\bjob description\b/,
    /\bjd\b/,
    /\bopenings?\b/,
    /\bpositions?\s*[:=-]/i,
    /\brole title\s*[:=-]/i,
    /\bmandatory skills?\s*[:=-]/i,
  ];
  const hasStrongSignal = strongRequirementSignals.some((rx) => rx.test(text));
  if (!hasStrongSignal && structuredFieldHits < 2) {
    return { allow: false, reason: 'Ignoring weak requirement signal email.', confidence: 25 };
  }
  if (isInternalSender && !hasStrongRequirementContext && structuredFieldHits < 3) {
    return {
      allow: false,
      reason: 'Ignoring internal non-requirement email without clear requirement structure.',
      confidence: 0,
    };
  }

  // Non-corporate / portfolio sender: require unmistakable client-vendor language unless signals are very strong.
  const portfolioSender = isProbablyPersonalPortfolioDomain(senderDomain);
  if (portfolioSender && !hasClientDemandCue && structuredFieldHits < 3) {
    return {
      allow: false,
      reason:
        'Sender domain looks non-corporate; ignoring without clear client demand cues (vendor JD, openings, bill rate, etc.).',
      confidence: 12,
    };
  }

  let confidence = 50 + Math.min(40, structuredFieldHits * 8);
  if (/\burgent\b|\brequirement\b/.test(subject)) confidence += 5;

  // Negative signals (job seeker / applicant) — lower score without hard keywords already blocked above.
  let penalty = 0;
  if (/\bserving my notice period\b/i.test(text)) penalty += 30;
  if (/\battached my (?:updated )?resume\b/i.test(text)) penalty += 38;
  if (/\bmy (?:updated )?resume (?:for your reference|is attached)\b/i.test(text)) penalty += 35;
  if (/\bdear hiring manager\b/i.test(text) && /\b(i am|i'm|i’m)\b/i.test(text) && !hasClientDemandCue) {
    penalty += 25;
  }
  if (/\b(?:i am|i'm|i’m)\s+.+\b(?:looking forward to your response|glad to connect)\b/i.test(text) && /\bmy background\b/i.test(text)) {
    penalty += 18;
  }
  if (portfolioSender && !hasClientDemandCue) penalty += 15;

  confidence -= penalty;
  if (confidence < 0) confidence = 0;
  if (confidence > 100) confidence = 100;

  const minConfidence = verifiedClientDomain ? 30 : 40;
  return {
    allow: confidence >= minConfidence,
    reason: confidence >= minConfidence ? undefined : 'Low extraction confidence.',
    confidence,
  };
}

function buildIngestionAudit(body: any, derived: EmailDerivedFields, decision: IngestionDecision): IngestionAudit {
  const rawSubject = toText(body.subject || derived.roleTitle);
  const subject = rawSubject.toLowerCase();
  const bodyText = toText(body.bodyText || body.text || body.body || body.content).toLowerCase();
  const preview = toText(body.bodyPreview || body.preview || body.description).toLowerCase();
  const text = `${subject}\n${preview}\n${bodyText}`;
  const senderParsed = parseAddressList(
    body.fromEmail ?? body.from ?? body.senderEmail ?? derived.clientLeadPoc,
  );
  const sender = toText(
    senderParsed[0] || body.fromEmail || body.from || body.senderEmail || derived.clientLeadPoc,
  ).toLowerCase();
  const senderDomain = sender.includes('@') ? sender.split('@').pop() || '' : '';
  const normalizedSenderDomain = senderDomain.replace(/[^a-z0-9.-]/gi, '').toLowerCase().trim();
  // Only true replies (Re:) flag here; forwards are now allowed downstream.
  const isReplyOrForward = /^\s*re\s*:/i.test(rawSubject);
  const isVerifiedClientDomain = CLIENT_REGISTRY.some((c) =>
    c.emailDomains.some((d) => {
      const dom = d.toLowerCase().trim();
      return normalizedSenderDomain === dom || normalizedSenderDomain.endsWith(`.${dom}`);
    }),
  );
  const matchedHardSignals = HARD_SIGNAL_RULES.filter((x) => x.rx.test(text)).map((x) => x.label);
  const matchedRequirementSignals = REQUIREMENT_SIGNAL_RULES.filter((x) => x.rx.test(text)).map(
    (x) => x.label,
  );
  return {
    senderDomain: normalizedSenderDomain,
    isReplyOrForward,
    isVerifiedClientDomain,
    matchedHardSignals,
    matchedRequirementSignals,
    confidence: decision.confidence,
    allow: decision.allow,
    ...(decision.reason ? { reason: decision.reason } : {}),
    ...(decision.decisionTag ? { decisionTag: decision.decisionTag } : {}),
  };
}

function computeEmailContentHash(data: Record<string, unknown>): string {
  // Hash a normalized projection of the message body so that two distinct emails
  // with the same role title/sender/date but different content do NOT collapse
  // to the same idempotency key. This is critical for clients (e.g. LTTS) that
  // dispatch many similar-titled requirements within minutes.
  const subject = String(data.subject ?? '').trim().toLowerCase();
  const sender = String(data.clientLeadPoc ?? data.from ?? data.fromEmail ?? '')
    .trim()
    .toLowerCase();
  const body = String(
    data.bodyText ?? data.text ?? data.body ?? data.content ?? data.bodyPreview ?? '',
  )
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  const projection = `${sender}\n${subject}\n${body.slice(0, 4096)}`;
  return createHash('sha1').update(projection).digest('hex');
}

function makeFallbackIdempotencyKey(data: Record<string, unknown>): string {
  const graphMessageId = String(data.graphMessageId ?? '').trim();
  const internetMessageId = String(data.internetMessageId ?? '').trim();

  if (graphMessageId) return `graph:${graphMessageId}`;
  if (internetMessageId) return `internet:${internetMessageId}`;

  // Last-resort key includes a content hash so two distinct emails from the
  // same client on the same day do not collide into a single idempotency row.
  const contentHash = computeEmailContentHash(data);
  const receivedRaw = String(
    data.receivedDateTime ??
      data.received_at ??
      data.emailReceivedAt ??
      data.graphReceivedDateTime ??
      '',
  ).trim();
  const receivedPart = receivedRaw
    ? new Date(receivedRaw).toISOString().slice(0, 16)
    : new Date().toISOString().slice(0, 16);
  return `fallback:${receivedPart}:${contentHash.slice(0, 16)}`;
}

function isMissingEmailIngestionEventsTable(error: unknown): boolean {
  const msg = String((error as any)?.message || '').toLowerCase();
  return msg.includes('email_ingestion_events') && msg.includes('does not exist');
}

function parseBudget(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const s = String(raw).trim().replace(/,/g, '');
  if (!s) return null;
  const compact = s.toLowerCase();
  const m = compact.match(/(\d+(?:\.\d+)?)(?:\s*)(lpa|lpm)?/);
  if (m) {
    const amountText = m[1] ?? '';
    const base = parseFloat(amountText);
    if (!Number.isFinite(base)) return null;
    if (m[2] === 'lpa' || m[2] === 'lpm') return base * 100000;
    if (/[a-z]/i.test(s)) return null;
    return base;
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function normalizeEmploymentType(raw: unknown): 'Full-time' | 'Contract' | null {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;
  if (s === 'full-time' || s === 'full time' || s === 'fulltime') return 'Full-time';
  if (s === 'contract' || s === 'contractual') return 'Contract';
  return null;
}

function normalizeBudgetCurrency(raw: unknown): string {
  const s = String(raw ?? 'INR').trim().toUpperCase().slice(0, 3);
  return /^[A-Z]{3}$/.test(s) ? s : 'INR';
}

async function resolveOrCreateClientIdFromInput(input: any): Promise<string> {
  const explicit = typeof input?.clientId === 'string' ? input.clientId.trim() : '';
  if (explicit) {
    const client = await prisma.client.findUnique({ where: { id: explicit }, select: { id: true } });
    if (!client) throw new Error(`Invalid clientId: ${explicit}`);
    return client.id;
  }

  const rawName =
    (typeof input?.clientName === 'string' && input.clientName.trim()) ||
    (typeof input?.client === 'string' && input.client.trim()) ||
    (typeof input?.submittingToCustom === 'string' && input.submittingToCustom.trim()) ||
    (typeof input?.clientLeadPoc === 'string' && input.clientLeadPoc.trim()) ||
    '';
  const name = rawName.trim();
  if (!name) throw new Error('clientId (or clientName) is required');

  const existing = await prisma.client.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.client.create({
    data: {
      name,
      pocName: (typeof input?.pocName === 'string' && input.pocName.trim()) || 'System',
      pocEmail:
        (typeof input?.pocEmail === 'string' && input.pocEmail.trim()) ||
        'default.client@metaforgeit.com',
      pocPhone: null,
      industry: null,
      location: null,
      isActive: true,
    },
    select: { id: true },
  });
  return created.id;
}

function parseReceivedDate(raw: unknown): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeTitleForDedup(raw: unknown): string {
  return String(raw || '')
    .toLowerCase()
    .replace(/^\s*(re|fw|fwd)\s*:\s*/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function findExistingSameDayRequirement(input: {
  demandReceivedAt: Date;
  roleTitle: string;
  clientLeadPoc: string;
  submittingTo: string;
  openPositions?: number | null;
  location?: string;
  contentHash?: string;
}): Promise<{ id: string; requirementId: string } | null> {
  // Content-only dedupe: ONLY collapse two ingested emails when the normalized
  // body+subject+sender hash is identical (i.e. truly the same template re-sent).
  //
  // Previously this function deduped on role-title + sender + positions + location,
  // which was too aggressive: clients like LTTS frequently dispatch multiple
  // distinct requirements with identical role titles and locations within minutes,
  // and those legitimate demands were being dropped. Requiring a content-hash
  // match keeps deduplication safe while letting genuinely distinct emails through.
  const target = normalizeTitleForDedup(input.roleTitle);
  if (!target || target === 'untitled requirement') return null;
  if (!input.contentHash) return null;

  const tz = getRequirementCalendarTz();
  const { start, end } = zonedCalendarDayRangeForInstant(input.demandReceivedAt, tz);
  const senderNorm = toText(input.clientLeadPoc).toLowerCase();

  const rows = await prisma.requirement.findMany({
    where: {
      isDeleted: false,
      requirementCreatorName: { equals: 'Email Automation', mode: 'insensitive' },
      createdAt: { gte: start, lt: end },
      activities: {
        some: {
          action: 'CREATED',
          metadata: { path: ['contentHash'], equals: input.contentHash },
        },
      },
    },
    select: {
      id: true,
      requirementId: true,
      roleTitle: true,
      clientLeadPoc: true,
    },
    take: 50,
  });

  for (const r of rows) {
    if (normalizeTitleForDedup(r.roleTitle) !== target) continue;
    if (toText((r as any).clientLeadPoc).toLowerCase() !== senderNorm) continue;
    return { id: r.id, requirementId: r.requirementId };
  }
  return null;
}

/** Namespace int for pg_advisory_xact_lock (daily REQ-* serial allocator). */
const ADVISORY_LOCK_REQ_DAILY_NS = 1_847_213;

function dailyRequirementSerialLockKey2(calendarDateStr: string): number {
  let h = 5381;
  for (let i = 0; i < calendarDateStr.length; i++) {
    h = (Math.imul(31, h) + calendarDateStr.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 2_147_483_646;
}

/**
 * Same calendar day + same Graph or Internet message id + same normalized title + same sender
 * as an existing Email Automation requirement (CREATED activity metadata). Catches re-ingests
 * where idempotencyKey changed but the underlying message + role are unchanged.
 */
async function findExistingRequirementByGraphOrInternetAndRole(input: {
  demandReceivedAt: Date;
  graphMessageId?: string;
  internetMessageId?: string;
  roleTitle: string;
  clientLeadPoc: string;
}): Promise<{ id: string; requirementId: string } | null> {
  const gid = String(input.graphMessageId || '').trim();
  const iid = String(input.internetMessageId || '').trim();
  if (!gid && !iid) return null;

  const tz = getRequirementCalendarTz();
  const { start, end } = zonedCalendarDayRangeForInstant(input.demandReceivedAt, tz);
  const target = normalizeTitleForDedup(input.roleTitle);
  const senderNorm = toText(input.clientLeadPoc).toLowerCase();

  const activityOr: Prisma.RequirementActivityWhereInput[] = [];
  if (gid) {
    activityOr.push({
      action: 'CREATED',
      metadata: { path: ['graphMessageId'], equals: gid },
    });
  }
  if (iid) {
    activityOr.push({
      action: 'CREATED',
      metadata: { path: ['internetMessageId'], equals: iid },
    });
  }
  if (activityOr.length === 0) return null;

  const rows = await prisma.requirement.findMany({
    where: {
      isDeleted: false,
      requirementCreatorName: { equals: 'Email Automation', mode: 'insensitive' },
      createdAt: { gte: start, lt: end },
      activities: { some: { OR: activityOr } },
    },
    select: { id: true, requirementId: true, roleTitle: true, clientLeadPoc: true },
    take: 80,
  });

  for (const r of rows) {
    if (normalizeTitleForDedup(r.roleTitle) !== target) continue;
    if (toText(r.clientLeadPoc).toLowerCase() !== senderNorm) continue;
    return { id: r.id, requirementId: r.requirementId };
  }
  return null;
}

/**
 * Next REQ-YYYY-MM-DD-NNN under a per-day transaction lock using MAX(suffix)+1 (append-only),
 * so concurrent ingestions cannot claim the same serial and high-volume runs do not skip numbers.
 */
async function allocateNextRequirementIdSerialized(
  tx: Prisma.TransactionClient,
  day: Date,
): Promise<string> {
  const dateStr = calendarDateInTimeZone(day, getRequirementCalendarTz());
  const prefix = `REQ-${dateStr}-`;
  const lockKey = dailyRequirementSerialLockKey2(dateStr);
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_REQ_DAILY_NS}::int4, ${lockKey}::int4)`,
  );
  const like = `${prefix}%`;
  const rows = await tx.$queryRaw<Array<{ maxn: bigint }>>(
    Prisma.sql`
      SELECT COALESCE(
        MAX(CAST(right(r."requirement_id", 3) AS INTEGER)),
        0
      ) AS maxn
      FROM "requirements" r
      WHERE r."requirement_id" LIKE ${like}
        AND length(r."requirement_id") >= 14
        AND right(r."requirement_id", 3) ~ '^[0-9]{3}$'
    `,
  );
  const maxn = Number(rows[0]?.maxn ?? 0);
  const next = maxn + 1;
  return `${prefix}${String(next).padStart(3, '0')}`;
}

function isRequirementIdUniqueConflict(error: any): boolean {
  return Boolean(
    error?.code === 'P2002' &&
      Array.isArray(error?.meta?.target) &&
      error.meta.target.includes('requirement_id'),
  );
}

async function createRequirementWithSequentialId(input: {
  data: any;
  clientId: string;
  actorName: string;
  idempotencyKey: string;
  status: RequirementStatus;
  assignment: RequirementAssignmentStatus;
  employmentType: 'Full-time' | 'Contract';
  budgetCurrency: string;
  overallBudget: number | null;
  demandReceivedAt: Date;
}) {
  let lastError: any = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const created = await prisma.$transaction(
        async (tx) => {
          const requirementId = await allocateNextRequirementIdSerialized(tx, input.demandReceivedAt);
          const reqCreated = await tx.requirement.create({
            data: {
              requirementId,
            clientId: input.clientId,
            clientLeadPoc: input.data.clientLeadPoc || 'Email Ingestion',
            clientPoc: input.data.clientPoc || 'Not specified',
            roleTitle: input.data.roleTitle || input.data.jobTitle || 'Untitled Requirement',
            location: Array.isArray(input.data.locations) ? input.data.locations.join(', ') : input.data.location || 'Not specified',
            experience: input.data.overallExperienceCustom || input.data.experience || 'Not specified',
            experienceLevel: input.data.experienceLevel || 'Not specified',
            employmentType: input.employmentType,
            workMode: input.data.workMode || 'Not specified',
            budgetCurrency: input.budgetCurrency,
            overallBudget: input.overallBudget,
            yearlyBudget: input.employmentType === 'Full-time' ? input.overallBudget : null,
            monthlyBudget: input.employmentType === 'Contract' ? input.overallBudget : null,
            noticePeriod: input.data.noticePeriod || 'Not specified',
            skills: Array.isArray(input.data.skills)
              ? input.data.skills
              : Array.isArray(input.data.mandatorySkills)
                ? input.data.mandatorySkills
                : [],
            technologies: Array.isArray(input.data.technologies)
              ? input.data.technologies
              : Array.isArray(input.data.mandatorySkills)
                ? input.data.mandatorySkills
                : [],
            priority: input.data.priority?.toUpperCase() || 'MEDIUM',
            openPositions:
              (input.data.openPositions ?? input.data.positions) != null &&
              !Number.isNaN(Number(input.data.openPositions ?? input.data.positions))
                ? parseInt(String(input.data.openPositions ?? input.data.positions), 10)
                : 1,
            submittingTo: input.data.submittingTo || 'Other company / source',
            internalPoc: input.data.internalPoc || 'Email Automation',
            demandType: input.data.demandType || null,
            status: input.status,
            assignment: input.assignment,
            requirementCreatorName: input.actorName,
            assignedToRecruiterName: input.assignment === 'ASSIGNED' ? input.actorName : null,
            assignmentAssignerName: input.assignment === 'ASSIGNED' ? input.actorName : null,
            sourceEmailGraphMessageId:
              input.data.graphMessageId || input.data.graph_message_id || null,
            sourceEmailInternetMessageId:
              input.data.internetMessageId || input.data.internet_message_id || null,
            sourceEmailMailbox:
              input.data.sourceMailbox ||
              input.data.source_mailbox ||
              input.data.mailbox ||
              input.data.graphMailbox ||
              input.data.graph_mailbox ||
              process.env.GRAPH_FROM_EMAIL ||
              process.env.FROM_EMAIL ||
              process.env.SMTP_USER ||
              null,
            sourceEmailSubject: input.data.subject || null,
            submissionsCount: 0,
            isDeleted: false,
            // Preserve first-come-first-serve ordering from email received timestamp.
            createdAt: input.demandReceivedAt,
          },
        });
          return reqCreated;
        },
        { maxWait: 10_000, timeout: 25_000 },
      );
      // Best-effort activity logging outside the write transaction so that
      // logging issues never roll back a successfully created requirement.
      try {
        await logRequirementActivity(prisma, { 
          requirementId: created.id,
          actorId: null,
          action: 'CREATED',
          summary: `Auto-created from email: ${created.roleTitle} (${created.requirementId})`,
          metadata: {
            source: 'EMAIL_AUTOMATION',
            idempotencyKey: input.idempotencyKey,
            graphMessageId: input.data.graphMessageId || null,
            internetMessageId: input.data.internetMessageId || null,
            contentHash: input.data.contentHash || null,
            autofillMeta: input.data.autofillMeta || null,
          },
        });
      } catch (activityError) {
        console.warn(
          '[internalAutomation] requirement created but activity log insert failed:',
          activityError,
        );
      }
      return created;
    } catch (e: any) {
      if (!isRequirementIdUniqueConflict(e)) throw e;
      lastError = e;
    }
  }
  throw lastError || new Error('Could not allocate sequential requirement ID.');
}

router.post(
  '/requirements/ingest-email',
  authenticateInternalAutomation,
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body || {};
    const emailDerived = extractFromEmailContent(body);
    const pipelineExtracted = isPipelineExtractedPayload(body);
    const decision: IngestionDecision = pipelineExtracted
      ? {
          allow: true,
          confidence: 1,
          decisionTag: 'PIPELINE_EXTRACTED',
          reason: 'Trusted pre-extracted email pipeline payload.',
        }
      : shouldIngestRequirementEmail(body, emailDerived);
    const ingestionAudit = buildIngestionAudit(body, emailDerived, decision);
    console.log(
      '[ingestion-audit]',
      JSON.stringify({
        idempotencyHint: String(body.idempotencyKey ?? body.idempotency_key ?? '').trim() || null,
        subject: String(body.subject ?? '').slice(0, 180),
        ...ingestionAudit,
      }),
    );
    if (!decision.allow) {
      return ResponseHelper.success(res, 'Email ignored by requirement classifier', {
        ignored: true,
        reason: decision.reason || 'Ignored as non-requirement email.',
        decisionTag: decision.decisionTag || null,
        confidence: decision.confidence,
        audit: ingestionAudit,
      });
    }
    const data = {
      ...body,
      clientName: body.clientName ?? body.requirement_from ?? emailDerived.submittingTo,
      clientLeadPoc: body.clientLeadPoc ?? body.client_lead_poc ?? emailDerived.clientLeadPoc,
      clientPoc: body.clientPoc ?? body.client_poc ?? emailDerived.clientPoc,
      roleTitle: body.roleTitle ?? body.job_title ?? emailDerived.roleTitle,
      jobTitle: body.jobTitle ?? body.job_title ?? emailDerived.roleTitle,
      location: body.location ?? emailDerived.location,
      overallExperienceCustom: body.overallExperienceCustom ?? body.overall_experience,
      experience: body.experience ?? body.overall_experience ?? emailDerived.experience,
      experienceLevel: body.experienceLevel ?? emailDerived.experienceLevel,
      employmentType: body.employmentType ?? body.employment_type ?? emailDerived.employmentType,
      workMode: body.workMode ?? body.work_mode ?? emailDerived.workMode,
      budgetCurrency: body.budgetCurrency ?? body.budget_currency ?? emailDerived.budgetCurrency,
      overallBudget:
        body.overallBudget ??
        body.yearly_budget ??
        body.monthly_budget ??
        emailDerived.overallBudget,
      noticePeriod: body.noticePeriod ?? body.notice_period ?? emailDerived.noticePeriod,
      skills:
        body.skills && !Array.isArray(body.skills)
          ? String(body.skills).split(';').map((x: string) => x.trim()).filter(Boolean)
          : body.skills ?? emailDerived.skills,
      mandatorySkills:
        body.mandatorySkills ??
        (body.mandatory_skills && !Array.isArray(body.mandatory_skills)
          ? String(body.mandatory_skills).split(';').map((x: string) => x.trim()).filter(Boolean)
          : body.mandatory_skills ?? emailDerived.mandatorySkills),
      technologies:
        body.technologies && !Array.isArray(body.technologies)
          ? String(body.technologies).split(';').map((x: string) => x.trim()).filter(Boolean)
          : body.technologies ?? emailDerived.technologies,
      priority: body.priority ?? emailDerived.priority,
      openPositions: body.openPositions ?? body.number_of_positions ?? emailDerived.openPositions,
      submittingTo: body.submittingTo ?? body.requirement_from ?? emailDerived.submittingTo,
      internalPoc: body.internalPoc ?? body.internal_poc ?? emailDerived.internalPoc,
      demandType: body.demandType ?? body.type_of_demand ?? emailDerived.demandType,
      graphMessageId: body.graphMessageId ?? body.graph_message_id,
      internetMessageId: body.internetMessageId ?? body.internet_message_id,
      idempotencyKey: body.idempotencyKey ?? body.idempotency_key,
      autofillMeta: body.autofillMeta ?? body.autofill_meta,
      ingestionAudit,
    };
    // Be tolerant when upstream automation misses idempotency fields.
    const idempotencyKey =
      String(data.idempotencyKey || '').trim() || makeFallbackIdempotencyKey(data as Record<string, unknown>);

    let existingEvent: any = null;
    try {
      existingEvent = await prismaAny.emailIngestionEvent.findUnique({
        where: { idempotencyKey },
      });
      if (existingEvent?.status === 'CREATED' && existingEvent.requirementPk && existingEvent.requirementCode) {
        return ResponseHelper.success(res, 'Requirement already created for this idempotency key', {
          requirementPk: existingEvent.requirementPk,
          requirementId: existingEvent.requirementCode,
          idempotencyKey,
          deduped: true,
        });
      }
    } catch (e) {
      if (!isMissingEmailIngestionEventsTable(e)) throw e;
    }

    const actorName = (process.env.INTERNAL_AUTOMATION_ACTOR_NAME || 'Email Automation').trim();
    const status = parseRequirementStatus(data.status);
    // Auto-mail demands must land in Unassigned for triage.
    const assignment: RequirementAssignmentStatus = 'UNASSIGNED';
    const employmentType = normalizeEmploymentType(data.employmentType) || 'Full-time';

    // Do not drop requirements due to partial budget extraction from email.
    const parsedBudget = parseBudget(data.overallBudget);
    const overallBudget = parsedBudget != null && parsedBudget > 0 ? parsedBudget : null;
    const budgetCurrency = normalizeBudgetCurrency(data.budgetCurrency);
    const clientId = await resolveOrCreateClientIdFromInput(data);
    const demandReceivedAt = parseReceivedDate(
      data.receivedDateTime ?? data.received_at ?? data.emailReceivedAt ?? data.graphReceivedDateTime,
    ) || new Date();
    const roleForDedup = String(data.roleTitle || data.jobTitle || '').trim();
    const senderForDedup = String(data.clientLeadPoc || '').trim();
    const contentHash = computeEmailContentHash(data as Record<string, unknown>);
    (data as Record<string, unknown>).contentHash = contentHash;
    let dup: { id: string; requirementId: string } | null = null;
    let dupReason = '';
    if (roleForDedup && senderForDedup) {
      dup = await findExistingRequirementByGraphOrInternetAndRole({
        demandReceivedAt,
        graphMessageId: String(data.graphMessageId || ''),
        internetMessageId: String(data.internetMessageId || ''),
        roleTitle: roleForDedup,
        clientLeadPoc: senderForDedup,
      });
      if (dup) {
        dupReason =
          'Same Graph or Internet message id, sender, and role title already ingested for this calendar day.';
      } else {
        dup = await findExistingSameDayRequirement({
          demandReceivedAt,
          roleTitle: roleForDedup,
          clientLeadPoc: senderForDedup,
          submittingTo: String(data.submittingTo || ''),
          openPositions:
            (data.openPositions ?? data.positions) != null && !Number.isNaN(Number(data.openPositions ?? data.positions))
              ? parseInt(String(data.openPositions ?? data.positions), 10)
              : null,
          location: String(data.location || ''),
          contentHash,
        });
        if (dup) dupReason = 'Identical email content already ingested for today.';
      }
    }
    if (dup) {
      // Persist this message on an ingestion row linked to the existing requirement so
      // "Original email (PDF)" can still resolve body (requirementPk was skipped on earlier dedupe-only returns).
      try {
        await prismaAny.emailIngestionEvent.upsert({
          where: { idempotencyKey },
          update: {
            status: 'DEDUPED',
            requirementPk: dup.id,
            requirementCode: dup.requirementId,
            payload: data as object,
            graphMessageId: data.graphMessageId ? String(data.graphMessageId) : null,
            internetMessageId: data.internetMessageId ? String(data.internetMessageId) : null,
            errorMessage: null,
          },
          create: {
            idempotencyKey,
            source: 'EMAIL_AUTOMATION',
            status: 'DEDUPED',
            requirementPk: dup.id,
            requirementCode: dup.requirementId,
            payload: data as object,
            graphMessageId: data.graphMessageId ? String(data.graphMessageId) : null,
            internetMessageId: data.internetMessageId ? String(data.internetMessageId) : null,
          },
        });
      } catch (e) {
        if (!isMissingEmailIngestionEventsTable(e)) throw e;
      }
      return ResponseHelper.success(res, 'Duplicate requirement email ignored', {
        requirementPk: dup.id,
        requirementId: dup.requirementId,
        idempotencyKey,
        deduped: true,
        ignored: true,
        reason: dupReason || 'Duplicate requirement email ignored.',
      });
    }

    try {
      await prismaAny.emailIngestionEvent.upsert({
        where: { idempotencyKey },
        update: {
          status: 'PROCESSING',
          payload: data,
          graphMessageId: data.graphMessageId ? String(data.graphMessageId) : null,
          internetMessageId: data.internetMessageId ? String(data.internetMessageId) : null,
          errorMessage: null,
        },
        create: {
          idempotencyKey,
          source: 'EMAIL_AUTOMATION',
          status: 'PROCESSING',
          payload: data,
          graphMessageId: data.graphMessageId ? String(data.graphMessageId) : null,
          internetMessageId: data.internetMessageId ? String(data.internetMessageId) : null,
        },
      });
    } catch (e) {
      if (!isMissingEmailIngestionEventsTable(e)) throw e;
    }

    try {
      const created = await createRequirementWithSequentialId({
        data,
        clientId,
        actorName,
        idempotencyKey,
        status,
        assignment,
        employmentType,
        budgetCurrency,
        overallBudget,
        demandReceivedAt,
      });

      try {
        await prismaAny.emailIngestionEvent.update({
          where: { idempotencyKey },
          data: {
            status: 'CREATED',
            requirementPk: created.id,
            requirementCode: created.requirementId,
          },
        });
      } catch (e) {
        if (!isMissingEmailIngestionEventsTable(e)) throw e;
      }

      let pdfErr: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await writeRequirementSourceEmailPdf({
            requirementPk: created.id,
            requirementCode: created.requirementId,
            receivedAt: demandReceivedAt,
            payload: data as Record<string, unknown>,
          });
          pdfErr = null;
          break;
        } catch (e) {
          pdfErr = e;
          if (attempt < 2) await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
        }
      }
      if (pdfErr) console.error('[requirement-source-pdf] failed to write PDF after retries:', pdfErr);

      return ResponseHelper.created(res, 'Requirement auto-created successfully', {
        requirementPk: created.id,
        requirementId: created.requirementId,
        idempotencyKey,
        deduped: false,
        confidence: decision.confidence,
      });
    } catch (error: any) {
      try {
        await prismaAny.emailIngestionEvent.update({
          where: { idempotencyKey },
          data: {
            status: 'FAILED',
            errorMessage: String(error?.message || 'Unknown error'),
          },
        });
      } catch (e) {
        if (!isMissingEmailIngestionEventsTable(e)) throw e;
      }
      throw error;
    }
  }),
);

router.get(
  '/requirements/today-email',
  authenticateInternalAutomation,
  asyncHandler(async (_req: Request, res: Response) => {
    const now = new Date();
    const { start, end } = zonedCalendarDayRangeForInstant(now, getRequirementCalendarTz());
    const actor = (process.env.INTERNAL_AUTOMATION_ACTOR_NAME || 'Email Automation').trim();

    const requirements = await prisma.requirement.findMany({
      where: {
        isDeleted: false,
        requirementCreatorName: { equals: actor, mode: 'insensitive' },
        createdAt: { gte: start, lt: end },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        requirementId: true,
        roleTitle: true,
        clientId: true,
        clientLeadPoc: true,
        clientPoc: true,
        internalPoc: true,
        submittingTo: true,
        location: true,
        experience: true,
        experienceLevel: true,
        employmentType: true,
        workMode: true,
        budgetCurrency: true,
        overallBudget: true,
        yearlyBudget: true,
        monthlyBudget: true,
        noticePeriod: true,
        openPositions: true,
        demandType: true,
        priority: true,
        skills: true,
        technologies: true,
        status: true,
        assignment: true,
        closedDate: true,
        createdAt: true,
        requirementCreatorName: true,
      },
    });

    return ResponseHelper.success(res, 'Today auto-email requirements fetched successfully', {
      count: requirements.length,
      requirements,
    });
  }),
);

export default router;
