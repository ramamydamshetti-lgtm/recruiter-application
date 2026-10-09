import { Router, Request, Response } from 'express';
import { Prisma, PrismaClient, type RequirementStatus, type RequirementAssignmentStatus } from '@prisma/client';
import { ResponseHelper } from '@/utils/response';
import { asyncHandler } from '@/middleware/errorHandler';
import { authenticate } from '@/middleware/auth';
import { logRequirementActivity } from '@/services/requirementActivityLog';
import { fetchRequirementEmailThreadParticipants } from '@/lib/requirementEmailThread';
import { getRequirementCalendarTz, zonedCalendarDayRangeForInstant } from '@/lib/requirementCalendar';
import { assertUserCanWorkOnRequirement, RequirementWorkAccessError } from '@/utils/requirementWorkAccess';

const router = Router();
import { prisma } from '@/lib/prisma';
const prismaAny = prisma as any;

/** Resolve by internal id or public code (REQ-…). Read paths include soft-deleted rows. */
async function findRequirementByRouteId(
  routeId: string,
  options?: { includeDeleted?: boolean },
) {
  const trimmed = routeId.trim();
  if (!trimmed) return null;

  const base: Prisma.RequirementWhereInput = {
    OR: [
      { id: trimmed },
      { requirementId: trimmed },
      { requirementId: { equals: trimmed, mode: 'insensitive' } },
    ],
  };
  if (!options?.includeDeleted) {
    base.isDeleted = false;
  }
  return prisma.requirement.findFirst({ where: base });
}

/** Activity rows returned by GET /:id/activity (includes actor for display). */
type RequirementActivityWithActor = Prisma.RequirementActivityGetPayload<{
  include: {
    actor: { select: { id: true; email: true; firstName: true; lastName: true } };
  };
}>;

/** Create New Job Demand sends title-case labels; DB uses enums. */
function parseUiRequirementStatus(raw: unknown): RequirementStatus {
  const s = String(raw ?? 'Open').trim();
  const map: Record<string, RequirementStatus> = {
    Open: 'OPEN',
    Assigned: 'ASSIGNED',
    Submitted: 'SUBMITTED',
    Interview: 'INTERVIEW',
    Selected: 'SELECTED',
    Rejected: 'REJECTED',
    Closed: 'CLOSED',
    OPEN: 'OPEN',
    ASSIGNED: 'ASSIGNED',
    SUBMITTED: 'SUBMITTED',
    INTERVIEW: 'INTERVIEW',
    SELECTED: 'SELECTED',
    REJECTED: 'REJECTED',
    CLOSED: 'CLOSED',
  };
  return map[s] ?? 'OPEN';
}

function parseUiAssignment(raw: unknown): RequirementAssignmentStatus {
  const s = String(raw ?? 'Unassigned').trim().toUpperCase();
  if (s === 'ASSIGNED') return 'ASSIGNED';
  return 'UNASSIGNED';
}

