/**
 * Deletes every row in `requirements`. PostgreSQL cascades to:
 * requirement_assignments, requirement_activities, submissions (and interviews, offer_letters via submissions).
 *
 * Usage (stop API recommended):
 *   npx tsx scripts/clear-all-requirements.ts --yes
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const ok =
    process.argv.includes('--yes') ||
    process.argv.includes('-y') ||
    process.env.CONFIRM_CLEAR_REQUIREMENTS === 'true';

  if (!ok) {
    console.error(
      '\nRefusing: this deletes ALL job demands and related submissions.\n' +
        'Run: npx tsx scripts/clear-all-requirements.ts --yes\n',
    );
    process.exit(1);
  }

  const result = await prisma.requirement.deleteMany({});
  console.log(
    `Deleted ${result.count} requirement(s). Child rows were removed by ON DELETE CASCADE (assignments, activities, submissions, etc.).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
