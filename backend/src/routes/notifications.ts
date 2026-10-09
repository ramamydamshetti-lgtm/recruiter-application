import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { ResponseHelper } from '@/utils/response';
import { asyncHandler } from '@/middleware/errorHandler';
import { authenticate, authorize } from '@/middleware/auth';
import { MailService } from '@/mail/mail.service';
import type { MailAttachment } from '@/mail/transport';
import {
  ITC_INFOTECH_TRACKER_HEADERS,
  parseItcInfotechTrackerRows,
} from '@/utils/itcInfotechTrackerExcel';
import { KPMG_TRACKER_HEADERS, parseKpmgTrackerRows } from '@/utils/kpmgTrackerExcel';
import { UST_TRACKER_HEADERS, parseUstTrackerRows } from '@/utils/ustTrackerExcel';
import { LTTS_TRACKER_HEADERS, parseLttsTrackerRows } from '@/utils/lttsTrackerExcel';
import { ACCENTURE_TRACKER_HEADERS, parseAccentureTrackerRows } from '@/utils/accentureTrackerExcel';
import {
  METAFORGE_INTERNAL_TRACKER_HEADERS,
  parseMetaforgeInternalTrackerRows,
} from '@/utils/metaforgeTrackerExcel';
import { BRILLIO_TRACKER_HEADERS, parseBrillioTrackerRows } from '@/utils/brillioTrackerExcel';
import {
  HAPPIEST_MINDS_TRACKER_HEADERS,
  parseHappiestMindsTrackerRows,
} from '@/utils/happiestMindsTrackerExcel';
import {
  UNIVERSAL_TRACKER_HEADERS,
  parseUniversalTrackerRows,
} from '@/utils/universalTrackerExcel';
import { sanitizeClientFacingCellValue, stripTrackerCellHtml } from '@/lib/clientFacingValue';
import { resolveSubmissionEmailClientName } from '@/lib/submissionClientLabels';
import { trackerRowsToMatrix } from '@/utils/submissionTrackerPdf';
import {
  buildClientTrackerEmailTableHtml,
  trackerVariantForSubmittingTo,
} from '@/mail/clientTrackerEmailTable';
import { buildClientSubmissionEmailHtml } from '@/mail/clientSubmissionEmailHtml';
import {
  buildSubmissionEmailGreeting,
  DEFAULT_SUBMISSION_EMAIL_INTRODUCTION,
  parseThreadToRecipientNames,
} from '@/mail/submissionEmailGreeting';
import { buildResumeDownloadFileName } from '@/utils/resumeFileName';
import { enrichTrackerMatrixFromCandidates } from '@/utils/enrichTrackerRows';
import { getClientSubmissionMailInlineAttachments } from '@/mail/inlineAssets';
import { userRoleToRecruiterTitle } from '@/mail/recruiterSignature';
import { buildSubmissionSenderIdentity } from '@/mail/submissionSender';
import type { InterviewNotificationDetails, InterviewNotificationKind } from '@/mail/templates';
import { fetchRequirementEmailThreadParticipants, resolveRequirementThreadTarget } from '@/lib/requirementEmailThread';
import {
  assertUserCanWorkOnRequirement,
  RequirementWorkAccessError,
} from '@/utils/requirementWorkAccess';

const router = Router();
const prisma = new PrismaClient();

const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'resumes');

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeFileBase(name: string): string {
  return name.replace(/[^a-zA-Z0-9._\s-]/g, '_').trim() || 'candidate';
}