function parseOptionalDateOnly(raw: unknown): Date | null {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  if (!s) return null;
  const d = new Date(s.length <= 10 ? `${s}T12:00:00.000Z` : s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Parse a plain numeric budget in currency units (allows commas); rejects non-numeric junk. */
function parseOverallBudget(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const s = String(raw).trim().replace(/,/g, '');
  if (!s) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function normalizeBudgetCurrency(raw: unknown): string {
  const s = String(raw ?? 'INR')
    .trim()
    .toUpperCase()
    .slice(0, 3);
  if (/^[A-Z]{3}$/.test(s)) return s;
  return 'INR';
}

function normalizeEmploymentType(raw: unknown): 'Full-time' | 'Contract' | null {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;
  if (s === 'full-time' || s === 'full time' || s === 'fulltime') return 'Full-time';
  if (s === 'contract') return 'Contract';
  return null;
}

/** Generate a unique public requirement id like REQ-YYYY-MM-DD-XXX. */
async function generateUniqueRequirementIdForToday(): Promise<string> {
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

async function resolveClientId(input: any): Promise<string> {
  // If frontend sends a specific clientId, validate it exists.
  const requestedClientId =
    typeof input?.clientId === 'string' ? input.clientId.trim() : '';
  if (requestedClientId) {
    const client = await prisma.client.findUnique({
      where: { id: requestedClientId },
      select: { id: true },
    });
    if (!client) {
      throw new Error(`Invalid clientId: ${requestedClientId}`);
    }
    return client.id;
  }

  throw new Error('clientId is required');
}

async function resolveOrCreateClientIdFromInput(input: any): Promise<string> {
  // Preferred: explicit clientId.
  const explicit = typeof input?.clientId === 'string' ? input.clientId.trim() : '';
  if (explicit) return resolveClientId({ clientId: explicit });

  // Fallback: a client name from UI (supports multiple field names used across screens/JD extraction).
  const rawName =
    (typeof input?.clientName === 'string' && input.clientName.trim()) ||
    (typeof input?.client === 'string' && input.client.trim()) ||
    // "Requirement From" (when custom) is typically the actual company/client name.
    (typeof input?.submittingToCustom === 'string' && input.submittingToCustom.trim()) ||
    // As a last fallback some screens put company name into clientLeadPoc.
    (typeof input?.clientLeadPoc === 'string' && input.clientLeadPoc.trim()) ||
    '';
  const name = rawName.trim();
  if (!name) throw new Error('clientId (or clientName) is required');

  const existing = await prisma.client.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
    select: { id: true },
  });
  if (existing) return existing.id;

  // Create a minimal client record. It can be edited later from the Clients screen.
  const pocName = typeof input?.pocName === 'string' && input.pocName.trim() ? input.pocName.trim() : 'System';
  const pocEmail =
    typeof input?.pocEmail === 'string' && input.pocEmail.trim()
      ? input.pocEmail.trim()
      : 'default.client@metaforgeit.com';

  const created = await prisma.client.create({
    data: {
      // clientCode is optional; can be added later.
      name,
      pocName,
      pocEmail,
      pocPhone: null,
      industry: null,
      location: null,
      isActive: true,
    },
    select: { id: true },
  });
  return created.id;
}

type FrontendRecruiter = {
  id: string;
  name: string;
  email: string;
  title: string;
};

function emptyOwner(): FrontendRecruiter {
  return { id: '', name: '', email: '', title: '' };
}

function recruiterShapeFromName(name: string): FrontendRecruiter {
  const n = name.trim();
  return { id: '', name: n, email: '', title: 'Recruiter' };
}

function recruiterShapeFromUser(user: {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role?: string | null;
}): FrontendRecruiter {
  const name =
    [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email || user.id;
  return {
    id: user.id,
    name,
    email: user.email,
    title: user.role ? String(user.role) : 'Recruiter',
  };
}

function toUiAssignment(raw: unknown): 'Assigned' | 'Unassigned' {
  const s = String(raw ?? '').trim().toUpperCase();
  return s === 'ASSIGNED' ? 'Assigned' : 'Unassigned';
}

function toUiStatus(raw: unknown): string {
  const map: Record<string, string> = {
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

async function getActiveAssigneeIds(requirementId: string): Promise<string[]> {
  const rows = await prisma.requirementAssignment.findMany({
    where: { requirementId, status: 'ACTIVE' },
    select: { recruiterId: true },
  });
  return rows.map((r) => r.recruiterId);
}

/** First active assignee (earliest assignedOn) — retains owner control when more recruiters are added. */
async function getPrimaryOwnerId(requirementId: string): Promise<string | null> {
  const first = await prisma.requirementAssignment.findFirst({
    where: { requirementId, status: 'ACTIVE' },
    orderBy: { assignedOn: 'asc' },
    select: { recruiterId: true },
  });
  return first?.recruiterId ?? null;
}

/** Any authenticated recruiter, lead, or admin may assign recruiters (including self) to a requirement. */
async function userMayAssignRecruiters(
  _requirementId: string,
  _userId: string,
  userRole?: string | null,
  _targetRecruiterId?: string | null,
): Promise<boolean> {
  const role = String(userRole ?? '').toUpperCase();
  return role === 'ADMIN' || role === 'LEAD' || role === 'RECRUITER';
}

/** Primary owner and all active assignees may edit requirement details. */
async function userMayEditRequirement(
  requirementId: string,
  userId: string,
  userRole?: string | null,
): Promise<boolean> {
  const role = String(userRole ?? '').toUpperCase();
  if (role === 'ADMIN' || role === 'LEAD') return true;
  const activeIds = await getActiveAssigneeIds(requirementId);
  if (activeIds.length === 0) return true;
  const primaryOwnerId = await getPrimaryOwnerId(requirementId);
  if (primaryOwnerId === userId) return true;
  return activeIds.includes(userId);
}

async function enrichRequirementsForFrontend(
  requirements: Array<any>,
): Promise<Array<any>> {
  const clientIds = new Set<string>();
  const requirementIds: string[] = [];
  for (const r of requirements) {
    if (r?.clientId) clientIds.add(r.clientId);
    if (typeof r?.id === 'string' && r.id) requirementIds.push(r.id);
  }

  const clients = clientIds.size
    ? await prisma.client.findMany({
        where: { id: { in: Array.from(clientIds) } },
        select: { id: true, clientCode: true, name: true },
      })
    : [];
  const clientMap = new Map<string, { clientCode: string | null; name: string }>(
    clients.map((c) => [c.id, { clientCode: c.clientCode ?? null, name: c.name }]),
  );

  const activeAssignments = requirementIds.length
    ? await prisma.requirementAssignment.findMany({
        where: { requirementId: { in: requirementIds }, status: 'ACTIVE' },
        orderBy: { assignedOn: 'desc' },
        include: {
          recruiter: {
            select: { id: true, email: true, firstName: true, lastName: true, role: true },
          },
        },
      })
    : [];

  const activeByRequirementId = new Map<string, (typeof activeAssignments)[number][]>();
  for (const row of activeAssignments) {
    const list = activeByRequirementId.get(row.requirementId) ?? [];
    list.push(row);
    activeByRequirementId.set(row.requirementId, list);
  }

  return requirements.map((r) => {
    const assignmentUi = toUiAssignment(r?.assignment);
    const statusUi = toUiStatus(r?.status);
    const creatorName = (r?.requirementCreatorName ?? '').trim();
    const assigneeName = (r?.assignedToRecruiterName ?? '').trim();
    const assignerName = (r?.assignmentAssignerName ?? '').trim();
    const activeList =
      typeof r?.id === 'string' ? activeByRequirementId.get(r.id) ?? [] : [];
    const activeSorted = [...activeList].sort(
      (a, b) => a.assignedOn.getTime() - b.assignedOn.getTime(),
    );

    if (assignmentUi === 'Unassigned' && activeSorted.length === 0) {
      return {
        ...r,
        status: statusUi,
        assignment: assignmentUi,
        owner: emptyOwner(),
        activeAssigneeId: null,
        assignedRecruiters: undefined,
        assignedBy: undefined,
        assignedOn: null,
        ownerName: creatorName,
        clientCode: r?.clientId ? clientMap.get(r.clientId)?.clientCode ?? null : null,
      };
    }

    const assignedRecruiters = activeSorted
      .map((row) => (row.recruiter ? recruiterShapeFromUser(row.recruiter) : null))
      .filter((rec): rec is FrontendRecruiter => !!rec && (!!rec.id || !!rec.name));

    const primary =
      assignedRecruiters[0] ??
      (assigneeName ? recruiterShapeFromName(assigneeName) : emptyOwner());
    const latestAssignedOn =
      activeSorted.length > 0
        ? activeSorted[activeSorted.length - 1]!.assignedOn.toISOString()
        : r?.updatedAt
          ? new Date(r.updatedAt).toISOString()
          : null;

    return {
      ...r,
      status: statusUi,
      assignment: 'Assigned',
      clientCode: r?.clientId ? clientMap.get(r.clientId)?.clientCode ?? null : null,
      owner: primary,
      primaryOwnerId: primary.id || null,
      activeAssigneeId: primary.id || null,
      activeAssigneeIds: activeSorted
        .map((row) => row.recruiterId)
        .filter((id): id is string => typeof id === 'string' && id.trim().length > 0),
      ownerName: primary.name || assigneeName || creatorName,
      assignedRecruiters: assignedRecruiters.length > 0 ? assignedRecruiters : undefined,
      assignedBy: assignerName || undefined,
      assignedOn: latestAssignedOn,
    };
  });
}

/**
 * @route   POST /api/requirements
 * @desc    Create a new requirement - SUPER SIMPLE NO VALIDATION
 * @access  Private
 */
router.post('/', authenticate, asyncHandler(async (req: Request, res: Response) => {
  try {
    console.log('🔍 DEBUG: Route hit!');
    console.log('🔍 DEBUG: Body:', req.body);
    
    const userId = (req as any).user?.id;
    const userName = (req as any).user
      ? `${(req as any).user.firstName ?? ''} ${(req as any).user.lastName ?? ''}`.trim() ||
        (req as any).user.email
      : '';
    const data = req.body;
    
    console.log('🔍 DEBUG: User ID:', userId);
    console.log('🔍 DEBUG: Received data:', JSON.stringify(data, null, 2));
    console.log('🔍 DEBUG: jobTitle:', data.jobTitle);
    console.log('🔍 DEBUG: locations:', data.locations);
    console.log('🔍 DEBUG: overallExperienceCustom:', data.overallExperienceCustom);
    console.log('🔍 DEBUG: employmentType:', data.employmentType);
    console.log('🔍 DEBUG: workMode:', data.workMode);
    console.log('🔍 DEBUG: overallBudget:', data.overallBudget);
    console.log('🔍 DEBUG: noticePeriod:', data.noticePeriod);
    console.log('🔍 DEBUG: Creating requirement...');

    let clientId: string;
    try {
      clientId = await resolveOrCreateClientIdFromInput(data);
    } catch (e) {
      return ResponseHelper.error(
        res,
        e instanceof Error ? e.message : 'clientId (or clientName) is required. Please select or create a client.',
        400,
      );
    }
    
    console.log('🔍 DEBUG: Frontend data received:', JSON.stringify(data, null, 2));
    
    console.log('🔍 DEBUG: Using clientId:', clientId);
    
    // Determine requirementId (public code like REQ-YYYY-MM-DD-XXX).
    const requestedRequirementId =
      (typeof data.requirementId === 'string' && data.requirementId.trim()) ||
      (typeof data.jobId === 'string' && data.jobId.trim()) ||
      (typeof data.id === 'string' && data.id.trim()) ||
      '';

    let requirementId: string;
    if (requestedRequirementId) {
      const existingByPublicId = await prisma.requirement.findUnique({
        where: { requirementId: requestedRequirementId },
        select: { id: true },
      });
      if (existingByPublicId) {
        return ResponseHelper.error(
          res,
          `Requirement ID "${requestedRequirementId}" already exists. Please choose a different Requirement ID or leave it blank to auto-generate.`,
          400,
        );
      }
      requirementId = requestedRequirementId;
    } else {
      requirementId = await generateUniqueRequirementIdForToday();
    }
    const employmentType = normalizeEmploymentType(data.employmentType);
    if (!employmentType) {
      return ResponseHelper.error(res, 'Employment type is required and must be Full-time or Contract.', 400);
    }
    const overallBudget = parseOverallBudget(data.overallBudget);
    if (overallBudget == null || overallBudget <= 0) {
      const msg =
        employmentType === 'Contract'
          ? 'Monthly budget is required and must be a number greater than 0 (in the selected currency).'
          : 'Yearly budget is required and must be a number greater than 0 (in the selected currency).';
      return ResponseHelper.error(res, msg, 400);
    }
    const budgetCurrency = normalizeBudgetCurrency(data.budgetCurrency);

    const dbStatus = parseUiRequirementStatus(data.status);
    const dbAssignment = parseUiAssignment(data.assignment);
    const closedAt = parseOptionalDateOnly(data.closedDate);
    const demandReceivedAt = parseOptionalDateOnly(data.createdAt);
    const internalPocRaw =
      typeof data.internalPoc === 'string' && data.internalPoc.trim() ? data.internalPoc.trim() : null;
    const demandTypeRaw =
      typeof data.demandType === 'string' && data.demandType.trim() ? data.demandType.trim() : null;

    const result = await prisma.$transaction(async (tx) => {
      const req = await tx.requirement.create({
        data: {
          requirementId,
          clientId: clientId,
          clientLeadPoc: data.clientLeadPoc || 'Not specified',
          clientPoc: data.clientPoc || 'Not specified',
          roleTitle: data.roleTitle || data.jobTitle || 'Default Title',
          location: Array.isArray(data.locations) ? data.locations.join(', ') : (data.location || 'Not specified'),
          experience: data.overallExperienceCustom || data.experience || 'Not specified',
          experienceLevel: data.experienceLevel || 'Not specified',
          employmentType,
          workMode: data.workMode || 'Not specified',
          budgetCurrency,
          // overallBudget mirrors the active period amount (yearly or monthly) in the same currency.
          overallBudget,
          yearlyBudget: employmentType === 'Full-time' ? overallBudget : null,
          monthlyBudget: employmentType === 'Contract' ? overallBudget : null,
          noticePeriod: data.noticePeriod || 'Not specified',
          skills: Array.isArray(data.skills) ? data.skills : [],
          technologies: Array.isArray(data.technologies) ? data.technologies : [],
          priority: data.priority?.toUpperCase() || 'MEDIUM',
          openPositions:
            (data.openPositions ?? data.positions) != null && !Number.isNaN(Number(data.openPositions ?? data.positions))
              ? parseInt(String(data.openPositions ?? data.positions), 10)
              : 1,
          submittingTo: data.submittingTo || 'Direct Client',
          internalPoc: internalPocRaw,
          demandType: demandTypeRaw,
          closedDate: dbStatus === 'CLOSED' ? closedAt : null,
          status: dbStatus,
          assignment: dbAssignment,
          requirementCreatorName: userName || null,
          ...(dbAssignment === 'UNASSIGNED'
            ? {
                assignedToRecruiterName: null,
                assignmentAssignerName: null,
              }
            : {
                assignedToRecruiterName: userName || null,
                assignmentAssignerName: userName || null,
              }),
          submissionsCount: 0,
          isDeleted: false,
          ...(demandReceivedAt ? { createdAt: demandReceivedAt } : {}),
          ...(typeof data.sourceEmailSubject === 'string' && data.sourceEmailSubject.trim()
            ? { sourceEmailSubject: data.sourceEmailSubject.trim() }
            : {}),
          ...(typeof data.sourceEmailGraphMessageId === 'string' && data.sourceEmailGraphMessageId.trim()
            ? { sourceEmailGraphMessageId: data.sourceEmailGraphMessageId.trim() }
            : {}),
          ...(typeof data.sourceEmailMailbox === 'string' && data.sourceEmailMailbox.trim()
            ? { sourceEmailMailbox: data.sourceEmailMailbox.trim() }
            : {}),
        },
      });
      await logRequirementActivity(tx, {
        requirementId: req.id,
        actorId: userId,
        action: 'CREATED',
        summary: `Job demand created: ${req.roleTitle} (${req.requirementId})`,
        metadata: {
          requirementId: req.requirementId,
          status: dbStatus,
          assignment: dbAssignment,
        },
      });
      return req;
    });
    
    console.log('🔍 DEBUG: Created successfully:', result.id);
    console.log('🔍 DEBUG: Created requirementId:', result.requirementId);

    const enriched = (await enrichRequirementsForFrontend([result]))[0];
    ResponseHelper.created(res, 'Requirement created successfully', enriched);
  } catch (error: any) {
    console.log('🔍 DEBUG: Error:', error?.message || error);
    console.log('🔍 DEBUG: Full error:', error);
    // Map common constraint errors to 400 with clearer messages.
    const msg = String(error?.message || 'Unknown error');
    const lower = msg.toLowerCase();
    if (error?.code === 'P2002' && Array.isArray(error?.meta?.target) && error.meta.target.includes('requirement_id')) {
      return ResponseHelper.error(
        res,
        'A requirement with this Requirement ID already exists. Please use a different Requirement ID.',
        400,
      );
    }
    const isClientError =
      lower.includes('invalid clientid') ||
      lower.includes('could not generate a unique requirementid');
    ResponseHelper.error(res, `Error: ${msg}`, isClientError ? 400 : 500);
  }
}));

/**
 * @route   PATCH /api/requirements/:id
 * @desc    Update requirement (same field shapes as POST body; preserves requirement_id / internal id)
 * @access  Private
 */
router.patch('/:id', authenticate, asyncHandler(async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) return ResponseHelper.error(res, 'Requirement id is required', 400);
    const userId = (req as any).user?.id;
    const data = req.body ?? {};

    const existing = await prisma.requirement.findFirst({
      where: { id, isDeleted: false },
    });
    if (!existing) {
      return ResponseHelper.error(res, 'Requirement not found', 404);
    }

    // Edit ownership rule: primary owner and active assignees (or admin/lead) may edit.
    if (String(existing.assignment || '').toUpperCase() === 'ASSIGNED') {
      const mayEdit = await userMayEditRequirement(
        id,
        userId,
        (req as any).user?.role,
      );
      if (!mayEdit) {
        return ResponseHelper.error(
          res,
          'This requirement is assigned to other recruiters and is not editable by you.',
          403,
        );
      }
    }

    let clientId = existing.clientId;
    if (typeof data.clientId === 'string' && data.clientId.trim()) {
      clientId = await resolveClientId({ clientId: data.clientId.trim() });
    }

    const requestedEmploymentType = normalizeEmploymentType(data.employmentType);
    const existingEmploymentType = normalizeEmploymentType(existing.employmentType);
    const employmentType = requestedEmploymentType ?? existingEmploymentType;
    if (!employmentType) {
      return ResponseHelper.error(res, 'Employment type is required and must be Full-time or Contract.', 400);
    }
    const overallBudget = parseOverallBudget(data.overallBudget);
    if (overallBudget == null || overallBudget <= 0) {
      const msg =
        employmentType === 'Contract'
          ? 'Monthly budget is required and must be a number greater than 0 (in the selected currency).'
          : 'Yearly budget is required and must be a number greater than 0 (in the selected currency).';
      return ResponseHelper.error(res, msg, 400);
    }
    const budgetCurrency =
      data.budgetCurrency !== undefined && data.budgetCurrency !== null && String(data.budgetCurrency).trim()
        ? normalizeBudgetCurrency(data.budgetCurrency)
        : normalizeBudgetCurrency((existing as { budgetCurrency?: string }).budgetCurrency ?? 'INR');

    const dbStatus = parseUiRequirementStatus(data.status);
    const dbAssignment = parseUiAssignment(data.assignment);
    const closedAt = parseOptionalDateOnly(data.closedDate);

    const openPosRaw = data.openPositions ?? data.positions;
    const openPositions =
      openPosRaw != null && !Number.isNaN(Number(openPosRaw))
        ? parseInt(String(openPosRaw), 10)
        : existing.openPositions ?? 1;

    const experienceStr =
      (typeof data.overallExperienceCustom === 'string' && data.overallExperienceCustom.trim()
        ? data.overallExperienceCustom
        : null) ||
      (typeof data.experience === 'string' && data.experience.trim() ? data.experience : null) ||
      existing.experience ||
      'Not specified';

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.requirement.update({
        where: { id },
        data: {
          clientId,
          clientLeadPoc:
            typeof data.clientLeadPoc === 'string' && data.clientLeadPoc.trim()
              ? data.clientLeadPoc.trim()
              : existing.clientLeadPoc,
          clientPoc:
            typeof data.clientPoc === 'string' ? data.clientPoc.trim() || existing.clientPoc : existing.clientPoc,
          roleTitle:
            (typeof data.roleTitle === 'string' && data.roleTitle.trim()
              ? data.roleTitle.trim()
              : null) ||
            (typeof data.jobTitle === 'string' && data.jobTitle.trim()
              ? data.jobTitle.trim()
              : null) ||
            existing.roleTitle,
          location: Array.isArray(data.locations)
            ? data.locations.join(', ')
            : typeof data.location === 'string' && data.location.trim()
              ? data.location.trim()
              : existing.location,
          experience: experienceStr,
          experienceLevel:
            typeof data.experienceLevel === 'string' && data.experienceLevel.trim()
              ? data.experienceLevel.trim()
              : existing.experienceLevel,
          employmentType,
          workMode:
            typeof data.workMode === 'string' && data.workMode.trim()
              ? data.workMode.trim()
              : existing.workMode,
          budgetCurrency,
          overallBudget,
          yearlyBudget: employmentType === 'Full-time' ? overallBudget : null,
          monthlyBudget: employmentType === 'Contract' ? overallBudget : null,
          noticePeriod:
            typeof data.noticePeriod === 'string' && data.noticePeriod.trim()
              ? data.noticePeriod.trim()
              : existing.noticePeriod || 'Not specified',
          skills: Array.isArray(data.skills) ? data.skills : existing.skills,
          technologies: Array.isArray(data.technologies) ? data.technologies : existing.technologies,
          priority: (typeof data.priority === 'string' ? data.priority.toUpperCase() : null) || existing.priority,
          openPositions,
          submittingTo:
            typeof data.submittingTo === 'string' && data.submittingTo.trim()
              ? data.submittingTo.trim()
              : existing.submittingTo,
          internalPoc:
            typeof data.internalPoc === 'string'
              ? data.internalPoc.trim() || null
              : existing.internalPoc,
          demandType:
            typeof data.demandType === 'string'
              ? data.demandType.trim() || null
              : existing.demandType,
          closedDate: dbStatus === 'CLOSED' ? closedAt ?? existing.closedDate : null,
          status: dbStatus,
          assignment: dbAssignment,
          ...(dbAssignment === 'UNASSIGNED'
            ? {
                assignedToRecruiterName: null,
                assignmentAssignerName: null,
              }
            : {}),
          ...(typeof data.sourceEmailSubject === 'string'
            ? { sourceEmailSubject: data.sourceEmailSubject.trim() || null }
            : {}),
          ...(typeof data.sourceEmailGraphMessageId === 'string'
            ? { sourceEmailGraphMessageId: data.sourceEmailGraphMessageId.trim() || null }
            : {}),
          ...(typeof data.sourceEmailMailbox === 'string'
            ? { sourceEmailMailbox: data.sourceEmailMailbox.trim() || null }
            : {}),
        },
      });

      await logRequirementActivity(tx, {
        requirementId: id,
        actorId: userId,
        action: 'UPDATED',
        summary:
          existing.status !== updated.status
            ? `Requirement status changed: ${existing.status} → ${updated.status}`
            : `Requirement updated: ${updated.roleTitle} (${updated.requirementId})`,
        metadata: {
          requirementId: updated.requirementId,
          previousStatus: existing.status,
          currentStatus: updated.status,
          previousAssignment: existing.assignment,
          currentAssignment: updated.assignment,
        },
      });

      return updated;
    });

    const enriched = (await enrichRequirementsForFrontend([result]))[0];
    ResponseHelper.success(res, 'Requirement updated successfully', enriched);
  } catch (error: any) {
    const msg = String(error?.message || 'Unknown error');
    const isClientError = msg.toLowerCase().includes('invalid clientid');
    ResponseHelper.error(res, `Error: ${msg}`, isClientError ? 400 : 500);
  }
}));

