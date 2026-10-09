import { Router, Request, Response } from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import { asyncHandler } from '@/middleware/errorHandler';
import { authenticate, authorize } from '@/middleware/auth';
import { AuthenticatedRequest } from '@/types';
import { ResponseHelper } from '@/utils/response';
import { deleteInterviewRoundByLegacyId, upsertInterviewRoundFromLegacy } from '@/services/interviewRoundsSync';
import { logRequirementActivity } from '@/services/requirementActivityLog';
import { assertCanActOnSubmission, SubmissionAccessError } from '@/utils/submissionOwnership';

const prisma = new PrismaClient();
const router = Router();

function toIso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

router.get(
  '/',
  authenticate,
  authorize('ADMIN', 'RECRUITER', 'LEAD'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const qSubmissionId = typeof req.query.submissionId === 'string' ? req.query.submissionId.trim() : '';
    const qRecruiterId = typeof req.query.recruiterId === 'string' ? req.query.recruiterId.trim() : '';
    const qLimitRaw = typeof req.query.limit === 'string' ? req.query.limit.trim() : '';
    const parsedLimit = qLimitRaw ? parseInt(qLimitRaw, 10) : NaN;
    const limit = Math.min(500, Math.max(1, Number.isFinite(parsedLimit) ? parsedLimit : 200));

    const qRequirementId =
      typeof req.query.requirementId === 'string' ? req.query.requirementId.trim() : '';

    const where: any = {};
    if (qSubmissionId) where.submissionId = qSubmissionId;
    if (qRecruiterId) {
      where.recruiterId = qRecruiterId;
    } else if (req.user?.role === 'RECRUITER' && !qRequirementId) {
      // Recruiters only see their own interviews unless scoped to a requirement (shared view).
      where.recruiterId = req.user.id;
    }

    if (qRequirementId) {
      const reqRow = await prisma.requirement.findFirst({
        where: { OR: [{ id: qRequirementId }, { requirementId: qRequirementId }] },
        select: { id: true },
      });
      if (reqRow?.id) {
        where.submission = { requirementId: reqRow.id };
      } else {
        where.submissionId = '__none__';
      }
    }

    const interviews = await prisma.interview.findMany({
      where,
      orderBy: { scheduledAt: 'desc' },
      take: limit,
      include: {
        submission: {
          include: {
            candidate: { select: { id: true, name: true, email: true, phone: true } },
            requirement: { select: { id: true, requirementId: true, roleTitle: true, submittingTo: true, clientLeadPoc: true } },
          },
        },
      },
    });

    const mapped = interviews.map((i) => ({
      id: i.id,
      submissionId: i.submissionId,
      recruiterId: i.recruiterId,
      round: i.round,
      mode: i.mode,
      status: i.status,
      scheduledAt: toIso(i.scheduledAt),
      location: i.location ?? null,
      meetingLink: i.meetingLink ?? null,
      notes: i.notes ?? null,
      feedback: i.feedback ?? null,
      rating: i.rating ?? null,
      finalDecision: i.finalDecision ?? null,
      createdAt: toIso(i.createdAt),
      updatedAt: toIso(i.updatedAt),
      candidate: {
        id: i.submission.candidate.id,
        name: i.submission.candidate.name,
        email: i.submission.candidate.email,
        phone: i.submission.candidate.phone ?? null,
      },
      requirement: {
        id: i.submission.requirement.id,
        requirementId: i.submission.requirement.requirementId ?? null,
        roleTitle: i.submission.requirement.roleTitle,
        clientName: i.submission.requirement.submittingTo || i.submission.requirement.clientLeadPoc,
      },
    }));

    return ResponseHelper.success(res, 'Interviews retrieved successfully', { interviews: mapped });
  }),
);

