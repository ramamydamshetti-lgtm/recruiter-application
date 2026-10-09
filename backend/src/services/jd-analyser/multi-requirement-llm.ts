// @ts-nocheck — copied from JD Analyser MVP; strict-null checks deferred to avoid risky refactors.
import {
  generateGeminiContent,
  isRetryableGeminiError,
} from "./gemini-helpers";
import {
  detectPositionFocusVariants,
  postProcessChunks,
  type RequirementChunk,
} from "./requirement-chunks";

export type { RequirementChunk };
  
  const SPLIT_REQUIREMENTS_PROMPT = `
You are an expert recruitment requirement parser with deep knowledge of technical staffing and HR operations.

Your task is to detect and split ALL hiring requirements from recruiter emails, vendor requests, staffing mails, requirement sheets, and job descriptions with high accuracy.

Return ONLY valid JSON.

Schema:

{
  "requirements": [
    {
      "title": "Role title",
      "content": "Complete requirement text for this role only",
      "numberOfPositions": "2"
    }
  ]
}

Rules:

1. Every distinct role must become a separate requirement.

2. Split requirements when you see:
   - Requirement #1, #2, #3, #N
   - Role:, Position:, Job Title:, Requirement:, Opening:, Vacancy:
   - Tables with Role Name / No. of Openings / Headcount columns (one row = one requirement)
   - Multiple job listings in one document
   - Different skill sets, experience, or locations for different positions

3. If an email contains multiple numbered requirements or N table rows, return exactly N requirement objects.

3b. Position focus variants (IMPORTANT):
   When ONE main JD body is followed by lines like:
   "Position 1 to be focused ..." and "Position 2 to be focused ..."
   These are role VARIANTS of the same requirement — NOT a separate parent JD.
   Return ONLY the position variants (e.g. 2 items for Position 1 and Position 2).
   Each variant's content MUST include: email headers + shared metadata + full JD body + its position focus line.
   Do NOT return the main JD as a separate third requirement.

9. numberOfPositions:
   - Extract per-role openings/headcount/vacancies when listed separately
   - Use "1" if not specified for that role

4. Preserve ALL original text belonging to that requirement, including technical details.

5. Do NOT summarize or condense the content.

6. Do NOT merge requirements under any circumstances.

7. Remove only:
   - Email signatures
   - Regards sections
   - Legal disclaimers
   - Confidentiality notices
   - Irrelevant headers/footers

8. Title generation:
   - Use explicit role name if available in the text
   - Otherwise infer a professional title from key skills and technologies
   - Ensure titles are recruiter-friendly and descriptive

Examples:

Input:

Requirement #1
Skills: AWS, Terraform, WAF

Requirement #2
Skills: Cloud Security GRC, AWS

Output:

{
  "requirements": [
    {
      "title": "WAF Migration Lead",
      "content": "..."
    },
    {
      "title": "Cloud Security GRC Engineer",
      "content": "..."
    }
  ]
}

IMPORTANT:

For input containing:

Requirement #1
Requirement #2
Requirement #3
Requirement #4

You MUST return exactly 4 requirement objects.

Return JSON only.
`;
  
  export async function detectRequirementsWithLlm(
    rawText: string
  ): Promise<RequirementChunk[]> {
    const positionVariants = detectPositionFocusVariants(rawText);
    if (positionVariants) {
      return positionVariants;
    }

    // Try Gemini first if API key is available
    if (process.env.GEMINI_API_KEY?.trim()) {
      try {
        const prompt = `${SPLIT_REQUIREMENTS_PROMPT}\n\nInput:\n\n${rawText}`;
        const { content, model } = await generateGeminiContent(prompt);

        console.log(`RAW GEMINI SPLITTER RESPONSE (${model}):`);
        console.log(content);

        const parsed = JSON.parse(content);
        console.log("Parsed Requirements:", parsed.requirements?.length);
        console.log(parsed.requirements);

        return postProcessChunks(rawText, parsed.requirements ?? [
          { title: "Single Requirement", content: rawText },
        ]);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (isRetryableGeminiError(errorMessage)) {
          console.error("Gemini unavailable. Trying fallback providers...");
        } else {
          console.error("Gemini API failed, falling back:", error);
        }
      }
    }
  
    // Try Groq as second fallback
    if (process.env.GROQ_API_KEY?.trim()) {
      try {
        const response = await fetch(
          "https://api.groq.com/openai/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
              temperature: 0,
              response_format: {
                type: "json_object",
              },
              messages: [
                {
                  role: "system",
                  content: SPLIT_REQUIREMENTS_PROMPT,
                },
                {
                  role: "user",
                  content: rawText,
                },
              ],
            }),
          }
        );
        
        const payload = await response.json();
        const content = payload.choices?.[0]?.message?.content;
        
        if (content) {
          console.log("RAW GROQ SPLITTER RESPONSE:");
          console.log(content);
          
          const parsed = JSON.parse(content);
          console.log(
            "Parsed Requirements:",
            parsed.requirements?.length
          );
          console.log(parsed.requirements);
        
          return postProcessChunks(rawText, parsed.requirements ?? [
            { title: "Single Requirement", content: rawText },
          ]);
        }
      } catch (error) {
        console.error("Groq API failed, falling back to SambaNova:", error);
      }
    }
  
    if (process.env.SAMBANOVA_API_KEY?.trim()) {
      try {
        const response = await fetch(
          "https://api.sambanova.ai/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.SAMBANOVA_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model:
              process.env.SAMBANOVA_MODEL ??
              "Meta-Llama-3.3-70B-Instruct",
              temperature: 0,
              response_format: {
                type: "json_object",
              },
              messages: [
                {
                  role: "system",
                  content: SPLIT_REQUIREMENTS_PROMPT,
                },
                {
                  role: "user",
                  content: rawText,
                },
              ],
            }),
          }
        );

        const payload = await response.json();

        const content =
          payload.choices?.[0]?.message?.content;

        if (content) {
          console.log("RAW SPLITTER RESPONSE:");
          console.log(content);
          const parsed = JSON.parse(content);
          console.log(
            "Parsed Requirements:",
            parsed.requirements?.length
          );
          console.log(parsed.requirements);

          return postProcessChunks(rawText, parsed.requirements ?? [
            { title: "Single Requirement", content: rawText },
          ]);
        }
      } catch (error) {
        console.error("SambaNova splitter failed:", error);
      }
    }

    console.warn("[jd-analyser] All splitters failed — treating JD as a single requirement.");
    return postProcessChunks(rawText, [
      { title: "Single Requirement", content: rawText },
    ]);
  }