/**
 * @route   GET /api/requirements
 * @desc    Get all requirements
 * @access  Private
 */
router.get('/', authenticate, asyncHandler(async (req: Request, res: Response) => {
  try {
    const qStatus = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const qRecruiterId = typeof req.query.recruiterId === 'string' ? req.query.recruiterId.trim() : '';
    const qRequirementId =
      typeof req.query.requirementId === 'string' ? req.query.requirementId.trim() : '';
    const qClient = typeof req.query.client === 'string' ? req.query.client.trim() : '';
    const qClientId = typeof req.query.clientId === 'string' ? req.query.clientId.trim() : '';
    const qRole = typeof req.query.role === 'string' ? req.query.role.trim() : '';
    const qOwner = typeof req.query.owner === 'string' ? req.query.owner.trim() : '';
    const qToday = typeof req.query.today === 'string' ? req.query.today.trim().toLowerCase() : '';
    const qSource = typeof req.query.source === 'string' ? req.query.source.trim().toLowerCase() : '';
    const qLimitRaw = typeof req.query.limit === 'string' ? req.query.limit.trim() : '';
    const qOffsetRaw = typeof req.query.offset === 'string' ? req.query.offset.trim() : '';
    const parsedLimit = qLimitRaw ? parseInt(qLimitRaw, 10) : NaN;
    const parsedOffset = qOffsetRaw ? parseInt(qOffsetRaw, 10) : NaN;
    const limit = Math.min(500, Math.max(1, Number.isFinite(parsedLimit) ? parsedLimit : 100));
    const offset = Math.max(0, Number.isFinite(parsedOffset) ? parsedOffset : 0);

    const statusNorm = qStatus.toUpperCase();

    // Map dashboard UI labels to DB values.
    // Frontend sends: Unassigned/Assigned/Submitted/Interview/Selected/Rejected/Closed
    // DB stores: assignment: UNASSIGNED|ASSIGNED and status: OPEN|ASSIGNED|SUBMITTED|INTERVIEW|SELECTED|REJECTED|CLOSED
    const statusWhere: any = {};
    if (statusNorm) {
      if (statusNorm === 'UNASSIGNED') {
        statusWhere.assignment = 'UNASSIGNED';
      } else if (statusNorm === 'ASSIGNED') {
        statusWhere.assignment = 'ASSIGNED';
        statusWhere.status = { in: ['OPEN', 'ASSIGNED'] };
      } else {
        const map: Record<string, string> = {
          SUBMITTED: 'SUBMITTED',
          INTERVIEW: 'INTERVIEW',
          SELECTED: 'SELECTED',
          REJECTED: 'REJECTED',
          CLOSED: 'CLOSED',
          OPEN: 'OPEN',
        };
        const dbStatus = map[statusNorm];
        if (dbStatus) statusWhere.status = dbStatus;
      }
    }

    let ownerSearchNeedle = qOwner.trim();
    if (qOwner && /^(?:user|usr)-\d+$/i.test(qOwner)) {
      const u = await prisma.user.findUnique({
        where: { id: qOwner },
        select: { firstName: true, lastName: true, email: true },
      });
      ownerSearchNeedle = u
        ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email || qOwner
        : qOwner;
    }

    const where: any = {
      isDeleted: false,
      ...statusWhere,
    };

    if (qRequirementId) {
      where.requirementId = { contains: qRequirementId, mode: 'insensitive' };
    }
    if (qRole) {
      where.roleTitle = { contains: qRole, mode: 'insensitive' };
    }
    if (qRecruiterId) {
      const active = await prisma.requirementAssignment.findMany({
        where: { recruiterId: qRecruiterId, status: 'ACTIVE' },
        select: { requirementId: true },
      });
      const ids = active.map((a) => a.requirementId);
      if (ids.length > 0) {
        where.id = { in: ids };
      } else if (/^(?:user|usr)-\d+$/i.test(qRecruiterId)) {
        where.id = { in: ['__none__'] };
      } else {
        where.assignedToRecruiterName = {
          contains: qRecruiterId,
          mode: 'insensitive',
        };
      }
    }
    if (qClientId) {
      where.clientId = qClientId;
    }
    if (qClient) {
      // Simple text filters over requirement/client fields.
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { clientLeadPoc: { contains: qClient, mode: 'insensitive' } },
            { clientPoc: { contains: qClient, mode: 'insensitive' } },
          ],
        },
      ];
    }
    if (qOwner) {
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { requirementCreatorName: { contains: ownerSearchNeedle, mode: 'insensitive' } },
            { assignedToRecruiterName: { contains: ownerSearchNeedle, mode: 'insensitive' } },
            { assignmentAssignerName: { contains: ownerSearchNeedle, mode: 'insensitive' } },
          ],
        },
      ];
    }
    if (qToday === '1' || qToday === 'true' || qToday === 'yes') {
      const now = new Date();
      const { start, end } = zonedCalendarDayRangeForInstant(now, getRequirementCalendarTz());
      where.createdAt = { gte: start, lt: end };
    }
    if (qSource === 'email' || qSource === 'auto' || qSource === 'automation') {
      const actor = (process.env.INTERNAL_AUTOMATION_ACTOR_NAME || 'Email Automation').trim();
      where.requirementCreatorName = { equals: actor, mode: 'insensitive' };
    }

    const total = await prisma.requirement.count({ where });
    const requirements = await prisma.requirement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    });
    
    // Add SLA breach detection to each requirement
    const requirementsWithSLA = requirements.map(req => {
      const createdAt = new Date(req.createdAt);
      const now = new Date();
      const daysSinceCreation = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
      const slaDays = req.slaDays || 10; // Default to 10 days
      const isSLABreached = daysSinceCreation > slaDays;
      const daysOverSLA = isSLABreached ? daysSinceCreation - slaDays : 0;
      
      return {
        ...req,
        slaDays,
        daysSinceCreation,
        isSLABreached,
        daysOverSLA,
        slaStatus: isSLABreached ? 'BREACHED' : 'WITHIN_SLA'
      };
    });
    
    console.log('🔍 DEBUG: Requirements with SLA:', requirementsWithSLA.length);

    const enriched = await enrichRequirementsForFrontend(requirementsWithSLA);
    ResponseHelper.success(res, 'Requirements retrieved successfully', {
      requirements: enriched,
      pagination: {
        total,
        limit,
        offset,
      },
    });
  } catch (error: any) {
    console.log('🔍 DEBUG: GET Error:', error?.message || error);
    ResponseHelper.error(res, `Error: ${error?.message || 'Unknown error'}`, 500);
  }
}));

