import type { Submission } from '@/lib/domain/submissions/types';

export type TrafficLightStatus = 'green' | 'yellow' | 'red';

export type RecruiterTaskSummary = {
  // Daily
  isWorkingDayToday: boolean;
  dailySubmissions: number;
  dailyTarget: number;
  dailyRemaining: number;
  dailyStatus: 'completed' | 'incomplete' | 'off';

  // Weekly
  weeklySubmissions: number;
  weeklyTarget: number;
  weeklyCompletionPercent: number;
  weeklyInterviews: number;
  weeklyConversionRate: number; // 0–1

  // Overall
  totalSubmissions: number;

  // Status & automation
  statusColor: TrafficLightStatus;
  statusLabel: 'On Track' | 'Warning' | 'Critical';
  needsAutoAssignment: boolean;
};

export type TeamTaskOverview = {
  workingRecruiters: number;
  onTrackTodayCount: number;
  percentOnTrackToday: number;

  teamDailySubmissions: number;
  teamDailyTarget: number;

  teamWeeklySubmissions: number;
  teamWeeklyTarget: number;
  teamWeeklyCompletionPercent: number;

  teamWeeklyInterviews: number;
  teamConversionRate: number; // 0–1

  greenCount: number;
  yellowCount: number;
  redCount: number;
};

const DAILY_TARGET = 5;
/** Expected candidate submissions per recruiter per week (Mon–today window). */
const WEEKLY_SUBMISSION_TARGET = 25;

// Leave calendar – replace with real backend integration later.
// Keys are recruiter IDs, values are ISO date strings (YYYY-MM-DD) of approved leave days.
const leaveDays: Record<string, string[]> = {
  // TODO: Replace with real leave data from backend
};

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseDateKey(iso: string): Date {
  return new Date(iso);
}

function isWeekend(date: Date): boolean {
  const day = date.getDay(); // 0=Sun, 6=Sat
  return day === 0 || day === 6;
}

function isLeaveDay(recruiterId: string, date: Date): boolean {
  const dates = leaveDays[recruiterId];
  if (!dates || dates.length === 0) return false;
  const key = toDateKey(date);
  return dates.includes(key);
}

function isWorkingDay(recruiterId: string, date: Date): boolean {
  if (isWeekend(date)) return false;
  if (isLeaveDay(recruiterId, date)) return false;
  return true;
}

