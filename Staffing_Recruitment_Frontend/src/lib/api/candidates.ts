// API functions for candidates and job demands
import type { Candidate, CandidateSubmission, JobDemand } from '@/lib/domain/candidates/types';
import { dedupeCandidateSubmissionsByCandidateRequirement } from '@/lib/domain/submissions/dedupe';
import { getPublicApiBase } from '@/lib/publicOrigin';

/** Fields returned by POST /api/candidates/resume/parse (Metaforge AI + legacy fallback). */
export type ParsedResumeCoreFields = {
  candidateName: string | null;
  email: string | null;
  contactNumber: string | null;
  linkedinUrl: string | null;
  highestQualification: string | null;
  skillsRaw: string | null;
  technologiesRaw: string | null;
  totalExperience: string | null;
  relevantExperience: string | null;
  currentEmployer: string | null;
  sourceFile?: string;
  parser?: 'metaforge' | 'legacy';
};

export type BulkResumeParseResult =
  | { sourceFile: string; status: 'done'; data: ParsedResumeCoreFields }
  | { sourceFile: string; status: 'error'; error: string };

export type BulkResumeParseResponse = {
  count: number;
  parser: 'metaforge' | 'legacy';
  notice?: string | null;
  results: BulkResumeParseResult[];
};

function authHeadersForUpload(): HeadersInit {
  return {
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  };
}

/**
 * Server-side resume parse (Metaforge AI via Gemini, with keyword-parser fallback).
 * Requires auth. Falls back to client-side parsing if this throws.
 */
export async function parseResumeViaApi(resumeFile: File): Promise<ParsedResumeCoreFields> {
  const form = new FormData();
  form.append('resume', resumeFile);
  const response = await fetch(`${getPublicApiBase()}/api/candidates/resume/parse`, {
    method: 'POST',
    headers: authHeadersForUpload(),
    body: form,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      (err as { message?: string }).message || `Resume parse failed (${response.status})`,
    );
  }
  const result = await response.json();
  const data = result.data as ParsedResumeCoreFields | undefined;
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid parse response from server');
  }
  return data;
}

/**
 * Parse up to 50 resumes sequentially (one file per request).
 * Avoids proxy timeouts and shows per-file progress via onProgress.
 */
export async function parseBulkResumesViaApi(
  resumeFiles: File[],
  onProgress?: (results: BulkResumeParseResult[]) => void,
): Promise<BulkResumeParseResponse> {
  if (!resumeFiles.length) {
    throw new Error('Select at least one resume file');
  }
  if (resumeFiles.length > 50) {
    throw new Error('Maximum 50 resumes per bulk parse');
  }

  const results: BulkResumeParseResult[] = [];
  let usedLegacy = false;
  let notice: string | null = null;

  for (const file of resumeFiles) {
    try {
      const data = await parseResumeViaApi(file);
      if (data.parser === 'legacy') usedLegacy = true;
      results.push({ sourceFile: file.name, status: 'done', data });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to parse resume';
      if (/quota|rate.?limit/i.test(message)) {
        notice = 'Gemini API quota or rate limit reached — some files may use keyword parsing only.';
      }
      results.push({ sourceFile: file.name, status: 'error', error: message });
    }
    onProgress?.([...results]);
  }

  return {
    count: results.length,
    parser: usedLegacy ? 'legacy' : 'metaforge',
    notice,
    results,
  };
}