/**
 * @route   GET /api/requirements/my-active-assignments
 * @desc    Active requirement assignments for the signed-in recruiter (in-app notifications)
 * @access  Private
 */
router.get('/my-active-assignments', authenticate, asyncHandler(async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as string | undefined;
    if (!userId) {
      return ResponseHelper.error(res, 'Authentication required', 401);
    }

    const rows = await prisma.requirementAssignment.findMany({
      where: { recruiterId: userId, status: 'ACTIVE' },
      orderBy: { assignedOn: 'desc' },
      take: 500,
      include: {
        requirement: {
          select: {
            id: true,
            requirementId: true,
            roleTitle: true,
            isDeleted: true,
          },
        },
        assigner: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });

    const assignments = rows
      .filter((row) => row.requirement && !row.requirement.isDeleted)
      .map((row) => {
        const assignerName =
          [row.assigner.firstName, row.assigner.lastName].filter(Boolean).join(' ').trim() ||
          row.assigner.email ||
          'A recruiter';
        return {
          id: row.id,
          requirementInternalId: row.requirement.id,
          requirementId: row.requirement.requirementId,
          jobTitle: row.requirement.roleTitle ?? '',
          assignerId: row.assignedBy,
          assignerName,
          assignedOn: row.assignedOn.toISOString(),
        };
      });

    return ResponseHelper.success(res, 'Active assignments retrieved successfully', { assignments });
  } catch (error: any) {
    ResponseHelper.error(res, `Error: ${error?.message || 'Unknown error'}`, 500);
  }
}));

