import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { ResponseHelper } from '@/utils/response';
import { validate, ValidationRules } from '@/utils/validation';
import { asyncHandler } from '@/middleware/errorHandler';
import { authenticate, authorize } from '@/middleware/auth';
import { normalizeOfferInHandDetails } from '@/utils/offerInHandDetails';
import {
  parseResumeBuffer,
  parseResumeBuffersBulk,
  isMetaforgeParserAvailable,
  getAiParsingSuspendedReason,
} from '../resume/metaforgeParser';
import { allocateCandidateIdentity } from '@/utils/humanReadableIds';
import {
  normalizeExperienceLabel,
  parseFlexibleExperienceInput,
  parseTotalExperienceYears,
} from '@/utils/candidateExperience';

const router = Router();
import { prisma } from '@/lib/prisma';

import { buildResumeDownloadFileName } from '@/utils/resumeFileName';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'resumes');

/** Row shape from raw SQL list query (aliases match Prisma client field names). */
type CandidateListApiRow = {
  id: string;
  candidateRef: string | null;
  name: string;
  email: string;
  phone: string | null;
  phoneNormalized?: string | null;
  currentCompany: string | null;
  experienceLabel: string | null;
  totalExperience: number | null;
  skills: string[];
  technologies: string[];
  education: string[];
  currentLocation: string | null;
  preferredLocation: string | null;
  noticePeriod: string | null;
  currentSalary: string | null;
  expectedSalary: string | null;
  linkedinUrl: string | null;
  highestQualification: string | null;
  availableForInterview: string | null;
  reasonForJobChange: string | null;
  offerInHand: string | null;
  offerInHandAmount: string | null;
  offerInHandCompany: string | null;
  offerInHandDetails: unknown;
  relevantExperience: string | null;
  resumeUrl: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdById?: string | null;
  createdBy?: { id: string; name: string; email: string } | null;
};

/** Use recruiter submission date for created_at (noon UTC avoids calendar-day TZ drift). */
function submissionDateToCreatedAt(dateYmd?: string): Date {
  if (dateYmd && /^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
    return new Date(`${dateYmd}T12:00:00.000Z`);
  }
  return new Date();
}

function expandSearchVariants(token: string): string[] {
  const t = token.trim().toLowerCase();
  if (!t) return [];
  const variants = new Set<string>([token.trim(), t]);
  const addAiMlFamily = () => {
    [
      'ai',
      'artificial intelligence',
      'artificial-intelligence',
      'gen ai',
      'genai',
      'generative ai',
      'machine learning',
      'ml',
      'deep learning',
      'computer vision',
      'nlp',
      'natural language processing',
      'llm',
      'large language model',
      'large language models',
      'tensorflow',
      'pytorch',
    ].forEach((v) => variants.add(v));
  };
  if (t === 'ai' || t === 'artificial intelligence') {
    addAiMlFamily();
  }
  if (t === 'ml' || t === 'machine learning') {
    addAiMlFamily();
  }
  if (t === 'genai' || t === 'gen ai' || t === 'generative ai') {
    addAiMlFamily();
  }
  if (t === 'llm' || t === 'large language model' || t === 'large language models') {
    addAiMlFamily();
  }
  if (t === 'nlp' || t === 'natural language processing') {
    addAiMlFamily();
  }
  if (t === 'deep learning' || t === 'computer vision') {
    addAiMlFamily();
  }
  return [...variants];
}

function normalizeEmail(email: unknown): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function normalizePhone(phone: unknown): string | null {
  if (typeof phone !== 'string') return null;
  const raw = phone.trim();
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d+]/g, '');
  const normalized =
    cleaned.startsWith('+')
      ? `+${cleaned.slice(1).replace(/\D/g, '')}`
      : cleaned.replace(/\D/g, '');
  if (!normalized || normalized === '+') return null;
  return normalized;
}

/**
 * Optional string fields on PATCH: the client sends JSON `null` to clear a value.
 * `typeof null === 'object'`, so never treat "string-only" checks as sufficient to apply clears.
 */
function nullableStringPatch(body: Record<string, unknown>, key: string): string | null | undefined {
  if (!(key in body)) return undefined;
  const v = body[key];
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v.trim() || null;
  return undefined;
}

function trimOfferDetail(raw: unknown, maxLen: number): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;
  return t.length > maxLen ? t.slice(0, maxLen) : t;
}

// Multer config for resume uploads (saved under backend/uploads/resumes)
const resumeUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
      const emailRaw = String(req.body?.email ?? '').trim().toLowerCase();
      const safeEmail = emailRaw ? emailRaw.replace(/[^a-z0-9]/gi, '_') : 'resume';
      const ext = path.extname(file.originalname).toLowerCase();
      const allowed = new Set(['.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff']);
      const finalExt = allowed.has(ext) ? ext : '.pdf';
      const filename = `${safeEmail}-${Date.now()}${finalExt}`;
      cb(null, filename);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = new Set(['.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff']);
    if (!allowed.has(ext)) return cb(null, false);
    return cb(null, true);
  },
});

