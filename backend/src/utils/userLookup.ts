import type { Prisma } from '@prisma/client';

/** PostgreSQL: match user email ignoring case (fixes "No account found" when casing differs). */
export function userWhereEmailInsensitive(email: string): Prisma.UserWhereInput {
  return {
    email: { equals: email.trim(), mode: 'insensitive' },
  };
}