/**
 * @route   GET /api/requirements/:id/activity
 * @desc    Activity log (requirement_activities)
 * @access  Private
 */
router.get('/:id/activity', authenticate, asyncHandler(async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) return ResponseHelper.error(res, 'Requirement id is required', 400);
    const reqRow = await findRequirementByRouteId(id, { includeDeleted: true });
    if (!reqRow) {
      return ResponseHelper.error(res, 'Requirement not found', 404);
    }
    const reqId = reqRow.id;

    let rows: RequirementActivityWithActor[] = [];
    try {
      rows = await prisma.requirementActivity.findMany({
        where: { requirementId: reqId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          actor: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
      });
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code !== 'P2021') throw e;
      rows = [];
    }

    const activities = rows.map((a) => ({
      id: a.id,
      requirementId: a.requirementId,
      action: a.action,
      summary: a.summary,
      metadata: a.metadata,
      createdAt: a.createdAt.toISOString(),
      actorId: a.actorId ?? a.actor?.id ?? null,
      actorName: a.actor
        ? [a.actor.firstName, a.actor.lastName].filter(Boolean).join(' ') || a.actor.email
        : null,
      actorEmail: a.actor?.email ?? null,
    }));

    // Backfill view for old records: if dedicated requirement_activity rows are missing
    // for lifecycle actions, synthesize readable activity entries from source tables.
    const hasSubmissionActivity = rows.some((r) => r.action.startsWith('submission.'));
    const hasSubmissionStatusActivity = rows.some((r) => r.action === 'submission.status_changed');
    const hasInterviewActivity = rows.some((r) => r.action.startsWith('interview.'));
    const hasOfferActivity = rows.some((r) => r.action.startsWith('offer.'));
    const hasAssignmentActivity = rows.some((r) => r.action === 'ASSIGNED' || r.action === 'REVOKED');
    const hasCommunicationActivity = rows.some((r) => r.action.startsWith('communication.'));
    const synthesized: Array<{
      id: string;
      requirementId: string;
      action: string;
      summary: string;
      metadata: unknown;
      createdAt: string;
      actorId: string | null;
      actorName: string | null;
      actorEmail: string | null;
    }> = [];

    if (!hasSubmissionActivity) {
      try {
        const submissions = await prisma.submission.findMany({
          where: { requirementId: reqId },
          select: {
            id: true,
            status: true,
            submittedOn: true,
            candidate: { select: { id: true, name: true } },
            submitter: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
          orderBy: { submittedOn: 'desc' },
          take: 200,
        });
        for (const s of submissions) {
          const submitterName =
            [s.submitter.firstName, s.submitter.lastName].filter(Boolean).join(' ') || s.submitter.email;
          synthesized.push({
            id: `synth-sub-${s.id}`,
            requirementId: reqId,
            action: 'submission.created',
            summary: `${submitterName} submitted ${s.candidate.name}`,
            metadata: {
              submissionId: s.id,
              candidateId: s.candidate.id,
              candidateName: s.candidate.name,
              recruiterId: s.submitter.id,
              status: s.status,
              source: 'synthesized',
            },
            createdAt: s.submittedOn.toISOString(),
            actorId: s.submitter.id,
            actorName: submitterName,
            actorEmail: s.submitter.email,
          });
        }
      } catch (e: unknown) {
        const code = (e as { code?: string })?.code;
        if (code !== 'P2021') console.warn('[requirements/activity] submissions synthesis failed:', e);
      }
    }

    if (!hasSubmissionStatusActivity) {
      try {
        const statusHistory = await prisma.candidateStatusHistory.findMany({
          where: { submission: { requirementId: reqId } },
          select: {
            id: true,
            oldStatus: true,
            newStatus: true,
            reason: true,
            createdAt: true,
            changedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
            submission: {
              select: {
                id: true,
                candidateId: true,
                candidate: { select: { name: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 300,
        });

        for (const h of statusHistory) {
          const actorName =
            h.changedBy
              ? [h.changedBy.firstName, h.changedBy.lastName].filter(Boolean).join(' ') || h.changedBy.email
              : null;
          synthesized.push({
            id: `synth-sub-status-${h.id}`,
            requirementId: reqId,
            action: 'submission.status_changed',
            summary: `${h.submission.candidate.name}: ${h.oldStatus} -> ${h.newStatus}`,
            metadata: {
              submissionId: h.submission.id,
              candidateId: h.submission.candidateId,
              candidateName: h.submission.candidate.name,
              oldStatus: h.oldStatus,
              newStatus: h.newStatus,
              rejectionReason: h.reason ?? null,
              source: 'synthesized',
            },
            createdAt: h.createdAt.toISOString(),
            actorId: h.changedBy?.id ?? null,
            actorName,
            actorEmail: h.changedBy?.email ?? null,
          });
        }
      } catch (e: unknown) {
        const code = (e as { code?: string })?.code;
        if (code !== 'P2021') console.warn('[requirements/activity] status-history synthesis failed:', e);
      }
    }

    if (!hasInterviewActivity) {
      try {
        const interviews = await prisma.interview.findMany({
          where: { submission: { requirementId: reqId } },
          select: {
            id: true,
            round: true,
            status: true,
            finalDecision: true,
            scheduledAt: true,
            updatedAt: true,
            recruiter: { select: { firstName: true, lastName: true, email: true } },
            submission: {
              select: {
                id: true,
                candidateId: true,
                candidate: { select: { name: true } },
              },
            },
          },
          orderBy: { updatedAt: 'desc' },
          take: 300,
        });

        for (const iv of interviews) {
          const recruiterName =
            [iv.recruiter.firstName, iv.recruiter.lastName].filter(Boolean).join(' ') || iv.recruiter.email;
          const decisionSuffix = iv.finalDecision ? ` (${iv.finalDecision})` : '';
          synthesized.push({
            id: `synth-iv-${iv.id}-${iv.updatedAt.getTime()}`,
            requirementId: reqId,
            action: 'interview.updated',
            summary: `${iv.submission.candidate.name} ${iv.round}: ${iv.status}${decisionSuffix}`,
            metadata: {
              interviewId: iv.id,
              submissionId: iv.submission.id,
              candidateId: iv.submission.candidateId,
              candidateName: iv.submission.candidate.name,
              round: iv.round,
              status: iv.status,
              finalDecision: iv.finalDecision,
              scheduledAt: iv.scheduledAt.toISOString(),
              source: 'synthesized',
            },
            createdAt: iv.updatedAt.toISOString(),
            actorId: null,
            actorName: recruiterName,
            actorEmail: iv.recruiter.email,
          });
        }
      } catch (e: unknown) {
        const code = (e as { code?: string })?.code;
        if (code !== 'P2021') console.warn('[requirements/activity] interviews synthesis failed:', e);
      }
    }

    if (!hasOfferActivity) {
      try {
        const offers = await prisma.offerLetter.findMany({
          where: { submission: { requirementId: reqId } },
          select: {
            id: true,
            status: true,
            releasedAt: true,
            acceptedJoiningDate: true,
            declineReason: true,
            updatedAt: true,
            submission: {
              select: {
                id: true,
                candidateId: true,
                candidate: { select: { name: true } },
              },
            },
            releasedBy: { select: { firstName: true, lastName: true, email: true } },
          },
          orderBy: { updatedAt: 'desc' },
          take: 200,
        });

        for (const offer of offers) {
          const releasedByName = offer.releasedBy
            ? [offer.releasedBy.firstName, offer.releasedBy.lastName].filter(Boolean).join(' ') ||
              offer.releasedBy.email
            : null;
          if (offer.releasedAt) {
            synthesized.push({
              id: `synth-offer-release-${offer.id}`,
              requirementId: reqId,
              action: 'offer.released',
              summary: `Offer released for ${offer.submission.candidate.name}`,
              metadata: {
                offerId: offer.id,
                submissionId: offer.submission.id,
                candidateId: offer.submission.candidateId,
                candidateName: offer.submission.candidate.name,
                status: offer.status,
                source: 'synthesized',
              },
              createdAt: offer.releasedAt.toISOString(),
              actorId: null,
              actorName: releasedByName,
              actorEmail: offer.releasedBy?.email ?? null,
            });
          }
          if (offer.status === 'ACCEPTED') {
            synthesized.push({
              id: `synth-offer-accepted-${offer.id}`,
              requirementId: reqId,
              action: 'offer.response.interested',
              summary: `Candidate ${offer.submission.candidate.name} marked Interested`,
              metadata: {
                offerId: offer.id,
                submissionId: offer.submission.id,
                acceptedJoiningDate: offer.acceptedJoiningDate?.toISOString() ?? null,
                source: 'synthesized',
              },
              createdAt: offer.updatedAt.toISOString(),
              actorId: null,
              actorName: releasedByName,
              actorEmail: offer.releasedBy?.email ?? null,
            });
          } else if (offer.status === 'DECLINED') {
            synthesized.push({
              id: `synth-offer-declined-${offer.id}`,
              requirementId: reqId,
              action: 'offer.response.not_interested',
              summary: `Candidate ${offer.submission.candidate.name} marked Not Interested`,
              metadata: {
                offerId: offer.id,
                submissionId: offer.submission.id,
                declineReason: offer.declineReason ?? null,
                source: 'synthesized',
              },
              createdAt: offer.updatedAt.toISOString(),
              actorId: null,
              actorName: releasedByName,
              actorEmail: offer.releasedBy?.email ?? null,
            });
          }
        }
      } catch (e: unknown) {
        const code = (e as { code?: string })?.code;
        if (code !== 'P2021') console.warn('[requirements/activity] offers synthesis failed:', e);
      }
    }

    if (!hasAssignmentActivity) {
      try {
        const assignments = await prisma.requirementAssignment.findMany({
          where: { requirementId: reqId },
          select: {
            id: true,
            status: true,
            assignedOn: true,
            recruiter: { select: { firstName: true, lastName: true, email: true } },
            assigner: { select: { firstName: true, lastName: true, email: true } },
          },
          orderBy: { assignedOn: 'desc' },
          take: 200,
        });

        for (const asn of assignments) {
          const recruiterName =
            [asn.recruiter.firstName, asn.recruiter.lastName].filter(Boolean).join(' ') || asn.recruiter.email;
          const assignerName =
            [asn.assigner.firstName, asn.assigner.lastName].filter(Boolean).join(' ') || asn.assigner.email;
          synthesized.push({
            id: `synth-asn-${asn.id}-${asn.status}`,
            requirementId: reqId,
            action: asn.status === 'ACTIVE' ? 'ASSIGNED' : 'REVOKED',
            summary:
              asn.status === 'ACTIVE'
                ? `Requirement assigned to ${recruiterName}`
                : `Assignment revoked for ${recruiterName}`,
            metadata: {
              recruiterName,
              recruiterEmail: asn.recruiter.email,
              assignerName,
              assignerEmail: asn.assigner.email,
              status: asn.status,
              source: 'synthesized',
            },
            createdAt: asn.assignedOn.toISOString(),
            actorId: null,
            actorName: assignerName,
            actorEmail: asn.assigner.email,
          });
        }
      } catch (e: unknown) {
        const code = (e as { code?: string })?.code;
        if (code !== 'P2021') console.warn('[requirements/activity] assignments synthesis failed:', e);
      }
    }

    if (!hasCommunicationActivity) {
      try {
        const communications = await prisma.communicationLog.findMany({
          where: { requirementId: reqId },
          select: {
            id: true,
            type: true,
            recipient: true,
            status: true,
            subject: true,
            submissionId: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 300,
        });

        for (const c of communications) {
          synthesized.push({
            id: `synth-com-${c.id}`,
            requirementId: reqId,
            action: `communication.${String(c.type).toLowerCase()}`,
            summary: `${c.type} ${String(c.status).toLowerCase()} to ${c.recipient}`,
            metadata: {
              communicationId: c.id,
              submissionId: c.submissionId,
              recipient: c.recipient,
              type: c.type,
              status: c.status,
              subject: c.subject,
              source: 'synthesized',
            },
            createdAt: c.createdAt.toISOString(),
            actorId: null,
            actorName: null,
            actorEmail: null,
          });
        }
      } catch (e: unknown) {
        const code = (e as { code?: string })?.code;
        if (code !== 'P2021') console.warn('[requirements/activity] communications synthesis failed:', e);
      }
    }

    const merged = [...activities, ...synthesized]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 300);

    ResponseHelper.success(res, 'Activity retrieved successfully', { activities: merged });
  } catch (error: any) {
    ResponseHelper.error(res, `Error: ${error?.message || 'Unknown error'}`, 500);
  }
}));

/**
 * @route   POST /api/requirements/:id/activity
 * @desc    Append an activity/audit entry for a requirement
 * @access  Private
 */
router.post('/:id/activity', authenticate, asyncHandler(async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) return ResponseHelper.error(res, 'Requirement id is required', 400);

    const reqRow = await prisma.requirement.findFirst({
      where: { OR: [{ id }, { requirementId: id }], isDeleted: false },
      select: { id: true },
    });
    if (!reqRow) return ResponseHelper.error(res, 'Requirement not found', 404);

    const actorId = (req as any).user?.id as string | undefined;
    const body = req.body ?? {};
    const action =
      typeof body.action === 'string' && body.action.trim()
        ? body.action.trim()
        : 'security.event';
    const summary =
      typeof body.summary === 'string' && body.summary.trim()
        ? body.summary.trim()
        : 'Security event captured';

    const metadata = Object.prototype.hasOwnProperty.call(body, 'metadata')
      ? ((body.metadata ?? Prisma.JsonNull) as unknown as Prisma.InputJsonValue)
      : (Prisma.JsonNull as unknown as Prisma.InputJsonValue);

    await logRequirementActivity(prisma, {
      requirementId: reqRow.id,
      actorId: actorId ?? null,
      action,
      summary,
      metadata,
    });

    ResponseHelper.success(res, 'Activity logged successfully', { ok: true });
  } catch (error: any) {
    ResponseHelper.error(res, `Error: ${error?.message || 'Unknown error'}`, 500);
  }
}));

