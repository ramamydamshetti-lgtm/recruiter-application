import type { RequirementAssignmentRow } from '@/lib/api/requirements';
import type { Requirement } from './types';

export type RevokeAssignmentTarget = {
  requirementInternalId: string;
  requirementId: string;
  roleTitle: string;
  assignmentId: string;
  recruiterId: string;
  recruiterName: string;
  recruiterEmail: string;
};

export function revokeTargetKey(target: Pick<RevokeAssignmentTarget, 'requirementInternalId' | 'recruiterId'>): string {
  return `${target.requirementInternalId}:${target.recruiterId}`;
}

export function getAssignedRecruitersFromRequirement(
  requirement: Requirement,
): Array<{ id: string; name: string; email: string; title: string }> {
  if (requirement.assignedRecruiters?.length) {
    return requirement.assignedRecruiters.filter((r) => r.id?.trim() || r.email?.trim() || r.name?.trim());
  }
  if (requirement.owner?.id?.trim() || requirement.owner?.name?.trim()) {
    return [requirement.owner];
  }
  return [];
}

export function buildRevokeTargetsFromAssignmentRows(
  requirement: Requirement,
  rows: RequirementAssignmentRow[],
): RevokeAssignmentTarget[] {
  const seenRecruiters = new Set<string>();
  const targets: RevokeAssignmentTarget[] = [];
  for (const row of rows) {
    if (row.status !== 'ACTIVE') continue;
    const recruiterId = row.recruiterId?.trim();
    const assignmentId = row.id?.trim();
    if (!recruiterId || !assignmentId) continue;
    if (seenRecruiters.has(recruiterId)) continue;
    seenRecruiters.add(recruiterId);
    targets.push({
      requirementInternalId: requirement.id,
      requirementId: requirement.requirementId ?? requirement.id,
      roleTitle: requirement.roleTitle || 'Requirement',
      assignmentId,
      recruiterId,
      recruiterName: row.recruiterName || row.recruiterEmail || 'Recruiter',
      recruiterEmail: row.recruiterEmail || '',
    });
  }
  return targets;
}

/** Fallback when assignment rows are unavailable (uses cached requirement payload). */
export function buildRevokeTargets(requirements: Requirement[]): RevokeAssignmentTarget[] {
  const targets: RevokeAssignmentTarget[] = [];
  for (const req of requirements) {
    const recruiters = getAssignedRecruitersFromRequirement(req);
    for (const recruiter of recruiters) {
      if (!recruiter.id?.trim()) continue;
      targets.push({
        requirementInternalId: req.id,
        requirementId: req.requirementId ?? req.id,
        roleTitle: req.roleTitle || 'Requirement',
        assignmentId: '',
        recruiterId: recruiter.id,
        recruiterName: recruiter.name || recruiter.email || 'Recruiter',
        recruiterEmail: recruiter.email || '',
      });
    }
  }
  return targets;
}

/** True when every requirement has exactly one assignee — no picker needed. */
export function canRevokeWithoutPicker(targets: RevokeAssignmentTarget[]): boolean {
  if (targets.length === 0) return false;
  const counts = new Map<string, number>();
  for (const target of targets) {
    counts.set(
      target.requirementInternalId,
      (counts.get(target.requirementInternalId) ?? 0) + 1,
    );
  }
  return [...counts.values()].every((count) => count === 1);
}

export function groupRevokeTargetsByRequirement(
  targets: RevokeAssignmentTarget[],
): Array<{ requirementId: string; roleTitle: string; recruiters: RevokeAssignmentTarget[] }> {
  const groups = new Map<
    string,
    { requirementId: string; roleTitle: string; recruiters: RevokeAssignmentTarget[] }
  >();
  for (const target of targets) {
    const existing = groups.get(target.requirementInternalId);
    if (existing) {
      existing.recruiters.push(target);
      continue;
    }
    groups.set(target.requirementInternalId, {
      requirementId: target.requirementId,
      roleTitle: target.roleTitle,
      recruiters: [target],
    });
  }
  return [...groups.values()];
}