router.post(
  '/',
  authenticate,
  authorize('ADMIN', 'RECRUITER', 'LEAD'),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const submissionId = typeof body.submissionId === 'string' ? body.submissionId.trim() : '';
    const round = typeof body.round === 'string' ? body.round.trim() : '';
    const mode = typeof body.mode === 'string' ? body.mode.trim() : '';
    const status = typeof body.status === 'string' ? body.status.trim() : 'Scheduled';
    const scheduledAtRaw = typeof body.scheduledAt === 'string' ? body.scheduledAt.trim() : '';

    if (!submissionId || !round || !mode || !scheduledAtRaw) {
      return ResponseHelper.error(res, 'submissionId, round, mode, scheduledAt are required', 400);
    }

    const scheduledAt = new Date(scheduledAtRaw);
    if (Number.isNaN(scheduledAt.getTime())) {
      return ResponseHelper.error(res, 'scheduledAt must be a valid ISO datetime', 400);
    }

    const recruiterId = (req as any).user?.id as string | undefined;
    const recruiterRole = (req as any).user?.role as string | undefined;
    if (!recruiterId) return ResponseHelper.unauthorized(res, 'Unauthorized');

    try {
      await assertCanActOnSubmission(prisma, submissionId, {
        id: recruiterId,
        role: recruiterRole,
      });
    } catch (e: unknown) {
      if (e instanceof SubmissionAccessError) {
        return ResponseHelper.error(res, e.message, e.statusCode);
      }
      throw e;
    }

    const timezone = typeof body.timezone === 'string' ? body.timezone.trim() : null;
    const interviewerName =
      typeof body.interviewerName === 'string'
        ? body.interviewerName.trim()
        : typeof body.interviewer_name === 'string'
          ? body.interviewer_name.trim()
          : null;
    const interviewerEmail =
      typeof body.interviewerEmail === 'string'
        ? body.interviewerEmail.trim()
        : typeof body.interviewer_email === 'string'
          ? body.interviewer_email.trim()
          : null;

    const created = await prisma.interview.create({
      data: {
        submissionId,
        recruiterId,
        round,
        mode,
        status,
        scheduledAt,
        location: typeof body.location === 'string' ? body.location : null,
        meetingLink: typeof body.meetingLink === 'string' ? body.meetingLink : null,
        notes: typeof body.notes === 'string' ? body.notes : null,
      },
      include: {
        submission: {
          include: {
            candidate: { select: { id: true, name: true, email: true, phone: true } },
            requirement: { select: { id: true, requirementId: true, roleTitle: true, submittingTo: true, clientLeadPoc: true } },
          },
        },
      },
    });

    const ivRow = await prisma.interview.findUnique({ where: { id: created.id } });
    if (ivRow) {
      await upsertInterviewRoundFromLegacy(prisma, ivRow, {
        timezone,
        interviewerName,
        interviewerEmail,
      });
    }

    try {
      await logRequirementActivity(prisma, {
        requirementId: created.submission.requirement.id,
        actorId: recruiterId,
        action: 'interview.scheduled',
        summary: `Interview scheduled for ${created.submission.candidate.name} (${round})`,
        metadata: {
          interviewId: created.id,
          submissionId: created.submissionId,
          candidateId: created.submission.candidate.id,
          candidateName: created.submission.candidate.name,
          round: created.round,
          mode: created.mode,
          status: created.status,
          scheduledAt: created.scheduledAt.toISOString(),
          recruiterId,
        } as Prisma.InputJsonValue,
      });
    } catch (e: unknown) {
      console.warn('[interviews] Could not log schedule activity:', e);
    }

    return ResponseHelper.created(res, 'Interview scheduled successfully', {
      id: created.id,
      submissionId: created.submissionId,
      recruiterId: created.recruiterId,
      round: created.round,
      mode: created.mode,
      status: created.status,
      scheduledAt: created.scheduledAt.toISOString(),
      location: created.location ?? null,
      meetingLink: created.meetingLink ?? null,
      notes: created.notes ?? null,
      candidate: created.submission.candidate,
      requirement: {
        id: created.submission.requirement.id,
        requirementId: created.submission.requirement.requirementId ?? null,
        roleTitle: created.submission.requirement.roleTitle,
        clientName: created.submission.requirement.submittingTo || created.submission.requirement.clientLeadPoc,
      },
    });
  }),
);