/**
 * @route   GET /api/requirements/:id/assignments
 * @desc    Assignment history (requirement_assignments)
 * @access  Private
 */
router.get('/:id/assignments', authenticate, asyncHandler(async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const qLimitRaw = typeof req.query.limit === 'string' ? req.query.limit.trim() : '';
    const qOffsetRaw = typeof req.query.offset === 'string' ? req.query.offset.trim() : '';
    const parsedLimit = qLimitRaw ? parseInt(qLimitRaw, 10) : NaN;
    const parsedOffset = qOffsetRaw ? parseInt(qOffsetRaw, 10) : NaN;
    const limit = Math.min(500, Math.max(1, Number.isFinite(parsedLimit) ? parsedLimit : 100));
    const offset = Math.max(0, Number.isFinite(parsedOffset) ? parsedOffset : 0);
    if (!id) return ResponseHelper.error(res, 'Requirement id is required', 400);
    const reqRow = await findRequirementByRouteId(id, { includeDeleted: true });
    if (!reqRow) {
      return ResponseHelper.error(res, 'Requirement not found', 404);
    }

    const rows = await prisma.requirementAssignment.findMany({
      where: { requirementId: reqRow.id },
      orderBy: { assignedOn: 'desc' },
      skip: offset,
      take: limit,
      include: {
        recruiter: { select: { id: true, email: true, firstName: true, lastName: true } },
        assigner: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    const assignments = rows.map((a) => ({
      id: a.id,
      requirementId: a.requirementId,
      recruiterId: a.recruiterId,
      assignedBy: a.assignedBy,
      assignedOn: a.assignedOn.toISOString(),
      status: a.status,
      notes: a.notes,
      recruiterName: [a.recruiter.firstName, a.recruiter.lastName].filter(Boolean).join(' ') || a.recruiter.email,
      recruiterEmail: a.recruiter.email,
      assignerName: [a.assigner.firstName, a.assigner.lastName].filter(Boolean).join(' ') || a.assigner.email,
    }));

    ResponseHelper.success(res, 'Assignments retrieved successfully', { assignments });
  } catch (error: any) {
    ResponseHelper.error(res, `Error: ${error?.message || 'Unknown error'}`, 500);
  }
}));

/**
 * @route   GET /api/requirements/:id/communications
 * @desc    Outbound email log (communication_logs)
 */
router.get('/:id/communications', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const rawId = req.params.id;
  if (!rawId) return ResponseHelper.error(res, 'Requirement id is required', 400);

  const reqRow = await findRequirementByRouteId(rawId, { includeDeleted: true });
  if (!reqRow) {
    return ResponseHelper.error(res, 'Requirement not found', 404);
  }

  try {
    const rows = await prisma.communicationLog.findMany({
      where: { requirementId: reqRow.id },
      orderBy: { createdAt: 'desc' },
      take: 400,
    });

    const communications = rows.map((r) => ({
      id: r.id,
      type: r.type,
      recipient: r.recipient,
      subject: r.subject,
      status: r.status,
      providerMessageId: r.providerMessageId,
      submissionId: r.submissionId,
      createdAt: r.createdAt.toISOString(),
      bodyPreview: r.body ? r.body.slice(0, 500) : null,
    }));

    return ResponseHelper.success(res, 'OK', { communications });
  } catch (error: unknown) {
    const code = (error as { code?: string })?.code;
    if (code === 'P2021') {
      return ResponseHelper.success(res, 'OK', { communications: [] });
    }
    throw error;
  }
}));

