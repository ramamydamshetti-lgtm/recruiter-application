// @ts-nocheck — copied from JD Analyser MVP; strict-null checks deferred to avoid risky refactors.
import type { RequirementData } from "./types/requirement";
import {
  isGenericJobTitle,
  NOT_SPECIFIED,
  regexAugment,
  resolveJobTitle,
  toRequirementData,
} from "./jd-utils";
import {
  generateGeminiContent,
  inferJobTitleWithGemini,
  isRetryableGeminiError,
} from "./gemini-helpers";

export interface ExtractOptions {
  hintTitle?: string;
  /** Full original JD/email text — used for shared metadata (From, Subject, salary, etc.) */
  fullJdText?: string;
}


// cSpell:disable

const SYSTEM_PROMPT = `
You are an expert ATS Recruitment Requirement Extraction Engine with deep domain knowledge in technical recruitment, staffing, and HR operations.

Your task is to extract structured data from recruiter emails, staffing requests, vendor requirements, hiring mails, tables, spreadsheets converted to text, and job descriptions with high precision and accuracy.

Return ONLY valid JSON.

Schema:

{
  "jobTitle": "",
  "clientLeadPocFrom": "",
  "clientPocFromCc": "",
  "internalPocTo": "",
  "requirementFrom": "",
  "demandReceivedDate": "",
  "typeOfDemand": "",
  "priority": "",
  "relevantExperience": "",
  "overallExperience": "",
  "qualificationCriteria": "",
  "employmentType": "",
  "workMode": "",
  "workTimings": "",
  "location": "",
  "numberOfPositions": "",
  "budgetCurrency": "",
  "monthlyBudget": "",
  "annualBudget": "",
  "noticePeriod": "",
  "sla": "",
  "mandatorySkills": [],
  "skills": [],
  "jobDescription": ""
}

Rules:

- Search the entire document thoroughly for all relevant information.
- Extract information even if labels vary or are non-standard.
- Preserve original values whenever possible, including formatting.
- Do not invent POC names, dates, budgets, or contact details not present in the text.
- Use "Not specified" only when information genuinely cannot be found after thorough search.
- EXCEPTION for jobTitle: you MUST always provide a meaningful job title. If no explicit title exists, infer one from skills, experience, and responsibilities (see Job Title Priority below). Never leave jobTitle as empty or "Not specified".
- Pay special attention to technical skills, experience requirements, and job specifics.
- Extract numerical values accurately (years of experience, budgets, positions, etc.).
- Normalize skill names to industry-standard terminology when appropriate.

Extraction:

clientLeadPocFrom:
- From
- Sender
- Requested By

clientPocFromCc:
- CC
- Cc

internalPocTo:
- To
- Assigned To
- @mentions

requirementFrom:
- Client
- Company
- Organization
- Email domain (e.g. itcinfotech.com → ITC INFOTECH)

demandReceivedDate:
- Sent
- Date
- Requested On
- Requirement Date

Email headers (ALWAYS extract when present):
- From: line → clientLeadPocFrom (name and email)
- To: line → internalPocTo
- Sent: line → demandReceivedDate
- Subject: line → jobTitle (before @) and location (after @)
- Cc: line → clientPocFromCc

Unlabeled metadata lines (common in recruiter emails):
- City lists on their own line (e.g. "Bangalore, Pune, Hyderabad") → location
- "Hybrid Mode (3 days a week)" → workMode
- "Work Timings – ..." → workTimings
- "3 Openings" or "N Openings" → numberOfPositions
- "25 to 28 LPA" → annualBudget (INR)
- "Is2 – 20 LPA" → append as IS2 budget note

employmentType:
- FTE
- FTS
- Contract
- Contractor
- Sub-Con
- Permanent

workMode:
- Remote
- Hybrid
- Onsite

location:
- Location
- Work Location
- Base Location
- Job Location

numberOfPositions:
- No. of Position
- Positions
- Openings
- Headcount
- Vacancies

Important:
If text contains:
"No. of Position 2"
"Positions: 2"
"Headcount: 2"

Then numberOfPositions MUST be 2.

typeOfDemand:
- Multiple if numberOfPositions > 1
- Single if numberOfPositions = 1

priority:
- HIGH if urgent, immediate, critical, ASAP, priority
- MEDIUM otherwise

Experience:

Extract exact experience values including ranges and minimums.

Examples:
- 3+ years, 3+ years experience
- 5-8 years, 5 to 8 years
- 7 years, 7 years of experience
- Minimum 2 years, Min 2 years
- 10+ years in relevant field

overallExperience = exact extracted value as string

relevantExperience:
0-2 years -> Junior
2-5 years -> Mid
5-8 years -> Mid Senior
8-12 years -> Senior
12+ years -> Lead/Principal

Consider both overall experience and relevant/specific experience when categorizing.

Budget:

Extract from various compensation indicators:
- Budget, Salary, Compensation, Package
- LPA (Lakhs Per Annum), CTC (Cost to Company)
- Bill Rate, Hourly Rate, Daily Rate
- Pay Range, Salary Range
- Lakh, Lakhs, L (e.g. "20 Lakh", "25L", "20-22 Lakh")

CRITICAL budget rules:

1. budgetCurrency: Extract currency symbol or code (USD, INR, EUR, etc.)
   - If "Lakh", "LPA", "CTC", "L" are mentioned → budgetCurrency = "INR"

2. monthlyBudget: ONLY for explicitly monthly figures
   - Monthly rates, bill rates per month, TPC rates
   - "$50-70/hour" → monthlyBudget with appropriate calculation
   - Do NOT put annual/yearly figures here

3. annualBudget: For annual/yearly figures
   - LPA, CTC, yearly salary, per annum, Lakh, Lakhs, L
   - "15-20 LPA" → "15-20 LPA"
   - "$80,000 - $120,000" → "$80,000 - $120,000"
   - "Budget: $100k" → "$100k"

4. TIERED/EXPERIENCE-BASED budgets (very common in Indian staffing emails):
   When budget varies by experience level, combine ALL tiers into annualBudget as a single string.
   Examples:
   - "5-6 yrs. Exp- 20-22 Lakh / 7-8 Years exp- 25L"
     → annualBudget: "5-6 yrs: 20-22 LPA; 7-8 yrs: 25 LPA"
     → budgetCurrency: "INR"
   - "Junior: 8-12 LPA, Senior: 15-20 LPA"
     → annualBudget: "Junior: 8-12 LPA; Senior: 15-20 LPA"
   - "3-5 yrs - 10L, 5-8 yrs - 15L"
     → annualBudget: "3-5 yrs: 10 LPA; 5-8 yrs: 15 LPA"

5. SHARED/GLOBAL budgets:
   If budget appears at the top of the email (before any Requirement #1, #2 etc.),
   it applies to ALL requirements. Always extract it even if it appears far from
   the current requirement's section.

6. "Lakh" / "L" conversions:
   - "20 Lakh" = "20 LPA"
   - "25L" = "25 LPA"  
   - "20-22 Lakh" = "20-22 LPA"
   These are ALWAYS annual (per annum). Never put them in monthlyBudget.

If currency is not specified, infer from context or use company location.

Skills:

mandatorySkills:
Extract only from explicitly marked sections:
- Key Skills, Required Skills, Mandatory Skills
- Must Have Skills, Primary Skills, Core Competencies
- Essential Technologies, Must-have Technologies
- Required Technologies, Critical Skills

These are non-negotiable requirements explicitly labeled as mandatory.

skills:
Extract ALL additional technologies, tools, certifications, frameworks, platforms, compliance standards, cloud services, and domain knowledge mentioned anywhere in the document, including:
- Nice-to-have skills
- Preferred qualifications
- Additional technologies mentioned
- Domain-specific knowledge
- Industry certifications
- Soft skills relevant to the role
- Tools and platforms used

Do not duplicate mandatorySkills in the skills array.

Job Title Priority (MANDATORY — jobTitle must never be "Not specified"):

1. Explicit Job Title/Role/Position fields
2. Requirement Name/Requirement Heading (e.g. "Requirement #2: Cloud Engineer")
3. Subject Line of email/document
4. First line of job description
5. Infer from mandatory skills, nice-to-have skills, and responsibilities

When inferring titles from skills:
- Combine related technologies into coherent professional titles
- Use industry-standard terminology
- Consider seniority levels from experience requirements
- Ensure titles are recruiter-friendly and descriptive

Examples:

IAM + IGA + PAM + SSO -> IAM Analyst
Cloud Security + GRC -> Cloud Security GRC Engineer
WAF + Terraform + AWS -> WAF Migration Lead
Wiz + CSPM + CNAPP -> Cloud Security Engineer
CyberArk + PAM -> CyberArk PAM Security Expert
Delinea + PAM -> Delinea PAM Engineer
AWS + DevOps + Kubernetes -> DevOps Engineer
Python + RAG + LangGraph -> Generative AI Engineer
Java + Spring Boot -> Java Backend Developer
React + Next.js -> Frontend Developer
SAP + FICO -> SAP FICO Consultant

If a role name appears anywhere in the requirement, always prefer that explicit role name over inference.

jobDescription:
Return only requirement-related content.
Remove:
- signatures
- regards
- email footers
- confidentiality notices
- legal disclaimers

Return JSON only.
`;
// cSpell:enable
const JSON_FIELDS = [
  "jobTitle",
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
  "mandatorySkills",
  "skills",
  "jobDescription",
] as const;

