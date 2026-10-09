import { Router, Request, Response } from 'express';
import { AuthenticatedRequest } from '@/types';
import type { InterviewType } from '@prisma/client';
import { Prisma, PrismaClient } from '@prisma/client';
import { ResponseHelper } from '@/utils/response';
import { asyncHandler } from '@/middleware/errorHandler';
import { authenticate, authorize } from '@/middleware/auth';
import { normalizeOfferInHandDetails } from '@/utils/offerInHandDetails';
import { applySubmissionStatusChange, parseSubmissionStatusBody } from '@/services/submissionStatus';
import { logRequirementActivity } from '@/services/requirementActivityLog';
import { assertCanActOnSubmission, SubmissionAccessError } from '@/utils/submissionOwnership';
import {
  isClientSubmittedStatus,
  isLeadReviewStatus,
  normalizeSubmissionStatus,
  parseSubmissionStage,
  resolveInitialSubmissionStatus,
  toFrontendSubmissionStatus,
  toRequirementStatusFromSubmission,
} from '@/utils/submissionWorkflow';
import {
  assertUserCanWorkOnRequirement,
  RequirementWorkAccessError,
} from '@/utils/requirementWorkAccess';

const router = Router();
const prisma = new PrismaClient();

const submissionInclude = {
  candidate: {
    select: {
      id: true,
      candidateRef: true,
      name: true,
      email: true,
      phone: true,
      currentCompany: true,
      experienceLabel: true,
      totalExperience: true,
      skills: true,
      technologies: true,
      currentLocation: true,
      preferredLocation: true,
      noticePeriod: true,
      currentSalary: true,
      expectedSalary: true,
      education: true,
      resumeUrl: true,
      sourcePlatform: true,
      sourcePlatformId: true,
    },
  },
  requirement: {
    select: {
      id: true,
      requirementId: true,
      roleTitle: true,
      isDeleted: true,
      skills: true,
      technologies: true,
      workMode: true,
      employmentType: true,
      submittingTo: true,
      clientLeadPoc: true,
    },
  },
  submitter: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
    },
  },
  assignedLead: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
    },
  },
  forwarder: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
    },
  },
} as const;

function toUserPayload(u: { id: string; email: string; firstName: string; lastName: string } | null | undefined) {
  if (!u) return null;
  return {
    id: u.id,
    name: `${u.firstName} ${u.lastName}`.trim(),
    email: u.email,
  };
}

function mapSubmissionRow(s: any) {
  return {
    id: s.id,
    submissionRef: s.submissionRef ?? s.id,
    soNumber: submissionStringOut(s.soNumber, '—'),
    reasonForJobChange: submissionStringOut(s.reasonForJobChange),
    offerInHand: submissionStringOut(s.offerInHand, 'No'),
    offerInHandAmount: submissionStringOut(s.offerInHandAmount, '—'),
    offerInHandCompany: submissionStringOut(s.offerInHandCompany, '—'),
    offerInHandDetails: s.offerInHandDetails,
    relevantExperience: submissionStringOut(s.relevantExperience),
    selectedDate: s.selectedDate ? s.selectedDate.toISOString() : null,
    interviewDate: s.interviewDate ? s.interviewDate.toISOString() : null,
    interviewLocation: submissionStringOut(s.interviewLocation),
    interviewType: (s.interviewType as InterviewType | null) ?? 'PHONE',
    rejectionReason: submissionStringOut(s.rejectionReason, '—'),
    clientFeedback: submissionStringOut(s.clientFeedback, 'Pending'),
    candidate: toCandidatePayload(s.candidate),
    requirement: {
      id: s.requirement.id,
      requirementId: s.requirement.requirementId,
      roleTitle: s.requirement.roleTitle,
      skills: s.requirement.skills ?? [],
      technologies: s.requirement.technologies ?? [],
      workMode: s.requirement.workMode,
      employmentType: s.requirement.employmentType,
      clientName: s.requirement.submittingTo || s.requirement.clientLeadPoc,
    },
    submittedBy: toSubmittedByPayload(s.submitter),
    assignedLead: toUserPayload(s.assignedLead),
    assignedLeadName: s.assignedLeadName ?? toUserPayload(s.assignedLead)?.name ?? null,
    forwardedBy: toUserPayload(s.forwarder),
    forwardedOn: s.forwardedOn ? s.forwardedOn.toISOString() : null,
    submittedOn: s.submittedOn.toISOString(),
    status: toFrontendSubmissionStatus(s.status),
    emailSent: Boolean(s.emailSent),
    emailSentDate: s.emailSentDate ? s.emailSentDate.toISOString() : null,
  };
}

