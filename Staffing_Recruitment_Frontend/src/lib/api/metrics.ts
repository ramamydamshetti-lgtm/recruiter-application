import { getPublicApiBase } from '@/lib/publicOrigin';

export type MyWorkCardMetrics = {
  totalSubmissions: number;
  interviewsHandled: number;
  selectionsAchieved: number;
  assignedRequirements: number;
};

export type TeamCardMetrics = {
  totalSubmissions: number;
  interviews: number;
  selections: number;
  teamSize: number;
};

export type TeamTaskCardMetrics = {
  teamDailySubmissions: number;
  teamWeeklySubmissions: number;
  teamWeeklyInterviews: number;
};

export type RequirementsCardMetrics = {
  total: number;
  submissions: number;
  unassigned: number;
  assigned: number;
  inProgress: number;
  interviews: number;
  selected: number;
  rejected: number;
  closed: number;
};

export type InterviewsCardMetrics = {
  total: number;
  scheduled: number;
  completed: number;
  today: number;
  thisWeek: number;
};

export type RequirementWidgetMetrics = {
  totalCandidates: number;
  submitted: number;
  interviewing: number;
  selected: number;
  rejected: number;
  offerReleased: number;
  slaRemaining: number;
};

export type CardMetricsPayload = {
  myWork?: MyWorkCardMetrics;
  team?: TeamCardMetrics;
  teamTasks?: TeamTaskCardMetrics;
  requirements?: RequirementsCardMetrics;
  interviews?: InterviewsCardMetrics;
  requirement?: RequirementWidgetMetrics;
};

export type CardMetricsScope =
  | 'myWork'
  | 'team'
  | 'teamTasks'
  | 'requirements'
  | 'interviews'
  | 'requirement';

export async function fetchCardMetrics(
  scopes: CardMetricsScope[],
  options?: { recruiterId?: string; requirementId?: string },
): Promise<CardMetricsPayload> {
  const qs = new URLSearchParams();
  qs.set('scopes', scopes.join(','));
  if (options?.recruiterId?.trim()) {
    qs.set('recruiterId', options.recruiterId.trim());
  }
  if (options?.requirementId?.trim()) {
    qs.set('requirementId', options.requirementId.trim());
  }

  const response = await fetch(`${getPublicApiBase()}/api/metrics/cards?${qs.toString()}`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token')}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch card metrics: ${response.statusText}`);
  }

  const result = await response.json();
  return (result.data ?? {}) as CardMetricsPayload;
}