/** In-memory upload for resume text extraction (no disk write). */
const resumeParseUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 50 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = new Set([
      '.pdf', '.doc', '.docx', '.txt',
      '.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff',
    ]);
    if (!allowed.has(ext)) return cb(null, false);
    return cb(null, true);
  },
});

/**
 * @route   POST /api/candidates
 * @desc    Create a new candidate
 * @access  Private
 */
router.post('/', authenticate, asyncHandler(async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return ResponseHelper.unauthorized(res, 'Unauthorized');
    }
    const data = req.body;
    
    console.log('🔍 DEBUG: Creating candidate with data:', JSON.stringify(data, null, 2));

    const emailLower = normalizeEmail(data.email);
    if (!emailLower) {
      return ResponseHelper.error(res, 'Email is required', 400);
    }

    const phoneNormalized = normalizePhone(data.phone);

    // Block duplicates by phone (even if email differs).
    // Email duplicates are handled by upsert, but phone duplicates should be restricted.
    if (phoneNormalized) {
      const existingByPhone = await prisma.candidate.findFirst({
        where: { phoneNormalized },
        select: { id: true, name: true, email: true, phone: true },
      });
      if (existingByPhone && existingByPhone.email.toLowerCase() !== emailLower) {
        return ResponseHelper.error(
          res,
          `Duplicate candidate detected: phone number already belongs to ${existingByPhone.name} (${existingByPhone.email}).`,
          409,
        );
      }
    }
    
    // Frontend can send comma-separated `skillsRaw` / `technologiesRaw` values.
    const parsedSkillTokens =
      typeof data.skillsRaw === 'string'
        ? data.skillsRaw
            .split(',')
            .map((s: string) => s.trim())
            .filter(Boolean)
        : Array.isArray(data.skills)
          ? data.skills.map((t: any) => String(t).trim()).filter(Boolean)
          : null;
    const parsedTechnologyTokens =
      typeof data.technologiesRaw === 'string'
        ? data.technologiesRaw
            .split(',')
            .map((s: string) => s.trim())
            .filter(Boolean)
        : Array.isArray(data.technologies)
          ? data.technologies.map((t: any) => String(t).trim()).filter(Boolean)
          : null;
    // Backward compatibility: if only one field is provided, mirror it to the other.
    const skillTokens = parsedSkillTokens ?? parsedTechnologyTokens ?? [];
    const technologyTokens = parsedTechnologyTokens ?? parsedSkillTokens ?? [];
    
    const parsedTotalExperience = data.totalExperience
      ? parseFlexibleExperienceInput(String(data.totalExperience))
      : null;
    const totalExperienceNum: number | null =
      parsedTotalExperience?.storageYears ?? parseTotalExperienceYears(data.totalExperience);
    const experienceLabel =
      (typeof data.experienceLabel === 'string' && data.experienceLabel.trim()
        ? normalizeExperienceLabel(data.experienceLabel)
        : null) ??
      parsedTotalExperience?.displayLabel ??
      null;

    // education: highestQualification as single-item array if string
    const educationArr: string[] = data.highestQualification
      ? [String(data.highestQualification).trim()].filter(Boolean)
      : [];

    // LinkedIn: store URL in sourcePlatformId when provided
    const linkedinUrl = data.linkedinUrl?.trim();
    const sourcePlatform = linkedinUrl ? 'LinkedIn' : (data.sourcePlatform ?? null);
    const sourcePlatformId = linkedinUrl || (data.sourcePlatformId ?? null);
    const availableForInterview =
      typeof data.availableForInterview === 'string' && data.availableForInterview.trim()
        ? data.availableForInterview.trim()
        : null;
    const reasonForJobChange =
      typeof data.reasonForJobChange === 'string' && data.reasonForJobChange.trim()
        ? data.reasonForJobChange.trim()
        : null;
    const relevantExperienceRaw =
      typeof data.relevantExperience === 'string' && data.relevantExperience.trim()
        ? data.relevantExperience.trim()
        : null;
    const relevantExperience = relevantExperienceRaw
      ? parseFlexibleExperienceInput(relevantExperienceRaw)?.displayLabel ?? relevantExperienceRaw
      : null;
    const offerInHand =
      data.offerInHand === true || data.offerInHand === false
        ? String(data.offerInHand)
        : typeof data.offerInHand === 'string' && data.offerInHand.trim()
          ? data.offerInHand.trim()
          : null;
    const offerYes = offerInHand === 'true';
    const norm = normalizeOfferInHandDetails(data as Record<string, unknown>, offerYes);

    const candidatePayload = {
      name: data.name,
      phone: typeof data.phone === 'string' && data.phone.trim() ? data.phone.trim() : null,
      phoneNormalized,
      currentCompany: data.currentEmployer ?? null,
      experienceLabel,
      totalExperience: totalExperienceNum,
      skills: skillTokens,
      technologies: technologyTokens,
      currentLocation: data.currentLocation ?? data.location ?? null,
      preferredLocation: data.preferredLocation ?? null,
      noticePeriod: data.noticePeriod ?? null,
      currentSalary: data.currentSalary ?? data.currentCtc ?? null,
      expectedSalary: data.expectedSalary ?? data.expectedCtc ?? null,
      linkedinUrl: linkedinUrl ?? null,
      highestQualification:
        typeof data.highestQualification === 'string' && data.highestQualification.trim()
          ? data.highestQualification.trim()
          : null,
      availableForInterview,
      reasonForJobChange,
      offerInHand,
      offerInHandAmount: null,
      offerInHandCompany: null,
      offerInHandDetails: norm.details,
      relevantExperience,
      education: educationArr,
      resumeUrl: data.resumeRef ?? null,
      sourcePlatform,
      sourcePlatformId,
      notes:
        typeof data.notes === 'string' && data.notes.trim() ? data.notes.trim().slice(0, 8000) : null,
    };

    // Internal PK is numeric; candidateRef is CAND-YYYY-MM-DD-XXX.
    let candidateNumericId: string;
    let candidateRef: string;
    const submissionDateYmd =
      typeof data.submissionDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(data.submissionDate.trim())
        ? data.submissionDate.trim().slice(0, 10)
        : undefined;
    const preferredRef =
      typeof data.candidateCode === 'string'
        ? data.candidateCode.trim()
        : typeof data.candidateRef === 'string'
          ? data.candidateRef.trim()
          : undefined;
    try {
      ({ id: candidateNumericId, candidateRef } = await allocateCandidateIdentity(prisma, {
        dateYmd: submissionDateYmd,
        preferredRef,
      }));
    } catch (identityErr) {
      const msg = identityErr instanceof Error ? identityErr.message : String(identityErr);
      console.error('[candidates] allocateCandidateIdentity failed:', msg);
      return ResponseHelper.error(res, 'Could not allocate a candidate id. Please try again.', 500);
    }

    const result = await prisma.candidate.upsert({
      where: { email: emailLower },
      update: {
        ...candidatePayload,
        updatedAt: new Date(),
      },
      create: {
        id: candidateNumericId,
        email: emailLower,
        candidateRef,
        ...candidatePayload,
        createdById: userId,
        createdAt: submissionDateToCreatedAt(submissionDateYmd),
        updatedAt: new Date(),
      },
    });

    if (!result.createdById) {
      await prisma.candidate.update({
        where: { id: result.id },
        data: { createdById: userId },
      });
      result.createdById = userId;
    }
    
    console.log('✅ DEBUG: Candidate created successfully:', result.id);
    
    ResponseHelper.created(res, 'Candidate created successfully', result);
  } catch (error: any) {
    console.log('🔍 DEBUG: Candidate creation error:', error?.message || error);
    const msg = String(error?.message || '');
    if (msg.includes('Unique constraint failed') && msg.includes('phone_normalized')) {
      return ResponseHelper.error(res, 'A candidate with this phone number already exists.', 409);
    }
    ResponseHelper.error(res, `Error: ${error?.message || 'Unknown error'}`, 500);
  }
}));

