import type { PrismaClient } from '@prisma/client';

export class SubmissionAccessError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

type AuthUser = { id: string; role?: string } | undefined;

export function isElevatedRecruiterRole(role: string | undefined): boolean {
  const r = String(role ?? '').toUpperCase();
  return r === 'ADMIN' || r === 'LEAD';
}

/** Recruiters may only mutate submissions they created; admins/leads may act on any. */
export async function assertCanActOnSubmission(
  prisma: PrismaClient,
  submissionId: string,
  user: AuthUser,
): Promise<void> {
  if (!user?.id) throw new SubmissionAccessError('Unauthorized', 401);

  const sub = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: { submittedBy: true },
  });
  if (!sub) throw new SubmissionAccessError('Submission not found', 404);

  if (isElevatedRecruiterRole(user.role)) return;

  if (sub.submittedBy !== user.id) {
    throw new SubmissionAccessError(
      'Only the recruiter who submitted this candidate can perform this action',
      403,
    );
  }
}