router.patch(
  '/:id',
  authenticate,
  authorize('ADMIN', 'RECRUITER', 'LEAD'),
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const body = req.body ?? {};
    const actorId = (req as any).user?.id as string | undefined;
    const actorRole = (req as any).user?.role as string | undefined;

    const existing = await prisma.interview.findUnique({
      where: { id },
      include: {
        submission: {
          select: {
            id: true,
            requirementId: true,
            candidateId: true,
            candidate: { select: { name: true } },
          },
        },
      },
    });
    if (!existing) return ResponseHelper.error(res, 'Interview not found', 404);

    try {
      await assertCanActOnSubmission(prisma, existing.submissionId, {
        id: actorId ?? '',
        role: actorRole,
      });
    } catch (e: unknown) {
      if (e instanceof SubmissionAccessError) {
        return ResponseHelper.error(res, e.message, e.statusCode);
      }
      throw e;
    }

    const data: any = {};
    if (typeof body.round === 'string') data.round = body.round.trim();
    if (typeof body.mode === 'string') data.mode = body.mode.trim();
    if (typeof body.status === 'string') data.status = body.status.trim();
    if (typeof body.scheduledAt === 'string' && body.scheduledAt.trim()) {
      const scheduledAt = new Date(body.scheduledAt.trim());
      if (Number.isNaN(scheduledAt.getTime())) {
        return ResponseHelper.error(res, 'scheduledAt must be a valid ISO datetime', 400);
      }
      data.scheduledAt = scheduledAt;
    }
    if (typeof body.location === 'string') data.location = body.location;
    if (typeof body.meetingLink === 'string') data.meetingLink = body.meetingLink;
    if (typeof body.notes === 'string') data.notes = body.notes;
    if (typeof body.feedback === 'string') data.feedback = body.feedback;
    if (body.rating !== undefined) data.rating = Number(body.rating);
    if (typeof body.finalDecision === 'string' && body.finalDecision.trim()) {
      data.finalDecision = body.finalDecision.trim().toUpperCase();
    }

    const updated = await prisma.interview.update({
      where: { id },
      data,
    });

    await upsertInterviewRoundFromLegacy(prisma, updated);

    try {
      await logRequirementActivity(prisma, {
        requirementId: existing.submission.requirementId,
        actorId: actorId ?? null,
        action: 'interview.updated',
        summary: `Interview updated for ${existing.submission.candidate.name} (${updated.round})`,
        metadata: {
          interviewId: updated.id,
          submissionId: updated.submissionId,
          candidateId: existing.submission.candidateId,
          candidateName: existing.submission.candidate.name,
          previous: {
            round: existing.round,
            status: existing.status,
            mode: existing.mode,
            scheduledAt: existing.scheduledAt.toISOString(),
            finalDecision: existing.finalDecision,
          },
          current: {
            round: updated.round,
            status: updated.status,
            mode: updated.mode,
            scheduledAt: updated.scheduledAt.toISOString(),
            finalDecision: updated.finalDecision,
          },
        } as Prisma.InputJsonValue,
      });
    } catch (e: unknown) {
      console.warn('[interviews] Could not log update activity:', e);
    }

    return ResponseHelper.success(res, 'Interview updated successfully', {
      id: updated.id,
      status: updated.status,
      feedback: updated.feedback ?? null,
      rating: updated.rating ?? null,
      finalDecision: updated.finalDecision ?? null,
      updatedAt: updated.updatedAt.toISOString(),
    });
  }),
);

router.delete(
  '/:id',
  authenticate,
  authorize('ADMIN', 'RECRUITER', 'LEAD'),
  asyncHandler(async (req: Request, res: Response) => {
    const id = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!id) return ResponseHelper.error(res, 'Interview id is required', 400);
    const actorId = (req as any).user?.id as string | undefined;
    const existing = await prisma.interview.findUnique({
      where: { id },
      include: {
        submission: {
          select: {
            requirementId: true,
            candidateId: true,
            candidate: { select: { name: true } },
          },
        },
      },
    });
    if (!existing) return ResponseHelper.error(res, 'Interview not found', 404);
    await prisma.interview.delete({ where: { id } });
    await deleteInterviewRoundByLegacyId(prisma, id);
    try {
      await logRequirementActivity(prisma, {
        requirementId: existing.submission.requirementId,
        actorId: actorId ?? null,
        action: 'interview.deleted',
        summary: `Interview removed for ${existing.submission.candidate.name} (${existing.round})`,
        metadata: {
          interviewId: existing.id,
          submissionId: existing.submissionId,
          candidateId: existing.submission.candidateId,
          candidateName: existing.submission.candidate.name,
          round: existing.round,
          status: existing.status,
          scheduledAt: existing.scheduledAt.toISOString(),
        } as Prisma.InputJsonValue,
      });
    } catch (e: unknown) {
      console.warn('[interviews] Could not log delete activity:', e);
    }
    return ResponseHelper.success(res, 'Interview deleted successfully');
  }),
);

export default router;

