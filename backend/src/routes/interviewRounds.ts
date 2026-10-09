import { Router, Request, Response } from 'express';
import { asyncHandler } from '@/middleware/errorHandler';
import { authenticate, authorize } from '@/middleware/auth';
import { ResponseHelper } from '@/utils/response';

import { prisma } from '@/lib/prisma';
const router = Router();

router.get(
  '/',
  authenticate,
  authorize('ADMIN', 'RECRUITER', 'LEAD'),
  asyncHandler(async (req: Request, res: Response) => {
    const qRequirementId = typeof req.query.requirementId === 'string' ? req.query.requirementId.trim() : '';
    if (!qRequirementId) return ResponseHelper.error(res, 'requirementId is required', 400);

    const reqRow = await prisma.requirement.findFirst({
      where: { OR: [{ id: qRequirementId }, { requirementId: qRequirementId }] },
      select: { id: true },
    });
    if (!reqRow) return ResponseHelper.error(res, 'Requirement not found', 404);

    try {
      const rows = await prisma.interviewRound.findMany({
        where: { submission: { requirementId: reqRow.id } },
        orderBy: { scheduledAt: 'desc' },
        take: 500,
        include: {
          submission: {
            select: {
              candidate: { select: { name: true } },
            },
          },
        },
      });

      const mapped = rows.map((r) => ({
        id: r.id,
        submissionId: r.submissionId,
        legacyInterviewId: r.legacyInterviewId,
        roundType: r.roundType,
        timezone: r.timezone,
        interviewerName: r.interviewerName,
        interviewerEmail: r.interviewerEmail,
        mode: r.mode,
        status: r.status,
        scheduledAt: r.scheduledAt.toISOString(),
        location: r.location,
        meetingLink: r.meetingLink,
        rescheduleCount: r.rescheduleCount,
        candidateName: r.submission?.candidate?.name ?? undefined,
      }));

      return ResponseHelper.success(res, 'OK', { interviewRounds: mapped });
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === 'P2021') return ResponseHelper.success(res, 'OK', { interviewRounds: [] });
      throw e;
    }
  }),
);

export default router;
