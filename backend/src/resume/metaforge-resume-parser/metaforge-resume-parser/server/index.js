import express from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config.js";
import { ensureAdminUser } from "./db.js";
import authRoutes from "./routes/auth.js";
import parseRoutes from "./routes/parse.js";
import candidateRoutes from "./routes/candidates.js";
import chatRoutes from "./routes/chat.js";

ensureAdminUser(config.adminUsername, config.adminPassword);

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

app.use(cors({
  origin: config.corsOrigin === "*" ? true : config.corsOrigin.split(",").map((o) => o.trim()),
  credentials: true,
}));

app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "metaforge-resume-parser-api",
    version: "2.0.0",
    model: config.geminiModel,
    env: config.nodeEnv,
  });
});

app.get("/api", (_req, res) => {
  res.json({
    service: "Metaforge Resume Parser API",
    endpoints: {
      health: "GET /api/health",
      login: "POST /api/auth/login",
      parseSingle: "POST /api/parse",
      parseBulk: "POST /api/parse/bulk",
      candidates: "GET /api/candidates",
      chat: "POST /api/chat",
    },
    auth: "X-API-Key header or Bearer JWT",
    docs: "See README.md",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/parse", parseRoutes);
app.use("/api/candidates", candidateRoutes);
app.use("/api/chat", chatRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(config.port, () => {
  console.log(`Metaforge Resume Parser API → http://localhost:${config.port}/api`);
  console.log(`Gemini model: ${config.geminiModel}`);
  console.log(`Integration key: ${config.integrationApiKey ? "enabled" : "not set"}`);
});
