import type { Requirement, RequirementAssignment, RequirementStatus } from './types';

export function normalizeRequirementAssignment(raw: unknown): RequirementAssignment {
  const s = String(raw ?? '').trim().toUpperCase();
  return s === 'ASSIGNED' || s === 'ASSIGN' ? 'Assigned' : 'Unassigned';
}

export function normalizeRequirementStatus(raw: unknown): RequirementStatus {
  const map: Record<string, RequirementStatus> = {
    OPEN: 'Open',
    ASSIGNED: 'Assigned',
    SUBMITTED: 'Submitted',
    INTERVIEW: 'Interview',
    SELECTED: 'Selected',
    REJECTED: 'Rejected',
    CLOSED: 'Closed',
  };
  const key = String(raw ?? 'OPEN').trim().toUpperCase();
  return map[key] ?? 'Open';
}

/** True when a recruiter is actively assigned (DB assignment row or assignment field). */
export function isRequirementAllocated(r: Requirement): boolean {
  if (normalizeRequirementAssignment(r.assignment) === 'Assigned') return true;
  const activeId = (r as Requirement & { activeAssigneeId?: string | null }).activeAssigneeId;
  return typeof activeId === 'string' && activeId.trim().length > 0;
}

export function recruiterOwnsRequirement(r: Requirement, recruiterId: string): boolean {
  const id = recruiterId.trim();
  if (!id) return false;
  const assigneeIds = (r as Requirement & { activeAssigneeIds?: string[] }).activeAssigneeIds;
  if (assigneeIds?.some((aid) => aid?.trim() === id)) return true;
  if (r.assignedRecruiters?.some((rec) => rec.id?.trim() === id)) return true;
  const activeId = (r as Requirement & { activeAssigneeId?: string | null }).activeAssigneeId;
  if (activeId?.trim() === id) return true;
  const primaryId = (r as Requirement & { primaryOwnerId?: string | null }).primaryOwnerId;
  if (primaryId?.trim() === id) return true;
  if (r.owner?.id?.trim() === id) return true;
  return false;
}

export type DashboardFilter =
  | 'All'
  | 'Unassigned'
  | 'Assigned'
  | 'Submitted'
  | 'Submitted to Lead'
  | 'Submitted to Client'
  | 'Interview'
  | 'Selected'
  | 'Rejected'
  | 'Closed';

/** Valid dashboard filter values (includes All). */
export const DASHBOARD_FILTER_OPTIONS: DashboardFilter[] = [
  'All',
  'Unassigned',
  'Assigned',
  'Submitted',
  'Submitted to Lead',
  'Submitted to Client',
  'Interview',
  'Selected',
  'Rejected',
  'Closed',
];

const sortOrder: DashboardFilter[] = [
  'Unassigned',
  'Assigned',
  'Submitted',
  'Interview',
  'Selected',
  'Rejected',
  'Closed',
  'All',
];

export function getDashboardStatus(r: Requirement): DashboardFilter {
  if (!isRequirementAllocated(r)) return 'Unassigned';

  const raw = typeof r.status === 'string' ? r.status.trim() : '';
  const direct = DASHBOARD_FILTER_OPTIONS.find(
    (f) => f !== 'All' && f.toLowerCase() === raw.toLowerCase(),
  );
  if (direct) return direct;

  const statusNorm = raw.toUpperCase();
  const statusMap: Record<string, DashboardFilter> = {
    OPEN: 'Assigned',
    ASSIGNED: 'Assigned',
    SUBMITTED: 'Submitted',
    INTERVIEW: 'Interview',
    SELECTED: 'Selected',
    REJECTED: 'Rejected',
    CLOSED: 'Closed',
    UNASSIGNED: 'Unassigned',
  };

  return statusMap[statusNorm] ?? 'Assigned';
}

/** Parse `?status=` query (case-insensitive; supports All / all / all statuses). */
export function parseDashboardFilterFromQuery(
  status: string | null | undefined,
  recruiterId?: string | null,
): DashboardFilter {
  const raw = String(status ?? '').trim();
  if (!raw) {
    return recruiterId?.trim() ? 'All' : 'Unassigned';
  }
  const lowered = raw.toLowerCase();
  if (lowered === 'all' || lowered === 'all statuses') return 'All';
  const match = DASHBOARD_FILTER_OPTIONS.find((f) => f.toLowerCase() === lowered);
  return match ?? 'Unassigned';
}

type RequirementIdSortKey = { date: string; serial: number; raw: string };

function parseRequirementIdSortKey(r: Requirement): RequirementIdSortKey {
  const raw = String(r.requirementId ?? r.id ?? '').trim();
  const m = raw.match(/^REQ-(\d{4}-\d{2}-\d{2})-(\d{3})$/i);
  if (m) {
    return { date: m[1], serial: Number.parseInt(m[2], 10), raw };
  }
  return { date: '', serial: 0, raw };
}

/**
 * Table order: newest calendar day first, then REQ serial ascending (001, 002, 003…).
 */
export function compareRequirementsByRequirementId(a: Requirement, b: Requirement): number {
  const ka = parseRequirementIdSortKey(a);
  const kb = parseRequirementIdSortKey(b);
  if (ka.date && kb.date && ka.date !== kb.date) {
    return kb.date.localeCompare(ka.date);
  }
  if (ka.serial !== kb.serial) {
    return ka.serial - kb.serial;
  }
  if (ka.raw && kb.raw) return ka.raw.localeCompare(kb.raw);
  return compareRequirementsByCreatedAtDesc(a, b);
}

