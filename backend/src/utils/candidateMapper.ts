type CandidateDraft = {
  name: string | null;
  email: string | null;
  phone: string | null;
  phoneNormalized: string | null;
  totalExperience: number | null;
  currentLocation: string | null;
  preferredLocation: string | null;
  currentCompany: string | null;
  experienceLabel: string | null;
  noticePeriod: string | null;
  currentSalary: string | null;
  expectedSalary: string | null;
  skills: string[];
  technologies: string[];
  sourcePlatform: string | null;
  notes: string | null;
};

function normalizeHeader(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .replace(/\u00a0/g, ' ')
    .replace(/[._/()-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickValue(rawRow: Record<string, unknown>, aliases: string[]): string | null {
  const keys = Object.keys(rawRow);
  for (const alias of aliases) {
    const target = normalizeHeader(alias);
    const matchedKey = keys.find((k) => normalizeHeader(k) === target);
    if (!matchedKey) continue;
    const v = rawRow[matchedKey];
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (!s) continue;
    const lowered = s.toLowerCase();
    if (lowered === 'na' || lowered === 'n/a' || lowered === 'null' || lowered === '-') continue;
    return s;
  }
  return null;
}

function normalizeEmail(raw: string | null): string | null {
  if (!raw) return null;
  const first = raw.split(/[;,/|]/).map((x) => x.trim()).find(Boolean) || '';
  const email = first.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function normalizePhone(raw: string | null): { phone: string | null; phoneNormalized: string | null } {
  if (!raw) return { phone: null, phoneNormalized: null };
  const first = raw
    .split(/[;,/|]/)
    .map((x) => x.trim())
    .find(Boolean) || raw;
  const cleaned = first.replace(/[^\d+]/g, '').trim();
  const normalizedDigits = cleaned.replace(/\D/g, '');
  if (!normalizedDigits) return { phone: raw, phoneNormalized: null };
  const lastTen = normalizedDigits.length >= 10 ? normalizedDigits.slice(-10) : normalizedDigits;
  return { phone: raw, phoneNormalized: lastTen };
}

function parseNumber(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n));
}

function splitList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[;,|/]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function mapExcelToCandidate(rawRow: Record<string, unknown>): CandidateDraft {
  const name = pickValue(rawRow, ['name', 'candidate name', 'candidate profile']);
  const emailRaw = pickValue(rawRow, ['email id', 'email', 'primary email', 'mail id']);
  const phoneRaw = pickValue(rawRow, [
    'phone number',
    'mobile',
    'mobile number',
    'contact number',
    'contact',
    'ph no',
    'phone',
  ]);
  const skillsRaw = pickValue(rawRow, ['key skills', 'skills', 'primary skills']);
  const techRaw = pickValue(rawRow, ['technologies', 'tech stack']);

  const { phone, phoneNormalized } = normalizePhone(phoneRaw);
  const email = normalizeEmail(
    emailRaw ?? pickValue(rawRow, ['email address']),
  );
  const totalExperience = parseNumber(
    pickValue(rawRow, ['total experience', 'total exp', 'total', 'experience']),
  );

  return {
    name,
    email,
    phone,
    phoneNormalized,
    totalExperience,
    currentLocation: pickValue(rawRow, ['current location', 'curr.location', 'curr location', 'location']),
    preferredLocation: pickValue(rawRow, ['preferred location', 'preferred locations']),
    currentCompany: pickValue(rawRow, ['curr.company', 'curr. company name', 'current company', 'curr company']),
    experienceLabel: pickValue(rawRow, ['total experience', 'experience label', 'exp range']),
    noticePeriod: pickValue(rawRow, [
      'notice period',
      'availability to join',
      'notice period/availability join',
      'notice period/ availability to join',
      'ans(what is your notice period?)',
    ]),
    currentSalary: pickValue(rawRow, [
      'annual salary',
      'current ctc',
      'current salary',
      'ans(what is your current ctc in lacs per annum?)',
    ]),
    expectedSalary: pickValue(rawRow, [
      'expected ctc',
      'expected salary',
      'ans(what is your expected ctc in lacs per annum?)',
    ]),
    skills: splitList(skillsRaw),
    technologies: splitList(techRaw),
    sourcePlatform: pickValue(rawRow, ['source', 'source platform']),
    notes: pickValue(rawRow, ['summary', 'headline']),
  };
}

export function shouldSkipMappedCandidate(mapped: CandidateDraft): { skip: boolean; reason: string | null } {
  if (!mapped.name?.trim()) return { skip: true, reason: 'Missing name' };
  if (!mapped.email && !mapped.phoneNormalized) {
    return { skip: true, reason: 'Missing valid email and phone' };
  }
  return { skip: false, reason: null };
}