async function resolveAssignedLead(input: {
  assignedLeadId?: string | null;
  assignedLeadName?: string | null;
  submitterSubmittingTo?: string | null;
}) {
  if (input.assignedLeadId) {
    const lead = await prisma.user.findUnique({
      where: { id: input.assignedLeadId },
      select: { id: true, firstName: true, lastName: true, email: true, role: true },
    });
    if (lead && (lead.role === 'LEAD' || lead.role === 'ADMIN')) {
      return {
        assignedLeadId: lead.id,
        assignedLeadName: `${lead.firstName} ${lead.lastName}`.trim() || lead.email,
      };
    }
  }
  const name = (input.assignedLeadName ?? input.submitterSubmittingTo ?? '').trim();
  if (!name) return { assignedLeadId: null as string | null, assignedLeadName: null as string | null };
  const lead = await prisma.user.findFirst({
    where: {
      role: { in: ['LEAD', 'ADMIN'] },
      OR: [
        { email: { equals: name, mode: 'insensitive' } },
        { firstName: { contains: name.split(/\s+/)[0] ?? name, mode: 'insensitive' } },
      ],
    },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  if (lead) {
    return {
      assignedLeadId: lead.id,
      assignedLeadName: `${lead.firstName} ${lead.lastName}`.trim() || lead.email,
    };
  }
  return { assignedLeadId: null as string | null, assignedLeadName: name };
}

function toCandidatePayload(c: any) {
  return {
    id: c.id,
    candidateRef: c.candidateRef ?? null,
    name: c.name,
    email: c.email,
    phone: c.phone,
    currentCompany: c.currentCompany,
    experienceLabel: c.experienceLabel,
    totalExperience: c.totalExperience,
    skills: c.skills ?? [],
    technologies: c.technologies ?? [],
    currentLocation: c.currentLocation,
    preferredLocation: c.preferredLocation,
    noticePeriod: c.noticePeriod,
    currentSalary: c.currentSalary,
    expectedSalary: c.expectedSalary,
    education: c.education ?? [],
    resumeUrl: c.resumeUrl,
    sourcePlatform: c.sourcePlatform,
    sourcePlatformId: c.sourcePlatformId,
  };
}

function toSubmittedByPayload(u: any) {
  return {
    id: u.id,
    name: `${u.firstName} ${u.lastName}`.trim(),
    email: u.email,
  };
}

/** Read optional string from body or body.submission (camelCase or snake_case). */
function pickOptionalSubmissionString(body: any, key: string): string | null {
  const snake = key.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
  const candidates = [body?.[key], body?.submission?.[key], body?.[snake], body?.submission?.[snake]];
  for (const v of candidates) {
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s === '') continue;
    return s;
  }
  return null;
}

function pickOfferInHand(body: any): string | null {
  const hasTop = Object.prototype.hasOwnProperty.call(body, 'offerInHand');
  const v = hasTop ? body.offerInHand : body.submission?.offerInHand;
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  const s = String(v).trim();
  return s === '' ? null : s;
}

/** Accept camelCase or snake_case, top-level or under `submission`. */
function pickRejectionReasonFromBody(body: any): string | null {
  const candidates = [
    body?.rejectionReason,
    body?.rejection_reason,
    body?.submission?.rejectionReason,
    body?.submission?.rejection_reason,
  ];
  for (const v of candidates) {
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s === '') continue;
    return s.length > 2000 ? s.slice(0, 2000) : s;
  }
  return null;
}

