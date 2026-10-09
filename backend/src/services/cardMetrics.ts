import type { AssignmentStatus, RequirementAssignmentStatus, RequirementStatus, SubmissionStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export type RequirementDashboardBucket =
  | 'unassigned'
  | 'assigned'
  | 'inProgress'
  | 'interviews'
  | 'selected'
  | 'rejected'
  | 'closed';

const INTERVIEW_HANDLED_STATUSES = ['Scheduled', 'Completed', 'Rescheduled'] as const;

function isRequirementAllocated(
  assignment: RequirementAssignmentStatus,
  hasActiveAssignment: boolean,
): boolean {
  return assignment === 'ASSIGNED' || hasActiveAssignment;
}

/** Mirrors frontend `getDashboardStatus` bucket keys for summary cards. */
export function requirementDashboardBucket(
  status: RequirementStatus,
  assignment: RequirementAssignmentStatus,
  hasActiveAssignment: boolean,
): RequirementDashboardBucket {
  if (!isRequirementAllocated(assignment, hasActiveAssignment)) {
    return 'unassigned';
  }
  switch (status) {
    case 'OPEN':
    case 'ASSIGNED':
      return 'assigned';
    case 'SUBMITTED':
      return 'inProgress';
    case 'INTERVIEW':
      return 'interviews';
    case 'SELECTED':
      return 'selected';
    case 'REJECTED':
      return 'rejected';
    case 'CLOSED':
      return 'closed';
    default:
      return 'assigned';
  }
}

export async function countAssignedRequirements(recruiterId: string): Promise<number> {
  return prisma.requirementAssignment.count({
    where: {
      recruiterId,
      status: 'ACTIVE' satisfies AssignmentStatus,
      requirement: { isDeleted: false },
    },
  });
}

export async function countRecruiterSubmissions(recruiterId: string): Promise<number> {
  return prisma.submission.count({ where: { submittedBy: recruiterId } });
}

/** Selected placements + joined (offer accepted), deduped per submission. */
export async function countRecruiterSelections(recruiterId: string): Promise<number> {
  return prisma.submission.count({
    where: {
      submittedBy: recruiterId,
      OR: [
        { status: 'SELECTED' satisfies SubmissionStatus },
        { offerMgmt: { status: 'ACCEPTED' } },
      ],
    },
  });
}

export async function countRecruiterInterviewsHandled(recruiterId: string): Promise<number> {
  return prisma.interview.count({
    where: {
      recruiterId,
      status: { in: [...INTERVIEW_HANDLED_STATUSES] },
    },
  });
}

export async function getMyWorkMetrics(recruiterId: string) {
  const [totalSubmissions, interviewsHandled, selectionsAchieved, assignedRequirements] =
    await Promise.all([
      countRecruiterSubmissions(recruiterId),
      countRecruiterInterviewsHandled(recruiterId),
      countRecruiterSelections(recruiterId),
      countAssignedRequirements(recruiterId),
    ]);
  return { totalSubmissions, interviewsHandled, selectionsAchieved, assignedRequirements };
}

export async function getTeamPerformanceMetrics() {
  const [totalSubmissions, interviews, selections, teamSize] = await Promise.all([
    prisma.submission.count(),
    prisma.interview.count({
      where: { status: { in: [...INTERVIEW_HANDLED_STATUSES] } },
    }),
    prisma.submission.count({
      where: {
        OR: [{ status: 'SELECTED' }, { offerMgmt: { status: 'ACCEPTED' } }],
      },
    }),
    prisma.user.count({
      where: {
        isActive: true,
        role: { in: ['RECRUITER', 'LEAD'] },
      },
    }),
  ]);
  return { totalSubmissions, interviews, selections, teamSize };
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeekMonday(): Date {
  const d = startOfToday();
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

function endOfWeekSunday(): Date {
  const start = startOfWeekMonday();
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return end;
}

export async function getTeamTaskSubmissionMetrics() {
  const todayStart = startOfToday();
  const tomorrow = new Date(todayStart);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const weekStart = startOfWeekMonday();
  const weekEnd = endOfWeekSunday();

  const [teamDailySubmissions, teamWeeklySubmissions, teamWeeklyInterviews] = await Promise.all([
    prisma.submission.count({
      where: { submittedOn: { gte: todayStart, lt: tomorrow } },
    }),
    prisma.submission.count({
      where: { submittedOn: { gte: weekStart, lt: weekEnd } },
    }),
    prisma.interview.count({
      where: {
        status: { in: [...INTERVIEW_HANDLED_STATUSES] },
        scheduledAt: { gte: weekStart, lt: weekEnd },
      },
    }),
  ]);

  return { teamDailySubmissions, teamWeeklySubmissions, teamWeeklyInterviews };
}

export async function getRequirementsDashboardMetrics() {
  const [requirements, activeAssignments, submissions] = await Promise.all([
    prisma.requirement.findMany({
      where: { isDeleted: false },
      select: { id: true, status: true, assignment: true },
    }),
    prisma.requirementAssignment.findMany({
      where: { status: 'ACTIVE' },
      select: { requirementId: true },
      distinct: ['requirementId'],
    }),
    prisma.submission.count(),
  ]);

  const activeReqIds = new Set(activeAssignments.map((a) => a.requirementId));
  const buckets: Record<RequirementDashboardBucket, number> = {
    unassigned: 0,
    assigned: 0,
    inProgress: 0,
    interviews: 0,
    selected: 0,
    rejected: 0,
    closed: 0,
  };

  for (const r of requirements) {
    const key = requirementDashboardBucket(
      r.status,
      r.assignment,
      activeReqIds.has(r.id),
    );
    buckets[key] += 1;
  }

  return {
    total: requirements.length,
    submissions,
    unassigned: buckets.unassigned,
    assigned: buckets.assigned,
    inProgress: buckets.inProgress,
    interviews: buckets.interviews,
    selected: buckets.selected,
    rejected: buckets.rejected,
    closed: buckets.closed,
  };
}

export async function getInterviewCardMetrics(recruiterId?: string) {
  const baseWhere = recruiterId ? { recruiterId } : {};
  const todayStart = startOfToday();
  const tomorrow = new Date(todayStart);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const weekStart = startOfWeekMonday();
  const weekEnd = endOfWeekSunday();

  const [total, scheduled, completed, today, thisWeek] = await Promise.all([
    prisma.interview.count({ where: baseWhere }),
    prisma.interview.count({ where: { ...baseWhere, status: 'Scheduled' } }),
    prisma.interview.count({ where: { ...baseWhere, status: 'Completed' } }),
    prisma.interview.count({
      where: {
        ...baseWhere,
        scheduledAt: { gte: todayStart, lt: tomorrow },
      },
    }),
    prisma.interview.count({
      where: {
        ...baseWhere,
        scheduledAt: { gte: weekStart, lt: weekEnd },
      },
    }),
  ]);

  return { total, scheduled, completed, today, thisWeek };
}

export async function getRequirementWidgetMetrics(requirementIdOrCode: string) {
  const req = await prisma.requirement.findFirst({
    where: {
      OR: [{ id: requirementIdOrCode }, { requirementId: requirementIdOrCode }],
    },
    select: { id: true, slaDays: true, createdAt: true },
  });
  if (!req) return null;

  const subWhere = { requirementId: req.id };
  const [totalCandidates, submitted, interviewing, selected, rejected, offerReleased] =
    await Promise.all([
      prisma.submission.count({ where: subWhere }),
      prisma.submission.count({
        where: {
          ...subWhere,
          status: { in: ['SUBMITTED', 'SUBMITTED_TO_LEAD', 'SUBMITTED_TO_CLIENT'] },
        },
      }),
      prisma.submission.count({ where: { ...subWhere, status: 'INTERVIEW' } }),
      prisma.submission.count({ where: { ...subWhere, status: 'SELECTED' } }),
      prisma.submission.count({ where: { ...subWhere, status: 'REJECTED' } }),
      prisma.offerLetter.count({
        where: {
          submission: { requirementId: req.id },
          status: { in: ['RELEASED', 'ACCEPTED'] },
        },
      }),
    ]);

  const daysOpen = Math.floor((Date.now() - req.createdAt.getTime()) / 86400000);
  const slaRemaining = Math.max(0, (req.slaDays ?? 15) - daysOpen);

  return {
    totalCandidates,
    submitted,
    interviewing,
    selected,
    rejected,
    offerReleased,
    slaRemaining,
  };
}
