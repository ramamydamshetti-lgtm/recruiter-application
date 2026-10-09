import type { PrismaClient, SubmissionStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { logRequirementActivity } from '@/services/requirementActivityLog';

export function parseSubmissionStatusBody(raw: unknown): SubmissionStatus | null {
  const s = String(raw ?? '').trim();
  const u = s.toUpperCase();
  if (u === 'SUBMITTED_TO_LEAD' || s === 'Submitted to Lead') return 'SUBMITTED_TO_LEAD';
  if (u === 'SUBMITTED_TO_CLIENT' || s === 'Submitted to Client') return 'SUBMITTED_TO_CLIENT';
  if (u === 'SUBMITTED' || s === 'Submitted') return 'SUBMITTED_TO_CLIENT';
  if (u === 'INTERVIEW' || s === 'Interview') return 'INTERVIEW';
  if (u === 'SELECTED' || s === 'Selected') return 'SELECTED';
  if (u === 'REJECTED' || s === 'Rejected') return 'REJECTED';
  if (u === 'INTERVIEWING') return 'INTERVIEW';
  return null;
}

export async function applySubmissionStatusChange(
  prisma: PrismaClient,
  input: {
    submissionId: string;
    newStatus: SubmissionStatus;
    actorId: string | null;
    rejectionReason?: string | null;
    /** Free-form notes stored in metadata + appended to activity summary */
    comments?: string | null;
  },
) {
  const { submissionId, newStatus, actorId, rejectionReason, comments } = input;

  const txResult = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const existing = await tx.submission.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        requirementId: true,
        status: true,
        rejectionReason: true,
        candidate: { select: { name: true } },
      },
    });
    if (!existing) {
      throw Object.assign(new Error('Submission not found'), { statusCode: 404 });
    }

    if (newStatus === 'REJECTED') {
      const rr = (rejectionReason ?? '').trim();
      if (!rr) {
        throw Object.assign(new Error('rejectionReason is required when rejecting'), { statusCode: 400 });
      }
    }

    const oldStatus = existing.status;
    const candName = existing.candidate?.name ?? 'candidate';

    await tx.submission.update({
      where: { id: submissionId },
      data: {
        status: newStatus,
        ...(newStatus === 'REJECTED'
          ? { rejectionReason: (rejectionReason ?? '').trim() }
          : {}),
        ...(oldStatus === 'REJECTED' && newStatus !== 'REJECTED'
          ? { rejectionReason: '—' }
          : {}),
      },
      select: { id: true, requirementId: true, status: true },
    });

    return {
      requirementId: existing.requirementId,
      oldStatus,
      candName,
    };
  });

  // Best-effort audit trail writes outside the main transaction.
  // Any audit-table issue must not fail status updates from the UI.
  try {
    await prisma.candidateStatusHistory.create({
      data: {
        submissionId,
        oldStatus: txResult.oldStatus,
        newStatus,
        changedById: actorId,
        reason: rejectionReason?.trim() || null,
        metadata:
          comments?.trim()
            ? ({ comments: comments.trim() } as Prisma.InputJsonValue)
            : Prisma.JsonNull,
      },
    });
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2021') {
      console.warn('[submissionStatus] candidate_status_history missing; run prisma migrate.');
    } else {
      console.warn('[submissionStatus] Could not write candidate status history:', e);
    }
  }

  try {
    await logRequirementActivity(prisma, {
      requirementId: txResult.requirementId,
      actorId,
      action: 'submission.status_changed',
      summary: `Submission for ${txResult.candName}: ${txResult.oldStatus} → ${newStatus}${
        comments?.trim() ? ` (${comments.trim()})` : ''
      }`,
      metadata: {
        submissionId,
        oldStatus: txResult.oldStatus,
        newStatus,
        rejectionReason: rejectionReason ?? null,
      } as Prisma.InputJsonValue,
    });
  } catch (e: unknown) {
    console.warn('[submissionStatus] Could not write requirement activity log:', e);
  }
}
