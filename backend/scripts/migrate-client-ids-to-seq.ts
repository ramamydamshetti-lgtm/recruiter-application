/**
 * Migrates `clients.id` from CUIDs to sequential `CLIENT-001`, `CLIENT-002`, ...
 * Updates FK references (requirements.client_id, submissions.clientId).
 *
 * Usage:
 *   npx prisma db execute --file prisma/sql/ensure_client_pk_generator.sql
 *   npx tsx scripts/migrate-client-ids-to-seq.ts --yes
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const ok =
    process.argv.includes('--yes') ||
    process.argv.includes('-y') ||
    process.env.CONFIRM_MIGRATE_CLIENT_IDS === 'true';

  if (!ok) {
    console.error(
      '\nRefusing to run: this rewrites clients primary keys.\n' +
        'Run: npx tsx scripts/migrate-client-ids-to-seq.ts --yes\n',
    );
    process.exit(1);
  }

  console.warn('\n*** MIGRATING clients.id -> CLIENT-### (updates FKs) ***\n');

  await prisma.$transaction(async (tx) => {
    // Ensure generator exists and default is set.
    await tx.$executeRawUnsafe(
      `CREATE SEQUENCE IF NOT EXISTS global_client_pk_seq AS BIGINT START 1 INCREMENT 1`,
    );
    await tx.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION generate_client_pk()
      RETURNS TEXT
      LANGUAGE plpgsql
      AS $$
      DECLARE
        n BIGINT;
        w INT;
      BEGIN
        n := nextval('global_client_pk_seq');
        w := GREATEST(3, length(n::TEXT));
        RETURN 'CLIENT-' || lpad(n::TEXT, w, '0');
      END;
      $$;
    `);
    await tx.$executeRawUnsafe(
      `ALTER TABLE "clients" ALTER COLUMN "id" SET DEFAULT generate_client_pk()`,
    );

    // Drop FKs referencing clients.id
    await tx.$executeRawUnsafe(
      `ALTER TABLE "requirements" DROP CONSTRAINT IF EXISTS "requirements_client_id_fkey"`,
    );
    await tx.$executeRawUnsafe(
      `ALTER TABLE "submissions" DROP CONSTRAINT IF EXISTS "submissions_clientId_fkey"`,
    );

    // Map old -> new
    await tx.$executeRawUnsafe(`DROP TABLE IF EXISTS "_client_id_map"`);
    await tx.$executeRawUnsafe(`
      CREATE TEMP TABLE "_client_id_map" AS
      SELECT c.id AS old_id, generate_client_pk() AS new_id
      FROM "clients" c
      WHERE c.id !~ '^CLIENT-[0-9]{3,}$'
      ORDER BY c.created_at, c.id
    `);

    // Update FK columns
    await tx.$executeRawUnsafe(`
      UPDATE "requirements" r
      SET "client_id" = m.new_id
      FROM "_client_id_map" m
      WHERE r."client_id" = m.old_id
    `);
    await tx.$executeRawUnsafe(`
      UPDATE "submissions" s
      SET "clientId" = m.new_id
      FROM "_client_id_map" m
      WHERE s."clientId" = m.old_id
    `);

    // Update PK itself
    await tx.$executeRawUnsafe(`
      UPDATE "clients" c
      SET "id" = m.new_id
      FROM "_client_id_map" m
      WHERE c.id = m.old_id
    `);

    // Recreate FKs
    await tx.$executeRawUnsafe(`
      ALTER TABLE "requirements"
      ADD CONSTRAINT "requirements_client_id_fkey"
      FOREIGN KEY ("client_id") REFERENCES "clients"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    `);
    await tx.$executeRawUnsafe(`
      ALTER TABLE "submissions"
      ADD CONSTRAINT "submissions_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "clients"("id")
      ON DELETE SET NULL ON UPDATE CASCADE
    `);
  });

  console.log('\nDone. clients.id is now CLIENT-###.\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

