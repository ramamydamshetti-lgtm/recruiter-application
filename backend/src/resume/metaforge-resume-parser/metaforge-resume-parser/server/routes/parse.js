import { Router } from "express";
import multer from "multer";
import crypto from "crypto";
import { config } from "../config.js";
import { authMiddleware } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import { extractFileContent, isSupportedFile } from "../services/extract.js";
import { parseResumeFromPdf, parseResumeFromText } from "../services/gemini.js";
import { saveCandidate, logAudit } from "../db.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxFileSizeMb * 1024 * 1024 },
});

const parseLimiter = createRateLimiter({
  max: config.rateLimitParse,
  keyPrefix: "parse",
});

async function parseBuffer(buffer, filename) {
  const extracted = await extractFileContent(buffer, filename);
  if (extracted.type === "pdf") {
    return parseResumeFromPdf(extracted.data, buffer);
  }
  return parseResumeFromText(extracted.data);
}

function shouldSave(req) {
  if (req.query.save === "false" || req.body?.save === false) return false;
  if (req.query.save === "true" || req.body?.save === true) return true;
  return !req.isServiceAuth;
}

function buildResponse(parsed, { sourceFile, save, userId, req }) {
  const payload = { source_file: sourceFile, ...parsed };

  if (!save) {
    return payload;
  }

  const id = crypto.randomUUID();
  const saved = saveCandidate(userId, { id, source_file: sourceFile, ...parsed });
  logAudit(typeof userId === "number" ? userId : null, "parse_resume", {
    candidateId: id,
    file: sourceFile,
  }, req.ip);

  return saved;
}

router.post(
  "/",
  authMiddleware,
  parseLimiter,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded. Use multipart field name: file" });
      }

      if (!isSupportedFile(req.file.originalname)) {
        return res.status(400).json({ error: "Unsupported file type. Supported: pdf, docx, doc, txt" });
      }

      const parsed = await parseBuffer(req.file.buffer, req.file.originalname);
      const save = shouldSave(req);
      const userId = typeof req.user.id === "number" ? req.user.id : 1;

      const result = buildResponse(parsed, {
        sourceFile: req.file.originalname,
        save,
        userId,
        req,
      });

      res.json(result);
    } catch (err) {
      console.error("Parse error:", err.message);
      res.status(500).json({ error: err.message || "Failed to parse resume" });
    }
  }
);

router.post(
  "/bulk",
  authMiddleware,
  parseLimiter,
  upload.array("files", config.maxBulkFiles),
  async (req, res) => {
    try {
      const files = req.files || [];
      if (!files.length) {
        return res.status(400).json({ error: "No files uploaded. Use multipart field name: files" });
      }

      const save = shouldSave(req);
      const userId = typeof req.user.id === "number" ? req.user.id : 1;
      const results = [];

      for (const file of files) {
        if (!isSupportedFile(file.originalname)) {
          results.push({
            source_file: file.originalname,
            status: "error",
            error: "Unsupported file type",
          });
          continue;
        }

        try {
          const parsed = await parseBuffer(file.buffer, file.originalname);
          const data = buildResponse(parsed, {
            sourceFile: file.originalname,
            save,
            userId,
            req,
          });
          results.push({ source_file: file.originalname, status: "done", data });

          if (files.length > 1) {
            await new Promise((r) => setTimeout(r, 1500));
          }
        } catch (err) {
          results.push({
            source_file: file.originalname,
            status: "error",
            error: err.message,
          });
        }
      }

      res.json({ count: results.length, results });
    } catch (err) {
      console.error("Bulk parse error:", err.message);
      res.status(500).json({ error: err.message || "Bulk parse failed" });
    }
  }
);

export default router;
