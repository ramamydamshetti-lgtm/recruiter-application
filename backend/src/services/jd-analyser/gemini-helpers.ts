import { GoogleGenerativeAI } from "@google/generative-ai";

/** Models tried in order when primary is busy (503) or rate-limited */
const DEFAULT_GEMINI_FALLBACKS = [
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-flash-latest",
  "gemini-3.1-flash-lite",
  "gemini-2.5-pro",
];

export function getGeminiModelChain(): string[] {
  const configured = process.env.GEMINI_MODEL?.trim();
  const fromEnv = (process.env.GEMINI_FALLBACK_MODELS ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  const chain = [
    ...(configured ? [configured] : ['gemini-2.5-flash-lite']),
    ...fromEnv,
    ...DEFAULT_GEMINI_FALLBACKS,
  ];
  return [...new Set(chain)];
}

export function isRetryableGeminiError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    message.includes('429') ||
    message.includes('503') ||
    message.includes('404') ||
    lower.includes('not found') ||
    lower.includes('is not supported') ||
    lower.includes('rate limit') ||
    lower.includes('high demand') ||
    lower.includes('quota exceeded') ||
    message.includes('RATE_LIMIT_EXCEEDED') ||
    lower.includes('overloaded') ||
    lower.includes('unavailable') ||
    lower.includes('temporarily unavailable')
  );
}

export async function generateGeminiContent(
  prompt: string,
  options?: { json?: boolean; retriesPerModel?: number }
): Promise<{ content: string; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("No GEMINI_API_KEY configured");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const models = getGeminiModelChain();
  const retriesPerModel = options?.retriesPerModel ?? 3;
  let lastError: Error | null = null;

  for (const modelName of models) {
    for (let attempt = 0; attempt < retriesPerModel; attempt++) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            temperature: 0,
            ...(options?.json !== false
              ? { responseMimeType: "application/json" as const }
              : {}),
          },
        });

        const result = await model.generateContent(prompt);
        const content = result.response.text();
        if (!content) throw new Error("Empty response from Gemini");

        if (modelName !== models[0]) {
          console.log(`Gemini succeeded with fallback model: ${modelName}`);
        }

        return { content, model: modelName };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        lastError = error instanceof Error ? error : new Error(message);

        if (isRetryableGeminiError(message) && attempt < retriesPerModel - 1) {
          const backoff = Math.pow(2, attempt) * 1500;
          console.warn(
            `Gemini ${modelName} busy. Retrying in ${backoff}ms (${attempt + 1}/${retriesPerModel})...`
          );
          await new Promise((resolve) => setTimeout(resolve, backoff));
          continue;
        }

        if (isRetryableGeminiError(message)) {
          console.warn(
            `Gemini ${modelName} unavailable (${message.slice(0, 100)}). Trying next model...`
          );
          break;
        }

        console.warn(
          `Gemini ${modelName} failed (${message.slice(0, 100)}). Trying next model...`
        );
        break;
      }
    }
  }

  throw lastError ?? new Error("All Gemini models failed");
}

const TITLE_INFERENCE_PROMPT = `You are an expert technical recruiter.

Given a job requirement text (which may NOT contain an explicit job title), infer the most accurate, professional job title based on:
- Required skills and technologies
- Years of experience
- Responsibilities and domain
- Seniority level implied by experience

Return ONLY valid JSON:
{ "jobTitle": "Professional Job Title Here" }

Rules:
- Use industry-standard titles recruiters would search for (e.g. "Senior Java Backend Developer", "Cloud Security Engineer")
- Include seniority prefix when experience warrants it (Junior/Mid/Senior/Lead)
- Combine key technologies into a coherent title when appropriate
- Never return generic placeholders like "Not specified", "Requirement", or "Role"
- Return a single concise title (max 6 words)`;

export async function inferJobTitleWithGemini(
  requirementText: string,
  skills: string[] = []
): Promise<string | null> {
  if (!process.env.GEMINI_API_KEY?.trim()) return null;

  const skillsHint =
    skills.length > 0 ? `\n\nKey skills: ${skills.slice(0, 15).join(", ")}` : "";

  try {
    const prompt = `${TITLE_INFERENCE_PROMPT}${skillsHint}\n\nRequirement text:\n\n${requirementText.slice(0, 4000)}`;
    const { content } = await generateGeminiContent(prompt);
    const parsed = JSON.parse(content) as { jobTitle?: string };
    const title = parsed.jobTitle?.trim();
    return title || null;
  } catch (error) {
    console.error("Gemini title inference failed:", error);
    return null;
  }
}
