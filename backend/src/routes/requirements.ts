import { Router, Request, Response } from 'express';
import { ResponseHelper } from '@/utils/response';
import { validate, ValidationRules } from '@/utils/validation';
import { asyncHandler } from '@/middleware/errorHandler';
import { authenticate, authorize } from '@/middleware/auth';
import { AuthenticatedRequest } from '@/types';

import { prisma } from '@/lib/prisma';
const router = Router();

/** Generate a unique public requirement id like REQ-YYYY-MM-DD-XXX. */
async function generateUniqueRequirementId(): Promise<string> {
  const maxAttempts = 10;
  for (let i = 0; i < maxAttempts; i += 1) {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const randomSuffix = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');
    const candidate = `REQ-${dateStr}-${randomSuffix}`;
    const existing = await prisma.requirement.findUnique({
      where: { requirementId: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  throw new Error('Could not generate a unique requirementId after several attempts.');
}

/**
 * @route   GET /api/requirements
 * @desc    Get all requirements
 * @access  Private
 */
router.get('/', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const skip = (page - 1) * limit;

  const [requirements, total] = await Promise.all([
    prisma.requirement.findMany({
      where: { 
        isDeleted: false
      },
      include: {
        assignments: {
          include: {
            recruiter: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              }
            }
          }
        },
        _count: {
          select: {
            assignments: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit
    }),
    prisma.requirement.count({
      where: { 
        isDeleted: false
      }
    })
  ]);

  ResponseHelper.success(res, 'Requirements retrieved successfully', {
    requirements,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  });
}));

/**
 * @route   POST /api/requirements
 * @desc    Create a new requirement
 * @access  Private
 */
router.post('/', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const requirementData = req.body;

  // Determine requirementId, ensuring uniqueness.
  const requestedRequirementId =
    (typeof requirementData.requirementId === 'string' && requirementData.requirementId.trim()) ||
    (typeof requirementData.jobId === 'string' && requirementData.jobId.trim()) ||
    '';

  let requirementId: string;
  if (requestedRequirementId) {
    const existing = await prisma.requirement.findUnique({
      where: { requirementId: requestedRequirementId },
      select: { id: true },
    });
    if (existing) {
      return ResponseHelper.error(
        res,
        `Requirement ID "${requestedRequirementId}" already exists. Please choose a different Requirement ID or leave it blank to auto-generate.`,
        400,
      );
    }
    requirementId = requestedRequirementId;
  } else {
    requirementId = await generateUniqueRequirementId();
  }

  // Create requirement - NO VALIDATION RESTRICTIONS
  try {
    const requirement = await prisma.requirement.create({
      data: {
      requirementId,
      clientId: requirementData.clientId || (await prisma.client.findFirst())?.id || 'default-client-id',
      clientLeadPoc: requirementData.clientLeadPoc || '',
      clientPoc: requirementData.clientPoc || '',
      roleTitle: requirementData.roleTitle || '',
      location: requirementData.location || '',
      experience: requirementData.experience || '',
      experienceLevel: requirementData.experienceLevel || '',
      employmentType: requirementData.employmentType || '',
      workMode: requirementData.workMode || '',
      overallBudget: requirementData.overallBudget != null && String(requirementData.overallBudget).trim() !== ''
        ? parseFloat(String(requirementData.overallBudget).replace(/,/g, ''))
        : null,
      budgetCurrency:
        typeof requirementData.budgetCurrency === 'string' && /^[A-Za-z]{3}$/.test(requirementData.budgetCurrency.trim())
          ? requirementData.budgetCurrency.trim().toUpperCase()
          : 'INR',
      yearlyBudget: (() => {
        const emp = String(requirementData.employmentType ?? '').toLowerCase();
        const isContract = emp === 'contract';
        const ob =
          requirementData.overallBudget != null && String(requirementData.overallBudget).trim() !== ''
            ? parseFloat(String(requirementData.overallBudget).replace(/,/g, ''))
            : null;
        if (ob == null || !Number.isFinite(ob)) return null;
        return !isContract ? ob : null;
      })(),
      monthlyBudget: (() => {
        const emp = String(requirementData.employmentType ?? '').toLowerCase();
        const isContract = emp === 'contract';
        const ob =
          requirementData.overallBudget != null && String(requirementData.overallBudget).trim() !== ''
            ? parseFloat(String(requirementData.overallBudget).replace(/,/g, ''))
            : null;
        if (ob == null || !Number.isFinite(ob)) return null;
        return isContract ? ob : null;
      })(),
      noticePeriod: requirementData.noticePeriod,
      skills: requirementData.skills || [],
      technologies: requirementData.technologies || [],
      priority: requirementData.priority || 'MEDIUM',
      openPositions: requirementData.openPositions ? parseInt(requirementData.openPositions) : null,
      submittingTo: requirementData.submittingTo,
      status: 'OPEN',
      assignment: 'UNASSIGNED',
      requirementCreatorName:
        `${req.user!.firstName ?? ''} ${req.user!.lastName ?? ''}`.trim() || req.user!.email,
      assignedToRecruiterName: null,
      assignmentAssignerName: null,
      submissionsCount: 0,
      isDeleted: false,
      },
      include: {
      assignments: {
        include: {
          recruiter: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            }
          }
        }
      },
      _count: {
        select: {
          assignments: true
        }
      }
    });

    ResponseHelper.created(res, 'Requirement created successfully', requirement);
  } catch (error: any) {
    const msg = String(error?.message || 'Unknown error');
    if (error?.code === 'P2002' && Array.isArray(error?.meta?.target) && error.meta.target.includes('requirement_id')) {
      return ResponseHelper.error(
        res,
        'A requirement with this Requirement ID already exists. Please use a different Requirement ID.',
        400,
      );
    }
    ResponseHelper.error(res, `Error: ${msg}`, 500);
  }
}));

/**
 * @route   GET /api/requirements/:id
 * @desc    Get requirement by ID
 * @access  Private
 */
router.get('/:id', authenticate, validate(ValidationRules.idParam), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  const requirement = await prisma.requirement.findFirst({
    where: { 
      id,
      isDeleted: false
    },
    include: {
      assignments: {
        include: {
          recruiter: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            }
          }
        }
      },
      _count: {
        select: {
          assignments: true
        }
      }
    }
  });

  if (!requirement) {
    return ResponseHelper.error(res, 'Requirement not found', 404);
  }

  ResponseHelper.success(res, 'Requirement retrieved successfully', requirement);
}));

/**
 * @route   PUT /api/requirements/:id
 * @desc    Update requirement
 * @access  Private
 */
router.put('/:id', authenticate, validate(ValidationRules.idParam), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const updateData = req.body;

  const requirement = await prisma.requirement.update({
    where: { 
      id,
    },
    data: {
      ...updateData,
      updatedAt: new Date(),
    },
    include: {
      assignments: {
        include: {
          recruiter: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            }
          }
        }
      },
      _count: {
        select: {
          assignments: true
        }
      }
    }
  });

  ResponseHelper.success(res, 'Requirement updated successfully', requirement);
}));

/**
 * @route   DELETE /api/requirements/:id
 * @desc    Delete requirement (soft delete)
 * @access  Private
 */
router.delete('/:id', authenticate, validate(ValidationRules.idParam), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  await prisma.requirement.update({
    where: { 
      id,
    },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
    }
  });

  ResponseHelper.success(res, 'Requirement deleted successfully');
}));

export default router;
