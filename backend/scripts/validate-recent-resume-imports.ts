import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { pathToFileURL } from 'url';

const prisma = new PrismaClient();

const BAD_NAME_RE =
  /^(career summary|core strengths?|core\s+skills?|key\s+achievements?|achievements?|key\s+accomplishments?|core\s+competencies?|software architecture|key responsibilities handled|of\s+the\s+company|summary|objective|professional summary|personal summary|executive summary|work experience|professional experience|organizations?\s+experience|organizational experience|technical competency|skills|key skills|technical skills|profile summary|career objective|synopsis|declaration|about\s+me|strengths|contact|resume)$/i;

const BAD_ROLE_TITLE_RE =
  /^(?:salesforce|java|\.net|python|react|angular|boomi|mulesoft|full\s*stack|integration|network|cloud|cyber|data|machine\s*learning|technical|senior|lead|staff|principal)\s+[a-z0-9][a-z0-9\s]+(developer|engineer|consultant|analyst|architect|tester)\b$/i;

function normalizeToken(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

function deriveNameFromEmail(email: string | null): string | null {
  const raw = String(email || '').trim().toLowerCase();
  if (!raw.includes('@')) return null;
  const local = raw.split('@')[0] || '';
  const stop = new Set(
    'resume cv careers jobs hiring hr admin info contact support sales marketing help noreply no-reply mail team dev developer engineers engineer test tester bot automated recruiting talent'.split(
      ' ',
    ),
  );
  const parts = local
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2 && !/\d/.test(p) && !stop.has(p));
  if (parts.length < 2) return null;
  return parts
    .slice(0, 3)
    .join(' ')
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function inferTechnologyFromSkills(skills: string[]): string | null {
  const text = skills.join(' ').toLowerCase();
  const domains: Array<{ label: string; hits: RegExp[] }> = [
    {
      label: 'Cyber Security Consultant',
      hits: [/\bvapt\b/, /\bpenetration\b/, /\bmetasploit\b/, /\bburp\b/, /\bnessus\b/, /\bowasp\b/, /\bsiem\b/],
    },
    {
      label: 'SAP FICO Consultant',
      hits: [/\bsap\b/, /\bfico\b/, /\bfinancial accounting\b/, /\bcontrolling\b/],
    },
    {
      label: 'Power BI Developer',
      hits: [/\bpower\s*bi\b/, /\bdax\b/, /\bpower query\b/, /\bdata modeling\b/],
    },
    {
      label: 'Data Engineer',
      hits: [/\bapache\s+spark\b/i, /\bhadoop\b/i, /\bapache\s+airflow\b/i, /\bdata\s+warehouse\b/i, /\bsnowflake\b/i, /\bdatabricks\b/i],
    },
    {
      label: 'DevOps Engineer',
      hits: [/\bdocker\b/, /\bkubernetes\b/, /\bjenkins\b/, /\bterraform\b/, /\bansible\b/, /\bdevops\b/],
    },
    {
      label: 'QA Automation Engineer',
      hits: [/\bselenium\b/, /\bcypress\b/, /\btestng\b/, /\bjunit\b/, /\bautomation testing\b/, /\bqa\b/],
    },
    {
      label: 'Java Developer',
      hits: [/\bjava\b/, /\bspring\b/, /\bspring boot\b/, /\bhibernate\b/, /\bmicroservices\b/],
    },
    {
      label: '.NET Developer',
      hits: [/\b\.net\b/, /\bc#\b/, /\basp\.net\b/, /\bentity framework\b/],
    },
    {
      label: 'Frontend Developer',
      hits: [/\breact\b/, /\bangular\b/, /\bvue\b/, /\btypescript\b/, /\bjavascript\b/, /\bhtml\b/, /\bcss\b/],
    },
  ];

  let best: { label: string; score: number } | null = null;
  let second = 0;
  for (const d of domains) {
    const score = d.hits.reduce((acc, rx) => (rx.test(text) ? acc + 1 : acc), 0);
    if (!best || score > best.score) {
      second = best?.score || 0;
      best = { label: d.label, score };
    } else if (score > second) {
      second = score;
    }
  }
  if (!best || best.score < 3) return null;
  if (second >= best.score) return null;
  return best.label;
}

function parseYears(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.match(/(\d+(?:\.\d+)?)\s*(?:\+)?\s*(?:years?|yrs?)/i) || raw.match(/(\d+(?:\.\d+)?)/);
  if (!m?.[1]) return null;
  const n = Math.round(Number(m[1]));
  if (!Number.isFinite(n) || n < 0 || n > 60) return null;
  return n;
}

export type ValidationSummary = {
  scanned: number;
  flagged: number;
  fixed: number;
  details: string[];
  dryRun: boolean;
};

type ValidationOptions = {
  dryRun?: boolean;
  limit?: number;
  prismaClient?: PrismaClient;
  log?: (line: string) => void;
};

export async function validateRecentResumeImports(options: ValidationOptions = {}): Promise<ValidationSummary> {
  const dryRun = options.dryRun ?? false;
  const limit = Number.isFinite(options.limit) && (options.limit || 0) > 0 ? Number(options.limit) : 250;
  const db = options.prismaClient ?? prisma;
  const log = options.log ?? ((line: string) => console.log(line));

  const rows = await db.candidate.findMany({
    where: { sourcePlatform: 'Resume Import' },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      candidateRef: true,
      name: true,
      email: true,
      skills: true,
      technologies: true,
      totalExperience: true,
      experienceLabel: true,
      relevantExperience: true,
      currentLocation: true,
      updatedAt: true,
    },
  });

  let scanned = 0;
  let flagged = 0;
  let fixed = 0;
  const details: string[] = [];

  for (const row of rows) {
    scanned += 1;
    const issues: string[] = [];
    const data: Record<string, unknown> = {};

    const name = normalizeToken(row.name || '');
    if (BAD_NAME_RE.test(name) || BAD_ROLE_TITLE_RE.test(name)) {
      const derived = deriveNameFromEmail(row.email);
      if (derived && derived.toLowerCase() !== name.toLowerCase()) {
        data.name = derived;
        issues.push(`name "${name}" -> "${derived}"`);
      } else {
        issues.push(`bad_name "${name}" (manual review)`);
      }
    }

    const skills = Array.from(new Set((row.skills || []).map((s) => normalizeToken(s)).filter(Boolean)));
    const technologies = Array.from(
      new Set((row.technologies || []).map((s) => normalizeToken(s)).filter(Boolean)),
    );
    const sameSkillsAndTech =
      skills.length > 0 &&
      technologies.length > 0 &&
      skills.length === technologies.length &&
      skills.every((s) => technologies.some((t) => t.toLowerCase() === s.toLowerCase()));

    if (technologies.length === 0 || sameSkillsAndTech) {
      const skillBlob = skills.join(' ').toLowerCase();
      if (skillBlob.length >= 55) {
        const inferred = inferTechnologyFromSkills(skills);
        if (inferred) {
          data.technologies = [inferred];
          issues.push(`technology -> "${inferred}"`);
        }
      }
    }

    if (row.totalExperience == null) {
      const inferredExp = parseYears(row.experienceLabel) ?? parseYears(row.relevantExperience);
      if (inferredExp != null) {
        data.totalExperience = inferredExp;
        issues.push(`totalExperience -> ${inferredExp}`);
      }
    }

    if (issues.length > 0) {
      flagged += 1;
      if (Object.keys(data).length > 0) {
        if (!dryRun) {
          await db.candidate.update({
            where: { id: row.id },
            data,
          });
        }
        fixed += 1;
      }
      details.push(`${row.id} (${row.email}) :: ${issues.join('; ')}`);
    }
  }

  log(`Scanned: ${scanned}`);
  log(`Flagged: ${flagged}`);
  log(`Fixed:   ${fixed}${dryRun ? ' (dry-run)' : ''}`);
  if (details.length > 0) {
    log('\nDetails:');
    for (const d of details.slice(0, 120)) {
      log(`- ${d}`);
    }
  }

  return { scanned, flagged, fixed, details, dryRun };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has('--dry-run');
  const limitArg = process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1];
  const limit = Number(limitArg || '250');
  await validateRecentResumeImports({ dryRun, limit, prismaClient: prisma });
}

const isDirectRun = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
})();

if (isDirectRun) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

