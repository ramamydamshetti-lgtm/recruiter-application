const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const prisma = new PrismaClient();

async function main() {
  console.log('--- Reset and Seed (server) ---');

  // 1) Clean transactional/workflow data first (FK-safe order)
  const deletedSubmissions = await prisma.submission.deleteMany({});
  const deletedAssignments = await prisma.requirementAssignment.deleteMany({});
  const deletedRequirements = await prisma.requirement.deleteMany({});
  const deletedCandidates = await prisma.candidate.deleteMany({});
  const deletedClients = await prisma.client.deleteMany({});

  console.log(`Deleted submissions: ${deletedSubmissions.count}`);
  console.log(`Deleted assignments: ${deletedAssignments.count}`);
  console.log(`Deleted requirements: ${deletedRequirements.count}`);
  console.log(`Deleted candidates: ${deletedCandidates.count}`);
  console.log(`Deleted clients: ${deletedClients.count}`);

  // 2) Keep users table clean and re-create a known recruiter login
  await prisma.user.deleteMany({});
  const hashedPassword = await bcrypt.hash('TestPassword123', 10);

  const recruiter = await prisma.user.create({
    data: {
      email: 'test@metaforgeit.com',
      password: hashedPassword,
      firstName: 'Test',
      lastName: 'User',
      role: 'RECRUITER',
      isActive: true,
      emailVerified: true,
    },
  });

  // 3) Create clients used by client pages
  const clientA = await prisma.client.create({
    data: {
      name: 'TechCorp Solutions',
      pocName: 'Michael Chen',
      pocEmail: 'michael.chen@techcorp.com',
      pocPhone: '+1-555-1001',
      industry: 'Technology',
      location: 'San Francisco, CA',
      isActive: true,
    },
  });

  const clientB = await prisma.client.create({
    data: {
      name: 'FinEdge Systems',
      pocName: 'Sarah Johnson',
      pocEmail: 'sarah.johnson@finedge.com',
      pocPhone: '+1-555-1002',
      industry: 'FinTech',
      location: 'Austin, TX',
      isActive: true,
    },
  });

  // 4) Create requirements for requirements/my-work/team-work pages
  const req1 = await prisma.requirement.create({
    data: {
      requirementId: 'REQ-SERVER-001',
      clientId: clientA.id,
      clientLeadPoc: clientA.pocName,
      clientPoc: clientA.pocEmail,
      roleTitle: 'Senior Full Stack Engineer',
      location: 'San Francisco, CA',
      experience: '5-8 years',
      experienceLevel: 'Senior',
      employmentType: 'Full-time',
      workMode: 'Hybrid',
      salaryMin: 140000,
      salaryMax: 190000,
      noticePeriod: '30 days',
      skills: ['JavaScript', 'TypeScript', 'React', 'Node.js'],
      technologies: ['React', 'Node.js', 'PostgreSQL', 'AWS'],
      priority: 'HIGH',
      openPositions: 2,
      slaDays: 10,
      submittingTo: 'Direct Client',
      clientJdId: 'JD-SERVER-001',
      status: 'OPEN',
      assignment: 'UNASSIGNED',
      ownerId: recruiter.id,
      assignedBy: recruiter.id,
      assignedRecruiters: [],
      submissionsCount: 0,
      isDeleted: false,
      updatedBy: recruiter.id,
    },
  });

  const req2 = await prisma.requirement.create({
    data: {
      requirementId: 'REQ-SERVER-002',
      clientId: clientB.id,
      clientLeadPoc: clientB.pocName,
      clientPoc: clientB.pocEmail,
      roleTitle: 'Data Engineer',
      location: 'Austin, TX',
      experience: '4-7 years',
      experienceLevel: 'Mid-Senior',
      employmentType: 'Full-time',
      workMode: 'Remote',
      salaryMin: 120000,
      salaryMax: 165000,
      noticePeriod: '45 days',
      skills: ['Python', 'SQL', 'ETL'],
      technologies: ['Python', 'PostgreSQL', 'Airflow'],
      priority: 'MEDIUM',
      openPositions: 1,
      slaDays: 12,
      submittingTo: 'Hiring Manager',
      clientJdId: 'JD-SERVER-002',
      status: 'OPEN',
      assignment: 'UNASSIGNED',
      ownerId: recruiter.id,
      assignedBy: recruiter.id,
      assignedRecruiters: [],
      submissionsCount: 0,
      isDeleted: false,
      updatedBy: recruiter.id,
    },
  });

  // 5) Create candidates for candidate repository/submission pages
  const candidate1 = await prisma.candidate.create({
    data: {
      name: 'Alice Brown',
      email: 'alice.brown@example.com',
      phone: '+1-555-2001',
      currentCompany: 'Acme Labs',
      experienceLabel: '6 years',
      totalExperience: 6,
      skills: ['JavaScript', 'TypeScript', 'React', 'Node.js'],
      technologies: ['React', 'Node.js', 'PostgreSQL'],
      education: ['B.Tech Computer Science'],
      currentLocation: 'San Francisco, CA',
      preferredLocation: 'San Francisco, CA',
      noticePeriod: '30 days',
      currentSalary: '35 LPA',
      expectedSalary: '42 LPA',
      sourcePlatform: 'Internal',
      sourcePlatformId: 'INT-ALICE-001',
      isActive: true,
    },
  });

  const candidate2 = await prisma.candidate.create({
    data: {
      name: 'Ravi Kumar',
      email: 'ravi.kumar@example.com',
      phone: '+1-555-2002',
      currentCompany: 'DataVerse',
      experienceLabel: '5 years',
      totalExperience: 5,
      skills: ['Python', 'SQL', 'Airflow'],
      technologies: ['Python', 'PostgreSQL', 'Airflow'],
      education: ['M.Tech Data Science'],
      currentLocation: 'Austin, TX',
      preferredLocation: 'Remote',
      noticePeriod: '45 days',
      currentSalary: '28 LPA',
      expectedSalary: '34 LPA',
      sourcePlatform: 'Referral',
      sourcePlatformId: 'REF-RAVI-001',
      isActive: true,
    },
  });

  // 6) Create submissions so submissions/report pages are populated
  await prisma.submission.create({
    data: {
      requirementId: req1.id,
      candidateId: candidate1.id,
      submittedBy: recruiter.id,
      status: 'SUBMITTED',
      submittedOn: new Date(),
      soNumber: 'SO-1001',
      reasonForJobChange: 'Looking for growth and product scale.',
      offerInHand: 'No',
      relevantExperience: '5 years',
    },
  });

  await prisma.submission.create({
    data: {
      requirementId: req2.id,
      candidateId: candidate2.id,
      submittedBy: recruiter.id,
      status: 'INTERVIEW',
      submittedOn: new Date(),
      soNumber: 'SO-1002',
      reasonForJobChange: 'Wants remote-first team and better stack.',
      offerInHand: 'Yes',
      relevantExperience: '4 years',
      interviewType: 'VIDEO',
      interviewLocation: 'Google Meet',
    },
  });

  // Recalculate submission counts
  const req1Count = await prisma.submission.count({ where: { requirementId: req1.id } });
  const req2Count = await prisma.submission.count({ where: { requirementId: req2.id } });

  await prisma.requirement.update({
    where: { id: req1.id },
    data: { submissionsCount: req1Count, status: 'SUBMITTED' },
  });
  await prisma.requirement.update({
    where: { id: req2.id },
    data: { submissionsCount: req2Count, status: 'INTERVIEW' },
  });

  const summary = {
    users: await prisma.user.count(),
    clients: await prisma.client.count(),
    requirements: await prisma.requirement.count(),
    candidates: await prisma.candidate.count(),
    submissions: await prisma.submission.count(),
  };

  console.log('\nSeed complete. Summary:', summary);
  console.log('Login -> email: test@metaforgeit.com  password: TestPassword123');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

