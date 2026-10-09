/**
 * Bulk development test data for Recruiter_dev (or any dev DB).
 *
 * Usage (from backend/):
 *   DEV_SEED_RESET=true  npx tsx scripts/seed-dev-test-data.ts
 *
 * DEV_SEED_RESET=true removes only rows tagged with this seed (clients with
 * clientCode DEVSEED_*, users/candidates with devseed. emails), then inserts
 * a large realistic dataset.
 *
 * Login (all accounts use the same password):
 *   Password: DevSeed#2026
 *   admin.devseed@example.com
 *   lead.devseed@example.com
 *   recruiter01.devseed@example.com … recruiter12.devseed@example.com
 */

import {
  PrismaClient,
  Prisma,
  RequirementStatus,
  RequirementAssignmentStatus,
  RequirementPriority,
  SubmissionStatus,
  AssignmentStatus,
  OfferLetterStatus,
  InterviewRoundType,
  CommunicationLogStatus,
  UserRole,
} from '@prisma/client';
import bcrypt from 'bcryptjs';
import { allocateNextUserId } from '../src/utils/userPublicId';

const prisma = new PrismaClient();

const SEED_CLIENT_PREFIX = 'DEVSEED_';
const PASSWORD = 'DevSeed#2026';

const FIRST_NAMES = [
  'Aarav', 'Vihaan', 'Aditya', 'Ananya', 'Diya', 'Ishaan', 'Kavya', 'Neha', 'Rohan', 'Sneha',
  'Arjun', 'Meera', 'Karan', 'Priya', 'Vikram', 'Anika', 'Dev', 'Riya', 'Siddharth', 'Tara',
];
const LAST_NAMES = [
  'Sharma', 'Verma', 'Patel', 'Singh', 'Reddy', 'Iyer', 'Menon', 'Kapoor', 'Malhotra', 'Joshi',
  'Nair', 'Desai', 'Kulkarni', 'Chopra', 'Bose', 'Ghosh', 'Rao', 'Mehta', 'Agarwal', 'Banerjee',
];
const ROLE_TITLES = [
  'Senior Full Stack Engineer',
  'Staff Backend Engineer',
  'Principal Data Engineer',
  'React Native Lead',
  'DevOps / SRE Engineer',
  'Product Designer (UX)',
  'QA Automation Lead',
  'Solutions Architect',
  'Engineering Manager',
  'Technical Program Manager',
  'Cloud Security Engineer',
  'ML Engineer',
  'Site Reliability Engineer',
  'Java Microservices Developer',
  'Angular + .NET Developer',
];
const LOCATIONS = ['Bangalore', 'Hyderabad', 'Pune', 'Chennai', 'Mumbai', 'Remote India', 'Noida', 'Gurgaon'];
const SKILLS_POOL = ['TypeScript', 'React', 'Node.js', 'PostgreSQL', 'AWS', 'Docker', 'Kubernetes', 'Java', 'Python', 'Go', 'GraphQL', 'Redis', 'Kafka', 'MongoDB', 'Spring Boot', 'Next.js', 'CI/CD', 'Terraform'];
const TECH_POOL = ['React', 'Vue', 'Angular', '.NET', 'Django', 'FastAPI', 'gRPC', 'Elasticsearch', 'Snowflake', 'Databricks'];

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length]!;
}

function uniqueReqId(i: number): string {
  const d = new Date();
  const ds = d.toISOString().slice(0, 10);
  return `REQ-DEVSEED-${ds}-${String(i).padStart(4, '0')}`;
}

