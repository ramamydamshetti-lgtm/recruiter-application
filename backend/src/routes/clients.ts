import { Router, Request, Response } from 'express';
import { asyncHandler } from '@/middleware/errorHandler';
import { authenticate, authorize } from '@/middleware/auth';
import { ResponseHelper } from '@/utils/response';

import { prisma } from '@/lib/prisma';
const router = Router();

function mapClient(c: {
  id: string;
  clientCode?: string | null;
  name: string;
  pocName: string;
  pocEmail: string;
  pocPhone: string | null;
  industry: string | null;
  location: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: c.id,
    clientCode: c.clientCode ?? null,
    name: c.name,
    pocName: c.pocName,
    pocEmail: c.pocEmail,
    pocPhone: c.pocPhone,
    industry: c.industry,
    location: c.location,
    isActive: c.isActive,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

async function generateUniqueClientCode(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `CL-${year}-`;
  const existing = await prisma.client.findMany({
    where: { clientCode: { startsWith: prefix } },
    select: { clientCode: true },
    take: 2000,
  });
  const taken = new Set(
    existing
      .map((c) => {
        const code = (c.clientCode ?? '').trim();
        const last = code.split('-').pop() ?? '';
        const n = parseInt(last, 10);
        return Number.isFinite(n) ? n : null;
      })
      .filter((x): x is number => x != null),
  );
  for (let i = 1; i <= 9999; i += 1) {
    if (!taken.has(i)) return `${prefix}${String(i).padStart(3, '0')}`;
  }
  throw new Error('Could not generate unique client code');
}

router.get(
  '/',
  authenticate,
  authorize('ADMIN', 'RECRUITER', 'LEAD'),
  asyncHandler(async (req: Request, res: Response) => {
    const q = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const where: any = {};
    if (q) {
      where.OR = [
        { clientCode: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
        { pocName: { contains: q, mode: 'insensitive' } },
        { pocEmail: { contains: q, mode: 'insensitive' } },
        { industry: { contains: q, mode: 'insensitive' } },
        { location: { contains: q, mode: 'insensitive' } },
      ];
    }

    const clients = await prisma.client.findMany({
      where,
      orderBy: { name: 'asc' },
      take: 500,
    });

    return ResponseHelper.success(res, 'Clients retrieved successfully', {
      clients: clients.map(mapClient),
    });
  }),
);

router.get(
  '/:id',
  authenticate,
  authorize('ADMIN', 'RECRUITER', 'LEAD'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            requirements: true,
            submissions: true,
          },
        },
      },
    });

    if (!client) {
      return ResponseHelper.error(res, 'Client not found', 404);
    }

    const selectedSubmissions = await prisma.submission.count({
      where: {
        requirement: { clientId: id },
        status: 'SELECTED',
      },
    });

    return ResponseHelper.success(res, 'Client retrieved successfully', {
      client: mapClient(client),
      counts: {
        requirements: client._count.requirements,
        submissions: client._count.submissions,
        selectedSubmissions,
      },
    });
  }),
);

router.post(
  '/',
  authenticate,
  authorize('ADMIN', 'RECRUITER', 'LEAD'),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const pocName = typeof body.pocName === 'string' ? body.pocName.trim() : '';
    const pocEmail = typeof body.pocEmail === 'string' ? body.pocEmail.trim() : '';
    if (!name || !pocName || !pocEmail) {
      return ResponseHelper.error(res, 'name, pocName, and pocEmail are required', 400);
    }

    const pocPhone =
      typeof body.pocPhone === 'string' && body.pocPhone.trim() ? body.pocPhone.trim() : null;
    const industry =
      typeof body.industry === 'string' && body.industry.trim() ? body.industry.trim() : null;
    const location =
      typeof body.location === 'string' && body.location.trim() ? body.location.trim() : null;

    const created = await prisma.client.create({
      data: {
        clientCode: await generateUniqueClientCode(),
        name,
        pocName,
        pocEmail,
        pocPhone,
        industry,
        location,
      },
    });

    return ResponseHelper.created(res, 'Client created successfully', {
      client: mapClient(created),
    });
  }),
);

router.patch(
  '/:id',
  authenticate,
  authorize('ADMIN', 'RECRUITER', 'LEAD'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const body = req.body ?? {};

    const existing = await prisma.client.findUnique({ where: { id } });
    if (!existing) {
      return ResponseHelper.error(res, 'Client not found', 404);
    }

    const data: any = {};
    if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim();
    if (typeof body.pocName === 'string' && body.pocName.trim()) data.pocName = body.pocName.trim();
    if (typeof body.pocEmail === 'string' && body.pocEmail.trim()) data.pocEmail = body.pocEmail.trim();
    if (body.pocPhone !== undefined) {
      data.pocPhone =
        typeof body.pocPhone === 'string' && body.pocPhone.trim() ? body.pocPhone.trim() : null;
    }
    if (body.industry !== undefined) {
      data.industry =
        typeof body.industry === 'string' && body.industry.trim() ? body.industry.trim() : null;
    }
    if (body.location !== undefined) {
      data.location =
        typeof body.location === 'string' && body.location.trim() ? body.location.trim() : null;
    }
    if (typeof body.isActive === 'boolean') data.isActive = body.isActive;

    if (Object.keys(data).length === 0) {
      return ResponseHelper.error(res, 'No valid fields to update', 400);
    }

    const updated = await prisma.client.update({
      where: { id },
      data,
    });

    return ResponseHelper.success(res, 'Client updated successfully', {
      client: mapClient(updated),
    });
  }),
);

export default router;