/**
 * @route   GET /api/requirements/:id/email-thread-participants
 * @desc    Original requirement email subject + To/CC/BCC for forward-to-client threading
 */
router.get('/:id/email-thread-participants', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const rawId = req.params.id;
  if (!rawId) return ResponseHelper.error(res, 'Requirement id is required', 400);

  const reqRow = await findRequirementByRouteId(rawId);
  if (!reqRow) return ResponseHelper.error(res, 'Requirement not found', 404);

  const actorId = (req as { user?: { id?: string } }).user?.id;
  if (!actorId) return ResponseHelper.unauthorized(res, 'Unauthorized');
  try {
    await assertUserCanWorkOnRequirement(prisma, reqRow.id, actorId);
  } catch (e: unknown) {
    if (e instanceof RequirementWorkAccessError) {
      return ResponseHelper.error(res, e.message, e.statusCode);
    }
    throw e;
  }

  const subjectOverride =
    typeof req.query.sourceEmailSubject === 'string' ? req.query.sourceEmailSubject.trim() : '';
  const participants = await fetchRequirementEmailThreadParticipants({
    id: reqRow.id,
    requirementId: reqRow.requirementId,
    sourceEmailGraphMessageId: reqRow.sourceEmailGraphMessageId,
    sourceEmailInternetMessageId: reqRow.sourceEmailInternetMessageId,
    sourceEmailMailbox: reqRow.sourceEmailMailbox,
    sourceEmailSubject: subjectOverride || reqRow.sourceEmailSubject,
    clientLeadPoc: reqRow.clientLeadPoc,
    clientPoc: reqRow.clientPoc,
    internalPoc: reqRow.internalPoc,
  });

  return ResponseHelper.success(res, 'Requirement email thread participants', participants);
}));

/**
 * @route   GET /api/requirements/:id/events
 * @desc    Lightweight SSE heartbeat so the overview page can soft-refresh.
 */
router.get('/:id/events', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const rawId = req.params.id;
  if (!rawId) return ResponseHelper.error(res, 'Requirement id is required', 400);

  const reqRow = await findRequirementByRouteId(rawId, { includeDeleted: true });
  if (!reqRow) {
    return ResponseHelper.error(res, 'Requirement not found', 404);
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof (res as any).flushHeaders === 'function') {
    (res as any).flushHeaders();
  }

  res.write(`data: ${JSON.stringify({ type: 'connected', requirementId: reqRow.id })}\n\n`);

  const iv = setInterval(() => {
    try {
      res.write(`data: ${JSON.stringify({ type: 'heartbeat', requirementId: reqRow.id, t: Date.now() })}\n\n`);
    } catch {
      clearInterval(iv);
    }
  }, 28000);

  req.on('close', () => {
    clearInterval(iv);
  });
}));

/**
 * @route   GET /api/requirements/:id
 * @desc    Single requirement by internal id (cuid)
 * @access  Private
 */
router.get('/:id', authenticate, asyncHandler(async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) return ResponseHelper.error(res, 'Requirement id is required', 400);
    const reqRow = await findRequirementByRouteId(id, { includeDeleted: true });
    if (!reqRow) {
      return ResponseHelper.error(res, 'Requirement not found', 404);
    }
    const createdAt = new Date(reqRow.createdAt);
    const now = new Date();
    const daysSinceCreation = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
    const slaDays = reqRow.slaDays || 10;
    const isSLABreached = daysSinceCreation > slaDays;
    const withSLA = {
      ...reqRow,
      slaDays,
      daysSinceCreation,
      isSLABreached,
      daysOverSLA: isSLABreached ? daysSinceCreation - slaDays : 0,
      slaStatus: isSLABreached ? 'BREACHED' : 'WITHIN_SLA',
    };
    const enriched = (await enrichRequirementsForFrontend([withSLA]))[0];
    ResponseHelper.success(res, 'Requirement retrieved successfully', enriched);
  } catch (error: any) {
    ResponseHelper.error(res, `Error: ${error?.message || 'Unknown error'}`, 500);
  }
}));

/**
 * @route   POST /api/requirements/:id/assign
 * @desc    Assign requirement to recruiter
 * @access  Private
 */