/** Prefer explicit body value; then existing row; then candidate/requirement; then fallback (never null). */
function mergeSubmissionText(
  body: any,
  key: string,
  existing: string | null | undefined,
  fromProfile: string | null | undefined,
  fallback: string,
): string {
  const fromBody = pickOptionalSubmissionString(body, key);
  if (fromBody !== null) return fromBody;
  const ex = existing?.trim();
  if (ex) return ex;
  const p = fromProfile?.trim();
  if (p) return p;
  return fallback;
}

function mergeOfferInHand(body: any, existing: string | null | undefined, candidate: string | null | undefined): string {
  const fromBody = pickOfferInHand(body);
  if (fromBody !== null) return fromBody;
  const ex = existing?.trim();
  if (ex) return ex;
  const c = candidate?.trim();
  if (c) return c;
  return 'No';
}

function parseInterviewTypeEnum(
  body: any,
  existing: string | null | undefined,
): InterviewType {
  const raw =
    (body.interviewType ??
      body.submission?.interviewType ??
      body.interview_type ??
      body.submission?.interview_type ??
      existing ??
      'PHONE') as string;
  const u = String(raw).trim().toUpperCase();
  if (u === 'VIDEO' || u === 'ONSITE' || u === 'PHONE') return u as InterviewType;
  return 'PHONE';
}

/** API: avoid showing null/empty for string fields. */
function submissionStringOut(v: string | null | undefined, fallback = 'Not specified'): string {
  const t = v?.trim();
  return t ? t : fallback;
}

function isRealCandidateEmail(value: string | null | undefined): value is string {
  const email = value?.trim().toLowerCase();
  return Boolean(email && email.includes('@') && !email.endsWith('@entry.local'));
}


router.get(
  '/',
  authenticate,
  authorize('ADMIN', 'RECRUITER', 'LEAD'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const qStatus = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const qSubmittedById =
      typeof req.query.submittedById === 'string' ? req.query.submittedById.trim() : '';
    const qScope = typeof req.query.scope === 'string' ? req.query.scope.trim().toLowerCase() : '';
    const teamScope = qScope === 'team';
    const qRequirementId =
      typeof req.query.requirementId === 'string' ? req.query.requirementId.trim() : '';
    const qCandidate = typeof req.query.candidate === 'string' ? req.query.candidate.trim() : '';
    const qLimitRaw = typeof req.query.limit === 'string' ? req.query.limit.trim() : '';
    const parsedLimit = qLimitRaw ? parseInt(qLimitRaw, 10) : NaN;
    const limit = Math.min(500, Math.max(1, Number.isFinite(parsedLimit) ? parsedLimit : 200));

    const where: any = {};

    if (qStatus) {
      where.status = normalizeSubmissionStatus(qStatus) as any;
    }
    if (qSubmittedById) {
      where.submittedBy = qSubmittedById;
    } else if (req.user?.role === 'RECRUITER' && !teamScope && !qRequirementId) {
      // Default for recruiters: own submissions. Requirement detail + scope=team return all rows.
      where.submittedBy = req.user.id;
    }

    if (qRequirementId) {
      // Accept either internal requirement `id` or public `requirementId` (REQ-...).
      const byId = await prisma.requirement.findFirst({
        where: {
          OR: [{ id: qRequirementId }, { requirementId: qRequirementId }],
        },
        select: { id: true },
      });
      if (byId?.id) {
        where.requirementId = byId.id;
      } else {
        // No match; ensure empty result set.
        where.requirementId = '__no_such_requirement__';
      }
    }

    if (qCandidate) {
      where.candidate = {
        OR: [
          { name: { contains: qCandidate, mode: 'insensitive' } },
          { email: { contains: qCandidate, mode: 'insensitive' } },
        ],
      };
    }

    const submissions = await prisma.submission.findMany({
      where,
      orderBy: { submittedOn: 'desc' },
      take: limit,
      include: submissionInclude,
    });

    ResponseHelper.success(res, 'Submissions retrieved successfully', {
      submissions: submissions.map(mapSubmissionRow),
    });
  }),
);