/** Resolve stored resume file on disk (same logic as GET /api/candidates/:id/resume). */
function resolveResumePathOnDisk(candidateId: string, resumeUrl: string | null): string | null {
  if (!resumeUrl?.trim()) return null;
  const resumeUrlTrim = resumeUrl.trim();
  if (resumeUrlTrim.startsWith('http://') || resumeUrlTrim.startsWith('https://')) {
    return null;
  }
  const safeName = resumeUrlTrim.replace(/[^a-zA-Z0-9._-]/g, '_');
  const candidates = [
    path.join(UPLOADS_DIR, `${candidateId}.pdf`),
    path.join(UPLOADS_DIR, `${candidateId}.doc`),
    path.join(UPLOADS_DIR, `${candidateId}.docx`),
    path.join(UPLOADS_DIR, safeName),
    path.join(UPLOADS_DIR, resumeUrlTrim),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function isClientSubmissionDryRun(): boolean {
  const mode = env('CLIENT_SUBMISSION_EMAIL_MODE').toLowerCase();
  return ['dry_run', 'dry-run', 'test', 'preview', 'disabled'].includes(mode);
}

function parseThreadRecipientList(body: Record<string, unknown>, key: string): string[] {
  const raw = body[key];
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of raw) {
    const s = String(x).trim();
    if (!s) continue;
    const lower = s.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(s);
  }
  return out;
}

function parseThreadRecipientsPayload(body: Record<string, unknown>): {
  to: string[];
  cc: string[];
  bcc: string[];
} {
  const to =
    parseThreadRecipientList(body, 'threadToRecipients').length > 0
      ? parseThreadRecipientList(body, 'threadToRecipients')
      : parseThreadRecipientList(body, 'toRecipients');
  const cc =
    parseThreadRecipientList(body, 'threadCcRecipients').length > 0
      ? parseThreadRecipientList(body, 'threadCcRecipients')
      : parseThreadRecipientList(body, 'ccRecipients');
  const bcc =
    parseThreadRecipientList(body, 'threadBccRecipients').length > 0
      ? parseThreadRecipientList(body, 'threadBccRecipients')
      : parseThreadRecipientList(body, 'bccRecipients');
  return { to, cc, bcc };
}

function parseThreadSubjectOverride(body: Record<string, unknown>): string {
  const raw = body.threadSubject;
  return typeof raw === 'string' ? raw.trim() : '';
}

function parseAlsoForwardToClientThread(body: Record<string, unknown>): boolean {
  return body.alsoForwardToClientThread === true;
}

function parseSubmitToLeadFlag(
  body: Record<string, unknown>,
  actorRole: string,
  submissionDestination: 'lead' | 'client',
): boolean {
  if (actorRole === 'RECRUITER') return true;
  if (typeof body.submitToLead === 'boolean') return body.submitToLead;
  return submissionDestination !== 'client';
}

function parseForwardToClientLoopFlag(
  body: Record<string, unknown>,
  actorRole: string,
  submissionDestination: 'lead' | 'client',
  alsoForwardToClientThread: boolean,
): boolean {
  if (actorRole === 'RECRUITER') return false;
  if (typeof body.forwardToClientLoop === 'boolean') return body.forwardToClientLoop;
  if (submissionDestination === 'client') return true;
  return alsoForwardToClientThread;
}

/** Normalize client recipient list: valid emails, deduped (case-insensitive), preserve first-seen casing. */
function normalizeClientRecipientEmails(body: Record<string, unknown>): string[] {
  const raw: string[] = [];
  if (Array.isArray(body.clientEmails)) {
    for (const x of body.clientEmails) {
      const s = typeof x === 'string' ? x.trim() : String(x ?? '').trim();
      if (s) raw.push(s);
    }
  }
  if (typeof body.clientEmail === 'string' && body.clientEmail.trim()) {
    raw.push(body.clientEmail.trim());
  }
  const seen = new Map<string, string>();
  for (const e of raw) {
    if (!EMAIL_RE.test(e)) continue;
    const key = e.toLowerCase();
    if (!seen.has(key)) seen.set(key, e);
  }
  return [...seen.values()];
}

function pickSubOrCand(
  sub: string | null | undefined,
  cand: string | null | undefined,
): string {
  const a = sub?.trim();
  if (a) return a;
  const b = cand?.trim();
  return b ?? '';
}

/** Candidate + submission merge for client-email validation. */
type CandidateForClientCheck = {
  name: string;
  email: string;
  phone: string | null;
  currentCompany: string | null;
  skills: string[];
  technologies: string[];
  currentSalary: string | null;
  currentLocation: string | null;
  availableForInterview: string | null;
  totalExperience: number | null;
  experienceLabel: string | null;
  highestQualification: string | null;
  education: string[];
  preferredLocation: string | null;
  expectedSalary: string | null;
  noticePeriod: string | null;
  relevantExperience: string | null;
  reasonForJobChange: string | null;
  offerInHand: string | null;
};

type SubmissionMergeForClient = {
  relevantExperience: string | null;
  reasonForJobChange: string | null;
  offerInHand: string | null;
} | null;

function highestQualificationDisplay(c: {
  highestQualification: string | null;
  education: string[];
}): string {
  const h = c.highestQualification?.trim();
  if (h) return h;
  return joinDisplayList(c.education);
}

function listMissingClientSubmissionFields(
  c: CandidateForClientCheck,
  sub: SubmissionMergeForClient,
): string[] {
  const missing: string[] = [];
  if (!String(c.name ?? '').trim()) missing.push('Name');
  if (!String(c.email ?? '').trim()) missing.push('Email');
  if (!String(c.phone ?? '').trim()) missing.push('Phone number');
  if (!String(c.currentCompany ?? '').trim()) missing.push('Current company');
  const hasSkillOrTech =
    (c.skills ?? []).some((x) => String(x).trim()) ||
    (c.technologies ?? []).some((x) => String(x).trim());
  if (!hasSkillOrTech) missing.push('Skills and technologies');
  if (!String(c.currentSalary ?? '').trim()) missing.push('Current CTC');
  if (!String(c.currentLocation ?? '').trim()) missing.push('Current location');
  if (!String(c.availableForInterview ?? '').trim()) missing.push('Availability for interview');
  const te = c.totalExperience;
  const hasNumericTotal = te != null && Number.isFinite(Number(te));
  const hasLabel = String(c.experienceLabel ?? '').trim().length > 0;
  if (!hasNumericTotal && !hasLabel) missing.push('Total years of experience');

  const qual = highestQualificationDisplay({
    highestQualification: c.highestQualification,
    education: c.education ?? [],
  });
  if (!qual.trim()) missing.push('Highest qualification');

  const relExp = pickSubOrCand(sub?.relevantExperience, c.relevantExperience);
  if (!String(relExp).trim()) missing.push('Relevant experience');

  if (!String(c.expectedSalary ?? '').trim()) missing.push('Expected CTC');

  if (!String(c.preferredLocation ?? '').trim()) missing.push('Preferred location');

  const offerSrc = sub?.offerInHand?.trim() ? sub.offerInHand : c.offerInHand;
  if (!String(offerSrc ?? '').trim()) missing.push('Offer in hand');

  const reason = pickSubOrCand(sub?.reasonForJobChange, c.reasonForJobChange);
  if (!String(reason).trim()) missing.push('Reason for job change');

  if (!String(c.noticePeriod ?? '').trim()) missing.push('Notice period (last working day)');

  return missing;
}

function joinDisplayList(items: string[] | undefined): string {
  return (items ?? [])
    .map((x) => String(x).trim())
    .filter(Boolean)
    .join(', ');
}

function normalizeKind(raw: unknown): InterviewNotificationKind | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const s = String(raw).toLowerCase();
  if (s === 'scheduled' || s === 'rescheduled' || s === 'reminder' || s === 'cancelled') return s;
  return undefined;
}