/**
 * @route   GET /api/candidates
 * @desc    Get all candidates (for recruiters)
 * @access  Private/Recruiter
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search as string || '';
    const trimmedSearch = search.trim();
    const searchTokens = trimmedSearch
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean);

    /** Substring match on human-readable skills + technologies (not JSON array cast). */
    const skillsTechLikeSql = (pattern: string) => Prisma.sql`
      lower(
        coalesce(array_to_string(c.skills, ' '), '') || ' ' ||
        coalesce(array_to_string(c.technologies, ' '), '')
      ) LIKE ${pattern}
    `;

    let phraseSkillsTechIds: string[] = [];
    if (trimmedSearch.length >= 2) {
      const phrasePattern = `%${trimmedSearch.toLowerCase()}%`;
      const phraseRows = await prisma.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
          SELECT c.id
          FROM candidates c
          WHERE ${skillsTechLikeSql(phrasePattern)}
        `,
      );
      phraseSkillsTechIds = [...new Set(phraseRows.map((r) => r.id))];
    }

    let arrayMatchIds: string[] = [];
    if (searchTokens.length) {
      let runningIds: Set<string> | null = null;
      for (const token of searchTokens) {
        const variants = expandSearchVariants(token);
        const currentIds = new Set<string>();
        for (const variant of variants) {
          const pattern = `%${variant.toLowerCase()}%`;
          const rows = await prisma.$queryRaw<Array<{ id: string }>>(
            Prisma.sql`
              SELECT c.id
              FROM candidates c
              WHERE ${skillsTechLikeSql(pattern)}
            `,
          );
          for (const row of rows) currentIds.add(row.id);
        }
        if (runningIds === null) {
          runningIds = currentIds;
        } else {
          runningIds = new Set<string>([...runningIds].filter((id: string) => currentIds.has(id)));
        }
        if (runningIds.size === 0) break;
      }
      arrayMatchIds = runningIds ? [...runningIds] : [];
    }

    const tokenClauses = searchTokens.map((token) => {
      const variants = expandSearchVariants(token);
      return {
        OR: [
          { id: { contains: token, mode: 'insensitive' as const } },
          { candidateRef: { contains: token, mode: 'insensitive' as const } },
          { name: { contains: token, mode: 'insensitive' as const } },
          { email: { contains: token, mode: 'insensitive' as const } },
          { phone: { contains: token, mode: 'insensitive' as const } },
          { currentCompany: { contains: token, mode: 'insensitive' as const } },
          { currentLocation: { contains: token, mode: 'insensitive' as const } },
          { preferredLocation: { contains: token, mode: 'insensitive' as const } },
          { experienceLabel: { contains: token, mode: 'insensitive' as const } },
          { relevantExperience: { contains: token, mode: 'insensitive' as const } },
          { highestQualification: { contains: token, mode: 'insensitive' as const } },
          { noticePeriod: { contains: token, mode: 'insensitive' as const } },
          { notes: { contains: token, mode: 'insensitive' as const } },
        ],
      };
    });
    const fullQuery = trimmedSearch;
    const phraseVariants = expandSearchVariants(fullQuery);
    const phraseClause =
      fullQuery.length > 2
        ? {
            OR: [
              { id: { contains: fullQuery, mode: 'insensitive' as const } },
              { candidateRef: { contains: fullQuery, mode: 'insensitive' as const } },
              { name: { contains: fullQuery, mode: 'insensitive' as const } },
              { email: { contains: fullQuery, mode: 'insensitive' as const } },
              { currentCompany: { contains: fullQuery, mode: 'insensitive' as const } },
              { experienceLabel: { contains: fullQuery, mode: 'insensitive' as const } },
              { notes: { contains: fullQuery, mode: 'insensitive' as const } },
              ...phraseVariants.flatMap((v) => [{ skills: { has: v } }, { technologies: { has: v } }]),
            ],
          }
        : null;
    const where = searchTokens.length
      ? ({
          OR: [
            { AND: tokenClauses },
            ...(phraseClause ? [phraseClause] : []),
            ...(phraseSkillsTechIds.length ? [{ id: { in: phraseSkillsTechIds } }] : []),
            ...(arrayMatchIds.length ? [{ id: { in: arrayMatchIds } }] : []),
          ],
        } as Prisma.CandidateWhereInput)
      : {};

    const pageSize = Math.min(Math.max(Number.isFinite(limit) && limit > 0 ? limit : 10, 1), 500);
    const skipVal = (page - 1) * pageSize;

    let candidates: CandidateListApiRow[];
    let total: number;

    if (!searchTokens.length) {
      const [rows, countRow] = await Promise.all([
        prisma.$queryRaw<CandidateListApiRow[]>(Prisma.sql`
          SELECT
            id,
            candidate_ref AS "candidateRef",
            name,
            email,
            phone,
            phone_normalized AS "phoneNormalized",
            current_company AS "currentCompany",
            experience_label AS "experienceLabel",
            total_experience AS "totalExperience",
            skills,
            technologies,
            education,
            current_location AS "currentLocation",
            preferred_location AS "preferredLocation",
            notice_period AS "noticePeriod",
            current_salary AS "currentSalary",
            expected_salary AS "expectedSalary",
            linkedin_url AS "linkedinUrl",
            highest_qualification AS "highestQualification",
            available_for_interview AS "availableForInterview",
            reason_for_job_change AS "reasonForJobChange",
            offer_in_hand AS "offerInHand",
            offer_in_hand_amount AS "offerInHandAmount",
            offer_in_hand_company AS "offerInHandCompany",
            offer_in_hand_details AS "offerInHandDetails",
            relevant_experience AS "relevantExperience",
            resume_url AS "resumeUrl",
            notes,
            created_by AS "createdById",
            created_at AS "createdAt",
            updated_at AS "updatedAt",
            coalesce(candidate_creator."createdBy", creator."createdBy") AS "createdBy"
          FROM candidates
          LEFT JOIN LATERAL (
            SELECT json_build_object(
              'id', u.id,
              'name', trim(concat(u."firstName", ' ', u."lastName")),
              'email', u.email
            ) AS "createdBy"
            FROM users u
            WHERE u.id = candidates.created_by
            LIMIT 1
          ) candidate_creator ON TRUE
          LEFT JOIN LATERAL (
            SELECT json_build_object(
              'id', u.id,
              'name', trim(concat(u."firstName", ' ', u."lastName")),
              'email', u.email
            ) AS "createdBy"
            FROM submissions s
            JOIN users u ON u.id = s.submitted_by
            WHERE s.candidate_id = candidates.id
            ORDER BY s.submitted_on ASC, s.created_at ASC
            LIMIT 1
          ) creator ON TRUE
          ORDER BY
            updated_at DESC NULLS LAST,
            created_at DESC NULLS LAST,
            CASE WHEN id ~ '^[0-9]+$' THEN id::bigint END ASC NULLS LAST,
            id ASC
          LIMIT ${pageSize} OFFSET ${skipVal}
        `),
        prisma.candidate.count({ where: {} }),
      ]);
      candidates = rows;
      total = countRow;
    } else {
      const pair = await Promise.all([
        prisma.candidate.findMany({
          where,
          select: {
            id: true,
            candidateRef: true,
            name: true,
            email: true,
            phone: true,
            currentCompany: true,
            experienceLabel: true,
            totalExperience: true,
            technologies: true,
            skills: true,
            currentSalary: true,
            currentLocation: true,
            expectedSalary: true,
            preferredLocation: true,
            noticePeriod: true,
            education: true,
            resumeUrl: true,
            linkedinUrl: true,
            highestQualification: true,
            availableForInterview: true,
            reasonForJobChange: true,
            offerInHand: true,
            offerInHandAmount: true,
            offerInHandCompany: true,
            offerInHandDetails: true,
            relevantExperience: true,
            notes: true,
            createdAt: true,
            updatedAt: true,
            createdBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            submissions: {
              orderBy: [{ submittedOn: 'asc' }, { createdAt: 'asc' }],
              take: 1,
              select: {
                submitter: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                  },
                },
              },
            },
          },
          orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
          skip: skipVal,
          take: pageSize,
        }),
        prisma.candidate.count({ where }),
      ]);
      candidates = pair[0] as CandidateListApiRow[];
      total = pair[1];
    }

    const mappedCandidates = candidates.map((c: any) => ({
      ...c,
      createdBy:
        c.createdBy?.email
          ? {
              id: c.createdBy.id,
              name:
                c.createdBy.name ??
                `${c.createdBy.firstName ?? ''} ${c.createdBy.lastName ?? ''}`.trim(),
              email: c.createdBy.email,
            }
          :
        (c.submissions?.[0]?.submitter
          ? {
              id: c.submissions[0].submitter.id,
              name: `${c.submissions[0].submitter.firstName ?? ''} ${c.submissions[0].submitter.lastName ?? ''}`.trim(),
              email: c.submissions[0].submitter.email,
            }
          : null),
      submissions: undefined,
      currentEmployer: c.currentCompany,
      resumeRef: c.resumeUrl,
      phone: c.phone ?? '',
    }));

    ResponseHelper.success(res, 'Candidates retrieved successfully', {
      candidates: mappedCandidates,
      pagination: {
        page,
        limit: pageSize,
        total,
        pages: Math.ceil(total / pageSize),
      },
    });
  } catch (error: any) {
    console.log('🔍 DEBUG: GET candidates error:', error?.message || error);
    ResponseHelper.error(res, `Error: ${error?.message || 'Unknown error'}`, 500);
  }
}));

/**
 * @route   GET /api/candidates/profile
 * @desc    Get current candidate profile
 * @access  Private/Candidate
 */
router.get('/profile', authenticate, authorize('CANDIDATE'), asyncHandler(async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    
    const candidate = await prisma.candidate.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        currentCompany: true,
        experienceLabel: true,
        resumeUrl: true,
        linkedinUrl: true,
        highestQualification: true,
        availableForInterview: true,
        reasonForJobChange: true,
        offerInHand: true,
        offerInHandAmount: true,
        offerInHandCompany: true,
        offerInHandDetails: true,
        relevantExperience: true,
        createdAt: true,
        updatedAt: true,
      }
    });

    if (!candidate) {
      return ResponseHelper.error(res, 'Candidate profile not found', 404);
    }

    ResponseHelper.success(res, 'Candidate profile retrieved successfully', candidate);
  } catch (error: any) {
    console.log('🔍 DEBUG: GET candidate profile error:', error?.message || error);
    ResponseHelper.error(res, `Error: ${error?.message || 'Unknown error'}`, 500);
  }
}));

/**
 * @route   PUT /api/candidates/profile
 * @desc    Update candidate profile
 * @access  Private/Candidate
 */
router.put('/profile', authenticate, authorize('CANDIDATE'), validate(ValidationRules.updateCandidateProfile), asyncHandler(async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const updateData = req.body;

    const updatedCandidate = await prisma.candidate.update({
      where: { id: userId },
      data: {
        ...updateData,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        currentCompany: true,
        experienceLabel: true,
        resumeUrl: true,
        linkedinUrl: true,
        highestQualification: true,
        availableForInterview: true,
        reasonForJobChange: true,
        offerInHand: true,
        relevantExperience: true,
        createdAt: true,
        updatedAt: true,
      }
    });

    ResponseHelper.success(res, 'Candidate profile updated successfully', updatedCandidate);
  } catch (error: any) {
    console.log('🔍 DEBUG: PUT candidate profile error:', error?.message || error);
    ResponseHelper.error(res, `Error: ${error?.message || 'Unknown error'}`, 500);
  }
}));

/**
 * @route   POST /api/candidates/resume/upload
 * @desc    Upload candidate resume file and update candidate.resumeUrl
 * @access  Private
 */
router.post(
  '/resume/upload',
  authenticate,
  resumeUpload.single('resume'),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const email = String(req.body?.email ?? '').trim().toLowerCase();
      if (!email) {
        return ResponseHelper.error(res, 'email is required', 400);
      }
      if (!req.file) {
        return ResponseHelper.error(res, 'resume file is required', 400);
      }

      const candidate = await prisma.candidate.findUnique({
        where: { email },
        select: { id: true, name: true, email: true, resumeUrl: true },
      });

      if (!candidate) {
        return ResponseHelper.error(res, 'Candidate not found', 404);
      }

      const updated = await prisma.candidate.update({
        where: { email },
        data: { resumeUrl: req.file.filename, updatedAt: new Date() },
        select: { id: true, name: true, email: true, resumeUrl: true },
      });

      ResponseHelper.success(res, 'Resume uploaded successfully', updated);
    } catch (error: any) {
      ResponseHelper.error(res, error?.message || 'Failed to upload resume', 500);
    }
  }),
);

/**
 * @route   POST /api/candidates/resume/parse
 * @desc    Parse resume via Metaforge AI (Gemini) with keyword-parser fallback
 * @access  Private
 */
router.post(
  '/resume/parse',
  authenticate,
  resumeParseUpload.single('resume'),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const file = req.file;
      if (!file?.buffer) {
        return ResponseHelper.error(res, 'resume file is required', 400);
      }
      const name = file.originalname || 'resume.pdf';
      const parsed = await parseResumeBuffer(file.buffer, name);
      ResponseHelper.success(res, 'Resume parsed successfully', parsed);
    } catch (error: any) {
      ResponseHelper.error(res, error?.message || 'Failed to parse resume', 500);
    }
  }),
);

/**
 * @route   POST /api/candidates/resume/parse/bulk
 * @desc    Parse multiple resumes (up to 50) via Metaforge AI with fallback
 * @access  Private
 */
router.post(
  '/resume/parse/bulk',
  authenticate,
  (req, res, next) => {
    req.setTimeout(10 * 60 * 1000);
    res.setTimeout(10 * 60 * 1000);
    next();
  },
  resumeParseUpload.array('resumes', 50),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (!files.length) {
        return ResponseHelper.error(res, 'At least one resume file is required', 400);
      }
      const inputs = files
        .filter((f) => f?.buffer)
        .map((f) => ({
          buffer: f.buffer,
          filename: f.originalname || 'resume.pdf',
        }));
      if (!inputs.length) {
        return ResponseHelper.error(res, 'No valid resume files received', 400);
      }
      const results = await parseResumeBuffersBulk(inputs);
      const usedLegacy = results.some((r) => r.status === 'done' && r.data.parser === 'legacy');
      const aiNotice = getAiParsingSuspendedReason();
      ResponseHelper.success(res, 'Bulk resume parse completed', {
        count: results.length,
        parser:
          isMetaforgeParserAvailable() && !usedLegacy && !aiNotice ? 'metaforge' : 'legacy',
        notice: aiNotice,
        results,
      });
    } catch (error: any) {
      ResponseHelper.error(res, error?.message || 'Bulk resume parse failed', 500);
    }
  }),
);

/**
 * @route   GET /api/candidates/:id/resume
 * @desc    Download candidate resume file
 * @access  Private
 */
router.get('/:id/resume', authenticate, asyncHandler(async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const candidate = await prisma.candidate.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        resumeUrl: true,
        skills: true,
        technologies: true,
        totalExperience: true,
        experienceLabel: true,
      },
    });
    if (!candidate) {
      return ResponseHelper.error(res, 'Candidate not found', 404);
    }
    const resumeUrl = candidate.resumeUrl?.trim();
    if (!resumeUrl) {
      return ResponseHelper.error(res, 'No resume on file for this candidate', 404);
    }
    // If resumeUrl is a full URL, redirect (external storage)
    if (resumeUrl.startsWith('http://') || resumeUrl.startsWith('https://')) {
      return res.redirect(302, resumeUrl);
    }
    // Look for file: uploads/resumes/{candidateId}.ext or uploads/resumes/{filename}
    const safeName = resumeUrl.replace(/[^a-zA-Z0-9._-]/g, '_');
    const candidates = [
      path.join(UPLOADS_DIR, `${id}.pdf`),
      path.join(UPLOADS_DIR, `${id}.doc`),
      path.join(UPLOADS_DIR, `${id}.docx`),
      path.join(UPLOADS_DIR, `${id}.png`),
      path.join(UPLOADS_DIR, `${id}.jpg`),
      path.join(UPLOADS_DIR, `${id}.jpeg`),
      path.join(UPLOADS_DIR, `${id}.webp`),
      path.join(UPLOADS_DIR, `${id}.bmp`),
      path.join(UPLOADS_DIR, `${id}.tif`),
      path.join(UPLOADS_DIR, `${id}.tiff`),
      path.join(UPLOADS_DIR, safeName),
      path.join(UPLOADS_DIR, resumeUrl),
    ];
    let filePath: string | null = null;
    for (const p of candidates) {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        filePath = p;
        break;
      }
    }
    if (!filePath) {
      return ResponseHelper.error(res, 'Resume file not found on server', 404);
    }
    const ext = path.extname(filePath).toLowerCase();
    const mime: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
      '.tif': 'image/tiff',
      '.tiff': 'image/tiff',
    };
    res.setHeader('Content-Type', mime[ext] || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${buildResumeDownloadFileName(
        {
          name: candidate.name,
          skills: candidate.skills,
          technologies: candidate.technologies,
          totalExperience: candidate.totalExperience,
          experienceLabel: candidate.experienceLabel,
        },
        ext,
      ).replace(/"/g, '')}"`,
    );
    res.sendFile(filePath);
  } catch (error: any) {
    ResponseHelper.error(res, error?.message || 'Failed to download resume', 500);
  }
}));

