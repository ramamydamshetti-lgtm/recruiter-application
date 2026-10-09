/**
 * Write missing "original email" PDFs from stored ingestion payloads or Microsoft Graph.
 *
 * Env:
 *   BACKFILL_PDF_ONLY_MISSING=1 (default) — skip rows that already have a PDF file
 *   BACKFILL_PDF_ALL=1 — include all requirements (not only Email Automation creator)
 *   BACKFILL_PDF_LIMIT=N — max requirements to scan (newest first)
 */
import 'dotenv/config';
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { resolveRequirementEmailPayload } from '../src/lib/resolveRequirementEmailPayload';
import {
  getRequirementSourcePdfAbsolutePath,
  writeRequirementSourceEmailPdf,
} from '../src/services/requirementSourceEmailPdf';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const actor = (process.env.INTERNAL_AUTOMATION_ACTOR_NAME || 'Email Automation').trim();
  const onlyMissing = process.env.BACKFILL_PDF_ONLY_MISSING !== '0';
  const allCreators = process.env.BACKFILL_PDF_ALL === '1';
  const limitRaw = parseInt(process.env.BACKFILL_PDF_LIMIT || '0', 10);
  const take = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined;

  const where: { isDeleted: boolean; requirementCreatorName?: { equals: string; mode: 'insensitive' } } = {
    isDeleted: false,
  };
  if (!allCreators) {
    where.requirementCreatorName = { equals: actor, mode: 'insensitive' };
  }

  const rows = await prisma.requirement.findMany({
    where,
    select: { id: true, requirementId: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take,
  });

  let written = 0;
  let skippedExisting = 0;
  let noPayload = 0;
  let failed = 0;

  for (const r of rows) {
    const pdfPath = getRequirementSourcePdfAbsolutePath(r.id);
    if (onlyMissing && fs.existsSync(pdfPath)) {
      skippedExisting += 1;
      continue;
    }
    const payload = await resolveRequirementEmailPayload(prisma, r);
    if (!payload) {
      noPayload += 1;
      console.warn(JSON.stringify({ requirementId: r.requirementId, note: 'no_resolvable_payload' }));
      continue;
    }
    try {
      await writeRequirementSourceEmailPdf({
        requirementPk: r.id,
        requirementCode: r.requirementId,
        receivedAt: r.createdAt,
        payload,
      });
      written += 1;
    } catch (e) {
      failed += 1;
      console.error(JSON.stringify({ requirementId: r.requirementId, error: String(e) }));
    }
  }

  console.log(
    JSON.stringify({
      scanned: rows.length,
      written,
      skippedExisting,
      noResolvablePayload: noPayload,
      failed,
    }),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
