import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { asyncHandler } from '@/middleware/errorHandler';
import { authenticate, authorize } from '@/middleware/auth';
import { MailService } from '@/mail/mail.service';
import { ResponseHelper } from '@/utils/response';
import { upsertOfferManagementFromLegacy } from '@/services/offerManagementSync';
import { logRequirementActivity } from '@/services/requirementActivityLog';
import { assertCanActOnSubmission, SubmissionAccessError } from '@/utils/submissionOwnership';

import { prisma } from '@/lib/prisma';
const router = Router();

function toIso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

function mapOfferLetter(o: {
  id: string;
  submissionId: string;
  status: string;
  positionTitle: string | null;
  compensation: string | null;
  joiningDate: Date | null;
  validUntil: Date | null;
  terms: string | null;
  letterContent: string | null;
  releasedAt: Date | null;
  acceptedJoiningDate: Date | null;
  declineReason: string | null;
  releasedBy: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: o.id,
    submissionId: o.submissionId,
    status: o.status,
    positionTitle: o.positionTitle,
    compensation: o.compensation,
    joiningDate: toIso(o.joiningDate),
    validUntil: toIso(o.validUntil),
    terms: o.terms,
    letterContent: o.letterContent,
    releasedAt: toIso(o.releasedAt),
    acceptedJoiningDate: toIso(o.acceptedJoiningDate),
    declineReason: o.declineReason,
    releasedBy: o.releasedBy
      ? {
          id: o.releasedBy.id,
          name: `${o.releasedBy.firstName} ${o.releasedBy.lastName}`.trim(),
          email: o.releasedBy.email,
        }
      : null,
    createdAt: toIso(o.createdAt),
    updatedAt: toIso(o.updatedAt),
  };
}

function isOfferLetterLocked(status: string): boolean {
  return status === 'RELEASED' || status === 'ACCEPTED' || status === 'DECLINED';
}

async function assertOfferEligible(submissionId: string) {
  const sub = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: { id: true, status: true },
  });
  if (!sub) {
    return { ok: false as const, status: 404, message: 'Submission not found' };
  }
  const finalSelectedInterview = await prisma.interview.findFirst({
    where: {
      submissionId,
      status: { not: 'CANCELLED' },
      finalDecision: 'SELECTED',
      OR: [
        { round: { equals: 'Final', mode: 'insensitive' } },
        { round: { startsWith: 'Final', mode: 'insensitive' } },
      ],
    },
    orderBy: { scheduledAt: 'desc' },
    select: { id: true },
  });

  if (sub.status !== 'SELECTED' || !finalSelectedInterview) {
    return {
      ok: false as const,
      status: 403,
      message:
        'Offer letter is only allowed when the submission is Selected and a final interview decision is recorded.',
    };
  }
  return { ok: true as const, submission: sub };
}

