import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function datePartUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function run(): Promise<void> {
  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const dayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
  const datePart = datePartUTC(now);

  const rows = await prisma.requirement.findMany({
    where: {
      isDeleted: false,
      requirementCreatorName: { equals: 'Email Automation', mode: 'insensitive' },
      createdAt: { gte: dayStart, lt: dayEnd },
    },
    select: { id: true, requirementId: true, createdAt: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  if (!rows.length) {
    console.log(JSON.stringify({ total: 0, updated: 0, mapping: [] }));
    return;
  }

  // Phase 1: temporary IDs to avoid unique collisions.
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    await prisma.requirement.update({
      where: { id: r.id },
      data: { requirementId: `TMP-${datePart}-${String(i + 1).padStart(3, '0')}` },
    });
  }

  // Phase 2: final sequential IDs.
  const mapping: Array<{ id: string; from: string; to: string }> = [];
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const nextId = `REQ-${datePart}-${String(i + 1).padStart(3, '0')}`;
    await prisma.requirement.update({
      where: { id: r.id },
      data: { requirementId: nextId },
    });
    mapping.push({ id: r.id, from: r.requirementId, to: nextId });
  }

  console.log(
    JSON.stringify({
      total: rows.length,
      updated: rows.length,
      mapping,
    }),
  );
}

run()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

