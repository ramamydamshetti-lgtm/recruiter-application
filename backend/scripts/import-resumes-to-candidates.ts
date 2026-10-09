import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { extractPlainTextFromResumeBuffer } from '../src/resume/extractResumeText';
import { parseCoreFieldsFromResumeText } from '../src/resume/parseCoreResumeFields';
import {
  isBadCandidateDisplayName,
  trimJobTitleSuffixFromDisplayName,
} from '../src/resume/candidateNameValidation';
import { sanitizeDisplayText } from '../src/resume/resumeFieldSanitize';
import { generateUniqueCandidateRef } from '../src/utils/humanReadableIds';
import { validateRecentResumeImports } from './validate-recent-resume-imports';

function databaseUrlWithConnectionLimit(raw: string | undefined, limit: number): string {
  if (!raw || !String(raw).trim()) {
    throw new Error('DATABASE_URL is not set. Add it to backend/.env before running resume import.');
  }
  const url = String(raw).trim();
  if (/[?&]connection_limit=/i.test(url)) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}connection_limit=${limit}`;
}

/** Single-connection pool: avoids exhausting Postgres when dev server + other tools are connected. */
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrlWithConnectionLimit(process.env.DATABASE_URL, 1),
    },
  },
});
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads', 'resumes');
const DATA_DIR = path.resolve(process.cwd(), 'data');
const PROCESSED_DIR = path.join(DATA_DIR, 'resumes_processed');
const FAILED_DIR = path.join(DATA_DIR, 'resumes_failed');
const MANIFEST_PATH = path.join(DATA_DIR, 'resume_import_manifest.json');

type ImportManifest = {
  processed: Record<string, { fileName: string; importedAt: string }>;
  failed: Record<string, { fileName: string; reason: string; failedAt: string }>;
};

function normalizePhone(phone: string | null): { phone: string | null; phoneNormalized: string | null } {
  if (!phone) return { phone: null, phoneNormalized: null };
  const cleaned = phone.trim();
  if (!cleaned) return { phone: null, phoneNormalized: null };
  const digits = cleaned.replace(/[^\d]/g, '');
  if (!digits) return { phone: cleaned, phoneNormalized: null };
  const normalized = digits.length >= 10 ? digits.slice(-10) : digits;
  return { phone: cleaned, phoneNormalized: normalized };
}

function splitCsv(raw: string | null): string[] {
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(/[,\n;|]/)
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  );
}

function sanitizeList(
  items: string[],
  options: { maxItems: number; maxTokenLength: number; allowLongSentences?: boolean },
): string[] {
  const out: string[] = [];
  for (const raw of items) {
    const token = sanitizeDisplayText(raw.replace(/\s+/g, ' ').trim());
    if (!token) continue;
    if (token.length > options.maxTokenLength) continue;
    if (!options.allowLongSentences) {
      const words = token.split(/\s+/).filter(Boolean);
      if (words.length > 12) continue;
      if (/[.?!]/.test(token)) continue;
    }
    if (!out.some((x) => x.toLowerCase() === token.toLowerCase())) {
      out.push(token);
      if (out.length >= options.maxItems) break;
    }
  }
  return out;
}

const FILENAME_NAME_NOISE = new Set(
  'resume cv of the and or for with yrs years y plus istqb certified certification automation lead engineer developer consultant sr jr mr mrs dr v1 v2 v3 qa tosca sap version final draft copy new database manual testing tester test senior junior data scientist analyst architect fullstack full stack mern stack net java python crm sf salesforce workday pp qm pm product manager experience summary curriculum vitae biodata instrumentation employee central time off azure cloud assistant manager professional'.split(
    ' ',
  ),
);

function titleCaseNameWords(words: string[]): string | null {
  const clean = words
    .map((w) => w.trim())
    .filter((w) => /^[a-z]{2,}$/i.test(w) && !FILENAME_NAME_NOISE.has(w.toLowerCase()));
  if (clean.length === 0) return null;
  if (clean.length === 1 && clean[0].length < 3) return null;
  const joined = clean
    .slice(0, 5)
    .join(' ')
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
  return isBadCandidateDisplayName(joined) ? null : joined;
}

function deriveNameFromStructuredFileName(fileName: string): string | null {
  const base = fileName.replace(/\.[^.]+$/, '');
  const m = base.match(/^naukri[_-]([a-z][a-z.\s_-]{1,80})(?:\[[^\]]+\])?$/i);
  if (!m?.[1]) return null;
  const normalized = m[1]
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return titleCaseNameWords(normalized.split(/\s+/));
}

/** e.g. "Pankaj Kumar SR_01.doc", "Resume_of_Jane_Doe.pdf" — not Naukri-prefixed. */
function deriveNameFromGenericFileName(fileName: string): string | null {
  const baseWithExt = path.basename(fileName);
  const base = baseWithExt.replace(/\.[^.]+$/i, '');
  if (/^naukri[_-]/i.test(base)) return null;
  let s = base.replace(/\[[^\]]*\]/g, ' ').replace(/\([^)]*\)/g, ' ');
  s = s.replace(/[_\s-]+\d{10,}\b.*$/i, '').trim();
  s = s.replace(/\b\d+\s*\+\s*yrs?\b.*$/i, '').trim();
  s = s.replace(/\b(resume|cv|curriculum\s+vitae)\b.*$/i, '').trim();
  s = s.replace(/([a-z])([A-Z])/g, '$1 $2');
  const tokens = s
    .split(/[_\s.-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const nameLike = tokens
    .filter(
      (t) =>
        /^[A-Za-z]{2,}$/.test(t) &&
        !FILENAME_NAME_NOISE.has(t.toLowerCase()) &&
        !/^\d+$/.test(t),
    )
    .slice(0, 5);
  return titleCaseNameWords(nameLike);
}

const EMAIL_LOCAL_STOP = new Set(
  'resume cv careers jobs hiring hr admin info contact support sales marketing help noreply no-reply mail team dev developer engineers engineer test tester bot automated recruiting talent'.split(
    ' ',
  ),
);

function deriveNameFromEmail(email: string | null): string | null {
  const raw = String(email || '').trim().toLowerCase();
  if (!raw.includes('@')) return null;
  const local = raw.split('@')[0] || '';
  const parts = local
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2 && !/\d/.test(p) && !EMAIL_LOCAL_STOP.has(p));
  if (parts.length < 2) return null;
  const selected = parts.slice(0, Math.min(3, parts.length)).join(' ');
  return selected.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function isBadParsedName(name: string | null): boolean {
  return isBadCandidateDisplayName(name);
}

function resolveImportCandidateName(
  parsedName: string | null,
  email: string | null,
  fileName: string,
): string | null {
  const trimmed = parsedName?.trim() || null;
  const fromParser =
    trimmed && !isBadCandidateDisplayName(trimmed)
      ? trimJobTitleSuffixFromDisplayName(trimmed) ?? trimmed
      : null;
  const candidates = [
    fromParser,
    deriveNameFromStructuredFileName(fileName),
    deriveNameFromGenericFileName(fileName),
    deriveNameFromEmail(email),
  ];
  for (const c of candidates) {
    const n = c?.trim();
    if (n && !isBadCandidateDisplayName(n)) return n;
  }
  return null;
}

function toPlaceholderEmail(name: string, phoneNormalized: string | null, fileName: string): string {
  const baseName = (name || 'candidate')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 30);
  const suffix = phoneNormalized || fileName.replace(/[^a-zA-Z0-9]/g, '').slice(-8) || Date.now().toString();
  return `${baseName || 'candidate'}.${suffix}@noemail.metaforge.local`;
}

function sanitizeFileToken(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function buildStoredResumeFileName(candidateIdOrEmail: string, sourceFileName: string): string {
  const ext = path.extname(sourceFileName).toLowerCase() || '.pdf';
  const safeExt = ext.replace(/[^a-z0-9.]/g, '') || '.pdf';
  const base = sanitizeFileToken(candidateIdOrEmail).slice(0, 50) || 'resume';
  return `${base}-${Date.now()}${safeExt}`;
}

async function listFiles(targetDir: string): Promise<string[]> {
  const entries = await fs.readdir(targetDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => path.join(targetDir, e.name))
    .sort((a, b) => a.localeCompare(b));
}

function contentHash(buffer: Buffer): string {
  return createHash('sha1').update(buffer).digest('hex');
}

async function readManifest(): Promise<ImportManifest> {
  try {
    const raw = await fs.readFile(MANIFEST_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<ImportManifest>;
    return {
      processed: parsed.processed && typeof parsed.processed === 'object' ? parsed.processed : {},
      failed: parsed.failed && typeof parsed.failed === 'object' ? parsed.failed : {},
    };
  } catch {
    return { processed: {}, failed: {} };
  }
}

async function writeManifest(manifest: ImportManifest): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

async function moveToFolder(sourcePath: string, destFolder: string): Promise<void> {
  await fs.mkdir(destFolder, { recursive: true });
  const originalName = path.basename(sourcePath);
  const parsed = path.parse(originalName);
  let candidate = path.join(destFolder, originalName);
  let i = 1;
  while (true) {
    try {
      await fs.access(candidate);
      candidate = path.join(destFolder, `${parsed.name}-${Date.now()}-${i}${parsed.ext}`);
      i += 1;
    } catch {
      break;
    }
  }
  await fs.rename(sourcePath, candidate);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has('--dry-run');
  const dirArg = process.argv.find((a) => a.startsWith('--dir='))?.split('=')[1];
  const targetDir = path.resolve(
    process.cwd(),
    dirArg && dirArg.trim() ? dirArg.trim() : path.join('data', 'resumes_to_process'),
  );

  console.log(`Resume import directory: ${targetDir}`);
  if (dryRun) console.log('Mode: dry-run (no DB writes)');

  const files = await listFiles(targetDir).catch(async () => {
    await fs.mkdir(targetDir, { recursive: true });
    return [];
  });
  if (files.length === 0) {
    console.log('No files found.');
    return;
  }

  let processed = 0;
  let imported = 0;
  let skipped = 0;
  const skipReasons: Record<string, number> = {};
  const manifest = await readManifest();

  for (const filePath of files) {
    processed += 1;
    const fileName = path.basename(filePath);
    try {
      const buffer = await fs.readFile(filePath);
      const hash = contentHash(buffer);
      if (manifest.processed[hash]) {
        skipped += 1;
        const reason = 'Already processed (duplicate content)';
        skipReasons[reason] = (skipReasons[reason] || 0) + 1;
        console.log(`SKIP [${fileName}]: ${reason}`);
        if (!dryRun) {
          await moveToFolder(filePath, PROCESSED_DIR);
        }
        continue;
      }
      const { text, error } = await extractPlainTextFromResumeBuffer(buffer, fileName);
      if (!text.trim()) {
        skipped += 1;
        const reason = error || 'No readable text';
        skipReasons[reason] = (skipReasons[reason] || 0) + 1;
        console.log(`SKIP [${fileName}]: ${reason}`);
        if (!dryRun) {
          manifest.failed[hash] = {
            fileName,
            reason,
            failedAt: new Date().toISOString(),
          };
          await moveToFolder(filePath, FAILED_DIR);
        }
        continue;
      }

      const parsed = parseCoreFieldsFromResumeText(text);
      const email = parsed.email?.trim().toLowerCase() || null;
      const name = resolveImportCandidateName(parsed.candidateName, email, fileName);
      const { phone, phoneNormalized } = normalizePhone(parsed.contactNumber);

      // Mandatory ingest rule: name + at least one contact (email/phone).
      if (!name) {
        skipped += 1;
        skipReasons['Missing name'] = (skipReasons['Missing name'] || 0) + 1;
        console.log(`SKIP [${fileName}]: Missing name`);
        if (!dryRun) {
          manifest.failed[hash] = {
            fileName,
            reason: 'Missing name',
            failedAt: new Date().toISOString(),
          };
          await moveToFolder(filePath, FAILED_DIR);
        }
        continue;
      }
      if (!email && !phoneNormalized) {
        skipped += 1;
        skipReasons['Missing email and phone'] = (skipReasons['Missing email and phone'] || 0) + 1;
        console.log(`SKIP [${fileName}]: Missing email and phone`);
        if (!dryRun) {
          manifest.failed[hash] = {
            fileName,
            reason: 'Missing email and phone',
            failedAt: new Date().toISOString(),
          };
          await moveToFolder(filePath, FAILED_DIR);
        }
        continue;
      }

      const skills = sanitizeList(splitCsv(parsed.skillsRaw || parsed.technologiesRaw), {
        maxItems: 15,
        maxTokenLength: 80,
      });
      const technologies = sanitizeList(splitCsv(parsed.technologiesRaw), {
        maxItems: 5,
        maxTokenLength: 100,
        allowLongSentences: true,
      });
      const education = sanitizeList(splitCsv(parsed.educationRaw), {
        maxItems: 2,
        maxTokenLength: 180,
        allowLongSentences: true,
      });
      if (education.length === 0 && parsed.highestQualification) {
        education.push(parsed.highestQualification);
      }
      const effectiveEmail = email || toPlaceholderEmail(name, phoneNormalized, fileName);

      if (dryRun) {
        imported += 1;
        console.log(`DRY-RUN [${fileName}] -> ${name} (${effectiveEmail})`);
        continue;
      }

      const existingByEmail = await prisma.candidate.findUnique({
        where: { email: effectiveEmail },
        select: { id: true },
      });
      const existingByPhone =
        !existingByEmail && phoneNormalized
          ? await prisma.candidate.findFirst({
              where: { phoneNormalized },
              select: { id: true },
            })
          : null;

      const candidateRef = await generateUniqueCandidateRef(prisma);
      const candidateId = candidateRef.replace(/^CAND-/, '');
      const resumeFileName = buildStoredResumeFileName(effectiveEmail, fileName);

      const payload = {
        name,
        email: effectiveEmail,
        phone,
        phoneNormalized,
        highestQualification: parsed.highestQualification,
        education,
        skills,
        // Keep technologies optional; if absent in resume we still import skills.
        technologies: technologies.length ? technologies : [],
        totalExperience: parsed.totalExperienceYears,
        relevantExperience: parsed.relevantExperience,
        currentCompany: parsed.currentCompany,
        currentLocation: parsed.currentLocation,
        preferredLocation: parsed.currentLocation,
        linkedinUrl: parsed.linkedinUrl,
        resumeUrl: resumeFileName,
        sourcePlatform: 'Resume Import',
        notes: `Imported from resume: ${fileName}`.slice(0, 8000),
        updatedAt: new Date(),
      };

      if (existingByEmail || existingByPhone) {
        await prisma.candidate.update({
          where: { id: (existingByEmail?.id || existingByPhone?.id)! },
          data: payload,
        });
      } else {
        await prisma.candidate.create({
          data: {
            id: candidateId,
            candidateRef,
            createdAt: new Date(),
            ...payload,
          },
        });
      }

      await fs.mkdir(UPLOADS_DIR, { recursive: true });
      await fs.copyFile(filePath, path.join(UPLOADS_DIR, resumeFileName));

      imported += 1;
      console.log(`OK   [${fileName}] -> ${name}`);
      if (!dryRun) {
        manifest.processed[hash] = {
          fileName,
          importedAt: new Date().toISOString(),
        };
        delete manifest.failed[hash];
        await moveToFolder(filePath, PROCESSED_DIR);
      }
    } catch (e) {
      skipped += 1;
      const reason = e instanceof Error ? e.message : 'Unknown error';
      skipReasons[reason] = (skipReasons[reason] || 0) + 1;
      console.log(`SKIP [${fileName}]: ${reason}`);
      if (!dryRun) {
        try {
          const failedBuffer = await fs.readFile(filePath);
          const hash = contentHash(failedBuffer);
          manifest.failed[hash] = {
            fileName,
            reason,
            failedAt: new Date().toISOString(),
          };
        } catch {
          // no-op; best effort metadata
        }
        try {
          await moveToFolder(filePath, FAILED_DIR);
        } catch {
          // no-op; best effort archival
        }
      }
    }
  }

  if (!dryRun) {
    await writeManifest(manifest);
    if (imported > 0) {
      const validationLimit = Math.max(120, imported * 12);
      console.log('\n=== Post-Import Validation ===');
      await validateRecentResumeImports({
        dryRun: false,
        limit: validationLimit,
        prismaClient: prisma,
      });
    }
  }

  console.log('\n=== Resume Import Summary ===');
  console.log(`Processed: ${processed}`);
  console.log(`Imported:  ${imported}`);
  console.log(`Skipped:   ${skipped}`);
  if (Object.keys(skipReasons).length > 0) {
    console.log('\nSkip reasons:');
    for (const [reason, count] of Object.entries(skipReasons)) {
      console.log(`  ${count} x ${reason}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
