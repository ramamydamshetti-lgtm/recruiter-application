import type { Interview, InterviewRoundType, Prisma, PrismaClient } from '@prisma/client';
import { Prisma as PrismaNs } from '@prisma/client';

export function roundLabelToType(round: string): InterviewRoundType {
  const u = (round || '').toUpperCase();
  if (u.includes('FINAL') || u.includes('L3')) return 'FINAL';
  if (u.includes('L2')) return 'L2';
  return 'L1';
}

type Extras = {
  timezone?: string | null;
  interviewerName?: string | null;
  interviewerEmail?: string | null;
};

export async function upsertInterviewRoundFromLegacy(
  prisma: PrismaClient | Prisma.TransactionClient,
  interview: Interview,
  extras?: Extras,
): Promise<void> {
  try {
    await prisma.interviewRound.upsert({
      where: { legacyInterviewId: interview.id },
      create: {
        submissionId: interview.submissionId,
        legacyInterviewId: interview.id,
        roundType: roundLabelToType(interview.round),
        timezone: extras?.timezone ?? null,
        interviewerName: extras?.interviewerName ?? null,
        interviewerEmail: extras?.interviewerEmail ?? null,
        mode: interview.mode,
        status: interview.status,
        scheduledAt: interview.scheduledAt,
        location: interview.location,
        meetingLink: interview.meetingLink,
        notes: interview.notes,
        feedback: interview.feedback,
        rating: interview.rating,
        finalDecision: interview.finalDecision,
      },
      update: {
        roundType: roundLabelToType(interview.round),
        ...(extras?.timezone !== undefined ? { timezone: extras.timezone } : {}),
        ...(extras?.interviewerName !== undefined ? { interviewerName: extras.interviewerName } : {}),
        ...(extras?.interviewerEmail !== undefined ? { interviewerEmail: extras.interviewerEmail } : {}),
        mode: interview.mode,
        status: interview.status,
        scheduledAt: interview.scheduledAt,
        location: interview.location,
        meetingLink: interview.meetingLink,
        notes: interview.notes,
        feedback: interview.feedback,
        rating: interview.rating,
        finalDecision: interview.finalDecision,
      },
    });
  } catch (e: unknown) {
    if (e instanceof PrismaNs.PrismaClientKnownRequestError && e.code === 'P2021') {
      console.warn('[interviewRoundsSync] interview_rounds table missing; run prisma migrate.');
      return;
    }
    throw e;
  }
}

export async function deleteInterviewRoundByLegacyId(
  prisma: PrismaClient | Prisma.TransactionClient,
  legacyInterviewId: string,
): Promise<void> {
  try {
    await prisma.interviewRound.deleteMany({ where: { legacyInterviewId } });
  } catch (e: unknown) {
    if (e instanceof PrismaNs.PrismaClientKnownRequestError && e.code === 'P2021') {
      return;
    }
    throw e;
  }
}