router.get(
  '/lead-queue',
  authenticate,
  authorize('ADMIN', 'LEAD'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const qLimitRaw = typeof req.query.limit === 'string' ? req.query.limit.trim() : '';
    const parsedLimit = qLimitRaw ? parseInt(qLimitRaw, 10) : NaN;
    const limit = Math.min(500, Math.max(1, Number.isFinite(parsedLimit) ? parsedLimit : 200));

    const submissions = await prisma.submission.findMany({
      where: { status: 'SUBMITTED_TO_LEAD' },
      orderBy: { submittedOn: 'desc' },
      take: limit,
      include: submissionInclude,
    });

    ResponseHelper.success(res, 'Lead submission queue retrieved successfully', {
      submissions: submissions.map(mapSubmissionRow),
    });
  }),
);

router.post(
  '/',
  authenticate,
  authorize('ADMIN', 'RECRUITER', 'LEAD'),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body ?? {};

    const candidateId: string | undefined = body.candidateId ?? body.candidate?.id ?? body.candidate?.candidateId;
    const requirementId: string | undefined =
      body.requirementId ?? body.requirement?.id ?? body.jdId ?? body.requirement?.requirementId;

    if (!candidateId || !requirementId) {
      return ResponseHelper.error(res, 'candidateId and requirementId are required', 400);
    }

    const candidateRow = await prisma.candidate.findUnique({
      where: { id: candidateId },
      select: {
        id: true,
        email: true,
        phoneNormalized: true,
        resumeUrl: true,
        reasonForJobChange: true,
        offerInHand: true,
        offerInHandAmount: true,
        offerInHandCompany: true,
        offerInHandDetails: true,
        relevantExperience: true,
        experienceLabel: true,
      },
    });
    if (!candidateRow) {
      return ResponseHelper.error(res, 'Candidate not found', 400);
    }
    if (!candidateRow.resumeUrl || !String(candidateRow.resumeUrl).trim()) {
      return ResponseHelper.error(
        res,
        'Resume is mandatory. Please upload the candidate resume before submitting to the client.',
        400,
      );
    }

    const requirementRow = await prisma.requirement.findUnique({
      where: { id: requirementId },
      select: { clientId: true, requirementId: true, location: true },
    });
    if (!requirementRow) {
      return ResponseHelper.error(res, 'Requirement not found', 400);
    }

    const actorRole = (req as any).user?.role as string | undefined;
    const stage = parseSubmissionStage(body);
    const status = resolveInitialSubmissionStatus({
      role: actorRole,
      stage,
      explicitStatus: body.status ?? body.submission?.status,
    });
    const rejectionReasonRaw = status === 'REJECTED' ? pickRejectionReasonFromBody(body) : null;
    if (status === 'REJECTED' && !rejectionReasonRaw) {
      return ResponseHelper.error(
        res,
        'rejectionReason is required when rejecting a submission.',
        400,
      );
    }

    const submittedOnRaw: string | undefined =
      body.submittedOn ?? body.submission?.submissionDate ?? body.submission?.submittedOn;
    const submittedOn = submittedOnRaw ? new Date(submittedOnRaw) : new Date();
    const selectedDateRaw =
      body.selectedDate ?? body.submission?.selectedDate ?? body.selected_date ?? body.submission?.selected_date;
    const interviewDateRaw =
      body.interviewDate ?? body.submission?.interviewDate ?? body.interview_date ?? body.submission?.interview_date;
    const selectedDate = selectedDateRaw ? new Date(selectedDateRaw) : null;
    const interviewDate = interviewDateRaw ? new Date(interviewDateRaw) : null;

    const submittedById = (req as any).user?.id as string | undefined;
    if (!submittedById) return ResponseHelper.unauthorized(res, 'Unauthorized');

    try {
      await assertUserCanWorkOnRequirement(prisma, requirementId, submittedById);
    } catch (e: unknown) {
      if (e instanceof RequirementWorkAccessError) {
        return ResponseHelper.error(res, e.message, e.statusCode);
      }
      throw e;
    }

    const candidateIdentityOr: Prisma.CandidateWhereInput[] = [{ id: candidateId }];
    if (isRealCandidateEmail(candidateRow.email)) {
      candidateIdentityOr.push({ email: { equals: candidateRow.email, mode: 'insensitive' } });
    }
    if (candidateRow.phoneNormalized) {
      candidateIdentityOr.push({ phoneNormalized: candidateRow.phoneNormalized });
    }

    const existing = await prisma.submission.findFirst({
      where: {
        requirementId,
        candidate: {
          OR: candidateIdentityOr,
        },
      },
      select: { id: true, status: true },
    });
    if (existing) {
      if (isClientSubmittedStatus(existing.status)) {
        return ResponseHelper.error(
          res,
          'Candidate already submitted to the client for this requirement.',
          400,
        );
      }
      if (isLeadReviewStatus(existing.status) && status === 'SUBMITTED_TO_CLIENT') {
        return ResponseHelper.error(
          res,
          'Use forward-to-client for candidates already submitted to lead.',
          400,
        );
      }
      if (isLeadReviewStatus(existing.status) && status === 'SUBMITTED_TO_LEAD') {
        return ResponseHelper.error(
          res,
          'Candidate is already submitted to lead for this requirement.',
          400,
        );
      }
    }

    const submitterProfile = await prisma.user.findUnique({
      where: { id: submittedById },
      select: { submittingTo: true },
    });
    const assignedLead = await resolveAssignedLead({
      assignedLeadId: pickOptionalSubmissionString(body, 'assignedLeadId'),
      assignedLeadName: pickOptionalSubmissionString(body, 'assignedLeadName'),
      submitterSubmittingTo: submitterProfile?.submittingTo ?? null,
    });

    const reasonForJobChange = mergeSubmissionText(
      body,
      'reasonForJobChange',
      null,
      candidateRow.reasonForJobChange,
      'Not specified',
    );
    const offerInHand = mergeOfferInHand(body, undefined, candidateRow.offerInHand);
    const offerYes =
      offerInHand === 'true' ||
      offerInHand.toLowerCase() === 'yes' ||
      offerInHand === '1';
    let norm = normalizeOfferInHandDetails(body as Record<string, unknown>, offerYes);
    if (
      offerYes &&
      norm.details === Prisma.JsonNull &&
      candidateRow.offerInHandDetails != null
    ) {
      norm = normalizeOfferInHandDetails(
        { ...body, offerInHandDetails: candidateRow.offerInHandDetails } as Record<string, unknown>,
        offerYes,
      );
    }
    const offerInHandAmount = mergeSubmissionText(
      body,
      'offerInHandAmount',
      null,
      candidateRow.offerInHandAmount,
      '—',
    );
    const offerInHandCompany = mergeSubmissionText(
      body,
      'offerInHandCompany',
      null,
      candidateRow.offerInHandCompany,
      '—',
    );
    const relevantExperience =
      pickOptionalSubmissionString(body, 'relevantExperience') ??
      (candidateRow.relevantExperience?.trim() ||
        candidateRow.experienceLabel?.trim() ||
        'Not specified');

    const soFromReq = requirementRow.requirementId?.trim() || '—';
    const soNumber =
      pickOptionalSubmissionString(body, 'soNumber') ??
      soFromReq;

    const interviewLocation = mergeSubmissionText(
      body,
      'interviewLocation',
      null,
      requirementRow.location,
      'Not specified',
    );

    const interviewType = parseInterviewTypeEnum(body, undefined);

    const rejectionReason = status === 'REJECTED' ? rejectionReasonRaw! : '—';

    const clientFeedback = mergeSubmissionText(
      body,
      'clientFeedback',
      null,
      null,
      'Pending',
    );

    const submissionPayload = {
      status: status as any,
      submittedOn,
      submittedBy: submittedById,
      assignedLeadId: assignedLead.assignedLeadId,
      assignedLeadName: assignedLead.assignedLeadName,
      ...(status === 'SUBMITTED_TO_CLIENT'
        ? { forwardedBy: submittedById, forwardedOn: submittedOn }
        : {}),
      soNumber,
      reasonForJobChange,
      offerInHand,
      offerInHandAmount,
      offerInHandCompany,
      offerInHandDetails: norm.details,
      relevantExperience,
      selectedDate,
      interviewDate,
      interviewLocation,
      interviewType,
      rejectionReason,
      clientFeedback,
    };

    let updatedOrCreated: { id: string };
    try {
      updatedOrCreated = await prisma.submission.create({
        select: { id: true },
        data: {
          candidateId,
          requirementId,
          clientId: requirementRow.clientId ?? null,
          ...submissionPayload,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return ResponseHelper.error(
          res,
          'Candidate already submitted to the client for this requirement.',
          400,
        );
      }
      throw error;
    }
    await prisma.submission.update({
      where: { id: updatedOrCreated.id },
      data: { submissionRef: updatedOrCreated.id },
    });

    const full = await prisma.submission.findUnique({
      where: { id: updatedOrCreated!.id },
      include: submissionInclude,
    });

    if (!full) {
      return ResponseHelper.error(res, 'Submission not found after creation', 500);
    }

    // Keep requirement summary in sync with submission activity.
    // This is what drives UI counters/status (e.g. "Submissions", "Assigned", etc.).
    const requirementIdSafe = requirementId!;
    const submissionCount = await prisma.submission.count({
      where: { requirementId: requirementIdSafe },
    });

    await prisma.requirement.update({
      where: { id: requirementIdSafe },
      data: {
        submissionsCount: submissionCount,
        status: toRequirementStatusFromSubmission(status) as any,
      },
    });

    try {
      const submitterName = `${full.submitter.firstName} ${full.submitter.lastName}`.trim() || full.submitter.email;
      const reqCode = full.requirement.requirementId || full.requirement.id;
      const action = 'submission.created';
      const summary = `${submitterName} submitted ${full.candidate.name} for ${reqCode}`;
      await logRequirementActivity(prisma, {
        requirementId: full.requirement.id,
        actorId: submittedById,
        action,
        summary,
        metadata: {
          submissionId: full.id,
          candidateId: full.candidate.id,
          candidateName: full.candidate.name,
          recruiterId: full.submitter.id,
          recruiterName: submitterName,
          requirementCode: reqCode,
          status: full.status,
          emailSent: Boolean(full.emailSent),
        } as Prisma.InputJsonValue,
      });
    } catch (e: unknown) {
      console.warn('[submissions] Could not write requirement activity log:', e);
    }

    ResponseHelper.success(res, 'Submission saved successfully', {
      submission: mapSubmissionRow(full),
    });
  }),
);

