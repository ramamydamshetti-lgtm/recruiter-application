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
      const rows = await prisma.offerManagement.findMany({
        where: { submission: { requirementId: reqRow.id } },
        orderBy: { updatedAt: 'desc' },
        take: 200,
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
        status: r.status,
        offeredCtc: r.offeredCtc != null ? r.offeredCtc.toString() : null,
        currency: r.currency,
        hrNotes: r.hrNotes,
        offerExpiryDate: r.offerExpiryDate ? r.offerExpiryDate.toISOString() : null,
        acceptedAt: r.acceptedAt ? r.acceptedAt.toISOString() : null,
        declinedAt: r.declinedAt ? r.declinedAt.toISOString() : null,
        compensation: r.compensation,
        joiningDate: r.joiningDate ? r.joiningDate.toISOString() : null,
        candidateName: r.submission?.candidate?.name ?? undefined,
      }));

      return ResponseHelper.success(res, 'OK', { offers: mapped });
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === 'P2021') return ResponseHelper.success(res, 'OK', { offers: [] });
      throw e;
    }
  }),
);

export default router;