type TrackerRenderOverride = {
  headers: string[];
  rows: string[][];
  headerBgColor?: string;
};

type RecruiterSignatureOverride = {
  name?: string;
  title?: string;
  email?: string;
  phone?: string;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function normalizeHexColor(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const s = raw.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(s)) return undefined;
  return s.toLowerCase();
}

function parseRecruiterSignatureOverride(raw: unknown): RecruiterSignatureOverride | undefined {
  if (!isPlainObject(raw)) return undefined;
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const email = typeof raw.email === 'string' ? raw.email.trim() : '';
  const phone = typeof raw.phone === 'string' ? raw.phone.trim() : '';
  const out: RecruiterSignatureOverride = {};
  if (name) out.name = name;
  if (title) out.title = title;
  if (email && EMAIL_RE.test(email)) out.email = email;
  if (phone) out.phone = phone;
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Optional tracker renderer override from the frontend:
 * - allows adding extra columns
 * - allows changing header background color before sending
 */
function parseTrackerRenderOverride(
  raw: unknown,
  expectedRows: number,
): TrackerRenderOverride | undefined {
  if (!isPlainObject(raw)) return undefined;
  const headersRaw = raw.headers;
  const rowsRaw = raw.rows;
  if (!Array.isArray(headersRaw) || !Array.isArray(rowsRaw) || rowsRaw.length !== expectedRows) {
    return undefined;
  }

  const headers: string[] = [];
  const seen = new Set<string>();
  for (const h of headersRaw) {
    const label = String(h ?? '').trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    headers.push(label);
  }
  if (headers.length === 0 || headers.length > 80) return undefined;

  const rows: string[][] = [];
  for (const r of rowsRaw) {
    if (!isPlainObject(r)) return undefined;
    const line = headers.map((h) => {
      const v = r[h];
      return sanitizeClientFacingCellValue(stripTrackerCellHtml(v == null ? '' : String(v)).trim());
    });
    rows.push(line);
  }

  const styles = isPlainObject(raw.styles) ? raw.styles : undefined;
  const headerBgColor = normalizeHexColor(styles?.headerBgColor);

  return { headers, rows, ...(headerBgColor ? { headerBgColor } : {}) };
}

/**
 * POST /api/notifications/interview-email
 * Sends an interview notification to the candidate using configured mail (Graph or SMTP).
 */
router.post(
  '/interview-email',
  authenticate,
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const candidateEmail = typeof body.candidateEmail === 'string' ? body.candidateEmail.trim() : '';
    const candidateName = typeof body.candidateName === 'string' ? body.candidateName.trim() : '';
    const round = typeof body.round === 'string' ? body.round.trim() : '';
    const date = typeof body.date === 'string' ? body.date.trim() : '';
    const time = typeof body.time === 'string' ? body.time.trim() : '';
    const mode = typeof body.mode === 'string' ? body.mode.trim() : '';

    if (!candidateEmail || !EMAIL_RE.test(candidateEmail)) {
      return ResponseHelper.error(res, 'Valid candidateEmail is required', 400);
    }
    if (!candidateName) {
      return ResponseHelper.error(res, 'candidateName is required', 400);
    }
    if (!round || !date || !time || !mode) {
      return ResponseHelper.error(res, 'round, date, time, and mode are required', 400);
    }

    const user = req.user!;
    const recruiterOverride = parseRecruiterSignatureOverride(
      (body as { recruiterSignature?: unknown }).recruiterSignature,
    );
    const recruiterName =
      recruiterOverride?.name ||
      [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
      user.email;
    const recruiterSig = {
      name: recruiterName,
      title: userRoleToRecruiterTitle(user.role),
      email: user.email,
      phone: user.phone,
    };

    const details: InterviewNotificationDetails = {
      jobTitle: typeof body.jobTitle === 'string' ? body.jobTitle.trim() : undefined,
      clientName: typeof body.clientName === 'string' ? body.clientName.trim() : undefined,
      round,
      date,
      time,
      mode,
      status: typeof body.status === 'string' ? body.status.trim() : undefined,
      location: typeof body.location === 'string' ? body.location.trim() : undefined,
      meetingLink: typeof body.meetingLink === 'string' ? body.meetingLink.trim() : undefined,
      notes: typeof body.notes === 'string' ? body.notes.trim() : undefined,
      kind: normalizeKind(body.kind),
    };

    const requirementPk = typeof body.requirementId === 'string' ? body.requirementId.trim() : '';
    const submissionPk = typeof body.submissionId === 'string' ? body.submissionId.trim() : '';

    await MailService.sendInterviewNotificationEmail(
      candidateEmail,
      candidateName,
      details,
      recruiterSig,
      requirementPk || submissionPk
        ? {
            type: 'INTERVIEW_NOTIFICATION',
            ...(requirementPk ? { requirementId: requirementPk } : {}),
            ...(submissionPk ? { submissionId: submissionPk } : {}),
          }
        : undefined,
    );

    return ResponseHelper.success(res, 'Interview notification email sent', {
      to: candidateEmail,
    });
  }),
);

/**
 * POST /api/notifications/client-submission-email
 * Sends client-facing submission email with per-candidate detail blocks and resume attachments (when files exist on server).
 */
