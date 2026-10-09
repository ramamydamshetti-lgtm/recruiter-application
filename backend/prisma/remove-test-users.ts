import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const testEmails = [
    'test@metaforgeit.com',
    'demo@metaforgeit.com',
    'sample@metaforgeit.com',
  ];

  const before = await prisma.user.count();
  const deleted = await prisma.user.deleteMany({
    where: { email: { in: testEmails } },
  });
  const after = await prisma.user.count();

  console.log('User cleanup summary');
  console.log(`- before: ${before}`);
  console.log(`- deleted: ${deleted.count}`);
  console.log(`- after: ${after}`);
}

main()
  .catch((err) => {
    console.error('Failed to remove test users:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