async function wipePreviousSeed(): Promise<void> {
  const clients = await prisma.client.findMany({
    where: { clientCode: { startsWith: SEED_CLIENT_PREFIX } },
    select: { id: true },
  });
  const clientIds = clients.map((c) => c.id);
  if (clientIds.length === 0) {
    await prisma.submission.deleteMany({
      where: { candidate: { email: { contains: 'devseed.candidate' } } },
    });
    await prisma.candidate.deleteMany({ where: { email: { contains: 'devseed.candidate' } } });
    await prisma.user.deleteMany({ where: { email: { contains: 'devseed.' } } });
    return;
  }

  const reqs = await prisma.requirement.findMany({
    where: { clientId: { in: clientIds } },
    select: { id: true },
  });
  const reqIds = reqs.map((r) => r.id);

  await prisma.communicationLog.deleteMany({ where: { requirementId: { in: reqIds } } });
  await prisma.communicationLog.deleteMany({ where: { submissionId: { not: null } } });

  const subs = await prisma.submission.findMany({
    where: { requirementId: { in: reqIds } },
    select: { id: true },
  });
  const subIds = subs.map((s) => s.id);

  await prisma.candidateStatusHistory.deleteMany({ where: { submissionId: { in: subIds } } });
  await prisma.interviewRound.deleteMany({ where: { submissionId: { in: subIds } } });
  await prisma.offerManagement.deleteMany({ where: { submissionId: { in: subIds } } });
  await prisma.offerLetter.deleteMany({ where: { submissionId: { in: subIds } } });
  await prisma.interview.deleteMany({ where: { submissionId: { in: subIds } } });
  await prisma.communicationLog.deleteMany({ where: { submissionId: { in: subIds } } });
  await prisma.submission.deleteMany({ where: { id: { in: subIds } } });

  await prisma.requirementActivity.deleteMany({ where: { requirementId: { in: reqIds } } });
  await prisma.requirementAssignment.deleteMany({ where: { requirementId: { in: reqIds } } });
  await prisma.requirement.deleteMany({ where: { id: { in: reqIds } } });
  await prisma.client.deleteMany({ where: { id: { in: clientIds } } });

  await prisma.candidate.deleteMany({ where: { email: { contains: 'devseed.candidate' } } });
  await prisma.user.deleteMany({ where: { email: { contains: 'devseed.' } } });
}

