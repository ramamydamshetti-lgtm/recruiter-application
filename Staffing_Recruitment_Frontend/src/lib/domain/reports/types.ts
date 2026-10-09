/**
 * Reports domain models.
 * Designed for REST API / PostgreSQL compatibility (query params, filters).
 */

export type ReportPeriodType = 'day' | 'week' | 'month' | 'year';

export type ReportFilters = {
  startDate: string; // ISO date YYYY-MM-DD
  endDate: string;
  periodType: ReportPeriodType;
  status?: string; // requirement status or 'All'
  recruiterId?: string;
  clientName?: string;
  jobId?: string;
};

/** Admin/Client report aggregation (dashboard KPIs + breakdowns). */
export type AdminReportAggregate = {
  totalRequirementsSent: number;
  totalRequirementsAssigned: number;
  totalCandidatesSubmitted: number;
  submissionRatioPerRequirement: number; // avg submissions per requirement
  openRequirements: number;
  closedRequirements: number;
  /** Time-series buckets for charts (label + count). */
  trendBuckets: { label: string; requirements: number; submissions: number }[];
  /** By status for pie/bar. */
  byStatus: { status: string; count: number }[];
  /** Recruiter-wise performance rows. */
  recruiterPerformance: RecruiterPerformanceRow[];
  /** Client-wise performance rows. */
  clientPerformance: ClientPerformanceRow[];
};

export type RecruiterPerformanceRow = {
  recruiterId: string;
  recruiterName: string;
  recruiterEmail: string;
  requirementsAssigned: number;
  candidatesSubmitted: number;
  submissionsSuccessRate: number; // 0–100 (e.g. Selected / total)
  openJobs: number;
  closedJobs: number;
};

export type ClientPerformanceRow = {
  clientName: string; // This will be clientLeadPoc from Requirement
  requirementsSent: number;
  requirementsAssigned: number;
  candidatesSubmitted: number;
  submissionRatio: number;
  openCount: number;
  closedCount: number;
};

/** Recruiter (profile) report: personal metrics only. */
export type RecruiterReportAggregate = {
  requirementsAssigned: number;
  candidatesSubmitted: number;
  submissionSuccessRate: number;
  openJobsHandled: number;
  closedJobsHandled: number;
  /** Weekly or monthly trend. */
  personalTrend: { label: string; requirements: number; submissions: number }[];
  /** Filtered requirement rows for table. */
  requirementRows: RecruiterRequirementRow[];
};

export type RecruiterRequirementRow = {
  jobId: string;
  clientName: string; // This will be clientLeadPoc from Requirement
  status: string;
  submissionsCount: number;
  createdAt: string;
  updatedAt: string;
};

/**
 * Search query shape (PostgreSQL-ready: can map to WHERE / params).
 * POC = Point of Contact (e.g. client_poc) for optimized indexing.
 */
export type ReportSearchQuery = {
  jobId?: string;
  clientName?: string;
  poc?: string; // Point of Contact - client POC field
  recruiterName?: string;
  recruiterId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  /** Combined: all conditions AND'd. */
};