router.get(
  '/by-submission/:submissionId',
  authenticate,
  authorize('ADMIN', 'RECRUITER', 'LEAD'),
  asyncHandler(async (req: Request, res: Response) => {
    const submissionId = String(req.params.submissionId || '').trim();
    if (!submissionId) {
      return ResponseHelper.error(res, 'submissionId is required', 400);
    }

    const gate = await assertOfferEligible(submissionId);
    if (!gate.ok) {
      return ResponseHelper.error(res, gate.message, gate.status);
    }

    const row = await prisma.offerLetter.findUnique({
      where: { submissionId },
      include: {
        releasedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    return ResponseHelper.success(res, 'OK', {
      offerLetter: row ? mapOfferLetter(row) : null,
    });
  }),
);

router.put(
  '/by-submission/:submissionId',
  authenticate,
  authorize('ADMIN', 'RECRUITER', 'LEAD'),
  asyncHandler(async (req: Request, res: Response) => {
    const submissionId = String(req.params.submissionId || '').trim();
    if (!submissionId) {
      return ResponseHelper.error(res, 'submissionId is required', 400);
    }

    const gate = await assertOfferEligible(submissionId);
    if (!gate.ok) {
      return ResponseHelper.error(res, gate.message, gate.status);
    }

    const body = req.body ?? {};
    const actorId = (req as any).user?.id as string | undefined;
    const existing = await prisma.offerLetter.findUnique({ where: { submissionId } });
    if (existing && isOfferLetterLocked(existing.status)) {
      return ResponseHelper.error(
        res,
        'This offer letter has already been released. Create a support ticket to amend it.',
        400,
      );
    }

    function pickStr(key: string, prev: string | null): string | null {
      if (!Object.prototype.hasOwnProperty.call(body, key)) return prev;
      const v = body[key];
      if (v === undefined || v === null) return null;
      const s = String(v).trim();
      return s === '' ? null : s;
    }

    const positionTitle = pickStr('positionTitle', existing?.positionTitle ?? null);
    const compensation = pickStr('compensation', existing?.compensation ?? null);
    const terms = pickStr('terms', existing?.terms ?? null);
    const letterContent = pickStr('letterContent', existing?.letterContent ?? null);

    let joiningDate: Date | null = existing?.joiningDate ?? null;
    if (Object.prototype.hasOwnProperty.call(body, 'joiningDate')) {
      const raw = body.joiningDate;
      joiningDate = raw ? new Date(String(raw)) : null;
      if (joiningDate && Number.isNaN(joiningDate.getTime())) joiningDate = null;
    }

    let validUntil: Date | null = existing?.validUntil ?? null;
    if (Object.prototype.hasOwnProperty.call(body, 'validUntil')) {
      const raw = body.validUntil;
      validUntil = raw ? new Date(String(raw)) : null;
      if (validUntil && Number.isNaN(validUntil.getTime())) validUntil = null;
    }

    const saved = await prisma.offerLetter.upsert({
      where: { submissionId },
      create: {
        submissionId,
        status: 'DRAFT',
        positionTitle,
        compensation,
        joiningDate,
        validUntil,
        terms,
        letterContent,
      },
      update: {
        positionTitle,
        compensation,
        joiningDate,
        validUntil,
        terms,
        letterContent,
      },
      include: {
        releasedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    await upsertOfferManagementFromLegacy(prisma, saved);

    try {
      const subCtx = await prisma.submission.findUnique({
        where: { id: submissionId },
        select: {
          requirementId: true,
          candidateId: true,
          candidate: { select: { name: true } },
          requirement: { select: { requirementId: true } },
        },
      });
      if (subCtx) {
        await logRequirementActivity(prisma, {
          requirementId: subCtx.requirementId,
          actorId: actorId ?? null,
          action: existing ? 'offer.updated' : 'offer.draft_created',
          summary: `${existing ? 'Offer draft updated' : 'Offer draft created'} for ${subCtx.candidate.name}`,
          metadata: {
            submissionId,
            candidateId: subCtx.candidateId,
            candidateName: subCtx.candidate.name,
            requirementCode: subCtx.requirement.requirementId,
            offerStatus: saved.status,
            fields: {
              positionTitle: saved.positionTitle,
              compensation: saved.compensation,
              joiningDate: toIso(saved.joiningDate),
              validUntil: toIso(saved.validUntil),
            },
          } as Prisma.InputJsonValue,
        });
      }
    } catch (e: unknown) {
      console.warn('[offer-letters] Could not log draft activity:', e);
    }

    return ResponseHelper.success(res, 'Offer letter saved', { offerLetter: mapOfferLetter(saved) });
  }),
);

router.post(
  '/by-submission/:submissionId/release',
  authenticate,
  authorize('ADMIN', 'RECRUITER', 'LEAD'),
  asyncHandler(async (req: Request, res: Response) => {
    const submissionId = String(req.params.submissionId || '').trim();
    if (!submissionId) {
      return ResponseHelper.error(res, 'submissionId is required', 400);
    }

    const gate = await assertOfferEligible(submissionId);
    if (!gate.ok) {
      return ResponseHelper.error(res, gate.message, gate.status);
    }

    const user = (req as any).user as { id?: string; role?: string } | undefined;
    const releasedById = user?.id;
    if (!releasedById) {
      return ResponseHelper.error(res, 'Authenticated user required', 401);
    }

    try {
      await assertCanActOnSubmission(prisma, submissionId, {
        id: releasedById,
        role: user?.role,
      });
    } catch (e: unknown) {
      if (e instanceof SubmissionAccessError) {
        return ResponseHelper.error(res, e.message, e.statusCode);
      }
      throw e;
    }

    const body = req.body ?? {};
    const existing = await prisma.offerLetter.findUnique({ where: { submissionId } });
    if (existing && isOfferLetterLocked(existing.status)) {
      return ResponseHelper.error(res, 'Offer letter is already released.', 400);
    }

    function pickStrRel(key: string, prev: string | null): string | null {
      if (!Object.prototype.hasOwnProperty.call(body, key)) return prev;
      const v = body[key];
      if (v === undefined || v === null) return null;
      const s = String(v).trim();
      return s === '' ? null : s;
    }

    const merged = {
      positionTitle: pickStrRel('positionTitle', existing?.positionTitle ?? null),
      compensation: pickStrRel('compensation', existing?.compensation ?? null),
      terms: pickStrRel('terms', existing?.terms ?? null),
      letterContent: pickStrRel('letterContent', existing?.letterContent ?? null),
      joiningDate: existing?.joiningDate ?? null,
      validUntil: existing?.validUntil ?? null,
    };

    if (Object.prototype.hasOwnProperty.call(body, 'joiningDate') && body.joiningDate) {
      const d = new Date(String(body.joiningDate));
      if (!Number.isNaN(d.getTime())) merged.joiningDate = d;
    } else if (Object.prototype.hasOwnProperty.call(body, 'joiningDate') && !body.joiningDate) {
      merged.joiningDate = null;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'validUntil') && body.validUntil) {
      const d = new Date(String(body.validUntil));
      if (!Number.isNaN(d.getTime())) merged.validUntil = d;
    } else if (Object.prototype.hasOwnProperty.call(body, 'validUntil') && !body.validUntil) {
      merged.validUntil = null;
    }

    const hasContent =
      !!(merged.compensation?.trim() || merged.letterContent?.trim() || merged.positionTitle?.trim());
    if (!hasContent) {
      return ResponseHelper.error(
        res,
        'Add at least a position title, compensation, or letter content before releasing.',
        400,
      );
    }

    const saved = await prisma.offerLetter.upsert({
      where: { submissionId },
      create: {
        submissionId,
        status: 'RELEASED',
        ...merged,
        releasedAt: new Date(),
        releasedById,
      },
      update: {
        ...merged,
        status: 'RELEASED',
        releasedAt: new Date(),
        releasedById,
      },
      include: {
        releasedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    const subCtx = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        candidate: { select: { email: true, name: true } },
        requirement: {
          include: {
            client: { select: { name: true } },
          },
        },
      },
    });

    let emailSent = false;
    let emailError: string | null = null;
    const candidateRow = subCtx?.candidate;
    const candidateEmail = candidateRow?.email?.trim();
    const clientName = subCtx?.requirement?.client?.name ?? null;
    const roleTitle = subCtx?.requirement?.roleTitle ?? null;

    if (!candidateEmail) {
      emailError = 'Candidate has no email on file.';
      console.warn('[offer-letters] release: missing candidate email', submissionId);
    } else if (!candidateRow) {
      emailError = 'Could not load candidate record for email.';
    } else {
      try {
        const releasedByName = saved.releasedBy
          ? `${saved.releasedBy.firstName} ${saved.releasedBy.lastName}`.trim()
          : null;
        await MailService.sendOfferLetterReleasedEmail(
          candidateEmail,
          candidateRow.name,
          {
            positionTitle: merged.positionTitle,
            compensation: merged.compensation,
            joiningDate: merged.joiningDate,
            validUntil: merged.validUntil,
            terms: merged.terms,
            letterContent: merged.letterContent,
            clientName,
            roleTitle,
            releasedByName,
          },
          {
            type: 'OFFER_RELEASED',
            requirementId: subCtx.requirement.id,
            submissionId,
          },
        );
        emailSent = true;
      } catch (e) {
        emailError = e instanceof Error ? e.message : String(e);
        console.error('[offer-letters] release: email send failed', e);
      }
    }

    const successMessage = emailSent
      ? 'Offer letter released and emailed to the candidate.'
      : 'Offer letter released, but the email could not be sent. Check mail configuration (SMTP or Microsoft Graph) and the candidate email.';

    await upsertOfferManagementFromLegacy(prisma, saved);

    try {
      if (subCtx) {
        await logRequirementActivity(prisma, {
          requirementId: subCtx.requirement.id,
          actorId: releasedById,
          action: 'offer.released',
          summary: `Offer released for ${subCtx.candidate.name}`,
          metadata: {
            submissionId,
            candidateName: subCtx.candidate.name,
            candidateEmail,
            requirementCode: subCtx.requirement.requirementId,
            roleTitle,
            emailSent,
            emailError,
            releasedAt: toIso(saved.releasedAt),
          } as Prisma.InputJsonValue,
        });
      }
    } catch (e: unknown) {
      console.warn('[offer-letters] Could not log release activity:', e);
    }

    return ResponseHelper.success(res, successMessage, {
      offerLetter: mapOfferLetter(saved),
      emailSent,
      ...(emailError ? { emailError } : {}),
    });
  }),
);

router.post(
  '/batch-by-submissions',
  authenticate,
  authorize('ADMIN', 'RECRUITER', 'LEAD'),
  asyncHandler(async (req: Request, res: Response) => {
    const raw = (req.body ?? {}).submissionIds;
    const ids = Array.isArray(raw) ? raw : [];
    const uniqueIds = [...new Set(ids.map((id: unknown) => String(id ?? '').trim()).filter(Boolean))].slice(
      0,
      200,
    );

    if (uniqueIds.length === 0) {
      return ResponseHelper.success(res, 'OK', { offers: {} });
    }

    const rows = await prisma.offerLetter.findMany({
      where: { submissionId: { in: uniqueIds } },
      include: {
        releasedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    const offers: Record<string, ReturnType<typeof mapOfferLetter>> = {};
    for (const row of rows) {
      offers[row.submissionId] = mapOfferLetter(row);
    }

    return ResponseHelper.success(res, 'OK', { offers });
  }),
);

router.post(
  '/by-submission/:submissionId/record-response',
  authenticate,
  authorize('ADMIN', 'RECRUITER', 'LEAD'),
  asyncHandler(async (req: Request, res: Response) => {
    const submissionId = String(req.params.submissionId || '').trim();
    if (!submissionId) {
      return ResponseHelper.error(res, 'submissionId is required', 400);
    }

    const gate = await assertOfferEligible(submissionId);
    if (!gate.ok) {
      return ResponseHelper.error(res, gate.message, gate.status);
    }

    const existing = await prisma.offerLetter.findUnique({
      where: { submissionId },
      include: {
        releasedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    if (!existing || existing.status !== 'RELEASED') {
      return ResponseHelper.error(
        res,
        'Record the candidate response only when the offer is released and not yet accepted or declined.',
        400,
      );
    }

    const actorId = (req as any).user?.id as string | undefined;
    const actorRole = (req as any).user?.role as string | undefined;
    try {
      await assertCanActOnSubmission(prisma, submissionId, {
        id: actorId ?? '',
        role: actorRole,
      });
    } catch (e: unknown) {
      if (e instanceof SubmissionAccessError) {
        return ResponseHelper.error(res, e.message, e.statusCode);
      }
      throw e;
    }

    const decision = String((req.body ?? {}).decision ?? '')
      .trim()
      .toLowerCase();

    const submissionCtx = await prisma.submission.findUnique({
      where: { id: submissionId },
      select: {
        requirementId: true,
        candidateId: true,
        candidate: { select: { name: true } },
        requirement: { select: { requirementId: true } },
      },
    });

    if (decision === 'accept') {
      const raw = (req.body ?? {}).acceptedJoiningDate;
      if (raw === undefined || raw === null || String(raw).trim() === '') {
        return ResponseHelper.error(res, 'acceptedJoiningDate is required when accepting', 400);
      }
      const d = new Date(String(raw));
      if (Number.isNaN(d.getTime())) {
        return ResponseHelper.error(res, 'Invalid acceptedJoiningDate', 400);
      }
      const saved = await prisma.offerLetter.update({
        where: { submissionId },
        data: {
          status: 'ACCEPTED',
          acceptedJoiningDate: d,
          declineReason: null,
        },
        include: {
          releasedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });
      await upsertOfferManagementFromLegacy(prisma, saved);
      try {
        if (submissionCtx) {
          await logRequirementActivity(prisma, {
            requirementId: submissionCtx.requirementId,
            actorId: actorId ?? null,
            action: 'offer.response.interested',
            summary: `Candidate ${submissionCtx.candidate.name} marked Interested`,
            metadata: {
              submissionId,
              candidateId: submissionCtx.candidateId,
              candidateName: submissionCtx.candidate.name,
              requirementCode: submissionCtx.requirement.requirementId,
              acceptedJoiningDate: d.toISOString(),
            } as Prisma.InputJsonValue,
          });
        }
      } catch (e: unknown) {
        console.warn('[offer-letters] Could not log interested response:', e);
      }
      return ResponseHelper.success(res, 'Offer accepted', { offerLetter: mapOfferLetter(saved) });
    }

    if (decision === 'decline') {
      const declineReason = String((req.body ?? {}).declineReason ?? '').trim();
      if (!declineReason) {
        return ResponseHelper.error(res, 'declineReason is required when declining', 400);
      }
      if (declineReason.length > 8000) {
        return ResponseHelper.error(res, 'declineReason is too long', 400);
      }
      const saved = await prisma.offerLetter.update({
        where: { submissionId },
        data: {
          status: 'DECLINED',
          declineReason,
          acceptedJoiningDate: null,
        },
        include: {
          releasedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });
      await upsertOfferManagementFromLegacy(prisma, saved);
      try {
        if (submissionCtx) {
          await logRequirementActivity(prisma, {
            requirementId: submissionCtx.requirementId,
            actorId: actorId ?? null,
            action: 'offer.response.not_interested',
            summary: `Candidate ${submissionCtx.candidate.name} marked Not Interested`,
            metadata: {
              submissionId,
              candidateId: submissionCtx.candidateId,
              candidateName: submissionCtx.candidate.name,
              requirementCode: submissionCtx.requirement.requirementId,
              declineReason,
            } as Prisma.InputJsonValue,
          });
        }
      } catch (e: unknown) {
        console.warn('[offer-letters] Could not log not-interested response:', e);
      }
      return ResponseHelper.success(res, 'Offer declined', { offerLetter: mapOfferLetter(saved) });
    }

    return ResponseHelper.error(res, 'decision must be "accept" or "decline"', 400);
  }),
);

export default router;