router.post(
  '/client-submission-email',
  authenticate,
  authorize('ADMIN', 'RECRUITER', 'LEAD'),
  asyncHandler(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const clientEmails = normalizeClientRecipientEmails(body);
    const actorRole = String((req as { user?: { role?: string } }).user?.role ?? '').toUpperCase();
    const rawDestination = body.submissionDestination ?? body.submissionStage;
    const submissionDestination: 'lead' | 'client' =
      actorRole === 'RECRUITER'
        ? 'lead'
        : rawDestination === 'client'
          ? 'client'
          : 'lead';
    const confirmClientThread = body.confirmClientThread === true;
    const alsoForwardToClientThread =
      actorRole !== 'RECRUITER' && parseAlsoForwardToClientThread(body);
    const wantsSubmitToLead = parseSubmitToLeadFlag(body, actorRole, submissionDestination);
    const wantsForwardToClientLoop = parseForwardToClientLoopFlag(
      body,
      actorRole,
      submissionDestination,
      alsoForwardToClientThread,
    );
    const requirementId = typeof body.requirementId === 'string' ? body.requirementId.trim() : '';
    const rawIds = body.candidateIds;
    const candidateIds: string[] = Array.isArray(rawIds)
      ? rawIds.map((x: unknown) => String(x).trim()).filter(Boolean)
      : [];

    if (!requirementId) {
      return ResponseHelper.error(res, 'requirementId is required', 400);
    }
    if (candidateIds.length === 0) {
      return ResponseHelper.error(res, 'candidateIds must be a non-empty array', 400);
    }

    const uniqueIds = [...new Set(candidateIds)];

    const requirement = await prisma.requirement.findFirst({
      where: { id: requirementId, isDeleted: false },
      select: {
        id: true,
        requirementId: true,
        roleTitle: true,
        clientLeadPoc: true,
        submittingTo: true,
        sourceEmailGraphMessageId: true,
        sourceEmailInternetMessageId: true,
        sourceEmailMailbox: true,
        sourceEmailSubject: true,
      },
    });

    if (!requirement) {
      return ResponseHelper.error(res, 'Requirement not found', 404);
    }

    const actorId = (req as { user?: { id?: string } }).user?.id;
    if (!actorId) {
      return ResponseHelper.unauthorized(res, 'Unauthorized');
    }
    try {
      await assertUserCanWorkOnRequirement(prisma, requirement.id, actorId);
    } catch (e: unknown) {
      if (e instanceof RequirementWorkAccessError) {
        return ResponseHelper.error(res, e.message, e.statusCode);
      }
      throw e;
    }

    if (!wantsSubmitToLead && !wantsForwardToClientLoop) {
      return ResponseHelper.error(
        res,
        'Select at least one action: submit to lead and/or forward to the original requirement email thread.',
        400,
      );
    }

    if (wantsSubmitToLead && clientEmails.length === 0) {
      return ResponseHelper.error(res, 'Enter at least one lead email.', 400);
    }

    const threadSubjectOverride = parseThreadSubjectOverride(body);
    let threadTarget: { graphMessageId: string; mailbox: string; subject: string } | null =
      await resolveRequirementThreadTarget(requirement);
    const needsThreadResolve =
      wantsForwardToClientLoop && !threadTarget?.graphMessageId && threadSubjectOverride;
    if (needsThreadResolve) {
      threadTarget = await resolveRequirementThreadTarget({
        ...requirement,
        sourceEmailSubject: threadSubjectOverride,
      });
      if (threadTarget?.graphMessageId) {
        try {
          await prisma.requirement.update({
            where: { id: requirement.id },
            data: {
              sourceEmailGraphMessageId: threadTarget.graphMessageId,
              sourceEmailMailbox: threadTarget.mailbox,
              sourceEmailSubject: threadSubjectOverride,
            },
          });
        } catch {
          // Linking is best-effort.
        }
      }
    }
    const threadRecipients = parseThreadRecipientsPayload(body);

    if (wantsForwardToClientLoop) {
      if (!confirmClientThread) {
        return ResponseHelper.error(
          res,
          wantsSubmitToLead
            ? 'Confirm that candidates should also be forwarded in the original client email thread.'
            : 'Confirm that this candidate should be submitted to the original client email thread.',
          400,
        );
      }
      if (!threadTarget?.graphMessageId) {
        return ResponseHelper.error(
          res,
          threadSubjectOverride
            ? 'No email was found in the mailbox with that subject. Enter the exact subject from the original client/DL email and try again.'
            : 'Original requirement email thread was not found. For manually created requirements, paste the original email subject and click Find email thread. Auto-ingested requirements link from the ingestion mailbox.',
          409,
        );
      }
      if (!threadTarget.mailbox) {
        return ResponseHelper.error(
          res,
          'Original requirement mailbox is not configured. Forward to client was not sent.',
          409,
        );
      }
    }

    const candidatesDb = await prisma.candidate.findMany({
      where: { id: { in: uniqueIds } },
      include: {
        submissions: {
          where: { requirementId },
          orderBy: { submittedOn: 'desc' },
          take: 1,
        },
      },
    });

    if (candidatesDb.length !== uniqueIds.length) {
      return ResponseHelper.error(res, 'One or more candidates were not found', 400);
    }

    const byId = new Map(candidatesDb.map((c) => [c.id, c]));
    const candidatesOrdered = uniqueIds.map((id) => byId.get(id)).filter(Boolean) as typeof candidatesDb;

    const user = req.user!;
    const recruiterOverride = parseRecruiterSignatureOverride(
      (body as { recruiterSignature?: unknown }).recruiterSignature,
    );
    const recruiterName =
      recruiterOverride?.name ||
      [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
      user.email;
    const recruiterReplyEmail = recruiterOverride?.email || user.email;
    let submissionSender = buildSubmissionSenderIdentity({
      firstName: user.firstName,
      lastName: user.lastName,
      email: recruiterReplyEmail,
      displayNameOverride: recruiterName,
    });

    if (
      wantsForwardToClientLoop &&
      !wantsSubmitToLead &&
      !recruiterOverride?.name &&
      !recruiterOverride?.email
    ) {
      const existingSubs = await prisma.submission.findMany({
        where: { requirementId: requirement.id, candidateId: { in: uniqueIds } },
        select: {
          submittedBy: true,
          submitter: { select: { firstName: true, lastName: true, email: true } },
        },
      });
      const submitterIds = [...new Set(existingSubs.map((s) => s.submittedBy))];
      if (submitterIds.length === 1 && existingSubs[0]?.submitter) {
        submissionSender = buildSubmissionSenderIdentity({
          firstName: existingSubs[0].submitter.firstName,
          lastName: existingSubs[0].submitter.lastName,
          email: existingSubs[0].submitter.email,
        });
      }
    }

    const submittingToRaw =
      typeof body.submittingToClient === 'string' && body.submittingToClient.trim()
        ? body.submittingToClient.trim().toLowerCase()
        : (requirement.submittingTo?.trim().toLowerCase() ?? '');

    const customClientNameFromBody =
      typeof body.customClientName === 'string' ? body.customClientName.trim() : '';
    const customClientNameFromTracker =
      (() => {
        const rawTracker = (body as { clientTracker?: unknown }).clientTracker;
        if (!rawTracker || typeof rawTracker !== 'object' || rawTracker === null) return '';
        const name = (rawTracker as { customClientName?: unknown }).customClientName;
        return typeof name === 'string' ? name.trim() : '';
      })();
    const resolvedCustomClientName = customClientNameFromBody || customClientNameFromTracker;

    const clientName = resolveSubmissionEmailClientName({
      submissionClientSlug: submittingToRaw,
      customClientName: resolvedCustomClientName,
      requirementSubmittingTo: requirement.submittingTo,
      clientLeadPoc: requirement.clientLeadPoc,
    });
    const roleTitle = requirement.roleTitle?.trim() || 'Position';
    const emailContextLine = clientName ? `${roleTitle} · ${clientName}` : roleTitle;

    const subtitleLine = emailContextLine;
    const trackerRenderOverride = parseTrackerRenderOverride(
      (body as { clientTrackerRenderOverride?: unknown }).clientTrackerRenderOverride,
      uniqueIds.length,
    );

    const renderTrackerTable = (input: {
      documentTitle: string;
      headers: readonly string[];
      rows: string[][];
      clientSlug: string;
    }): string => {
      const headers = trackerRenderOverride?.headers ?? input.headers;
      const baseRows = trackerRenderOverride?.rows ?? input.rows;
      const enrichedRows = enrichTrackerMatrixFromCandidates(headers, baseRows, candidatesOrdered);
      return buildClientTrackerEmailTableHtml({
        documentTitle: input.documentTitle,
        subtitle: subtitleLine,
        headers,
        rows: enrichedRows,
        variant: trackerVariantForSubmittingTo(input.clientSlug),
        headerBgOverride: trackerRenderOverride?.headerBgColor,
        hideTitleHeader: true,
      });
    };

    let trackerTableHtml = '';
    if (submittingToRaw === 'itc') {
      const rawTracker = (body as { clientTracker?: unknown }).clientTracker;
      const rowsUnknown =
        rawTracker &&
        typeof rawTracker === 'object' &&
        rawTracker !== null &&
        (rawTracker as { client?: string }).client === 'itc'
          ? (rawTracker as { rows?: unknown }).rows
          : null;
      const parsed = parseItcInfotechTrackerRows(rowsUnknown);
      if (!parsed || parsed.length !== uniqueIds.length) {
        return ResponseHelper.error(
          res,
          'Client tracker is required: send clientTracker.client "itc" and clientTracker.rows with one row per candidate (same order as candidateIds).',
          400,
        );
      }
      const matrix = trackerRowsToMatrix(ITC_INFOTECH_TRACKER_HEADERS, parsed);
      trackerTableHtml = renderTrackerTable({
        documentTitle: 'ITC Infotech — Submission tracker',
        headers: ITC_INFOTECH_TRACKER_HEADERS,
        rows: matrix,
        clientSlug: 'itc',
      });
    } else if (submittingToRaw === 'kpmg') {
      const rawTracker = (body as { clientTracker?: unknown }).clientTracker;
      const rowsUnknown =
        rawTracker &&
        typeof rawTracker === 'object' &&
        rawTracker !== null &&
        (rawTracker as { client?: string }).client === 'kpmg'
          ? (rawTracker as { rows?: unknown }).rows
          : null;
      const parsed = parseKpmgTrackerRows(rowsUnknown);
      if (!parsed || parsed.length !== uniqueIds.length) {
        return ResponseHelper.error(
          res,
          'Client tracker is required: send clientTracker.client "kpmg" and clientTracker.rows with one row per candidate (same order as candidateIds).',
          400,
        );
      }
      const matrix = trackerRowsToMatrix(KPMG_TRACKER_HEADERS, parsed);
      trackerTableHtml = renderTrackerTable({
        documentTitle: 'KPMG — Submission tracker',
        headers: KPMG_TRACKER_HEADERS,
        rows: matrix,
        clientSlug: 'kpmg',
      });
    } else if (submittingToRaw === 'ust') {
      const rawTracker = (body as { clientTracker?: unknown }).clientTracker;
      const rowsUnknown =
        rawTracker &&
        typeof rawTracker === 'object' &&
        rawTracker !== null &&
        (rawTracker as { client?: string }).client === 'ust'
          ? (rawTracker as { rows?: unknown }).rows
          : null;
      const parsed = parseUstTrackerRows(rowsUnknown);
      if (!parsed || parsed.length !== uniqueIds.length) {
        return ResponseHelper.error(
          res,
          'Client tracker is required: send clientTracker.client "ust" and clientTracker.rows with one row per candidate (same order as candidateIds).',
          400,
        );
      }
      const matrix = trackerRowsToMatrix(UST_TRACKER_HEADERS, parsed);
      trackerTableHtml = renderTrackerTable({
        documentTitle: 'UST — Submission tracker',
        headers: UST_TRACKER_HEADERS,
        rows: matrix,
        clientSlug: 'ust',
      });
    } else if (submittingToRaw === 'ltts') {
      const rawTracker = (body as { clientTracker?: unknown }).clientTracker;
      const rowsUnknown =
        rawTracker &&
        typeof rawTracker === 'object' &&
        rawTracker !== null &&
        (rawTracker as { client?: string }).client === 'ltts'
          ? (rawTracker as { rows?: unknown }).rows
          : null;
      const parsed = parseLttsTrackerRows(rowsUnknown);
      if (!parsed || parsed.length !== uniqueIds.length) {
        return ResponseHelper.error(
          res,
          'Client tracker is required: send clientTracker.client "ltts" and clientTracker.rows with one row per candidate (same order as candidateIds).',
          400,
        );
      }
      const matrix = trackerRowsToMatrix(LTTS_TRACKER_HEADERS, parsed);
      trackerTableHtml = renderTrackerTable({
        documentTitle: 'LTTS / L&T — Submission tracker',
        headers: LTTS_TRACKER_HEADERS,
        rows: matrix,
        clientSlug: 'ltts',
      });
    } else if (submittingToRaw === 'accenture') {
      const rawTracker = (body as { clientTracker?: unknown }).clientTracker;
      const rowsUnknown =
        rawTracker &&
        typeof rawTracker === 'object' &&
        rawTracker !== null &&
        (rawTracker as { client?: string }).client === 'accenture'
          ? (rawTracker as { rows?: unknown }).rows
          : null;
      const parsed = parseAccentureTrackerRows(rowsUnknown);
      if (!parsed || parsed.length !== uniqueIds.length) {
        return ResponseHelper.error(
          res,
          'Client tracker is required: send clientTracker.client "accenture" and clientTracker.rows with one row per candidate (same order as candidateIds).',
          400,
        );
      }
      const matrix = trackerRowsToMatrix(ACCENTURE_TRACKER_HEADERS, parsed);
      trackerTableHtml = renderTrackerTable({
        documentTitle: 'Accenture — Submission tracker',
        headers: ACCENTURE_TRACKER_HEADERS,
        rows: matrix,
        clientSlug: 'accenture',
      });
    } else if (submittingToRaw === 'metaforge') {
      const rawTracker = (body as { clientTracker?: unknown }).clientTracker;
      const rowsUnknown =
        rawTracker &&
        typeof rawTracker === 'object' &&
        rawTracker !== null &&
        (rawTracker as { client?: string }).client === 'metaforge'
          ? (rawTracker as { rows?: unknown }).rows
          : null;
      const parsed = parseMetaforgeInternalTrackerRows(rowsUnknown);
      if (!parsed || parsed.length !== uniqueIds.length) {
        return ResponseHelper.error(
          res,
          'Client tracker is required: send clientTracker.client "metaforge" and clientTracker.rows with one row per candidate (same order as candidateIds).',
          400,
        );
      }
      const matrix = trackerRowsToMatrix(METAFORGE_INTERNAL_TRACKER_HEADERS, parsed);
      trackerTableHtml = renderTrackerTable({
        documentTitle: 'MetaForge (Internal) — Submission tracker',
        headers: METAFORGE_INTERNAL_TRACKER_HEADERS,
        rows: matrix,
        clientSlug: 'metaforge',
      });
    } else if (submittingToRaw === 'brillio') {
      const rawTracker = (body as { clientTracker?: unknown }).clientTracker;
      const rowsUnknown =
        rawTracker &&
        typeof rawTracker === 'object' &&
        rawTracker !== null &&
        (rawTracker as { client?: string }).client === 'brillio'
          ? (rawTracker as { rows?: unknown }).rows
          : null;
      const parsed = parseBrillioTrackerRows(rowsUnknown);
      if (!parsed || parsed.length !== uniqueIds.length) {
        return ResponseHelper.error(
          res,
          'Client tracker is required: send clientTracker.client "brillio" and clientTracker.rows with one row per candidate (same order as candidateIds).',
          400,
        );
      }
      const matrix = trackerRowsToMatrix(BRILLIO_TRACKER_HEADERS, parsed);
      trackerTableHtml = renderTrackerTable({
        documentTitle: 'Brillio — Submission tracker',
        headers: BRILLIO_TRACKER_HEADERS,
        rows: matrix,
        clientSlug: 'brillio',
      });
    } else if (submittingToRaw === 'happiest-minds') {
      const rawTracker = (body as { clientTracker?: unknown }).clientTracker;
      const rowsUnknown =
        rawTracker &&
        typeof rawTracker === 'object' &&
        rawTracker !== null &&
        (rawTracker as { client?: string }).client === 'happiest-minds'
          ? (rawTracker as { rows?: unknown }).rows
          : null;
      const parsed = parseHappiestMindsTrackerRows(rowsUnknown);
      if (!parsed || parsed.length !== uniqueIds.length) {
        return ResponseHelper.error(
          res,
          'Client tracker is required: send clientTracker.client "happiest-minds" and clientTracker.rows with one row per candidate (same order as candidateIds).',
          400,
        );
      }
      const matrix = trackerRowsToMatrix(HAPPIEST_MINDS_TRACKER_HEADERS, parsed);
      trackerTableHtml = renderTrackerTable({
        documentTitle: 'Happiest Minds — Submission tracker',
        headers: HAPPIEST_MINDS_TRACKER_HEADERS,
        rows: matrix,
        clientSlug: 'happiest-minds',
      });
    } else if (submittingToRaw === 'other-custom') {
      const rawTracker = (body as { clientTracker?: unknown }).clientTracker;
      const rowsUnknown =
        rawTracker &&
        typeof rawTracker === 'object' &&
        rawTracker !== null &&
        (rawTracker as { client?: string }).client === 'other-custom'
          ? (rawTracker as { rows?: unknown }).rows
          : null;
      const universalClientName = resolvedCustomClientName;
      if (!universalClientName) {
        return ResponseHelper.error(
          res,
          'Custom client name is required when using Other/Custom submission tracker.',
          400,
        );
      }
      const parsed = parseUniversalTrackerRows(rowsUnknown);
      if (!parsed || parsed.length !== uniqueIds.length) {
        return ResponseHelper.error(
          res,
          'Client tracker is required: send clientTracker.client "other-custom", customClientName, and clientTracker.rows with one row per candidate (same order as candidateIds).',
          400,
        );
      }
      const matrix = trackerRowsToMatrix(UNIVERSAL_TRACKER_HEADERS, parsed);
      trackerTableHtml = renderTrackerTable({
        documentTitle: `${universalClientName} — Submission Tracker`,
        headers: UNIVERSAL_TRACKER_HEADERS,
        rows: matrix,
        clientSlug: 'other-custom',
      });
    }

    const threadToNameMap = parseThreadToRecipientNames(body);

    const greetingToEmails =
      wantsForwardToClientLoop && threadRecipients.to.length > 0
        ? threadRecipients.to
        : wantsSubmitToLead
          ? clientEmails
          : threadRecipients.to;

    const emailGreeting =
      typeof body.emailGreeting === 'string' && body.emailGreeting.trim()
        ? body.emailGreeting.trim()
        : buildSubmissionEmailGreeting(greetingToEmails, threadToNameMap);

    const emailIntroduction =
      typeof body.emailIntroduction === 'string' && body.emailIntroduction.trim()
        ? body.emailIntroduction.trim()
        : DEFAULT_SUBMISSION_EMAIL_INTRODUCTION;

    const html = buildClientSubmissionEmailHtml({
      greeting: emailGreeting,
      introduction: emailIntroduction,
      trackerTableHtml: trackerTableHtml || undefined,
      recruiterName,
      recruiterTitle: recruiterOverride?.title || userRoleToRecruiterTitle(user.role),
      recruiterEmail: recruiterOverride?.email || user.email,
      recruiterPhone: recruiterOverride?.phone ?? user.phone,
      sentAtLocale: new Date().toLocaleString(),
    });

    const attachments: MailAttachment[] = [...getClientSubmissionMailInlineAttachments()];
    for (const c of candidatesOrdered) {
      const diskPath = resolveResumePathOnDisk(c.id, c.resumeUrl);
      if (!diskPath) continue;
      const ext = path.extname(diskPath).toLowerCase() || '.pdf';
      attachments.push({
        filename: buildResumeDownloadFileName(
          {
            name: c.name,
            skills: c.skills,
            technologies: c.technologies,
            totalExperience: c.totalExperience,
            experienceLabel: c.experienceLabel,
          },
          ext,
        ),
        path: diskPath,
      });
    }

    const subject = clientName
      ? `Candidate submission — ${roleTitle} — ${clientName}`
      : `Candidate submission — ${roleTitle}`;

    const dryRun = isClientSubmissionDryRun();
    const originalRequirementSubject = threadTarget?.subject?.trim() || '';
    const effectiveThreadSubject = threadSubjectOverride || originalRequirementSubject;
    const fallbackLeadSubject = clientName
      ? `Candidate submission for lead review — ${roleTitle} — ${clientName}`
      : `Candidate submission for lead review — ${roleTitle}`;

    if (dryRun) {
      return ResponseHelper.success(res, 'Dry run: submission email prepared; no email was sent', {
        dryRun: true,
        thread: threadTarget?.graphMessageId
          ? {
              graphMessageId: threadTarget.graphMessageId,
              mailbox: threadTarget.mailbox,
              subject: threadTarget.subject || subject,
            }
          : undefined,
        wantsSubmitToLead,
        wantsForwardToClientLoop,
        recipients: [
          ...(wantsSubmitToLead
            ? clientEmails.map((to) => ({ to, ok: true, mode: 'dry-run-lead-review' }))
            : []),
          ...(wantsForwardToClientLoop
            ? [{ to: 'original requirement email thread', ok: true, mode: 'dry-run-thread-reference' }]
            : []),
        ],
        attachmentCount: attachments.length,
      });
    }

    const sendResults: Array<{ to: string; ok: boolean; error?: string; mode?: string }> = [];

    if (wantsSubmitToLead) {
      const leadEmailSubject = fallbackLeadSubject;
      for (const to of clientEmails) {
        try {
          await MailService.sendClientSubmissionEmail(
            to,
            leadEmailSubject,
            html,
            attachments,
            {
              type: 'CLIENT_SUBMISSION',
              requirementId: requirement.id,
            },
            submissionSender,
          );
          sendResults.push({ to, ok: true, mode: 'lead-review' });
        } catch (e: unknown) {
          sendResults.push({
            to,
            ok: false,
            mode: 'lead-review',
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
      const leadFailed = sendResults.filter((r) => !r.ok);
      if (leadFailed.length === sendResults.length) {
        return ResponseHelper.error(
          res,
          `Could not send lead review email: ${leadFailed.map((f) => `${f.to}: ${f.error}`).join('; ')}`,
          502,
        );
      }
    }

    let threadForwardResults: Array<{ to: string; ok: boolean; error?: string; mode?: string }> = [];
    let threadForwardOk = false;

    if (wantsForwardToClientLoop && threadTarget?.graphMessageId && threadTarget.mailbox) {
      const attemptThreadReply = async (target: {
        graphMessageId: string;
        mailbox: string;
        subject: string;
      }) => {
        await MailService.replyToRequirementThreadWithClientSubmission({
          mailbox: target.mailbox,
          graphMessageId: target.graphMessageId,
          html,
          attachments,
          submissionSender,
          toRecipients: threadRecipients.to.length
            ? threadRecipients.to.map((address) => ({ address }))
            : undefined,
          ccRecipients: threadRecipients.cc.map((address) => ({ address })),
          bccRecipients: threadRecipients.bcc.map((address) => ({ address })),
          replySubject: effectiveThreadSubject || undefined,
          mailLog: {
            type: 'CLIENT_SUBMISSION',
            requirementId: requirement.id,
            subject: effectiveThreadSubject || target.subject || subject,
            recipient:
              [
                ...threadRecipients.to,
                ...threadRecipients.cc.map((e) => `cc:${e}`),
                ...threadRecipients.bcc.map((e) => `bcc:${e}`),
              ].join(', ') || 'original requirement email thread',
          },
        });
      };

      try {
        await attemptThreadReply(threadTarget);
        threadForwardResults = [
          { to: 'original requirement email thread', ok: true, mode: 'thread-reply' },
        ];
        threadForwardOk = true;
      } catch (e: unknown) {
        const err = e instanceof Error ? e.message : String(e);
        const staleMessage =
          /ErrorItemNotFound|ItemNotFound|The specified object was not found|404/i.test(err);

        if (staleMessage) {
          try {
            // Clear stale Graph id and re-link via subject / internetMessageId, then retry once.
            await prisma.requirement.update({
              where: { id: requirement.id },
              data: { sourceEmailGraphMessageId: null },
            });
            const refreshed = await resolveRequirementThreadTarget({
              ...requirement,
              sourceEmailGraphMessageId: null,
              sourceEmailSubject: threadSubjectOverride || requirement.sourceEmailSubject,
            });
            if (refreshed?.graphMessageId) {
              threadTarget = refreshed;
              await attemptThreadReply(refreshed);
              threadForwardResults = [
                {
                  to: 'original requirement email thread',
                  ok: true,
                  mode: 'thread-reply-relinked',
                },
              ];
              threadForwardOk = true;
            } else {
              threadForwardResults = [
                {
                  to: 'original requirement email thread',
                  ok: false,
                  mode: 'thread-reply',
                  error: err,
                },
              ];
            }
          } catch (retryErr: unknown) {
            const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
            threadForwardResults = [
              {
                to: 'original requirement email thread',
                ok: false,
                mode: 'thread-reply',
                error: retryMsg,
              },
            ];
          }
        } else {
          threadForwardResults = [
            { to: 'original requirement email thread', ok: false, mode: 'thread-reply', error: err },
          ];
        }
      }
    }

    if (wantsForwardToClientLoop && !wantsSubmitToLead && !threadForwardOk) {
      const err = threadForwardResults[0]?.error ?? 'Thread reply failed';
      return ResponseHelper.error(
        res,
        `Could not reply to the original requirement email thread: ${err}`,
        502,
      );
    }

    let finalStatus: 'SUBMITTED_TO_LEAD' | 'SUBMITTED_TO_CLIENT' = 'SUBMITTED_TO_LEAD';
    if (wantsForwardToClientLoop && threadForwardOk) {
      finalStatus = 'SUBMITTED_TO_CLIENT';
    } else if (wantsSubmitToLead) {
      finalStatus = 'SUBMITTED_TO_LEAD';
    }

    const forwardedOn = new Date();
    await prisma.submission.updateMany({
      where: {
        requirementId: requirement.id,
        candidateId: { in: uniqueIds },
        status: { notIn: ['INTERVIEW', 'SELECTED', 'REJECTED'] },
      },
      data: {
        status: finalStatus,
        emailSent: true,
        emailSentDate: forwardedOn,
        ...(finalStatus === 'SUBMITTED_TO_CLIENT'
          ? { forwardedBy: user.id, forwardedOn }
          : {}),
      },
    });

    const allFailures = [
      ...sendResults.filter((r) => !r.ok),
      ...threadForwardResults.filter((r) => !r.ok),
    ];

    const successMessage = wantsSubmitToLead && wantsForwardToClientLoop
      ? threadForwardOk
        ? 'Candidate submission sent to lead and forwarded in the original client email thread'
        : 'Candidate submission sent to lead, but the client email thread forward failed'
      : wantsForwardToClientLoop
        ? 'Client submission replied to original requirement email thread'
        : 'Candidate submission sent to lead for review';

    return ResponseHelper.success(res, successMessage, {
      threadSubject: wantsSubmitToLead ? fallbackLeadSubject : effectiveThreadSubject || originalRequirementSubject,
      recipients: [...sendResults, ...threadForwardResults],
      attachmentCount: attachments.length,
      partialFailures: allFailures.length > 0 ? allFailures : undefined,
      ...(threadTarget && wantsForwardToClientLoop
        ? {
            thread: {
              graphMessageId: threadTarget.graphMessageId,
              mailbox: threadTarget.mailbox,
              subject: effectiveThreadSubject || threadTarget.subject || subject,
            },
          }
        : {}),
    });
  }),
);

export default router;
