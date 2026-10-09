import type { PrismaClient as PrismaClientType } from '@prisma/client';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PrismaClient } = require('@prisma/client') as typeof import('@prisma/client');

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClientType;
};

export const prisma: PrismaClientType =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development' ? (['warn', 'error'] as const) : (['error'] as const),
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
