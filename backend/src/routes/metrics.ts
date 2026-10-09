import { Router, Response } from 'express';
import { asyncHandler } from '@/middleware/errorHandler';
import { authenticate, authorize } from '@/middleware/auth';
import { AuthenticatedRequest } from '@/types';
import { ResponseHelper } from '@/utils/response';
import {
  getInterviewCardMetrics,
  getMyWorkMetrics,
  getRequirementsDashboardMetrics,
  getTeamPerformanceMetrics,
  getTeamTaskSubmissionMetrics,
  getRequirementWidgetMetrics,
} from '@/services/cardMetrics';

const router = Router();

/**
 * @route GET /api/metrics/cards
 * @query scopes — comma-separated: myWork, team, teamTasks, requirements, interviews, requirement
 * @query recruiterId — optional override for myWork / interviews (admins/leads)
 * @query requirementId — required when scope includes requirement (detail page widgets)
 */
router.get(
  '/cards',
  authenticate,
  authorize('ADMIN', 'RECRUITER', 'LEAD'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const scopesRaw = typeof req.query.scopes === 'string' ? req.query.scopes : 'myWork';
    const scopes = new Set(
      scopesRaw
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    );

    const qRecruiterId =
      typeof req.query.recruiterId === 'string' ? req.query.recruiterId.trim() : '';
    const userId = req.user?.id ?? '';
    const recruiterId =
      qRecruiterId ||
      (req.user?.role === 'RECRUITER' ? userId : userId);

    const payload: Record<string, unknown> = {};

    if (scopes.has('mywork') && recruiterId) {
      payload.myWork = await getMyWorkMetrics(recruiterId);
    }

    if (scopes.has('team')) {
      payload.team = await getTeamPerformanceMetrics();
    }

    if (scopes.has('teamtasks')) {
      payload.teamTasks = await getTeamTaskSubmissionMetrics();
    }

    if (scopes.has('requirements')) {
      payload.requirements = await getRequirementsDashboardMetrics();
    }

    if (scopes.has('interviews')) {
      const interviewRecruiterId =
        qRecruiterId || (req.user?.role === 'RECRUITER' ? userId : undefined);
      payload.interviews = await getInterviewCardMetrics(interviewRecruiterId || undefined);
    }

    if (scopes.has('requirement')) {
      const qRequirementId =
        typeof req.query.requirementId === 'string' ? req.query.requirementId.trim() : '';
      if (!qRequirementId) {
        return ResponseHelper.error(res, 'requirementId is required for requirement scope', 400);
      }
      const requirement = await getRequirementWidgetMetrics(qRequirementId);
      if (!requirement) {
        return ResponseHelper.error(res, 'Requirement not found', 404);
      }
      payload.requirement = requirement;
    }

    return ResponseHelper.success(res, 'Card metrics retrieved', payload);
  }),
);

export default router;
