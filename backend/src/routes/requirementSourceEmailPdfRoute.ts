import fs from 'fs';
import { Router, Request, Response } from 'express';
import { ResponseHelper } from '@/utils/response';
import { asyncHandler } from '@/middleware/errorHandler';
import { authenticate } from '@/middleware/auth';
import { resolveRequirementEmailPayload } from '@/lib/resolveRequirementEmailPayload';
import {
  getRequirementSourcePdfAbsolutePath,
  writeRequirementSourceEmailPdf,
} from '@/services/requirementSourceEmailPdf';

const router = Router();
import { prisma } from '@/lib/prisma';

async function findRequirementByRouteId(routeId: string) {
  return prisma.requirement.findFirst({
    where: {
      OR: [{ id: routeId }, { requirementId: routeId }],
    },
    select: { id: true, requirementId: true, createdAt: true },
  });
}

/**
 * Mounted first at /api/requirements so this path always resolves (avoids 404 from stale or heavy routers).
 * GET /api/requirements/:id/source-email-pdf
 */
router.get('/:id/source-email-pdf', authenticate, asyncHandler(async (req: Request, res: Response) => {
  try {
    const routeId = req.params.id;
    if (!routeId) return ResponseHelper.error(res, 'Requirement id is required', 400);

    const row = await findRequirementByRouteId(routeId);
    if (!row) {
      return ResponseHelper.error(res, 'Requirement not found', 404);
    }

    const pdfPath = getRequirementSourcePdfAbsolutePath(row.id);
    const payload =
      (await resolveRequirementEmailPayload(prisma, {
        id: row.id,
        requirementId: row.requirementId,
      })) || null;

    // Regenerate when payload exists so template changes are reflected for old files too.
    if (payload) {
      await writeRequirementSourceEmailPdf({
        requirementPk: row.id,
        requirementCode: row.requirementId,
        receivedAt: row.createdAt,
        payload,
      });
    } else if (!fs.existsSync(pdfPath)) {
      return ResponseHelper.error(
        res,
        'No stored source email is available for this requirement. It may have been created manually (not from email ingest), or email ingestion events were not persisted when it was created.',
        404,
      );
    }

    const safeName = String(row.requirementId || row.id).replace(/[^\w.-]+/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="source-email-${safeName}.pdf"`);
    fs.createReadStream(pdfPath).pipe(res);
  } catch (error: any) {
    ResponseHelper.error(res, `Error: ${error?.message || 'Unknown error'}`, 500);
  }
}));

export default router;
