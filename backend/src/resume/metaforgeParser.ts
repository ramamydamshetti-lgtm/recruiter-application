import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import dotenv from 'dotenv';
import { extractPlainTextFromResumeBuffer } from './extractResumeText';
import { parseCoreFieldsFromResumeText } from './parseCoreResumeFields';

const METAFORGE_ENV_PATH = path.resolve(
  process.cwd(),
  'src/resume/metaforge-resume-parser/metaforge-resume-parser/.env',
);

const GEMINI_ENV_KEYS = ['GEMINI_API_KEY', 'GEMINI_MODEL', 'GEMINI_FALLBACK_MODELS'] as const;

/** Load Gemini model + key from metaforge-resume-parser/.env (integrated app ignores that file by default). */
function loadMetaforgeGeminiEnv(): void {
  if (!fs.existsSync(METAFORGE_ENV_PATH)) return;
  const parsed = dotenv.parse(fs.readFileSync(METAFORGE_ENV_PATH));
  for (const key of GEMINI_ENV_KEYS) {
    const value = parsed[key]?.trim();
    if (value) process.env[key] = value;
  }
}

function metaforgeGeminiModelLabel(): string {
  const primary = process.env.GEMINI_MODEL?.trim() || 'gemini-2.0-flash-lite';
  const fallbacks = (process.env.GEMINI_FALLBACK_MODELS || '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  return fallbacks.length ? `${primary} (+ ${fallbacks.join(', ')})` : primary;
}

export type ParsedCandidateResume = {
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
  sourceFile: string;
  parser: 'metaforge' | 'legacy';
};

type MetaforgeParsed = {
  full_name?: string;
  contact?: string;
  email?: string;
  linkedin?: string;
  qualification?: string;
  total_experience?: string;
  relevant_experience?: string;
  skills?: string[];
  technology?: string[];
};

type MetaforgeServices = {
  extractFileContent: (buffer: Buffer, filename: string) => Promise<{ type: string; data: string }>;
  parseResumeFromPdf: (base64Data: string, pdfBuffer: Buffer) => Promise<MetaforgeParsed>;
  parseResumeFromText: (resumeText: string) => Promise<MetaforgeParsed>;
  isSupportedFile: (filename: string) => boolean;
};

let servicesPromise: Promise<MetaforgeServices> | null = null;
/** After quota/rate-limit errors, skip Gemini for the rest of this process to keep bulk fast. */
let aiParsingSuspended = false;
let aiParsingSuspendedReason: string | null = null;

function isQuotaOrRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /quota|rate.?limit|429|resource.?exhausted|too many requests/i.test(msg);
}

export function getAiParsingSuspendedReason(): string | null {
  return aiParsingSuspendedReason;
}

function metaforgeServicesDir(): string {
  return path.resolve(
    process.cwd(),
    'src/resume/metaforge-resume-parser/metaforge-resume-parser/server/services',
  );
}

async function loadMetaforgeServices(): Promise<MetaforgeServices> {
  if (!servicesPromise) {
    servicesPromise = (async () => {
      loadMetaforgeGeminiEnv();
      aiParsingSuspended = false;
      aiParsingSuspendedReason = null;
      process.env.METAFORGE_PARSER_EMBEDDED = 'true';

      const dir = metaforgeServicesDir();
      const extractMod = await import(pathToFileURL(path.join(dir, 'extract.js')).href);
      const geminiMod = await import(pathToFileURL(path.join(dir, 'gemini.js')).href);
      console.info(`[resume-parser] Metaforge AI models: ${metaforgeGeminiModelLabel()}`);
      return {
        extractFileContent: extractMod.extractFileContent,
        isSupportedFile: extractMod.isSupportedFile,
        parseResumeFromPdf: geminiMod.parseResumeFromPdf,
        parseResumeFromText: geminiMod.parseResumeFromText,
      };
    })();
  }
  return servicesPromise;
}

function normalizeLinkedInUrl(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^linkedin\.com/i.test(t) || /^www\.linkedin\.com/i.test(t)) {
    return `https://${t.replace(/^www\./i, '')}`;
  }
  if (/^\/in\//i.test(t)) return `https://www.linkedin.com${t}`;
  return t.includes('linkedin.com') ? `https://${t.replace(/^https?:\/\//i, '')}` : null;
}

function joinList(items: string[] | null | undefined): string | null {
  if (!Array.isArray(items) || !items.length) return null;
  const cleaned = items.map((s) => s.trim()).filter(Boolean);
  return cleaned.length ? cleaned.join(', ') : null;
}