router.post(
  '/:id/forward-to-client',
  authenticate,
  authorize('ADMIN', 'LEAD'),
  asyncHandler(async (req: Request, res: Response) => {
    const submissionId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!submissionId) return ResponseHelper.error(res, 'Invalid submission id', 400);

    const actorId = (req as any).user?.id as string | undefined;
    if (!actorId) return ResponseHelper.unauthorized(res, 'Unauthorized');

    const existing = await prisma.submission.findUnique({
      where: { id: submissionId },
      select: { id: true, status: true, requirementId: true, candidate: { select: { name: true } } },
    });
    if (!existing) return ResponseHelper.error(res, 'Submission not found', 404);
    if (!isLeadReviewStatus(existing.status)) {
      return ResponseHelper.error(res, 'Only submissions awaiting lead review can be forwarded to the client.', 400);
    }

    try {
      await assertUserCanWorkOnRequirement(prisma, existing.requirementId, actorId);
    } catch (e: unknown) {
      if (e instanceof RequirementWorkAccessError) {
        return ResponseHelper.error(res, e.message, e.statusCode);
      }
      throw e;
    }

    const forwardedOn = new Date();
    await applySubmissionStatusChange(prisma, {
      submissionId,
      newStatus: 'SUBMITTED_TO_CLIENT',
      actorId,
      comments: 'Forwarded to client',
    });
    await prisma.submission.update({
      where: { id: submissionId },
      data: { forwardedBy: actorId, forwardedOn },
    });

    try {
      await logRequirementActivity(prisma, {
        requirementId: existing.requirementId,
        actorId,
        action: 'submission.forwarded_to_client',
        summary: `${existing.candidate?.name ?? 'Candidate'} forwarded to client`,
        metadata: { submissionId, forwardedOn: forwardedOn.toISOString() } as Prisma.InputJsonValue,
      });
    } catch {
      // best-effort
    }

    const full = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: submissionInclude,
    });
    if (!full) return ResponseHelper.error(res, 'Submission not found after forward', 500);

    ResponseHelper.success(res, 'Submission forwarded to client', {
      submission: mapSubmissionRow(full),
    });
  }),
);