router.post('/:id/assign', authenticate, asyncHandler(async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) return ResponseHelper.error(res, 'Requirement id is required', 400);
    const { owner } = req.body;
    const userId = (req as any).user?.id;
    const assignerName = (req as any).user
      ? `${(req as any).user.firstName ?? ''} ${(req as any).user.lastName ?? ''}`.trim() ||
        (req as any).user.email
      : '';

    const recruiterId = owner?.id as string | undefined;
    if (!recruiterId) {
      return ResponseHelper.error(res, 'owner.id is required', 400);
    }

    const existing = await prisma.requirement.findFirst({
      where: { id, isDeleted: false },
      select: { id: true, assignment: true },
    });
    if (!existing) {
      return ResponseHelper.error(res, 'Requirement not found', 404);
    }

    const mayAssign = await userMayAssignRecruiters(
      id,
      userId,
      (req as any).user?.role,
      recruiterId,
    );
    if (!mayAssign) {
      return ResponseHelper.error(res, 'You do not have permission to assign recruiters.', 403);
    }

    let recruiterDisplay =
      typeof owner?.name === 'string' && owner.name.trim() ? owner.name.trim() : '';
    if (!recruiterDisplay) {
      const rec = await prisma.user.findUnique({
        where: { id: recruiterId },
        select: { firstName: true, lastName: true, email: true },
      });
      recruiterDisplay = rec
        ? `${rec.firstName ?? ''} ${rec.lastName ?? ''}`.trim() || rec.email || recruiterId
        : recruiterId;
    }

    const result = await prisma.$transaction(async (tx) => {
      const alreadyActive = await tx.requirementAssignment.findFirst({
        where: { requirementId: id, recruiterId, status: 'ACTIVE' },
        select: { id: true },
      });

      if (!alreadyActive) {
        const prior = await tx.requirementAssignment.findFirst({
          where: { requirementId: id, recruiterId },
          orderBy: { assignedOn: 'desc' },
          select: { id: true },
        });
        if (prior) {
          await tx.requirementAssignment.update({
            where: { id: prior.id },
            data: {
              status: 'ACTIVE',
              assignedBy: userId,
              assignedOn: new Date(),
            },
          });
        } else {
          await tx.requirementAssignment.create({
            data: {
              requirementId: id,
              recruiterId,
              assignedBy: userId,
              status: 'ACTIVE',
            },
          });
        }
      }

      const allActive = await tx.requirementAssignment.findMany({
        where: { requirementId: id, status: 'ACTIVE' },
        include: {
          recruiter: {
            select: { id: true, email: true, firstName: true, lastName: true, role: true },
          },
        },
        orderBy: { assignedOn: 'asc' },
      });

      const displayNames = allActive
        .map((row) => {
          const u = row.recruiter;
          return u
            ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email
            : '';
        })
        .filter(Boolean)
        .join(', ');

      const updated = await tx.requirement.update({
        where: { id, isDeleted: false },
        data: {
          assignment: 'ASSIGNED',
          assignedToRecruiterName: displayNames || recruiterDisplay || null,
          assignmentAssignerName: assignerName || null,
        },
      });

      await logRequirementActivity(tx, {
        requirementId: id,
        actorId: userId,
        action: 'ASSIGNED',
        summary: alreadyActive
          ? `${recruiterDisplay} is already assigned to this requirement`
          : `Requirement assigned to ${recruiterDisplay}`,
        metadata: {
          recruiterId,
          recruiterName: recruiterDisplay,
          assignedById: userId ?? null,
          assignedByName: assignerName || null,
          activeAssigneeCount: allActive.length,
        },
      });

      return updated;
    });

    const enriched = (await enrichRequirementsForFrontend([result]))[0];

    ResponseHelper.success(res, 'Requirement assigned successfully', enriched);
  } catch (error: any) {
    console.log('🔍 DEBUG: Assignment Error:', error?.message || error);
    ResponseHelper.error(res, `Error: ${error?.message || 'Unknown error'}`, 500);
  }
}));

/**
 * @route   POST /api/requirements/:id/revoke
 * @desc    Revoke requirement assignment
 * @access  Private
 */
router.post('/:id/revoke', authenticate, asyncHandler(async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) return ResponseHelper.error(res, 'Requirement id is required', 400);
    const userId = (req as any).user?.id;
    const actorName = (req as any).user
      ? `${(req as any).user.firstName ?? ''} ${(req as any).user.lastName ?? ''}`.trim() ||
        (req as any).user.email
      : '';

    const body = (req.body ?? {}) as { recruiterIds?: unknown; assignmentIds?: unknown };
    const recruiterIds = Array.isArray(body.recruiterIds)
      ? body.recruiterIds
          .map((value) => String(value ?? '').trim())
          .filter((value) => value.length > 0)
      : [];
    const assignmentIds = Array.isArray(body.assignmentIds)
      ? body.assignmentIds
          .map((value) => String(value ?? '').trim())
          .filter((value) => value.length > 0)
      : [];
    const result = await prisma.$transaction(async (tx) => {
      const activeAssignments = await tx.requirementAssignment.findMany({
        where: { requirementId: id, status: 'ACTIVE' },
        include: {
          recruiter: {
            select: { id: true, email: true, firstName: true, lastName: true, role: true },
          },
        },
        orderBy: { assignedOn: 'asc' },
      });

      if (activeAssignments.length === 0) {
        throw new Error('No active assignments to revoke');
      }

      let assignmentsToRevoke: typeof activeAssignments = [];
      if (assignmentIds.length > 0) {
        const assignmentIdSet = new Set(assignmentIds);
        assignmentsToRevoke = activeAssignments.filter((row) => assignmentIdSet.has(row.id));
      } else if (recruiterIds.length > 0) {
        const recruiterIdSet = new Set(recruiterIds);
        assignmentsToRevoke = activeAssignments.filter((row) => recruiterIdSet.has(row.recruiterId));
      } else if (activeAssignments.length === 1) {
        assignmentsToRevoke = activeAssignments;
      } else {
        throw new Error('recruiterIds or assignmentIds is required when multiple recruiters are assigned');
      }

      if (assignmentsToRevoke.length === 0) {
        throw new Error('Selected recruiters are not actively assigned to this requirement');
      }

      await tx.requirementAssignment.updateMany({
        where: { id: { in: assignmentsToRevoke.map((row) => row.id) } },
        data: { status: 'REVOKED' },
      });

      const remainingActive = await tx.requirementAssignment.findMany({
        where: { requirementId: id, status: 'ACTIVE' },
        include: {
          recruiter: {
            select: { id: true, email: true, firstName: true, lastName: true, role: true },
          },
        },
        orderBy: { assignedOn: 'asc' },
      });

      const displayNames = remainingActive
        .map((row) => {
          const recruiter = row.recruiter;
          if (!recruiter) return '';
          return (
            [recruiter.firstName, recruiter.lastName].filter(Boolean).join(' ').trim() ||
            recruiter.email ||
            ''
          );
        })
        .filter(Boolean)
        .join(', ');

      const revokedNames = assignmentsToRevoke
        .map((row) => {
          const recruiter = row.recruiter;
          if (!recruiter) return '';
          return (
            [recruiter.firstName, recruiter.lastName].filter(Boolean).join(' ').trim() ||
            recruiter.email ||
            ''
          );
        })
        .filter(Boolean)
        .join(', ');

      const updated = await tx.requirement.update({
        where: { id, isDeleted: false },
        data:
          remainingActive.length > 0
            ? {
                assignment: 'ASSIGNED',
                assignedToRecruiterName: displayNames || null,
              }
            : {
                assignment: 'UNASSIGNED',
                assignedToRecruiterName: null,
                assignmentAssignerName: null,
              },
      });

      await logRequirementActivity(tx, {
        requirementId: id,
        actorId: userId,
        action: 'REVOKED',
        summary:
          remainingActive.length > 0
            ? `Assignment revoked for ${revokedNames}`
            : 'Assignment revoked; requirement moved to unassigned',
        metadata: {
          revokedById: userId ?? null,
          revokedByName: actorName || null,
          revokedRecruiterIds: assignmentsToRevoke.map((row) => row.recruiterId),
          revokedRecruiterNames: revokedNames || null,
          remainingAssigneeCount: remainingActive.length,
        },
      });

      return updated;
    });

    const enriched = (await enrichRequirementsForFrontend([result]))[0];

    ResponseHelper.success(res, 'Requirement assignment revoked successfully', enriched);
  } catch (error: any) {
    console.log('🔍 DEBUG: Revoke Error:', error?.message || error);
    const message = error?.message || 'Unknown error';
    const status =
      message.includes('recruiterIds') || message.includes('assignmentIds') ? 400 : 500;
    ResponseHelper.error(res, `Error: ${message}`, status);
  }
}));

export default router;