function mapMetaforgeResult(parsed: MetaforgeParsed, sourceFile: string): ParsedCandidateResume {
  const skills = joinList(parsed.skills);
  const technology = joinList(parsed.technology);

  return {
    candidateName: (parsed.full_name ?? '').trim() || null,
    email: (parsed.email ?? '').trim() || null,
    contactNumber: (parsed.contact ?? '').trim() || null,
    linkedinUrl: normalizeLinkedInUrl(parsed.linkedin),
    highestQualification: (parsed.qualification ?? '').trim() || null,
    skillsRaw: skills ?? technology,
    technologiesRaw: technology ?? skills,
    totalExperience: (parsed.total_experience ?? '').trim() || null,
    relevantExperience: (parsed.relevant_experience ?? '').trim() || null,
    currentEmployer: null,
    sourceFile,
    parser: 'metaforge',
  };
}

function mapLegacyResult(
  parsed: ReturnType<typeof parseCoreFieldsFromResumeText>,
  sourceFile: string,
): ParsedCandidateResume {
  return {
    candidateName: parsed.candidateName,
    email: parsed.email,
    contactNumber: parsed.contactNumber,
    linkedinUrl: parsed.linkedinUrl,
    highestQualification: parsed.highestQualification,
    skillsRaw: parsed.skillsRaw ?? parsed.technologiesRaw,
    technologiesRaw: parsed.technologiesRaw,
    totalExperience: parsed.totalExperienceYears != null ? String(parsed.totalExperienceYears) : null,
    relevantExperience: parsed.relevantExperience,
    currentEmployer: parsed.currentCompany,
    sourceFile,
    parser: 'legacy',
  };
}

export function isMetaforgeParserAvailable(): boolean {
  loadMetaforgeGeminiEnv();
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export async function parseResumeBufferWithMetaforge(
  buffer: Buffer,
  filename: string,
): Promise<ParsedCandidateResume> {
  const services = await loadMetaforgeServices();
  if (!services.isSupportedFile(filename)) {
    throw new Error('Unsupported file type. Supported: pdf, docx, doc, txt');
  }

  const extracted = await services.extractFileContent(buffer, filename);
  let parsed: MetaforgeParsed;
  if (extracted.type === 'pdf') {
    parsed = await services.parseResumeFromPdf(extracted.data, buffer);
  } else {
    parsed = await services.parseResumeFromText(extracted.data);
  }

  return mapMetaforgeResult(parsed, filename);
}

async function parseResumeBufferLegacy(
  buffer: Buffer,
  filename: string,
): Promise<ParsedCandidateResume> {
  const { text, error } = await extractPlainTextFromResumeBuffer(buffer, filename);
  if (!text.trim()) {
    throw new Error(error || 'Could not read text from this file.');
  }
  const parsed = parseCoreFieldsFromResumeText(text);
  return mapLegacyResult(parsed, filename);
}

export async function parseResumeBuffer(
  buffer: Buffer,
  filename: string,
): Promise<ParsedCandidateResume> {
  if (isMetaforgeParserAvailable() && !aiParsingSuspended) {
    try {
      return await parseResumeBufferWithMetaforge(buffer, filename);
    } catch (err) {
      if (isQuotaOrRateLimitError(err)) {
        aiParsingSuspended = true;
        aiParsingSuspendedReason =
          'Gemini API quota or rate limit reached — using keyword parser for remaining resumes.';
        console.warn(aiParsingSuspendedReason);
      } else {
        console.warn(
          'Metaforge resume parse failed, falling back to keyword parser:',
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  return parseResumeBufferLegacy(buffer, filename);
}

export type BulkParseItemResult =
  | { sourceFile: string; status: 'done'; data: ParsedCandidateResume }
  | { sourceFile: string; status: 'error'; error: string };

export async function parseResumeBuffersBulk(
  files: { buffer: Buffer; filename: string }[],
): Promise<BulkParseItemResult[]> {
  const results: BulkParseItemResult[] = [];

  for (let i = 0; i < files.length; i++) {
    const { buffer, filename } = files[i]!;
    try {
      const data = await parseResumeBuffer(buffer, filename);
      results.push({ sourceFile: filename, status: 'done', data });
    } catch (err) {
      results.push({
        sourceFile: filename,
        status: 'error',
        error: err instanceof Error ? err.message : 'Failed to parse resume',
      });
    }

    if (i < files.length - 1 && isMetaforgeParserAvailable() && !aiParsingSuspended) {
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  return results;
}