/**
 * My Work → Assigned: per-recruiter open assignment.
 * Stays visible until this recruiter submits, is unassigned, or the requirement closes.
 */
export function isRecruiterMyWorkAssignedRequirement(
  r: Requirement,
  recruiterSubmittedRequirementIds: ReadonlySet<string>,
): boolean {
  if (!isRequirementAllocated(r)) return false;
  if (getDashboardStatus(r) === 'Closed') return false;
  if (recruiterSubmittedRequirementIds.has(r.id)) return false;
  return true;
}

export function compareRequirementsForDashboard(a: Requirement, b: Requirement) {
  const sa = getDashboardStatus(a);
  const sb = getDashboardStatus(b);
  const oa = sortOrder.indexOf(sa);
  const ob = sortOrder.indexOf(sb);
  if (oa !== ob) return oa - ob;

  // tie-breaker: oldest first for higher visibility
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

function assignedSortTimestamp(r: Requirement): number {
  if (r.assignedOn) {
    const t = new Date(r.assignedOn).getTime();
    if (Number.isFinite(t)) return t;
  }
  if (isRequirementAllocated(r) && r.updatedAt) {
    const t = new Date(r.updatedAt).getTime();
    if (Number.isFinite(t)) return t;
  }
  return NaN;
}

/** Newest `createdAt` first; used as default table order and Assigned-filter tiebreaker. */
export function compareRequirementsByCreatedAtDesc(a: Requirement, b: Requirement): number {
  const ta = new Date(a.createdAt).getTime();
  const tb = new Date(b.createdAt).getTime();
  const aOk = Number.isFinite(ta);
  const bOk = Number.isFinite(tb);
  if (aOk && bOk && ta !== tb) return tb - ta;
  if (!aOk && !bOk) return 0;
  if (!aOk) return 1;
  if (!bOk) return -1;
  return String(b.requirementId || b.id).localeCompare(String(a.requirementId || a.id));
}

/** Default table order: REQ-YYYY-MM-DD-NNN ascending within each day (001, 002, 003…). */
export function sortRequirementsForTable(
  rows: Requirement[],
  filter: DashboardFilter,
): Requirement[] {
  const sorted = [...rows];
  if (filter === 'Assigned') {
    sorted.sort((a, b) => {
      const ta = assignedSortTimestamp(a);
      const tb = assignedSortTimestamp(b);
      const aOk = Number.isFinite(ta);
      const bOk = Number.isFinite(tb);
      if (aOk && bOk && ta !== tb) return tb - ta;
      if (aOk && !bOk) return -1;
      if (!aOk && bOk) return 1;
      return compareRequirementsByRequirementId(a, b);
    });
    return sorted;
  }
  sorted.sort(compareRequirementsByRequirementId);
  return sorted;
}

export function filterRequirementsForDashboard(reqs: Requirement[], filter: DashboardFilter) {
  if (filter === 'All') return reqs;
  if (filter === 'Unassigned') {
    return reqs.filter((r) => getDashboardStatus(r) === 'Unassigned');
  }
  return reqs.filter((r) => getDashboardStatus(r) === filter);
}

export function getSlaOverdue(r: Requirement, slaDays = 7) {
  const status = getDashboardStatus(r);
  if (status === 'Closed' || status === 'Selected' || status === 'Rejected') return false;
  const daysOpen = getOpenDays(r);
  return daysOpen > slaDays;
}

export function getOpenDays(r: Requirement) {
  const created = new Date(r.createdAt).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - created);
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

const REQ_ID_REGEX = /^REQ-\d{4}-\d{2}-\d{2}-\d{3}$/;

function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function resolveRequirementBusinessId(r: Requirement): string {
  return (r.requirementId ?? r.id ?? '').trim();
}

/** Returns the next 3-digit serial for requirements on the given calendar day (YYYY-MM-DD). */
export function getNextRequirementSerial(
  existing: Requirement[],
  dateYmd?: string,
): number {
  const datePart =
    dateYmd?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(dateYmd.trim())
      ? dateYmd.trim()
      : formatLocalYmd(new Date());
  const prefix = `REQ-${datePart}-`;
  let maxSerial = 0;

  for (const r of existing) {
    const rid = resolveRequirementBusinessId(r);
    if (!rid.startsWith(prefix)) continue;
    const match = rid.match(/-(\d{3})$/);
    if (match) {
      const n = Number.parseInt(match[1], 10);
      if (Number.isFinite(n)) maxSerial = Math.max(maxSerial, n);
    }
  }

  return maxSerial + 1;
}

export function nextRequirementId(existing: Requirement[], dateYmd?: string): string {
  const datePart =
    dateYmd?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(dateYmd.trim())
      ? dateYmd.trim()
      : formatLocalYmd(new Date());
  const serial = getNextRequirementSerial(existing, datePart);
  return `REQ-${datePart}-${String(serial).padStart(3, '0')}`;
}

export { REQ_ID_REGEX };

/** Link target for requirement overview — accepts internal id or public REQ code. */
export function requirementDetailHref(req: {
  id?: string | null;
  requirementId?: string | null;
}): string {
  const routeId = (req.id ?? req.requirementId ?? '').trim();
  return routeId ? `/requirements/${encodeURIComponent(routeId)}` : '/requirements';
}

export function normalizeStatusForStore(status: RequirementStatus) {
  // keep as-is for store; dashboard buckets Open under Assigned
  return status;
}