/**
 * @route   PATCH /api/candidates/:id
 * @desc    Update candidate profile (recruiters / leads)
 * @access  Private
 */
router.patch(
  '/:id',
  authenticate,
  validate(ValidationRules.resourceIdParam),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const data = req.body ?? {};
      const body = data as Record<string, unknown>;

      const existing = await prisma.candidate.findUnique({ where: { id } });
      if (!existing) {
        return ResponseHelper.error(res, 'Candidate not found', 404);
      }

      const emailLower =
        typeof data.email === 'string' && data.email.trim()
          ? normalizeEmail(data.email)
          : null;
      if (emailLower && emailLower !== existing.email.toLowerCase()) {
        const clash = await prisma.candidate.findUnique({ where: { email: emailLower } });
        if (clash) {
          return ResponseHelper.error(res, 'Another candidate already uses this email.', 409);
        }
      }

      let nextPhoneNorm: string | null | undefined;
      if (typeof data.phone === 'string') {
        nextPhoneNorm = normalizePhone(data.phone);
        if (nextPhoneNorm) {
          const dup = await prisma.candidate.findFirst({
            where: { phoneNormalized: nextPhoneNorm, NOT: { id } },
          });
          if (dup) {
            return ResponseHelper.error(
              res,
              `Phone already belongs to ${dup.name} (${dup.email}).`,
              409,
            );
          }
        }
      }

      const skillTokens: string[] | undefined =
        typeof data.skillsRaw === 'string'
          ? data.skillsRaw
              .split(',')
              .map((s: string) => s.trim())
              .filter(Boolean)
          : Array.isArray(data.skills)
            ? data.skills.map((t: unknown) => String(t).trim()).filter(Boolean)
            : typeof data.technologiesRaw === 'string'
              ? data.technologiesRaw
                  .split(',')
                  .map((s: string) => s.trim())
                  .filter(Boolean)
              : Array.isArray(data.technologies)
                ? data.technologies.map((t: unknown) => String(t).trim()).filter(Boolean)
                : undefined;
      const technologyTokens: string[] | undefined =
        typeof data.technologiesRaw === 'string'
          ? data.technologiesRaw
              .split(',')
              .map((s: string) => s.trim())
              .filter(Boolean)
          : Array.isArray(data.technologies)
            ? data.technologies.map((t: unknown) => String(t).trim()).filter(Boolean)
            : typeof data.skillsRaw === 'string'
              ? data.skillsRaw
                  .split(',')
                  .map((s: string) => s.trim())
                  .filter(Boolean)
              : Array.isArray(data.skills)
                ? data.skills.map((t: unknown) => String(t).trim()).filter(Boolean)
                : undefined;

      let totalExperienceNum: number | null | undefined;
      let parsedTotalExperience: ReturnType<typeof parseFlexibleExperienceInput> = null;
      if (data.totalExperience !== undefined && data.totalExperience !== null) {
        const rawTotal = String(data.totalExperience).trim();
        parsedTotalExperience = rawTotal ? parseFlexibleExperienceInput(rawTotal) : null;
        totalExperienceNum =
          parsedTotalExperience?.storageYears ?? parseTotalExperienceYears(data.totalExperience);
      }

      const updateData: Prisma.CandidateUpdateInput = {};

      if (typeof data.name === 'string' && data.name.trim()) {
        updateData.name = data.name.trim();
      }
      if (emailLower) {
        updateData.email = emailLower;
      }
      if (typeof data.phone === 'string') {
        updateData.phone = data.phone.trim() || null;
        updateData.phoneNormalized = nextPhoneNorm ?? null;
      }
      {
        const v = nullableStringPatch(body, 'currentEmployer');
        if (v !== undefined) updateData.currentCompany = v;
      }
      {
        const v = nullableStringPatch(body, 'experienceLabel');
        if (v !== undefined) {
          updateData.experienceLabel = v ? normalizeExperienceLabel(v) : null;
        } else if (parsedTotalExperience?.displayLabel) {
          updateData.experienceLabel = parsedTotalExperience.displayLabel;
        }
      }
      if (totalExperienceNum !== undefined) {
        updateData.totalExperience = totalExperienceNum;
      }
      if (skillTokens !== undefined) {
        updateData.skills = skillTokens;
      }
      if (technologyTokens !== undefined) {
        updateData.technologies = technologyTokens;
      }
      {
        const v = nullableStringPatch(body, 'currentLocation');
        if (v !== undefined) updateData.currentLocation = v;
      }
      {
        const v = nullableStringPatch(body, 'preferredLocation');
        if (v !== undefined) updateData.preferredLocation = v;
      }
      {
        const v = nullableStringPatch(body, 'noticePeriod');
        if (v !== undefined) updateData.noticePeriod = v;
      }
      if ('currentSalary' in data || 'currentCtc' in data) {
        const v =
          typeof data.currentSalary === 'string'
            ? data.currentSalary
            : typeof data.currentCtc === 'string'
              ? data.currentCtc
              : '';
        updateData.currentSalary = String(v).trim() || null;
      }
      if ('expectedSalary' in data || 'expectedCtc' in data) {
        const v =
          typeof data.expectedSalary === 'string'
            ? data.expectedSalary
            : typeof data.expectedCtc === 'string'
              ? data.expectedCtc
              : '';
        updateData.expectedSalary = String(v).trim() || null;
      }
      {
        const v = nullableStringPatch(body, 'linkedinUrl');
        if (v !== undefined) {
          updateData.linkedinUrl = v;
          if (v) {
            updateData.sourcePlatform = 'LinkedIn';
            updateData.sourcePlatformId = v;
          }
        }
      }
      if ('highestQualification' in body) {
        const q = nullableStringPatch(body, 'highestQualification');
        if (q !== undefined) {
          updateData.highestQualification = q;
          updateData.education = q ? [q] : [];
        }
      }
      {
        const v = nullableStringPatch(body, 'availableForInterview');
        if (v !== undefined) updateData.availableForInterview = v;
      }
      {
        const v = nullableStringPatch(body, 'reasonForJobChange');
        if (v !== undefined) updateData.reasonForJobChange = v;
      }
      {
        const v = nullableStringPatch(body, 'relevantExperience');
        if (v !== undefined) {
          updateData.relevantExperience = v
            ? parseFlexibleExperienceInput(v)?.displayLabel ?? v
            : null;
        }
      }
      let nextOfferVal: string | null = existing.offerInHand ?? null;
      if (data.offerInHand === true || data.offerInHand === false) {
        nextOfferVal = String(data.offerInHand);
        updateData.offerInHand = nextOfferVal;
      } else if (typeof data.offerInHand === 'string') {
        const t = data.offerInHand.trim();
        nextOfferVal = t || null;
        updateData.offerInHand = nextOfferVal;
      }
      const offerYes =
        String(nextOfferVal ?? '')
          .trim()
          .toLowerCase() === 'true';

      const offerTouched =
        'offerInHand' in data ||
        'offerInHandDetails' in data ||
        'offerInHandAmount' in data ||
        'offerInHandCompany' in data;

      if (offerTouched) {
        if (!offerYes) {
          updateData.offerInHandAmount = null;
          updateData.offerInHandCompany = null;
          updateData.offerInHandDetails = Prisma.JsonNull;
        } else if (
          'offerInHandDetails' in data ||
          'offerInHandAmount' in data ||
          'offerInHandCompany' in data
        ) {
          const norm = normalizeOfferInHandDetails(data as Record<string, unknown>, offerYes);
          updateData.offerInHandDetails = norm.details;
          updateData.offerInHandAmount = null;
          updateData.offerInHandCompany = null;
        }
      }
      {
        const v = nullableStringPatch(body, 'resumeRef');
        if (v !== undefined) updateData.resumeUrl = v;
      }
      if ('notes' in body) {
        const v = nullableStringPatch(body, 'notes');
        if (v !== undefined) {
          updateData.notes = v ? v.slice(0, 8000) : null;
        }
      }

      const updated = await prisma.candidate.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          currentCompany: true,
          experienceLabel: true,
          totalExperience: true,
          technologies: true,
          skills: true,
          currentSalary: true,
          currentLocation: true,
          expectedSalary: true,
          preferredLocation: true,
          noticePeriod: true,
          education: true,
          highestQualification: true,
          relevantExperience: true,
          reasonForJobChange: true,
          offerInHand: true,
          offerInHandAmount: true,
          offerInHandCompany: true,
          offerInHandDetails: true,
          availableForInterview: true,
          notes: true,
          resumeUrl: true,
          linkedinUrl: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      ResponseHelper.success(res, 'Candidate updated successfully', {
        ...updated,
        currentEmployer: updated.currentCompany,
        resumeRef: updated.resumeUrl,
        phone: updated.phone ?? '',
      });
    } catch (error: any) {
      const msg = String(error?.message || '');
      if (msg.includes('Unique constraint') && msg.includes('phone_normalized')) {
        return ResponseHelper.error(res, 'A candidate with this phone number already exists.', 409);
      }
      ResponseHelper.error(res, error?.message || 'Failed to update candidate', 500);
    }
  }),
);

