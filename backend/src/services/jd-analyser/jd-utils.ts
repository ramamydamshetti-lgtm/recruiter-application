// @ts-nocheck — copied from JD Analyser MVP; strict-null checks deferred to avoid risky refactors.
import type { RequirementData } from "./types/requirement";

export const NOT_SPECIFIED = "Not specified";

const GENERIC_TITLES = new Set([
  "not specified",
  "single requirement",
  "multi requirement",
  "requirement",
  "n/a",
  "na",
  "tbd",
  "to be determined",
  "job title",
  "role",
  "position",
]);

export function isGenericJobTitle(title: string): boolean {
  const normalized = title.trim().toLowerCase();
  if (!normalized) return true;
  if (GENERIC_TITLES.has(normalized)) return true;
  if (/^requirement\s*#?\d*$/i.test(normalized)) return true;
  return false;
}

export function resolveJobTitle(
  extractedTitle: string,
  hintTitle?: string
): string {
  if (!isGenericJobTitle(extractedTitle)) return extractedTitle;
  if (hintTitle && !isGenericJobTitle(hintTitle)) return hintTitle;
  return NOT_SPECIFIED;
}

const INHERITABLE_STRING_FIELDS: (keyof RequirementData)[] = [
  "clientLeadPocFrom",
  "clientPocFromCc",
  "internalPocTo",
  "requirementFrom",
  "demandReceivedDate",
  "typeOfDemand",
  "priority",
  "relevantExperience",
  "overallExperience",
  "qualificationCriteria",
  "employmentType",
  "workMode",
  "workTimings",
  "location",
  "numberOfPositions",
  "budgetCurrency",
  "monthlyBudget",
  "annualBudget",
  "noticePeriod",
  "sla",
];

/** Fill missing role fields from shared JD/email metadata */
export function mergeInheritedFields(
  role: RequirementData,
  common: Partial<RequirementData>
): RequirementData {
  const merged = { ...role };

  for (const field of INHERITABLE_STRING_FIELDS) {
    if (isMissingField(merged[field]) && !isMissingField(common[field])) {
      (merged as Record<string, unknown>)[field] = common[field];
    }
  }

  if (!merged.mandatorySkills.length && common.mandatorySkills?.length) {
    merged.mandatorySkills = common.mandatorySkills;
  }
  if (!merged.skills.length && common.skills?.length) {
    merged.skills = common.skills;
  }
  if (
    merged.jobDescription === NOT_SPECIFIED &&
    common.jobDescription &&
    common.jobDescription !== NOT_SPECIFIED
  ) {
    merged.jobDescription = common.jobDescription;
  }

  if (merged.demandReceivedDate !== NOT_SPECIFIED) {
    merged.openSince = formatOpenSince(merged.demandReceivedDate);
  }

  return merged;
}

export function extractCommonMetadata(
  rawText: string
): Partial<RequirementData> {
  return regexAugment(rawText, {});
}

export function normalize(value: unknown): string {
  if (value === undefined || value === null) return NOT_SPECIFIED;

  let text: string;
  if (typeof value === "string") {
    text = value;
  } else if (typeof value === "number" || typeof value === "boolean") {
    text = String(value);
  } else if (Array.isArray(value)) {
    text = value.map((item) => String(item)).join(", ");
  } else if (typeof value === "object") {
    text = JSON.stringify(value);
  } else {
    return NOT_SPECIFIED;
  }

  const trimmed = text.trim();
  if (!trimmed || trimmed.toLowerCase() === "n/a" || trimmed === "-") {
    return NOT_SPECIFIED;
  }
  return trimmed;
}

export function normalizeSkills(skills: unknown): string[] {
  let items: unknown[] = [];

  if (Array.isArray(skills)) {
    items = skills;
  } else if (typeof skills === "string" && skills.trim()) {
    items = skills.split(/[,;|]/);
  }

  if (!items.length) return [];

  const seen = new Set<string>();
  const result: string[] = [];
  for (const skill of items) {
    const cleaned = normalize(skill).replace(/^[-•*]\s*/, "");
    if (!cleaned || cleaned === NOT_SPECIFIED) continue;
    const key = cleaned.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(cleaned);
    }
  }
  return result;
}

export function generateRequirementId(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const seq = String(Math.floor(Math.random() * 900) + 100);
  return `REQ-${y}-${m}-${d}-${seq}`;
}

