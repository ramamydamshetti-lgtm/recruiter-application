import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Next id from DB: user-001, user-002, ... (global sequence).
 * Requires `prisma/sql/ensure_user_id_generator.sql` applied to the database.
 */
export async function allocateNextUserId(client: DbClient): Promise<string> {
  const rows = await client.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT generate_user_id() AS id`,
  );
  const id = rows[0]?.id;
  if (!id || !/^user-\d{3,}$/.test(id)) {
    throw new Error(
      'generate_user_id() is missing or invalid. Run: npx prisma db execute --file prisma/sql/ensure_user_id_generator.sql',
    );
  }
  return id;
}
