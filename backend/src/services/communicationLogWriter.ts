
import { prisma } from '@/lib/prisma';

export type MailLogPayload = {
  type: string;
  requirementId?: string;
  submissionId?: string;
  /** Optional HTML body snippet for expandable row */
  bodySnippet?: string;
};

export async function recordOutboundCommunication(input: MailLogPayload & { subject?: string; recipient: string; status: 'SENT' | 'FAILED' | 'QUEUED'; providerMessageId?: string | null }): Promise<void> {
  if (process.env.MAIL_LOG_ENABLED !== 'true' && process.env.MAIL_LOG_ENABLED !== '1') {
    return;
  }

  try {
    await prisma.communicationLog.create({
      data: {
        type: input.type,
        recipient: input.recipient,
        subject: input.subject ?? null,
        status: input.status,
        providerMessageId: input.providerMessageId ?? null,
        requirementId: input.requirementId ?? null,
        submissionId: input.submissionId ?? null,
        body: input.bodySnippet ?? null,
      },
    });
  } catch (e: unknown) {
    console.warn('[communicationLog] skipped:', e instanceof Error ? e.message : e);
  }
}