export function formatOpenSince(demandDate: string): string {
  if (demandDate === NOT_SPECIFIED) return NOT_SPECIFIED;
  const parsed = Date.parse(demandDate.replace(/,/g, ""));
  if (Number.isNaN(parsed)) return demandDate;
  const days = Math.max(
    0,
    Math.floor((Date.now() - parsed) / (1000 * 60 * 60 * 24))
  );
  const datePart = demandDate.split(",").slice(0, 2).join(",").trim();
  return `${datePart} (${days} day${days === 1 ? "" : "s"})`;
}

export function mapRelevantExperience(yearsText: string): string {
  const match = yearsText.match(/(\d+)/);
  if (!match) return NOT_SPECIFIED;
  const minYears = parseInt(match[1], 10);
  if (minYears < 2) return "Junior";
  if (minYears < 5) return "Mid";
  if (minYears < 8) return "Mid Senior";
  return "Senior";
}

export function companyFromEmail(email: string): string {
  const domain = email.split("@")[1]?.split(".")[0] ?? "";
  if (!domain) return NOT_SPECIFIED;
  return domain.replace(/-/g, " ").toUpperCase();
}

export function splitSkillList(raw: string): string[] {
  return raw
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function extractJobDescriptionSection(rawText: string): string {
  const match = rawText.match(
    /(?:job\s*description|key\s*areas?\s*of\s*responsibility|role\s*overview|key\s*responsibilities?)\s*:?\s*([\s\S]+)/i
  );
  if (!match) return NOT_SPECIFIED;
  return match[1].trim().slice(0, 3000);
}

export function toRequirementData(
  extracted: Partial<RequirementData>,
  options?: { isInferredTitle?: boolean }
): RequirementData {
  const demandReceivedDate = normalize(extracted.demandReceivedDate);
  const mandatorySkills = normalizeSkills(extracted.mandatorySkills);
  const skills = normalizeSkills(extracted.skills);
  const finalSkills = skills.length ? skills : mandatorySkills;

  return {
    requirementId: generateRequirementId(),
    jobTitle: normalize(extracted.jobTitle),
    isInferredTitle: options?.isInferredTitle,
    clientLeadPocFrom: normalize(extracted.clientLeadPocFrom),
    clientPocFromCc: normalize(extracted.clientPocFromCc),
    internalPocTo: normalize(extracted.internalPocTo),
    requirementFrom: normalize(extracted.requirementFrom),
    demandReceivedDate,
    closedDate: NOT_SPECIFIED,
    openSince: formatOpenSince(demandReceivedDate),
    typeOfDemand: normalize(extracted.typeOfDemand),
    jobStatus: "Unassigned",
    priority: normalize(extracted.priority),
    relevantExperience: normalize(extracted.relevantExperience),
    overallExperience: normalize(extracted.overallExperience),
    qualificationCriteria: normalize(extracted.qualificationCriteria),
    employmentType: normalize(extracted.employmentType),
    workMode: normalize(extracted.workMode),
    workTimings: normalize(extracted.workTimings),
    location: normalize(extracted.location),
    numberOfPositions: normalize(extracted.numberOfPositions),
    budgetCurrency: normalize(extracted.budgetCurrency),
    monthlyBudget: normalize(extracted.monthlyBudget),
    annualBudget: normalize(extracted.annualBudget),
    noticePeriod: normalize(extracted.noticePeriod),
    sla: normalize(extracted.sla),
    mandatorySkills,
    skills: finalSkills,
    jobDescription: normalize(extracted.jobDescription),
  };
}


function isMissingField(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return !trimmed || trimmed === NOT_SPECIFIED;
  }
  return false;
}