export type LlmProvider =
  | "groq"
  | "openrouter"
  | "sambanova"
  | "gemini";

function isValidKey(key: string | undefined, placeholder: string): boolean {
  if (!key?.trim()) return false;
  return !key.includes(placeholder) && key.length > 10;
}

export function getConfiguredProvider(): LlmProvider | null {
  if (process.env.GEMINI_API_KEY?.trim())
    return "gemini";

  if (process.env.SAMBANOVA_API_KEY?.trim())
    return "sambanova";

  if (
    isValidKey(
      process.env.GROQ_API_KEY,
      "your-groq"
    )
  )
    return "groq";

  if (
    isValidKey(
      process.env.OPENROUTER_API_KEY,
      "your-openrouter"
    )
  )
    return "openrouter";

  return null;
}
const SKILL_FIELDS = new Set(["mandatorySkills", "skills"]);

async function finalizeExtraction(
  rawJdText: string,
  parsed: Record<string, unknown>,
  options?: ExtractOptions
): Promise<RequirementData> {
  const mandatoryArray = Array.isArray(parsed.mandatorySkills)
    ? (parsed.mandatorySkills as string[])
    : typeof parsed.mandatorySkills === "string"
      ? parsed.mandatorySkills.split(/[,;|]/)
      : [];

  const skillArray = Array.isArray(parsed.skills)
    ? (parsed.skills as string[])
    : typeof parsed.skills === "string"
      ? parsed.skills.split(/[,;|]/)
      : [];

  const mandatory = new Set(
    mandatoryArray.map((s: string) => s.toLowerCase().trim())
  );

  parsed.mandatorySkills = mandatoryArray;
  parsed.skills = skillArray.filter(
    (skill: string) => !mandatory.has(skill.toLowerCase().trim())
  );

  const augmentSource = options?.fullJdText ?? rawJdText;
  const augmented = regexAugment(
    augmentSource,
    parsed as Partial<RequirementData>
  );

  const rawExtractedTitle = String(augmented.jobTitle ?? NOT_SPECIFIED);
  let jobTitle = resolveJobTitle(rawExtractedTitle, options?.hintTitle);
  let isInferredTitle = false;

  if (jobTitle === NOT_SPECIFIED) {
    const allSkills = [
      ...mandatoryArray,
      ...skillArray.filter(
        (s: string) => !mandatory.has(s.toLowerCase().trim())
      ),
    ];
    const inferred = await inferJobTitleWithGemini(rawJdText, allSkills);
    if (inferred && !isGenericJobTitle(inferred)) {
      jobTitle = inferred;
      isInferredTitle = true;
    }
  } else if (isGenericJobTitle(rawExtractedTitle)) {
    isInferredTitle = true;
  }

  augmented.jobTitle = jobTitle;

  return toRequirementData(augmented, { isInferredTitle });
}