router.patch(
  '/:id',
  authenticate,
  authorize('ADMIN', 'RECRUITER', 'LEAD'),
  asyncHandler(async (req: Request, res: Response) => {
    const submissionId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!submissionId) return ResponseHelper.error(res, 'Invalid submission id', 400);

    const body = req.body ?? {};
    const newStatus = parseSubmissionStatusBody(body.status ?? body.submission?.status);
    if (!newStatus) {
      return ResponseHelper.error(res, 'status must be Submitted, Interview, Selected, or Rejected', 400);
    }

    const actorId = (req as any).user?.id as string | undefined;
    const actorRole = (req as any).user?.role as string | undefined;
    const rejectionReason =
      typeof body.rejectionReason === 'string'
        ? body.rejectionReason
        : typeof body.rejection_reason === 'string'
          ? body.rejection_reason
          : null;
    const comments =
      typeof body.comments === 'string'
        ? body.comments
        : typeof body.notes === 'string'
          ? body.notes
          : null;

    try {
      await assertCanActOnSubmission(prisma, submissionId, {
        id: actorId ?? '',
        role: actorRole,
      });
      await applySubmissionStatusChange(prisma, {
        submissionId,
        newStatus,
        actorId: actorId ?? null,
        rejectionReason,
        comments,
      });
    } catch (e: unknown) {
      if (e instanceof SubmissionAccessError) {
        return ResponseHelper.error(res, e.message, e.statusCode);
      }
      const code = (e as { statusCode?: number }).statusCode;
      const msg = e instanceof Error ? e.message : String(e);
      if (code === 404) return ResponseHelper.error(res, msg, 404);
      if (code === 400) return ResponseHelper.error(res, msg, 400);
      throw e;
    }

    const s = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: submissionInclude,
    });
    if (!s) return ResponseHelper.error(res, 'Submission not found after update', 500);

    return ResponseHelper.success(res, 'Submission updated', { submission: mapSubmissionRow(s) });
  }),
);

router.get(
  '/:id/status-history',
  authenticate,
  authorize('ADMIN', 'RECRUITER', 'LEAD'),
  asyncHandler(async (req: Request, res: Response) => {
    const submissionId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!submissionId) return ResponseHelper.error(res, 'Invalid submission id', 400);

    try {
      const rows = await prisma.candidateStatusHistory.findMany({
        where: { submissionId },
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: {
          changedBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      });

      const mapped = rows.map((r) => ({
        id: r.id,
        submissionId: r.submissionId,
        oldStatus: r.oldStatus,
        newStatus: r.newStatus,
        reason: r.reason,
        metadata: r.metadata,
        createdAt: r.createdAt.toISOString(),
        changedBy: r.changedBy
          ? {
              id: r.changedBy.id,
              name: `${r.changedBy.firstName} ${r.changedBy.lastName}`.trim(),
              email: r.changedBy.email,
            }
          : null,
      }));

      return ResponseHelper.success(res, 'OK', { rows: mapped });
    } catch (e: unknown) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2021') {
        return ResponseHelper.success(res, 'OK', { rows: [] });
      }
      throw e;
    }
  }),
);

export default router;