function getWeekStart(today: Date): Date {
  const d = new Date(today);
  const day = d.getDay(); // 0=Sun, 1=Mon, ... 6=Sat
  const diff = (day + 6) % 7; // 0 for Monday, 6 for Sunday
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function computeRecruiterTaskSummary(
  recruiterId: string,
  recruiterSubmissions: Submission[],
  recruiterActiveRequirementCount: number,
  today: Date,
): RecruiterTaskSummary {
  const todayMidnight = new Date(today);
  todayMidnight.setHours(0, 0, 0, 0);

  // Daily submissions rule:
  // - Each working day the recruiter must submit at least 5 candidates.
  // - 5 or more => completed/green, below 5 => incomplete/red.
  // - No carry-over dependency in daily target.
  const isWorkingToday = isWorkingDay(recruiterId, todayMidnight);
  const dailySubmissions = recruiterSubmissions.filter((s) =>
    isSameDay(new Date(s.submittedOn), todayMidnight),
  ).length;
  const dailyTarget = isWorkingToday ? DAILY_TARGET : 0;
  let dailyRemaining = 0;
  let dailyStatus: RecruiterTaskSummary['dailyStatus'] = 'off';

  if (!isWorkingToday) {
    dailyStatus = 'off';
    dailyRemaining = 0;
  } else if (dailySubmissions >= dailyTarget) {
    dailyStatus = 'completed';
    dailyRemaining = 0;
  } else {
    dailyStatus = 'incomplete';
    dailyRemaining = Math.max(0, dailyTarget - dailySubmissions);
  }

  // Weekly window (Mon -> today)
  const weekStart = getWeekStart(todayMidnight);

  const weeklySubmissions = recruiterSubmissions.filter((s) => {
    const d = new Date(s.submittedOn);
    d.setHours(0, 0, 0, 0);
    return d >= weekStart && d <= todayMidnight;
  });

  const weeklyTarget = WEEKLY_SUBMISSION_TARGET;
  const weeklySubmissionsCount = weeklySubmissions.length;
  const weeklyInterviews = weeklySubmissions.filter(
    (s) => s.status === 'Interview',
  ).length;

  const weeklyCompletionPercent =
    weeklyTarget > 0 ? (weeklySubmissionsCount / weeklyTarget) * 100 : 0;

  const weeklyConversionRate =
    weeklySubmissionsCount > 0 ? weeklyInterviews / weeklySubmissionsCount : 0;

  const totalSubmissions = recruiterSubmissions.length;

  // Status coloring is driven by the daily carry-over rule.
  let statusColor: TrafficLightStatus;
  let statusLabel: RecruiterTaskSummary['statusLabel'];

  // Daily rule drives traffic-light:
  // - If working today and recruiter met required target => GREEN
  // - If working today and recruiter missed required target => RED
  // - If not a working day => treat as neutral ("On Track") to avoid false alerts.
  if (!isWorkingToday) {
    statusColor = 'green';
    statusLabel = 'On Track';
  } else if (dailyStatus === 'completed') {
    statusColor = 'green';
    statusLabel = 'On Track';
  } else {
    statusColor = 'red';
    statusLabel = 'Critical';
  }

  // Auto-assignment placeholder:
  // If recruiter has very few active requirements, flag them for auto-assignment.
  const needsAutoAssignment = recruiterActiveRequirementCount < 2;

  return {
    isWorkingDayToday: isWorkingToday,
    dailySubmissions,
    dailyTarget,
    dailyRemaining,
    dailyStatus,

    weeklySubmissions: weeklySubmissionsCount,
    weeklyTarget,
    weeklyCompletionPercent,
    weeklyInterviews,
    weeklyConversionRate,

    totalSubmissions,

    statusColor,
    statusLabel,
    needsAutoAssignment,
  };
}

export function computeTeamTaskOverview(
  summaries: RecruiterTaskSummary[],
): TeamTaskOverview {
  if (summaries.length === 0) {
    return {
      workingRecruiters: 0,
      onTrackTodayCount: 0,
      percentOnTrackToday: 0,
      teamDailySubmissions: 0,
      teamDailyTarget: 0,
      teamWeeklySubmissions: 0,
      teamWeeklyTarget: 0,
      teamWeeklyCompletionPercent: 0,
      teamWeeklyInterviews: 0,
      teamConversionRate: 0,
      greenCount: 0,
      yellowCount: 0,
      redCount: 0,
    };
  }

  const working = summaries.filter((s) => s.isWorkingDayToday);
  const onTrackTodayCount = working.filter(
    (s) => s.dailyStatus === 'completed',
  ).length;
  const workingRecruiters = working.length;

  const teamDailySubmissions = working.reduce(
    (sum, s) => sum + s.dailySubmissions,
    0,
  );
  const teamDailyTarget = working.reduce(
    (sum, s) => sum + s.dailyTarget,
    0,
  );

  const teamWeeklySubmissions = summaries.reduce(
    (sum, s) => sum + s.weeklySubmissions,
    0,
  );
  const teamWeeklyTarget = summaries.reduce(
    (sum, s) => sum + s.weeklyTarget,
    0,
  );
  const teamWeeklyInterviews = summaries.reduce(
    (sum, s) => sum + s.weeklyInterviews,
    0,
  );

  const teamWeeklyCompletionPercent =
    teamWeeklyTarget > 0
      ? (teamWeeklySubmissions / teamWeeklyTarget) * 100
      : 0;

  const teamConversionRate =
    teamWeeklySubmissions > 0
      ? teamWeeklyInterviews / teamWeeklySubmissions
      : 0;

  let greenCount = 0;
  let yellowCount = 0;
  let redCount = 0;
  for (const s of summaries) {
    if (s.statusColor === 'green') greenCount += 1;
    else if (s.statusColor === 'yellow') yellowCount += 1;
    else if (s.statusColor === 'red') redCount += 1;
  }

  const percentOnTrackToday =
    workingRecruiters > 0
      ? (onTrackTodayCount / workingRecruiters) * 100
      : 0;

  return {
    workingRecruiters,
    onTrackTodayCount,
    percentOnTrackToday,
    teamDailySubmissions,
    teamDailyTarget,
    teamWeeklySubmissions,
    teamWeeklyTarget,
    teamWeeklyCompletionPercent,
    teamWeeklyInterviews,
    teamConversionRate,
    greenCount,
    yellowCount,
    redCount,
  };
}