function fillMissingFields(parsed: Record<string, unknown>): Record<string, unknown> {
  for (const field of JSON_FIELDS) {
    if (!(field in parsed) || parsed[field] === null || parsed[field] === undefined) {
      parsed[field] = SKILL_FIELDS.has(field) ? [] : "Not specified";
    }
  }
  return parsed;
}

async function callChatApi(
  url: string,
  apiKey: string,
  model: string,
  extraHeaders: Record<string, string>,
  rawJdText: string,
  hintTitle?: string
): Promise<string> {
  const titleHint = hintTitle
    ? `\n\nDetected role heading from document: "${hintTitle}" — use this as jobTitle if no explicit title is found in the text.`
    : "";
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Extract structured requirement data from this JD:${titleHint}\n\n${rawJdText}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message =
      (body as { error?: { message?: string } })?.error?.message ??
      `LLM API error (${response.status})`;
    throw new Error(message);
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };

  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty response from LLM");
  return content;
}

async function extractWithGroq(
  rawJdText: string,
  options?: ExtractOptions
): Promise<RequirementData> {
  const apiKey = process.env.GROQ_API_KEY!.trim();
  const model =
    process.env.GROQ_MODEL ??
    "llama-3.3-70b-versatile";

  const content = await callChatApi(
    "https://api.groq.com/openai/v1/chat/completions",
    apiKey,
    model,
    {},
    rawJdText,
    options?.hintTitle
  );

  const parsed = fillMissingFields(
    JSON.parse(content) as Record<string, unknown>
  );

  return finalizeExtraction(rawJdText, parsed, options);
}
async function extractWithSambaNova(
  rawJdText: string,
  options?: ExtractOptions
): Promise<RequirementData> {
  const apiKey =
    process.env.SAMBANOVA_API_KEY!.trim();

  const model =
    process.env.SAMBANOVA_MODEL ??
    "Meta-Llama-3.3-70B-Instruct";

  const content = await callChatApi(
    "https://api.sambanova.ai/v1/chat/completions",
    apiKey,
    model,
    {},
    rawJdText,
    options?.hintTitle
  );

  const parsed = fillMissingFields(
    JSON.parse(content) as Record<string, unknown>
  );

  return finalizeExtraction(rawJdText, parsed, options);
}
async function extractWithOpenRouter(
  rawJdText: string,
  options?: ExtractOptions
): Promise<RequirementData> {
  const apiKey =
    process.env.OPENROUTER_API_KEY!.trim();

  const model =
    process.env.OPENROUTER_MODEL ??
    "meta-llama/llama-3.3-70b-instruct:free";

  const content = await callChatApi(
    "https://openrouter.ai/api/v1/chat/completions",
    apiKey,
    model,
    {
      "HTTP-Referer":
        "http://localhost:3000",
      "X-Title": "JD Analyser",
    },
    rawJdText,
    options?.hintTitle
  );

  const parsed = fillMissingFields(
    JSON.parse(content) as Record<string, unknown>
  );

  return finalizeExtraction(rawJdText, parsed, options);
}