async function main(): Promise<void> {
  const reset = String(process.env.DEV_SEED_RESET || '').toLowerCase() === 'true';
  if (!reset) {
    console.log('Set DEV_SEED_RESET=true to remove prior dev-seed rows and insert a fresh bulk dataset.');
    console.log('Example: DEV_SEED_RESET=true npx tsx scripts/seed-dev-test-data.ts');
    process.exit(1);
  }

  console.log('🧹 Removing previous dev-seed data (DEVSEED_* clients + devseed.* users/candidates)...');
  await wipePreviousSeed();

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  console.log('👤 Creating users...');
  const adminId = await allocateNextUserId(prisma);
  await prisma.user.create({
    data: {
      id: adminId,
      email: 'admin.devseed@example.com',
      password: passwordHash,
      firstName: 'Dev',
      lastName: 'Admin',
      role: UserRole.ADMIN,
      emailVerified: true,
      isActive: true,
    },
  });

  const leadId = await allocateNextUserId(prisma);
  await prisma.user.create({
    data: {
      id: leadId,
      email: 'lead.devseed@example.com',
      password: passwordHash,
      firstName: 'Priya',
      lastName: 'Lead',
      role: UserRole.LEAD,
      emailVerified: true,
      isActive: true,
    },
  });

  const recruiterIds: string[] = [];
  for (let i = 1; i <= 12; i += 1) {
    const id = await allocateNextUserId(prisma);
    recruiterIds.push(id);
    await prisma.user.create({
      data: {
        id,
        email: `recruiter${String(i).padStart(2, '0')}.devseed@example.com`,
        password: passwordHash,
        firstName: pick(FIRST_NAMES, i + 3),
        lastName: pick(LAST_NAMES, i),
        role: UserRole.RECRUITER,
        emailVerified: true,
        isActive: true,
        location: pick(LOCATIONS, i),
      },
    });
  }
  const allRecruiterIds = [leadId, ...recruiterIds];

  console.log('🏢 Creating clients...');
  const industries = ['FinTech', 'HealthTech', 'E‑commerce', 'SaaS', 'Logistics', 'EdTech', 'Gaming', 'Enterprise IT'];
  const clientRows: { id: string; name: string }[] = [];
  for (let i = 0; i < 18; i += 1) {
    const c = await prisma.client.create({
      data: {
        clientCode: `${SEED_CLIENT_PREFIX}${String(i + 1).padStart(3, '0')}`,
        name: `DevSeed ${pick(['Apex', 'Nova', 'Zenith', 'Orbit', 'Pulse', 'Vertex'], i)} ${industries[i % industries.length]}`,
        pocName: `${pick(FIRST_NAMES, i)} ${pick(LAST_NAMES, i + 1)}`,
        pocEmail: `client.poc${i}@partner-${i}.example.com`,
        pocPhone: `+91 98765${String(43210 + i).slice(-5)}`,
        industry: industries[i % industries.length]!,
        location: pick(LOCATIONS, i),
        isActive: true,
      },
      select: { id: true, name: true },
    });
    clientRows.push(c);
  }

  console.log('📋 Creating requirements...');
  const statuses: RequirementStatus[] = [
    'OPEN',
    'ASSIGNED',
    'SUBMITTED',
    'INTERVIEW',
    'SELECTED',
    'REJECTED',
    'CLOSED',
  ];
  const assignmentByStatus = (s: RequirementStatus): RequirementAssignmentStatus =>
    s === 'OPEN' ? 'UNASSIGNED' : 'ASSIGNED';

  const requirementRows: {
    id: string;
    requirementId: string;
    clientId: string;
    status: RequirementStatus;
  }[] = [];

  let reqCounter = 0;
  for (const cl of clientRows) {
    const nReq = 3 + (reqCounter % 4);
    for (let j = 0; j < nReq; j += 1) {
      const st = statuses[(reqCounter + j) % statuses.length]!;
      const rid = uniqueReqId(reqCounter * 10 + j);
      const r = await prisma.requirement.create({
        data: {
          requirementId: rid,
          clientId: cl.id,
          clientLeadPoc: 'hiring@client.example.com',
          clientPoc: 'manager@client.example.com',
          roleTitle: pick(ROLE_TITLES, reqCounter + j),
          location: pick(LOCATIONS, reqCounter),
          experience: `${3 + (reqCounter % 8)}–${8 + (reqCounter % 6)} years`,
          experienceLevel: 'Senior',
          employmentType: j % 3 === 0 ? 'Contract' : 'Full-time',
          workMode: j % 2 === 0 ? 'Hybrid' : 'Remote',
          budgetCurrency: 'INR',
          overallBudget: j % 3 === 0 ? 180000 + j * 5000 : 2400000 + j * 100000,
          yearlyBudget: j % 3 === 0 ? null : 2400000 + j * 100000,
          monthlyBudget: j % 3 === 0 ? 180000 + j * 5000 : null,
          noticePeriod: '30 days',
          skills: SKILLS_POOL.slice(0, 5 + (j % 5)),
          technologies: TECH_POOL.slice(0, 4 + (j % 4)),
          priority: [RequirementPriority.HIGH, RequirementPriority.MEDIUM, RequirementPriority.LOW][
            reqCounter % 3
          ]!,
          openPositions: 1 + (j % 4),
          slaDays: 10 + (j % 8),
          submittingTo: 'Direct Client',
          internalPoc: 'Internal TA',
          status: st,
          assignment: assignmentByStatus(st),
          requirementCreatorName: 'Dev Seed Script',
          assignedToRecruiterName: st === 'OPEN' ? null : pick(FIRST_NAMES, reqCounter) + ' Recruiter',
          assignmentAssignerName: st === 'OPEN' ? null : 'Dev Seed Script',
          submissionsCount: 0,
        },
        select: { id: true, requirementId: true, clientId: true, status: true },
      });
      requirementRows.push({ ...r, status: st });
      reqCounter += 1;
    }
  }

  console.log('📝 Logging requirement activities...');
  for (const r of requirementRows) {
    const actor = pick(allRecruiterIds, r.requirementId.length);
    await prisma.requirementActivity.create({
      data: {
        requirementId: r.id,
        actorId: actor,
        action: 'CREATED',
        summary: `Seeded job demand ${r.requirementId}`,
        metadata: { seed: 'dev-bulk' },
      },
    });
    if (r.status !== 'OPEN') {
      await prisma.requirementActivity.create({
        data: {
          requirementId: r.id,
          actorId: actor,
          action: 'UPDATED',
          summary: `Assignment / status seed → ${r.status}`,
          metadata: { seed: 'dev-bulk' },
        },
      });
    }
  }

  console.log('🤝 Creating requirement assignments...');
  for (const r of requirementRows.filter((x) => x.status !== 'OPEN')) {
    const rec = pick(recruiterIds, r.id.charCodeAt(2) ?? 0);
    await prisma.requirementAssignment.create({
      data: {
        requirementId: r.id,
        recruiterId: rec,
        assignedBy: leadId,
        status: AssignmentStatus.ACTIVE,
        notes: 'Seeded assignment for development',
      },
    });
  }

  console.log('👥 Creating candidates...');
  const candidateIds: string[] = [];
  for (let i = 0; i < 120; i += 1) {
    const email = `devseed.candidate${String(i + 1).padStart(3, '0')}@example.com`;
    const c = await prisma.candidate.create({
      data: {
        candidateRef: `CND-DEV-${String(i + 1).padStart(4, '0')}`,
        name: `${pick(FIRST_NAMES, i)} ${pick(LAST_NAMES, i + 5)}`,
        email,
        phone: `+9198765${String(10000 + i).padStart(5, '0').slice(0, 5)}`,
        currentCompany: pick(['Infosys', 'TCS', 'Wipro', 'Accenture', 'Cognizant', 'StartupCo'], i),
        experienceLabel: `${2 + (i % 10)}+ years`,
        totalExperience: 2 + (i % 12),
        skills: SKILLS_POOL.slice(0, 4 + (i % 6)),
        technologies: TECH_POOL.slice(0, 3 + (i % 5)),
        education: ['B.Tech Computer Science', 'M.Tech Software Engineering'].slice(0, 1 + (i % 2)),
        currentLocation: pick(LOCATIONS, i),
        preferredLocation: pick(LOCATIONS, i + 2),
        noticePeriod: pick(['Immediate', '15 days', '30 days', '60 days'], i),
        currentSalary: `${12 + (i % 20)} LPA`,
        expectedSalary: `${18 + (i % 25)} LPA`,
        linkedinUrl: `https://linkedin.com/in/devseed-cand-${i + 1}`,
        highestQualification: 'B.Tech',
        sourcePlatform: pick(['Naukri', 'LinkedIn', 'Referral', 'Internal'], i),
        notes: 'Seeded candidate for development / QA.',
        isActive: true,
      },
      select: { id: true },
    });
    candidateIds.push(c.id);
  }

  console.log('📤 Creating submissions and related workflow rows...');
  const submissionStatuses: SubmissionStatus[] = ['SUBMITTED', 'INTERVIEW', 'SELECTED', 'REJECTED'];
  const pairs = new Set<string>();
  let subIdx = 0;
  for (const req of requirementRows) {
    const nSub = 2 + (subIdx % 5);
    for (let k = 0; k < nSub; k += 1) {
      const candId = pick(candidateIds, subIdx + k * 17);
      const key = `${req.id}:${candId}`;
      if (pairs.has(key)) continue;
      pairs.add(key);

      const st = pick(submissionStatuses, subIdx + k);
      const submitter = pick(recruiterIds, subIdx);
      const sub = await prisma.submission.create({
        data: {
          requirementId: req.id,
          candidateId: candId,
          submittedBy: submitter,
          clientId: req.clientId,
          status: st,
          reasonForJobChange: 'Career growth and tech stack alignment.',
          relevantExperience: `${4 + (k % 6)} years in product engineering`,
          submittedOn: new Date(Date.now() - (subIdx % 45) * 86400000),
        },
        select: { id: true },
      });
      await prisma.submission.update({
        where: { id: sub.id },
        data: { submissionRef: sub.id },
      });

      const count = await prisma.submission.count({ where: { requirementId: req.id } });
      await prisma.requirement.update({
        where: { id: req.id },
        data: {
          submissionsCount: count,
        },
      });

      await prisma.candidateStatusHistory.create({
        data: {
          submissionId: sub.id,
          oldStatus: null,
          newStatus: 'SUBMITTED',
          changedById: submitter,
          reason: 'Initial submission (seed)',
        },
      });

      if (st !== 'SUBMITTED') {
        await prisma.candidateStatusHistory.create({
          data: {
            submissionId: sub.id,
            oldStatus: 'SUBMITTED',
            newStatus: st,
            changedById: submitter,
            reason: 'Seeded pipeline transition',
          },
        });
      }

      if (st === 'INTERVIEW' || st === 'SELECTED' || st === 'REJECTED') {
        const rec = pick(recruiterIds, subIdx);
        await prisma.interview.create({
          data: {
            submissionId: sub.id,
            recruiterId: rec,
            round: k % 2 === 0 ? 'Technical L1' : 'Manager L2',
            mode: k % 3 === 0 ? 'Video' : 'Phone',
            status: st === 'REJECTED' ? 'Completed' : 'Completed',
            scheduledAt: new Date(Date.now() - (10 + (subIdx % 20)) * 86400000),
            location: pick(LOCATIONS, subIdx),
            meetingLink: 'https://meet.example.com/seed-room',
            notes: 'Seeded interview',
            feedback: st === 'REJECTED' ? 'Good depth; role not a fit.' : 'Strong hire signal.',
            rating: 3 + (subIdx % 3),
            finalDecision: st === 'SELECTED' ? 'SELECTED' : st === 'REJECTED' ? 'REJECTED' : null,
          },
        });

        await prisma.interviewRound.create({
          data: {
            submissionId: sub.id,
            roundType: [InterviewRoundType.L1, InterviewRoundType.L2, InterviewRoundType.FINAL][
              subIdx % 3
            ]!,
            timezone: 'Asia/Kolkata',
            interviewerName: `Interviewer ${k + 1}`,
            interviewerEmail: `interviewer${k}@client.example.com`,
            mode: 'Video',
            status: 'DONE',
            scheduledAt: new Date(Date.now() - (5 + k) * 86400000),
            meetingLink: 'https://teams.microsoft.com/seed',
            feedback: 'Structured seed feedback.',
            rating: 4,
            finalDecision: st === 'SELECTED' ? 'SELECTED' : null,
          },
        });
      }

      if (st === 'SELECTED') {
        await prisma.offerLetter.create({
          data: {
            submissionId: sub.id,
            status: pick([OfferLetterStatus.DRAFT, OfferLetterStatus.RELEASED, OfferLetterStatus.ACCEPTED], subIdx),
            positionTitle: 'Senior Engineer',
            compensation: 'INR 28–32 LPA (seed)',
            joiningDate: new Date(Date.now() + 45 * 86400000),
            validUntil: new Date(Date.now() + 21 * 86400000),
            terms: 'Standard dev-seed terms.',
            letterContent: 'Dear Candidate,\n\nThis is seeded offer letter content.\n',
            releasedAt: subIdx % 2 === 0 ? new Date() : null,
            releasedById: subIdx % 2 === 0 ? leadId : null,
          },
        });

        await prisma.offerManagement.create({
          data: {
            submissionId: sub.id,
            status: OfferLetterStatus.RELEASED,
            offeredCtc: new Prisma.Decimal(String(2600000 + (subIdx % 500000))),
            currency: 'INR',
            hrNotes: 'Seeded offer management row.',
            offerExpiryDate: new Date(Date.now() + 14 * 86400000),
            positionTitle: 'Senior Software Engineer',
            compensation: 'INR 26.5 LPA fixed + variable',
            joiningDate: new Date(Date.now() + 60 * 86400000),
          },
        });
      }

      if (subIdx % 7 === 0) {
        await prisma.communicationLog.create({
          data: {
            type: 'EMAIL',
            recipient: `devseed.candidate${String((subIdx % 120) + 1).padStart(3, '0')}@example.com`,
            subject: `Update on ${req.requirementId}`,
            status: CommunicationLogStatus.SENT,
            requirementId: req.id,
            submissionId: sub.id,
            body: 'Seeded communication log body.',
          },
        });
      }

      subIdx += 1;
    }
  }

  console.log('✅ Dev seed complete.');
  console.log('');
  console.log('Summary:');
  console.log(`  Users:        1 admin + 1 lead + ${recruiterIds.length} recruiters`);
  console.log(`  Clients:      ${clientRows.length}`);
  console.log(`  Requirements: ${requirementRows.length}`);
  console.log(`  Candidates:   ${candidateIds.length}`);
  console.log(`  Password:     ${PASSWORD}`);
  console.log('');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