/**
 * @route   GET /api/candidates/:id
 * @desc    Get candidate by ID (public profile)
 * @access  Public
 */
router.get('/:id', validate(ValidationRules.resourceIdParam), asyncHandler(async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const candidate = await prisma.candidate.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        currentCompany: true,
        experienceLabel: true,
        totalExperience: true,
        technologies: true,
        skills: true,
        currentSalary: true,
        currentLocation: true,
        expectedSalary: true,
        preferredLocation: true,
        noticePeriod: true,
        education: true,
        highestQualification: true,
        relevantExperience: true,
        reasonForJobChange: true,
        offerInHand: true,
        offerInHandAmount: true,
        offerInHandCompany: true,
        offerInHandDetails: true,
        availableForInterview: true,
        notes: true,
        resumeUrl: true,
        linkedinUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!candidate) {
      return ResponseHelper.error(res, 'Candidate not found', 404);
    }

    ResponseHelper.success(res, 'Candidate retrieved successfully', {
      ...candidate,
      currentEmployer: candidate.currentCompany,
      resumeRef: candidate.resumeUrl,
      phone: candidate.phone ?? '',
      linkedinUrl: candidate.linkedinUrl ?? '',
    });
  } catch (error: any) {
    console.log('🔍 DEBUG: GET candidate by ID error:', error?.message || error);
    ResponseHelper.error(res, `Error: ${error?.message || 'Unknown error'}`, 500);
  }
}));

export default router;
