import type { Requirement } from './types';
import { isRequirementAllocated, recruiterOwnsRequirement } from './logic';

export const UNASSIGNED_REQUIREMENT_WORK_MESSAGE =
  'This requirement is not assigned. Candidates cannot be added or submitted until it is assigned.';

export const USER_NOT_ASSIGNED_WORK_MESSAGE =
  'You are not assigned to this requirement. Candidates cannot be added or submitted.';

export function getRequirementWorkBlockReason(
  requirement: Requirement | null | undefined,
  userId: string | null | undefined,
  options?: { activeAssigneeIds?: ReadonlySet<string> },
): string | null {
  if (!requirement) return null;

  const allocated =
    isRequirementAllocated(requirement) ||
    Boolean(options?.activeAssigneeIds && options.activeAssigneeIds.size > 0);
  if (!allocated) return UNASSIGNED_REQUIREMENT_WORK_MESSAGE;

  const id = userId?.trim();
  if (!id) return USER_NOT_ASSIGNED_WORK_MESSAGE;
  if (options?.activeAssigneeIds?.has(id)) return null;
  if (recruiterOwnsRequirement(requirement, id)) return null;

  return USER_NOT_ASSIGNED_WORK_MESSAGE;
}

export function canUserWorkOnRequirement(
  requirement: Requirement | null | undefined,
  userId: string | null | undefined,
  options?: { activeAssigneeIds?: ReadonlySet<string> },
): boolean {
  if (!requirement) return false;
  return getRequirementWorkBlockReason(requirement, userId, options) === null;
}