export async function uploadCandidateResume(input: {
  email: string;
  resumeFile: File;
}): Promise<{ id: string; name: string; email: string; resumeUrl: string | null }> {
  const form = new FormData();
  form.append('email', input.email);
  form.append('resume', input.resumeFile);

  const response = await fetch(`${getPublicApiBase()}/api/candidates/resume/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`,
    },
    body: form,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to upload resume: ${response.statusText}`);
  }

  const result = await response.json();
  return result.data;
}

export async function getJobDemands(): Promise<JobDemand[]> {
  const response = await fetch(`${getPublicApiBase()}/api/requirements`, {
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`,
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch job demands: ${response.statusText}`);
  }
  
  const result = await response.json();
  const requirements = result.data?.requirements || [];

  return requirements.map((r: any) => ({
    id: r.id,
    jobTitle: r.roleTitle ?? r.jobTitle ?? '',
    clientLeadPoc: r.clientLeadPoc ?? '',
    jdCode: r.requirementId ?? r.jdCode ?? '',
    assignedRecruiters: Array.isArray(r.assignedRecruiters)
      ? r.assignedRecruiters.map((x: any) => ({
          id: x.id,
          name: x.name,
          email: x.email,
        }))
      : [],
  }));
}

/**
 * `candidates.id` is a string; numeric ids must sort 1,2,…,10 (not 1,10,100 as plain strings).
 * Non-numeric ids (e.g. cuid) sort after all-numeric ids, then lexicographically.
 */
export function compareCandidateIdNumericAsc(a: Pick<Candidate, 'id'>, b: Pick<Candidate, 'id'>): number {
  const na = /^\d+$/.test(a.id) ? Number(a.id) : Number.NaN;
  const nb = /^\d+$/.test(b.id) ? Number(b.id) : Number.NaN;
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  if (!Number.isNaN(na)) return -1;
  if (!Number.isNaN(nb)) return 1;
  return String(a.id).localeCompare(String(b.id));
}

/** Newest first (bulk imports / edits bump `updatedAt`). */
export function compareCandidateUpdatedAtDesc(a: Candidate, b: Candidate): number {
  const tu = Date.parse(String(a.updatedAt || a.createdAt || ''));
  const tv = Date.parse(String(b.updatedAt || b.createdAt || ''));
  const u = Number.isFinite(tu) ? tu : 0;
  const v = Number.isFinite(tv) ? tv : 0;
  if (v !== u) return v - u;
  return compareCandidateIdNumericAsc(a, b);
}

export async function getCandidates(): Promise<Candidate[]> {
  // Backend defaults to page=1&limit=10; load all pages so repository search
  // can match across the full candidate pool (not only first page slice).
  const limit = 500;
  let page = 1;
  let pages = 1;
  const allRows: Array<Record<string, unknown>> = [];

  while (page <= pages) {
    const response = await fetch(`${getPublicApiBase()}/api/candidates?limit=${limit}&page=${page}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch candidates: ${response.statusText}`);
    }

    const result = await response.json();
    const rows = (result.data?.candidates || []) as Array<Record<string, unknown>>;
    const pagination = result.data?.pagination as
      | { pages?: number; page?: number; total?: number; limit?: number }
      | undefined;
    allRows.push(...rows);
    pages = Math.max(1, Number(pagination?.pages ?? 1));
    page += 1;
  }

  // Safety dedupe by internal id in case API pages overlap.
  const unique = new Map<string, Record<string, unknown>>();
  for (const row of allRows) {
    const id = String(row.id ?? '');
    if (!id) continue;
    unique.set(id, row);
  }

  return [...unique.values()]
    .map((raw: Record<string, unknown>) => mapApiCandidateToClient(raw))
    .sort(compareCandidateUpdatedAtDesc);
}

export async function searchCandidates(input: {
  query: string;
  limit?: number;
  page?: number;
}): Promise<Candidate[]> {
  const query = input.query.trim();
  if (!query) return [];
  const limit = Math.max(1, Math.min(500, input.limit ?? 100));
  const page = Math.max(1, input.page ?? 1);
  const response = await fetch(
    `${getPublicApiBase()}/api/candidates?search=${encodeURIComponent(query)}&limit=${limit}&page=${page}`,
    {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    },
  );
  if (!response.ok) {
    throw new Error(`Failed to search candidates: ${response.statusText}`);
  }
  const result = await response.json();
  const rows = (result.data?.candidates || []) as Array<Record<string, unknown>>;
  return rows.map((raw) => mapApiCandidateToClient(raw));
}

function parseOfferInHandDetailsFromApi(raw: unknown): Candidate['offerInHandDetails'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.offers)) return null;
  return { offers: o.offers as Array<{ company?: string; ctc?: string }> };
}

function mapApiCandidateToClient(raw: Record<string, unknown>): Candidate {
  const technologies = Array.isArray(raw.technologies)
    ? (raw.technologies as string[])
    : Array.isArray(raw.skills)
      ? (raw.skills as string[])
      : [];
  const createdByRaw = raw.createdBy;
  const createdBy =
    createdByRaw && typeof createdByRaw === 'object' && !Array.isArray(createdByRaw)
      ? (createdByRaw as Record<string, unknown>)
      : null;

  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    email: String(raw.email ?? ''),
    phone: typeof raw.phone === 'string' ? raw.phone : '',
    candidateCode: typeof raw.candidateCode === 'string' ? raw.candidateCode : undefined,
    candidateRef: typeof raw.candidateRef === 'string' ? raw.candidateRef : undefined,
    currentEmployer:
      typeof raw.currentEmployer === 'string'
        ? raw.currentEmployer
        : typeof raw.currentCompany === 'string'
          ? raw.currentCompany
          : undefined,
    currentLocation:
      (typeof raw.currentLocation === 'string' ? raw.currentLocation : null) ??
      (typeof raw.current_location === 'string' ? raw.current_location : null) ??
      (typeof raw.location === 'string' ? raw.location : null),
    location:
      typeof raw.currentLocation === 'string'
        ? raw.currentLocation
        : typeof raw.current_location === 'string'
          ? raw.current_location
          : typeof raw.location === 'string'
            ? raw.location
            : undefined,
    currentSalary: (raw.currentSalary as string) ?? null,
    expectedSalary: (raw.expectedSalary as string) ?? null,
    availableForInterview: (raw.availableForInterview as string) ?? null,
    skills: Array.isArray(raw.skills) ? (raw.skills as string[]) : technologies,
    education: Array.isArray(raw.education) ? (raw.education as string[]) : [],
    highestQualification: (raw.highestQualification as string) ?? null,
    preferredLocation: (raw.preferredLocation as string) ?? null,
    noticePeriod: (raw.noticePeriod as string) ?? null,
    relevantExperience: (raw.relevantExperience as string) ?? null,
    reasonForJobChange: (raw.reasonForJobChange as string) ?? null,
    offerInHand: raw.offerInHand != null ? String(raw.offerInHand) : null,
    offerInHandAmount: (raw.offerInHandAmount as string) ?? null,
    offerInHandCompany: (raw.offerInHandCompany as string) ?? null,
    offerInHandDetails: parseOfferInHandDetailsFromApi(raw.offerInHandDetails),
    notes: (raw.notes as string) ?? null,
    linkedinUrl: (raw.linkedinUrl as string) ?? null,
    totalExperience: typeof raw.totalExperience === 'number' ? raw.totalExperience : null,
    experienceLabel: (raw.experienceLabel as string) ?? undefined,
    technologies,
    resumeRef:
      typeof raw.resumeRef === 'string'
        ? raw.resumeRef
        : typeof raw.resumeUrl === 'string'
          ? raw.resumeUrl
          : undefined,
    createdAt:
      typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    updatedAt:
      typeof raw.updatedAt === 'string'
        ? raw.updatedAt
        : typeof raw.createdAt === 'string'
          ? raw.createdAt
          : undefined,
    createdBy: createdBy
      ? {
          id: String(createdBy.id ?? ''),
          name: String(createdBy.name ?? createdBy.email ?? ''),
          email: String(createdBy.email ?? ''),
        }
      : null,
  };
}

export async function getCandidate(id: string): Promise<Candidate> {
  const response = await fetch(`${getPublicApiBase()}/api/candidates/${encodeURIComponent(id)}`, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token') ?? ''}`,
    },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Failed to load candidate (${response.status})`);
  }
  const result = await response.json();
  return mapApiCandidateToClient((result.data ?? {}) as Record<string, unknown>);
}

export async function updateCandidate(
  id: string,
  body: Record<string, unknown>,
): Promise<Candidate> {
  const response = await fetch(`${getPublicApiBase()}/api/candidates/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token') ?? ''}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Failed to update candidate (${response.status})`);
  }
  const result = await response.json();
  return mapApiCandidateToClient((result.data ?? {}) as Record<string, unknown>);
}