async function extractWithGemini(
  rawJdText: string,
  options?: ExtractOptions
): Promise<RequirementData> {
  const titleHint = options?.hintTitle
    ? `\n\nDetected role heading from document: "${options.hintTitle}" — use this as jobTitle if no explicit title is found in the text.`
    : "";
  const prompt = `${SYSTEM_PROMPT}\n\nExtract structured requirement data from this JD:${titleHint}\n\n${rawJdText}`;

  const { content } = await generateGeminiContent(prompt);
  const parsed = fillMissingFields(
    JSON.parse(content) as Record<string, unknown>
  );

  return finalizeExtraction(rawJdText, parsed, options);
}
export function getMissingKeyMessage(): string {
  return `No LLM API key configured. Add a free key to .env.local:

Option 1 — Gemini Flash (recommended, free):
  GEMINI_API_KEY=your-gemini-api-key-here   → get at https://aistudio.google.com/app/apikey

Option 2 — Groq (free):
  GROQ_API_KEY=gsk_...   → get at https://console.groq.com

Option 3 — OpenRouter (free models):
  OPENROUTER_API_KEY=sk-or-...   → get at https://openrouter.ai/keys

Then restart: npm run dev`;
}

export function getRateLimitMessage(): string {
  return `Gemini is temporarily busy or rate-limited. The system retries with backoff, tries alternate Gemini models, then falls back to other providers if configured.

To improve reliability:
1. Set GEMINI_MODEL=gemini-2.5-flash-lite in .env.local (often less busy)
2. Add SAMBANOVA_API_KEY or GROQ_API_KEY as fallback in .env.local
3. Wait a minute and try again`;
}

export async function extractWithLlm(
  rawJdText: string,
  options?: ExtractOptions
): Promise<{ data: RequirementData; provider: LlmProvider }> {
  const provider = getConfiguredProvider();
  if (!provider) {
    throw new Error(getMissingKeyMessage());
  }

  try {
    const data =
    provider === "gemini"
      ? await extractWithGemini(rawJdText, options)
      : provider === "sambanova"
      ? await extractWithSambaNova(rawJdText, options)
      : provider === "groq"
      ? await extractWithGroq(rawJdText, options)
      : await extractWithOpenRouter(rawJdText, options);
    return { data, provider };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isTransient = isRetryableGeminiError(errorMessage);

    if (isTransient && provider === "gemini") {
      console.error("Gemini unavailable. Trying fallback providers...");
      
      // Try Groq
      if (process.env.GROQ_API_KEY?.trim()) {
        try {
          console.log("Attempting fallback to Groq...");
          const data = await extractWithGroq(rawJdText, options);
          return { data, provider: "groq" };
        } catch (groqError) {
          console.error("Groq fallback failed:", groqError);
        }
      }
      
      // Try SambaNova
      if (process.env.SAMBANOVA_API_KEY?.trim()) {
        try {
          console.log("Attempting fallback to SambaNova...");
          const data = await extractWithSambaNova(rawJdText, options);
          return { data, provider: "sambanova" };
        } catch (sambaError) {
          console.error("SambaNova fallback failed:", sambaError);
        }
      }
      
      // Try OpenRouter
      if (process.env.OPENROUTER_API_KEY?.trim()) {
        try {
          console.log("Attempting fallback to OpenRouter...");
          const data = await extractWithOpenRouter(rawJdText, options);
          return { data, provider: "openrouter" };
        } catch (openrouterError) {
          console.error("OpenRouter fallback failed:", openrouterError);
        }
      }
      
      throw new Error(`All providers failed. Last error: ${errorMessage}`);
    }

    throw error;
  }
}