export function regexAugment(
  rawText: string,
  data: Partial<RequirementData>
): Partial<RequirementData> {
  const augmented = { ...data };

  const fromLine = rawText.match(/From:\s*(.+)/i);
  if (fromLine) {
    const fromEmail = fromLine[1].match(/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/);
    const fromName = fromLine[1]
      .replace(/<[^>]+>/, "")
      .replace(fromEmail?.[0] ?? "", "")
      .trim();
    if (fromEmail) {
      if (isMissingField(augmented.clientLeadPocFrom)) {
        augmented.clientLeadPocFrom = fromName
          ? `${fromName} <${fromEmail[0]}>`
          : fromEmail[0];
      }
      if (isMissingField(augmented.clientPocFromCc)) {
        augmented.clientPocFromCc = fromEmail[0];
      }
      if (isMissingField(augmented.requirementFrom)) {
        augmented.requirementFrom = companyFromEmail(fromEmail[0]);
      }
    }
  }

  const toMatch = rawText.match(/To:\s*(.+)/i);
  if (toMatch && isMissingField(augmented.internalPocTo)) {
    augmented.internalPocTo = toMatch[1].trim();
  }

  const subjectMatch = rawText.match(/Subject:\s*(.+)/i);
  if (subjectMatch) {
    const subject = subjectMatch[1].trim();
    const atParts = subject.split("@").map((p) => p.trim());
    if (isMissingField(augmented.jobTitle) && atParts[0]) {
      augmented.jobTitle = atParts[0];
    }
    if (isMissingField(augmented.location) && atParts[1]) {
      augmented.location = atParts[1];
    }
  }

  const sentMatch = rawText.match(
    /Sent:\s*(?:\w+day,?\s*)?(\w+\s+\d{1,2},?\s*\d{4})(?:\s+(\d{1,2}:\d{2}))?/i
  );
  if (sentMatch && isMissingField(data.demandReceivedDate)) {
    const time = sentMatch[2] ? `, ${sentMatch[2]}` : "";
    augmented.demandReceivedDate = `${sentMatch[1]}${time}`.trim();
  }

  const openingsInline = rawText.match(/\b(\d+)\s+openings?\b/i);
  if (openingsInline) {
    augmented.numberOfPositions = openingsInline[1];
    const count = parseInt(openingsInline[1], 10);
    augmented.typeOfDemand = count > 1 ? "Multiple" : "Single";
  }

  const positionMatch = rawText.match(
    /(?:No\.?\s*of\s*Position[s]?|Number\s*of\s*Position[s]?|Headcount|Resources\s*Required)\s*[\r\n\t :\-]*([0-9]+)/i
  );

  if (positionMatch && isMissingField(augmented.numberOfPositions)) {
    augmented.numberOfPositions = positionMatch[1];
    const count = parseInt(positionMatch[1], 10);
    augmented.typeOfDemand = count > 1 ? "Multiple" : "Single";
  }

  const expMatch = rawText.match(
    /overall\s*exp(?:erience)?\s*[-–:]\s*([\d\s\-–to]+years?)/i
  );
  if (expMatch && isMissingField(data.overallExperience)) {
    augmented.overallExperience = expMatch[1].replace(/\s+/g, " ").trim();
  }

  const tpcMatch = rawText.match(/tpc\s*rates?\s*[-–:]\s*([\d,]+)/i);
  if (tpcMatch && isMissingField(data.monthlyBudget)) {
    augmented.monthlyBudget = `INR ${tpcMatch[1]}`;
    augmented.budgetCurrency = "INR";
  }

  const lpaMatch = rawText.match(/(\d+\s*(?:to|-)\s*\d+)\s*lpa/i);
  if (lpaMatch && isMissingField(augmented.annualBudget)) {
    augmented.annualBudget = `${lpaMatch[1]} LPA`;
    augmented.budgetCurrency = "INR";
  }

  const is2Match = rawText.match(/is2\s*[-–:]\s*(\d+(?:\s*to\s*\d+)?\s*lpa)/i);
  if (is2Match) {
    const is2Val = is2Match[1].trim();
    if (isMissingField(augmented.annualBudget)) {
      augmented.annualBudget = is2Val;
      augmented.budgetCurrency = "INR";
    } else if (
      !String(augmented.annualBudget).toLowerCase().includes("is2")
    ) {
      augmented.annualBudget = `${augmented.annualBudget} (IS2: ${is2Val})`;
    }
  }

  if (/immediate\s*joiners?/i.test(rawText) && isMissingField(data.noticePeriod)) {
    augmented.noticePeriod = "Immediate joiners only";
  }

  const mentions = [...rawText.matchAll(/@([A-Za-z][\w\s.]+?)(?=\s*&|\s*on\b|[\n,]|$)/g)].map(
    (m) => m[1].trim()
  );
  if (mentions.length && isMissingField(data.internalPocTo)) {
    augmented.internalPocTo = mentions.join(", ");
  }

  if (/on\s+priority|priority/i.test(rawText) && isMissingField(data.priority)) {
    augmented.priority = "HIGH";
  }

  if (/hybrid\s*mode/i.test(rawText) && isMissingField(data.workMode)) {
    const hybridDetail = rawText.match(/hybrid\s*mode\s*\(([^)]+)\)/i);
    augmented.workMode = hybridDetail
      ? `Hybrid (${hybridDetail[1]})`
      : "Hybrid";
  } else if (/on-?site/i.test(rawText) && isMissingField(data.workMode)) {
    augmented.workMode = "On-site";
  } else if (/\bremote\b/i.test(rawText) && isMissingField(data.workMode)) {
    augmented.workMode = "Remote";
  }

  const timingsMatch = rawText.match(
    /work\s*timings?\s*[-–:]\s*(.+?)(?:\n|$)/i
  );
  if (timingsMatch && isMissingField(data.workTimings)) {
    augmented.workTimings = timingsMatch[1].trim();
  }

  const contractMatch = /\bcontract\b/i.test(rawText);
  if (contractMatch && isMissingField(data.employmentType)) {
    augmented.employmentType = "Contract";
  }

  const posCount = parseInt(
    String(augmented.numberOfPositions ?? data.numberOfPositions ?? ""),
    10
  );
  if (!Number.isNaN(posCount) && isMissingField(data.typeOfDemand)) {
    augmented.typeOfDemand = posCount === 1 ? "Single" : "Multiple";
  }

  if (
    augmented.overallExperience &&
    !isMissingField(augmented.overallExperience) &&
    isMissingField(data.relevantExperience)
  ) {
    augmented.relevantExperience = mapRelevantExperience(
      String(augmented.overallExperience)
    );
  }

  
  // PASTE HERE ↓↓↓
  
  const locationMatch = rawText.match(
    /(?:Location|Work\s*Location|Job\s*Location|Base\s*Location)\s*[\r\n\t :\-]*([A-Za-z\/ ,]+)/i
  );

  if (locationMatch && isMissingField(augmented.location)) {
    augmented.location = locationMatch[1].trim();
  }

  const cityLineMatch = rawText.match(
    /\n([A-Z][a-zA-Z]+(?:\s*,\s*[A-Z][a-zA-Z]+)+)\s*\n(?=Hybrid|Remote|On-?site|\d+\s+Openings|Work\s*Timings)/i
  );
  if (cityLineMatch && isMissingField(augmented.location)) {
    augmented.location = cityLineMatch[1].trim();
  }
  
  // QUALIFICATION
  const qualificationMatch = rawText.match(
    /qualification\s*[-–:]\s*(.+?)(?:\n|$)/i
  );
  
  if (
    qualificationMatch &&
    isMissingField(data.qualificationCriteria)
  ) {
    augmented.qualificationCriteria =
      qualificationMatch[1].trim();
  }
  
  // EXPERIENCE
  const experienceMatch = rawText.match(
    /experience\s*[-–:]\s*(.+?)(?:\n|$)/i
  );
  
  if (
    experienceMatch &&
    isMissingField(data.overallExperience)
  ) {
    augmented.overallExperience =
      experienceMatch[1].trim();
  }
  
  // BILL RATE
  const billRateMatch = rawText.match(
    /bill\s*rate\s*per\s*month\s*[-–:]\s*(.+?)(?:\n|$)/i
  );
  
  if (
    billRateMatch &&
    isMissingField(data.monthlyBudget)
  ) {
    augmented.monthlyBudget =
      billRateMatch[1].trim();
  
    if (
      isMissingField(data.budgetCurrency)
    ) {
      augmented.budgetCurrency = "INR";
    }
  }
  // POSITIONS

// EMPLOYMENT TYPE
const hireTypeMatch = rawText.match(
  /(?:Type\s*of\s*Hire|Employment\s*Type)\s*[\r\n\t :\-]*(FTE|FTS|Sub-Con|Contract|Permanent)/i
);

if (hireTypeMatch) {
  augmented.employmentType = hireTypeMatch[1];
}
  
const ccMatch = rawText.match(
  /Cc:\s*(.+)/i
);

if (
  ccMatch &&
  isMissingField(data.clientPocFromCc)
) {
  augmented.clientPocFromCc =
    ccMatch[1].trim();
}

  return augmented;
}
