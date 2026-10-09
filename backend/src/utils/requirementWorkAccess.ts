import type { PrismaClient } from '@prisma/client';

export const UNASSIGNED_REQUIREMENT_WORK_MESSAGE =
  'This requirement is not assigned. Candidates cannot be added or submitted until it is assigned.';

export const USER_NOT_ASSIGNED_WORK_MESSAGE =
  'You are not assigned to this requirement. Candidates cannot be added or submitted.';

export class RequirementWorkAccessError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 403) {
    super(message);
    this.statusCode = statusCode;
  }
}

export async function assertUserCanWorkOnRequirement(
  prisma: PrismaClient,
  requirementId: string,
  userId: string,
): Promise<{ id: string }> {
  const requirement = await prisma.requirement.findFirst({
    where: {
      OR: [{ id: requirementId }, { requirementId }],
      isDeleted: false,
    },
    select: {
      id: true,
      assignment: true,
      assignments: {
        where: { status: 'ACTIVE' },
        select: { recruiterId: true },
      },
    },
  });

  if (!requirement) {
    throw new RequirementWorkAccessError('Requirement not found', 404);
  }

  const hasActiveAssignment = requirement.assignments.length > 0;
  const isAllocated = requirement.assignment === 'ASSIGNED' || hasActiveAssignment;
  if (!isAllocated) {
    throw new RequirementWorkAccessError(UNASSIGNED_REQUIREMENT_WORK_MESSAGE, 403);
  }

  const isUserAssigned = requirement.assignments.some((row) => row.recruiterId === userId);
  if (!isUserAssigned) {
    throw new RequirementWorkAccessError(USER_NOT_ASSIGNED_WORK_MESSAGE, 403);
  }

  return { id: requirement.id };
}
