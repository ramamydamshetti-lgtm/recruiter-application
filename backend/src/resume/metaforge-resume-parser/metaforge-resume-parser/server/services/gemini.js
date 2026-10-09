import { config } from "../config.js";
import { EXTRACTION_PROMPT, buildTextPrompt } from "./prompt.js";
import { extractJsonFromText, validateParsedResult } from "./schema.js";
import { normalizeParsedResult } from "./normalize.js";
import { extractPdfText } from "./pdfText.js";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

function getModelsToTry() {
  return [config.geminiModel, ...config.geminiFallbackModels.filter((m) => m !== config.geminiModel)];
}

function isRetryableModelError(status, msg) {
  return (
    status === 429 ||
    status === 503 ||
    status === 404 ||
    /quota|rate.?limit|high demand|overloaded|unavailable|try again/i.test(msg) ||
    /not found|not supported/i.test(msg)
  );
}

function extractGeminiText(data) {
  const candidate = data?.candidates?.[0];

  if (!candidate) {
    const block = data?.promptFeedback?.blockReason;
    if (block) throw new Error(`Request blocked: ${block}`);
    throw new Error("Empty response from Gemini");
  }

  if (candidate.finishReason && !["STOP", "MAX_TOKENS"].includes(candidate.finishReason)) {
    console.warn("Gemini finishReason:", candidate.finishReason);
    if (candidate.finishReason === "SAFETY") {
      throw new Error("Content blocked by safety filter. Try a different file format.");
    }
  }

  const text = candidate.content?.parts?.map((p) => p.text || "").join("").trim() || "";
  if (!text) {
    throw new Error("Empty response from Gemini");
  }
  return text;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function callGemini(parts, { maxRetries = 5, maxOutputTokens = 4096, systemInstruction, useJsonMode = true } = {}) {
  const models = getModelsToTry();
  let lastError;

  for (const model of models) {
    const url = `${GEMINI_BASE}/models/${model}:generateContent`;

    const generationConfig = {
      temperature: 0.1,
      maxOutputTokens,
    };
    if (useJsonMode) {
      generationConfig.responseMimeType = "application/json";
    }

    const body = {
      contents: [{ role: "user", parts }],
      generationConfig,
    };

    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": config.geminiApiKey,
          },
          body: JSON.stringify(body),
        });

        const data = await resp.json();

        if (!resp.ok) {
          const msg = data?.error?.message || `Gemini API error (${resp.status})`;
          if (resp.status === 401 || resp.status === 403) {
            throw new Error("Invalid Gemini API key. Check GEMINI_API_KEY in server .env");
          }
          if (isRetryableModelError(resp.status, msg) && model !== models[models.length - 1]) {
            lastError = new Error(msg);
            break;
          }
          if (isRetryableModelError(resp.status, msg) && attempt < maxRetries - 1) {
            await sleep(/high demand|overloaded/i.test(msg) ? 3000 * (attempt + 1) : 2000 * (attempt + 1));
            continue;
          }
          if (/quota|rate.?limit/i.test(msg)) {
            throw new Error("Gemini API quota exceeded. Check billing at https://ai.google.dev or try again later.");
          }
          if (/high demand|overloaded/i.test(msg)) {
            throw new Error("AI models are busy right now. Please wait a moment and try again.");
          }
          throw new Error(msg);
        }

        return extractGeminiText(data);
      } catch (err) {
        lastError = err;
        if (attempt < maxRetries - 1 && !err.message.includes("Invalid Gemini") && !err.message.includes("quota")) {
          await sleep(1500 * (attempt + 1));
          continue;
        }
        if (!isRetryableModelError(0, err.message) || model === models[models.length - 1]) {
          throw err;
        }
        break;
      }
    }
  }

  throw lastError || new Error("Gemini API request failed");
}

function finalizeParse(raw) {
  const parsed = extractJsonFromText(raw);
  const validation = validateParsedResult(parsed);
  if (!validation.valid) {
    throw new Error(`Invalid parse result: ${validation.errors.join(", ")}`);
  }
  return normalizeParsedResult(parsed);
}

async function tryParse(parts, label) {
  const errors = [];

  for (const useJsonMode of [true, false]) {
    try {
      const raw = await callGemini(parts, { maxOutputTokens: 4096, useJsonMode });
      return finalizeParse(raw);
    } catch (err) {
      errors.push(`${label}${useJsonMode ? "" : " (plain)"}: ${err.message}`);
      if (!/No JSON|Empty response|Invalid parse/i.test(err.message)) {
        throw err;
      }
    }
  }

  throw new Error(errors[errors.length - 1] || "Failed to parse resume");
}

export async function parseResumeFromPdf(base64Data, pdfBuffer) {
  const pdfParts = [
    { inlineData: { mimeType: "application/pdf", data: base64Data } },
    { text: EXTRACTION_PROMPT },
  ];

  try {
    return await tryParse(pdfParts, "PDF");
  } catch (pdfErr) {
    console.warn("PDF multimodal parse failed, trying text fallback:", pdfErr.message);

    if (pdfBuffer) {
      const text = await extractPdfText(pdfBuffer);
      if (text.length > 50) {
        try {
          return await tryParse([{ text: buildTextPrompt(text) }], "PDF-text");
        } catch (textErr) {
          throw new Error(textErr.message || pdfErr.message);
        }
      }
    }

    throw new Error(pdfErr.message || "Failed to parse PDF resume");
  }
}

export async function parseResumeFromText(resumeText) {
  return tryParse([{ text: buildTextPrompt(resumeText) }], "text");
}

export async function chatWithContext({ messages, candidateProfile }) {
  const systemInstruction = `You are a recruitment assistant for Metaforge IT Solutions.${
    candidateProfile
      ? `\nCandidate profile:\n${JSON.stringify(candidateProfile, null, 2)}`
      : ""
  }\nHelp assess candidates, identify skill gaps, check JD alignment. Be concise and professional.`;

  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: typeof m.content === "string" ? m.content : JSON.stringify(m.content) }],
  }));

  const models = getModelsToTry();
  let lastError;

  for (const model of models) {
    const url = `${GEMINI_BASE}/models/${model}:generateContent`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": config.geminiApiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents,
        generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      const msg = data?.error?.message || `Gemini API error (${resp.status})`;
      if (isRetryableModelError(resp.status, msg) && model !== models[models.length - 1]) {
        lastError = new Error(msg);
        continue;
      }
      if (/quota|rate.?limit/i.test(msg)) {
        throw new Error("Gemini API quota exceeded. Check billing or try again later.");
      }
      throw new Error(msg);
    }

    return extractGeminiText(data);
  }

  throw lastError || new Error("Chat request failed");
}
