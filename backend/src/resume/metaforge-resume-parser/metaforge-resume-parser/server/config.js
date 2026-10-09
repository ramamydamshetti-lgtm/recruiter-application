import "dotenv/config";

const embedded = process.env.METAFORGE_PARSER_EMBEDDED === "true";

if (!process.env.GEMINI_API_KEY?.trim()) {
  const msg = "Missing required environment variable: GEMINI_API_KEY";
  if (embedded) {
    console.warn(`[resume-parser] ${msg}`);
  } else {
    console.error(msg);
    process.exit(1);
  }
}

if (!embedded && !process.env.JWT_SECRET?.trim() && !process.env.INTEGRATION_API_KEY?.trim()) {
  console.error("Set JWT_SECRET and/or INTEGRATION_API_KEY");
  process.exit(1);
}

export const config = {
  port: Number(process.env.PORT) || 3001,
  nodeEnv: process.env.NODE_ENV || "development",
  geminiApiKey: process.env.GEMINI_API_KEY.trim(),
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.0-flash-lite",
  geminiFallbackModels: (process.env.GEMINI_FALLBACK_MODELS || "gemini-2.0-flash,gemini-2.5-flash-lite,gemini-2.5-flash")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean),
  jwtSecret: process.env.JWT_SECRET?.trim() || "unused",
  integrationApiKey: process.env.INTEGRATION_API_KEY?.trim() || "",
  adminUsername: process.env.ADMIN_USERNAME || "admin",
  adminPassword: process.env.ADMIN_PASSWORD || "change-me",
  corsOrigin: process.env.CORS_ORIGIN || "*",
  rateLimitParse: Number(process.env.RATE_LIMIT_PARSE) || 30,
  rateLimitChat: Number(process.env.RATE_LIMIT_CHAT) || 60,
  maxFileSizeMb: 10,
  maxBulkFiles: 50,
};
