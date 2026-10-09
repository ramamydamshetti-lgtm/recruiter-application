import { Prisma } from '@prisma/client';

type RequirementActivityWriter = Pick<Prisma.TransactionClient, 'requirementActivity'>;

export async function logRequirementActivity(
  tx: RequirementActivityWriter,
  input: {
    requirementId: string;
    actorId?: string | null;
    action: string;
    summary: string;
    metadata?: Prisma.InputJsonValue;
  },
): Promise<void> {
  try {
    await tx.requirementActivity.create({
      data: {
        requirementId: input.requirementId,
        actorId: input.actorId ?? null,
        action: input.action,
        summary: input.summary,
        metadata: input.metadata,
      },
    });
  } catch (e: unknown) {
    // P2021: table missing (DB not migrated / db push). Do not fail the main transaction.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2021') {
      console.warn(
        '[requirementActivityLog] requirement_activities table missing; run: npx prisma db push (or apply migrations)',
      );
      return;
    }
    const msg = e instanceof Error ? e.message : String(e);
    // Postgres 25P02: transaction already aborted. Logging is non-critical;
    // avoid cascading failures for business actions (select/reject/etc).
    if (msg.includes('25P02') || msg.includes('current transaction is aborted')) {
      console.warn('[requirementActivityLog] transaction aborted; skipping activity insert.');
      return;
    }
    if (msg.includes('does not exist') && msg.includes('requirement_activities')) {
      console.warn('[requirementActivityLog] requirement_activities missing; skipping activity row.');
      return;
    }
    throw e;
  }
}
