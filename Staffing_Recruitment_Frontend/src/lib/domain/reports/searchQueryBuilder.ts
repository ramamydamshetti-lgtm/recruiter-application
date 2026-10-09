/**
 * Advanced search query builder.
 * Produces a structured query that can be applied in-memory or translated to PostgreSQL.
 *
 * PostgreSQL example mapping:
 *   jobId -> WHERE req.id ILIKE $jobId
 *   clientName -> WHERE req.client_name ILIKE $clientName
 *   poc -> WHERE req.client_poc ILIKE $poc (Point of Contact, index-friendly)
 *   recruiterId -> JOIN recruiters / WHERE req.owner_id = $recruiterId
 *   status -> WHERE req.status = $status
 *   startDate/endDate -> WHERE req.created_at BETWEEN $start AND $end
 */

import type { ReportSearchQuery } from './types';
import { getDashboardStatus, recruiterOwnsRequirement } from '@/lib/domain/requirements/logic';

export type SearchInput = {
  jobId?: string;
  clientName?: string;
  poc?: string; // Point of Contact
  recruiterName?: string;
  recruiterId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
};

export function buildReportSearchQuery(input: SearchInput): ReportSearchQuery {
  const q: ReportSearchQuery = {};
  if (input.jobId?.trim()) q.jobId = input.jobId.trim();
  if (input.clientName?.trim()) q.clientName = input.clientName.trim();
  if (input.poc?.trim()) q.poc = input.poc.trim();
  if (input.recruiterId?.trim()) q.recruiterId = input.recruiterId.trim();
  if (input.recruiterName?.trim()) q.recruiterName = input.recruiterName.trim();
  if (input.status?.trim() && input.status !== 'All') q.status = input.status.trim();
  if (input.startDate?.trim()) q.startDate = input.startDate.trim();
  if (input.endDate?.trim()) q.endDate = input.endDate.trim();
  return q;
}

/**
 * Apply search query to an in-memory list of requirements.
 * For API/DB, use query params instead of this.
 * Model supports clientPoc (POC) for optimized query indexing.
 */
export function applySearchToRequirements<
  T extends {
    id: string;
    requirementId?: string;
    clientLeadPoc: string;
    clientPoc?: string;
    submittingTo?: string;
    status: string;
    createdAt: string;
    owner: { id: string; name: string };
  },
>(items: T[], query: ReportSearchQuery): T[] {
  return items.filter((r) => {
    if (query.jobId) {
      const jid = query.jobId.toLowerCase();
      const matches =
        r.id.toLowerCase().includes(jid) ||
        String(r.requirementId ?? '')
          .toLowerCase()
          .includes(jid);
      if (!matches) return false;
    }
    if (query.clientName) {
      const needle = query.clientName.toLowerCase();
      const hay = `${r.submittingTo ?? ''} ${r.clientLeadPoc ?? ''}`.trim().toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    if (query.poc && !(r.clientPoc ?? '').toLowerCase().includes(query.poc.toLowerCase())) return false;
    if (query.recruiterId && !recruiterOwnsRequirement(r as any, query.recruiterId)) return false;
    if (query.recruiterName && !r.owner.name.toLowerCase().includes(query.recruiterName.toLowerCase())) return false;
    if (query.status && getDashboardStatus(r as any) !== query.status && r.status !== query.status)
      return false;
    if (query.startDate) {
      const created = r.createdAt.slice(0, 10);
      if (created < query.startDate) return false;
    }
    if (query.endDate) {
      const created = r.createdAt.slice(0, 10);
      if (created > query.endDate) return false;
    }
    return true;
  });
}
