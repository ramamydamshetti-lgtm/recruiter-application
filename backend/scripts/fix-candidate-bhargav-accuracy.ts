import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = 'bhargavboora999@gmail.com';

  const skills = [
    'Windows',
    'Linux',
    'Client/Server',
    'Oracle',
    'SQL Server',
    'NoSQL',
    'HTML',
    'CSS',
    'JavaScript',
    'XML',
    'JSON',
    'AJAX',
    'jQuery',
    'C#.NET',
    '.NET Core',
    '.NET Core Web API',
    'ASP.NET Core MVC',
    'ADO.NET',
    'LINQ',
    'EF Core',
    'Microsoft Visual Studio 2022',
    'Visual Studio Code',
    'SQL Server Management Studio 2022',
    'Azure',
    'GitHub',
    'TFS',
    'Azure DevOps',
    'Jira',
    'ServiceNow',
    'Agile',
    'Waterfall',
  ];

  const candidate = await prisma.candidate.findUnique({
    where: { email },
    select: { id: true, name: true },
  });
  if (!candidate) {
    throw new Error(`Candidate not found for email: ${email}`);
  }

  await prisma.candidate.update({
    where: { id: candidate.id },
    data: {
      totalExperience: 8,
      experienceLabel: '8 Years',
      relevantExperience: '4.6+ years in .NET technologies',
      skills,
      technologies: skills,
      updatedAt: new Date(),
    },
  });

  console.log(`Updated candidate accuracy fields: ${candidate.name} (${candidate.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