export async function getCandidateSubmissions(): Promise<CandidateSubmission[]> {
  const response = await fetch(`${getPublicApiBase()}/api/submissions?scope=team&limit=500`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token')}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch candidate submissions: ${response.statusText}`);
  }

  const result = await response.json();
  const submissions: any[] = result.data?.submissions || [];

  const mapped = submissions.map((s) => {
    const cand = s.candidate ?? {};
    return {
      id: s.id,
      candidateId: cand.id ?? s.candidateId,
      jdId: s.requirement?.id ?? s.jdId,
      submittedBy: s.submittedBy,
      submittedOn: s.submittedOn,
      status: s.status,
      soNumber: s.soNumber,
      totalExperience: s.totalExperience,
      relevantExperience: s.relevantExperience ?? cand.relevantExperience,
      currentCtc: s.currentCtc ?? cand.currentSalary,
      expectedCtc: s.expectedCtc ?? cand.expectedSalary,
      noticePeriod: s.noticePeriod ?? cand.noticePeriod,
      currentLocation: cand.currentLocation ?? s.currentLocation,
      preferredLocation: cand.preferredLocation ?? s.preferredLocation,
      availableForInterview: s.availableForInterview ?? cand.availableForInterview,
      reasonForJobChange: s.reasonForJobChange ?? cand.reasonForJobChange,
      offerInHand: s.offerInHand ?? cand.offerInHand,
      offerInHandAmount: s.offerInHandAmount ?? cand.offerInHandAmount,
      offerInHandCompany: s.offerInHandCompany ?? cand.offerInHandCompany,
      offerInHandDetails: parseOfferInHandDetailsFromApi(s.offerInHandDetails ?? cand.offerInHandDetails),
      linkedinUrl: cand.linkedinUrl ?? s.linkedinUrl,
      highestQualification: cand.highestQualification ?? s.highestQualification,
    };
  });
  return dedupeCandidateSubmissionsByCandidateRequirement(mapped);
}

