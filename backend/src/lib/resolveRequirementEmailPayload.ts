import type { PrismaClient } from '@prisma/client';
import { tryFetchGraphMessagePayload } from '@/lib/graphEmailPayloadForPdf';

function isNonEmptyPayload(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length > 0;
}

/**
 * Find stored email JSON for PDF / archive when `requirementPk` on the event row
 * is missing or was never written (dedupe short-circuit, older runs, etc.).
 */
export async function resolveRequirementEmailPayload(
  prisma: PrismaClient,
  row: { id: string; requirementId: string },
): Promise<Record<string, unknown> | null> {
  const prismaAny = prisma as any;

  try {
    const linked = await prismaAny.emailIngestionEvent.findMany({
      where: {
        OR: [{ requirementPk: row.id }, { requirementCode: row.requirementId }],
      },
      orderBy: { createdAt: 'asc' },
      select: { payload: true, graphMessageId: true },
    });
    for (const r of linked) {
      if (isNonEmptyPayload(r.payload)) return r.payload as Record<string, unknown>;
      const gid = r.graphMessageId != null ? String(r.graphMessageId).trim() : '';
      if (gid) {
        const fromGraph = await tryFetchGraphMessagePayload(gid);
        if (isNonEmptyPayload(fromGraph)) return fromGraph;
      }
    }

    const acts = await prisma.requirementActivity.findMany({
      where: { requirementId: row.id, action: 'CREATED' },
      orderBy: { createdAt: 'asc' },
      take: 15,
      select: { metadata: true },
    });

    for (const a of acts) {
      const meta = a.metadata as Record<string, unknown> | null | undefined;
      const gid = meta?.graphMessageId != null ? String(meta.graphMessageId).trim() : '';
      if (gid) {
        const ev = await prismaAny.emailIngestionEvent.findFirst({
          where: { graphMessageId: gid },
          orderBy: { createdAt: 'desc' },
          select: { payload: true },
        });
        if (isNonEmptyPayload(ev?.payload)) return ev.payload as Record<string, unknown>;
        const fromGraph = await tryFetchGraphMessagePayload(gid);
        if (isNonEmptyPayload(fromGraph)) return fromGraph;
      }
      const iid = meta?.internetMessageId != null ? String(meta.internetMessageId).trim() : '';
      if (iid) {
        const ev2 = await prismaAny.emailIngestionEvent.findFirst({
          where: { internetMessageId: iid },
          orderBy: { createdAt: 'desc' },
          select: { payload: true },
        });
        if (isNonEmptyPayload(ev2?.payload)) return ev2.payload as Record<string, unknown>;
      }
    }
  } catch {
    return null;
  }

  return null;
}
