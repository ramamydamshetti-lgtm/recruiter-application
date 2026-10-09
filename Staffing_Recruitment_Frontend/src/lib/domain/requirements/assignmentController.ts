/**
 * Assignment controller: resolves who gets assigned from form state.
 * Keeps assignment decision logic in one place for workflow engine integration.
 */
import type { Recruiter } from './types';

export type AssignmentFormInput = {
  actionNeeded: 'Lead' | 'Recruiter';
  assignmentMode?: 'auto_assign' | 'assign_to_recruiters';
  assignedRecruiterIds: string[];
};

export type ResolvedAssignment = {
  /** Single owner for the requirement (primary assignee). */
  ownerId: string;
  /** All assigned recruiter IDs (for multi-assign or future use). */
  assignedRecruiterIds: string[];
  /** How assignment was determined (for audit/workflow). */
  source: 'self_assign' | 'auto_assign' | 'manual_assign';
};

/**
 * Resolves assignment from create-requirement form values.
 * - Recruiter: self-assign to logged-in user only.
 * - Lead + Auto Assign: placeholder for workload-based assignment (returns first recruiter for now).
 * - Lead + Assign to Recruiter(s): use selected recruiter IDs; primary owner is first selected.
 */
export function resolveAssignment(
  input: AssignmentFormInput,
  recruiters: Recruiter[],
  currentUserId: string,
): ResolvedAssignment {
  if (input.actionNeeded === 'Recruiter') {
    return {
      ownerId: currentUserId,
      assignedRecruiterIds: [currentUserId],
      source: 'self_assign',
    };
  }

  if (input.actionNeeded === 'Lead' && input.assignmentMode === 'auto_assign') {
    const assigned = selectRecruiterByWorkload(recruiters);
    return {
      ownerId: assigned.id,
      assignedRecruiterIds: [assigned.id],
      source: 'auto_assign',
    };
  }

  // Lead + assign_to_recruiters (or fallback)
  const ids = input.assignedRecruiterIds.length > 0
    ? input.assignedRecruiterIds
    : [];
  const ownerId = ids[0] ?? currentUserId;
  return {
    ownerId,
    assignedRecruiterIds: ids,
    source: 'manual_assign',
  };
}

/**
 * Placeholder: workload-based auto-assignment.
 * Replace with real logic (e.g. API call, workload table) when integrating workflow engine.
 */
function selectRecruiterByWorkload(recruiters: Recruiter[]): Recruiter {
  // Exclude leads from auto-assign pool; pick first recruiter by title.
  const pool = recruiters.filter(
    (r) => !r.title.toLowerCase().includes('lead'),
  );
  if (pool.length === 0) return recruiters[0]!;
  return pool[0]!;
}