export async function submitCandidate(input: {
  candidate: Omit<Candidate, 'id' | 'createdAt' | 'technologies'> & {
    skillsRaw?: string;
    technologiesRaw?: string;
  };
  jdId: string;
  submittedBy: { id: string; name: string; email: string };
  submission?: Omit<CandidateSubmission, 'id' | 'candidateId' | 'jdId' | 'submittedBy' | 'submittedOn' | 'status'> & { submissionDate?: string };
  resumeFile?: File | null;
  /** When set, skip creating a new candidate — only upload resume (optional) and create submission. */
  existingCandidateId?: string;
  /** When true, submission proceeds without a resume on file (Submission to Client flow). */
  resumeOptional?: boolean;
  /** Internal lead review vs client thread. */
  submissionStage?: 'lead' | 'client';
}): Promise<{ candidate: Candidate; submission: CandidateSubmission }> {
  const token = localStorage.getItem('token');
  const authHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // --- Existing candidate: submission to client only (no duplicate POST /api/candidates) ---
  if (input.existingCandidateId) {
    const resumeRef = input.candidate.resumeRef?.trim();
    if (!input.resumeOptional && !input.resumeFile && !resumeRef) {
      throw new Error(
        'Resume is mandatory. Upload a resume for this candidate on this page, or ensure a resume is already on file.',
      );
    }

    if (input.resumeFile) {
      await uploadCandidateResume({
        email: input.candidate.email,
        resumeFile: input.resumeFile,
      });
    }

    const verifyRes = await fetch(`${getPublicApiBase()}/api/candidates/${encodeURIComponent(input.existingCandidateId)}`);
    if (!verifyRes.ok) {
      const err = (await verifyRes.json().catch(() => ({}))) as {
        message?: string;
        data?: Array<{ message?: string }>;
      };
      const detail = err.data?.[0]?.message ?? err.message;
      throw new Error(detail || 'Could not verify candidate');
    }
    const verifyJson = await verifyRes.json();
    const row = verifyJson.data as {
      resumeUrl?: string | null;
      resumeRef?: string | null;
      totalExperience?: number | null;
      experienceLabel?: string | null;
    };
    const resumeOk = row?.resumeRef ?? row?.resumeUrl;
    if (!input.resumeOptional && (!resumeOk || !String(resumeOk).trim())) {
      throw new Error(
        'Resume is mandatory. Please upload a resume file for this candidate before submitting.',
      );
    }

    const skillTokens = input.candidate.skillsRaw
      ? input.candidate.skillsRaw
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)
      : [];
    const techTokens = input.candidate.technologiesRaw
      ? input.candidate.technologiesRaw
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)
      : [];

    const mapped: Candidate = {
      id: input.existingCandidateId,
      name: input.candidate.name,
      email: input.candidate.email,
      phone: input.candidate.phone,
      candidateCode: input.candidate.candidateCode,
      currentEmployer: input.candidate.currentEmployer,
      location: input.candidate.location,
      totalExperience: row.totalExperience ?? input.candidate.totalExperience ?? null,
      experienceLabel: row.experienceLabel ?? input.candidate.experienceLabel,
      skills: skillTokens.length ? skillTokens : techTokens,
      technologies: techTokens.length ? techTokens : skillTokens,
      resumeRef: resumeOk ?? input.candidate.resumeRef,
      createdAt: new Date().toISOString(),
    };

    const sub = input.submission;
    const submissionPayload: Record<string, unknown> = {
      candidateId: input.existingCandidateId,
      requirementId: input.jdId,
      status: input.submissionStage === 'client' ? 'SUBMITTED_TO_CLIENT' : 'SUBMITTED_TO_LEAD',
      submissionStage: input.submissionStage ?? 'lead',
      submittedOn: sub?.submissionDate || new Date().toISOString(),
      soNumber: sub?.soNumber ?? null,
      // Use null (not undefined) so JSON always includes keys; trim text fields.
      reasonForJobChange:
        typeof sub?.reasonForJobChange === 'string' && sub.reasonForJobChange.trim()
          ? sub.reasonForJobChange.trim()
          : null,
      relevantExperience:
        typeof sub?.relevantExperience === 'string' && sub.relevantExperience.trim()
          ? sub.relevantExperience.trim()
          : null,
      offerInHand: (() => {
        const v = sub?.offerInHand as unknown;
        if (v === null || v === undefined) return null;
        const s = typeof v === 'string' ? v.trim() : String(v);
        if (s === '') return null;
        return s;
      })(),
      offerInHandDetails:
        sub?.offerInHand === true ? sub.offerInHandDetails ?? null : null,
    };

    const submissionResponse = await fetch(`${getPublicApiBase()}/api/submissions`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(submissionPayload),
    });

    if (!submissionResponse.ok) {
      const errorData = await submissionResponse.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to create submission: ${submissionResponse.statusText}`);
    }

    const submissionResult = await submissionResponse.json();
    const s = submissionResult.data?.submission;

    const submission: CandidateSubmission = {
      id: s.id,
      candidateId: input.existingCandidateId,
      jdId: input.jdId,
      submittedBy: s.submittedBy,
      submittedOn: s.submittedOn,
      status: s.status,
      soNumber: input.submission?.soNumber,
      totalExperience: input.submission?.totalExperience,
      relevantExperience: input.submission?.relevantExperience,
      currentCtc: input.submission?.currentCtc,
      expectedCtc: input.submission?.expectedCtc,
      noticePeriod: input.submission?.noticePeriod,
      currentLocation: input.submission?.currentLocation,
      preferredLocation: input.submission?.preferredLocation,
      availableForInterview: input.submission?.availableForInterview,
      reasonForJobChange: input.submission?.reasonForJobChange,
      offerInHand: input.submission?.offerInHand,
      offerInHandAmount: s.offerInHandAmount ?? null,
      offerInHandCompany: s.offerInHandCompany ?? null,
      offerInHandDetails: parseOfferInHandDetailsFromApi(s.offerInHandDetails) ?? input.submission?.offerInHandDetails ?? null,
      linkedinUrl: input.submission?.linkedinUrl,
      highestQualification: input.submission?.highestQualification,
    };

    return { candidate: mapped, submission };
  }

  // Enforce resume as mandatory at submission time.
  // Either user must provide a resume file now, or candidate must already have one on record.
  const resumeRef = input.candidate.resumeRef?.trim();
  if (!input.resumeFile && !resumeRef) {
    throw new Error('Resume is mandatory. Please upload/attach the candidate resume before submitting to the client.');
  }

  // Merge submission details into candidate for backend (all stored on Candidate model)
  const candidatePayload = {
    ...input.candidate,
    totalExperience: input.submission?.totalExperience,
    currentCtc: input.submission?.currentCtc,
    expectedCtc: input.submission?.expectedCtc,
    noticePeriod: input.submission?.noticePeriod,
    currentLocation: input.submission?.currentLocation,
    preferredLocation: input.submission?.preferredLocation,
    linkedinUrl: input.submission?.linkedinUrl,
    highestQualification: input.submission?.highestQualification,
    availableForInterview: input.submission?.availableForInterview,
    reasonForJobChange: input.submission?.reasonForJobChange,
    offerInHand: input.submission?.offerInHand,
    offerInHandDetails:
      input.submission?.offerInHand === true
        ? input.submission.offerInHandDetails ?? null
        : null,
    relevantExperience: input.submission?.relevantExperience,
  };

  // First create the candidate
  const candidateResponse = await fetch(`${getPublicApiBase()}/api/candidates`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(candidatePayload),
  });
  
  if (!candidateResponse.ok) {
    const errorData = await candidateResponse.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to create candidate: ${candidateResponse.statusText}`);
  }
  
  const candidateResult = await candidateResponse.json();
  const candidate = candidateResult.data;
  
  // If user selected a local resume file, upload it now.
  // This ensures `candidate.resumeUrl` becomes an actual server file (so download works later).
  if (input.resumeFile) {
    const uploaded = await uploadCandidateResume({
      email: candidate.email,
      resumeFile: input.resumeFile,
    });
    // Keep the returned object in sync for any UI that relies on resumeUrl immediately.
    Object.assign(candidate, uploaded);
  } else if (!candidate?.resumeRef && !candidate?.resumeUrl) {
    // Backend will also enforce this; fail fast in UI.
    throw new Error('Resume is mandatory. Please upload the candidate resume before submitting to the client.');
  }

  // Create/update the submission record (trim strings; null so keys are always sent in JSON).
  const sub = input.submission;
  const submissionPayload: Record<string, unknown> = {
    candidateId: candidate.id,
    requirementId: input.jdId,
    status: input.submissionStage === 'client' ? 'SUBMITTED_TO_CLIENT' : 'SUBMITTED_TO_LEAD',
    submissionStage: input.submissionStage ?? 'lead',
    submittedOn: sub?.submissionDate || new Date().toISOString(),
    soNumber: sub?.soNumber ?? null,
    reasonForJobChange:
      typeof sub?.reasonForJobChange === 'string' && sub.reasonForJobChange.trim()
        ? sub.reasonForJobChange.trim()
        : null,
    relevantExperience:
      typeof sub?.relevantExperience === 'string' && sub.relevantExperience.trim()
        ? sub.relevantExperience.trim()
        : null,
    offerInHand: (() => {
      const v = sub?.offerInHand as unknown;
      if (v === null || v === undefined) return null;
      const s = typeof v === 'string' ? v.trim() : String(v);
      if (s === '') return null;
      return s;
    })(),
    offerInHandDetails: sub?.offerInHand === true ? sub.offerInHandDetails ?? null : null,
  };

  const submissionResponse = await fetch(`${getPublicApiBase()}/api/submissions`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(submissionPayload),
  });

  if (!submissionResponse.ok) {
    const errorData = await submissionResponse.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to create submission: ${submissionResponse.statusText}`);
  }

  const submissionResult = await submissionResponse.json();
  const s = submissionResult.data?.submission;

  const submission: CandidateSubmission = {
    id: s.id,
    candidateId: candidate.id,
    jdId: input.jdId,
    submittedBy: s.submittedBy,
    submittedOn: s.submittedOn,
    status: s.status,
    // These fields are captured in the UI but may not exist in the backend model yet.
    soNumber: input.submission?.soNumber,
    totalExperience: input.submission?.totalExperience,
    relevantExperience: input.submission?.relevantExperience,
    currentCtc: input.submission?.currentCtc,
    expectedCtc: input.submission?.expectedCtc,
    noticePeriod: input.submission?.noticePeriod,
    currentLocation: input.submission?.currentLocation,
    preferredLocation: input.submission?.preferredLocation,
    availableForInterview: input.submission?.availableForInterview,
    reasonForJobChange: input.submission?.reasonForJobChange,
    offerInHand: input.submission?.offerInHand,
    offerInHandAmount: s.offerInHandAmount ?? null,
    offerInHandCompany: s.offerInHandCompany ?? null,
    offerInHandDetails:
      parseOfferInHandDetailsFromApi(s.offerInHandDetails) ?? input.submission?.offerInHandDetails ?? null,
    linkedinUrl: input.submission?.linkedinUrl,
    highestQualification: input.submission?.highestQualification,
  };

  return { candidate, submission };
}
