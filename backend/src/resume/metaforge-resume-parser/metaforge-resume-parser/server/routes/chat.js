import { Router } from "express";
import multer from "multer";
import { authMiddleware } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import { config } from "../config.js";
import { chatWithContext } from "../services/gemini.js";
import { extractFileContent, isSupportedFile } from "../services/extract.js";
import { getCandidateById, logAudit } from "../db.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxFileSizeMb * 1024 * 1024 },
});

const chatLimiter = createRateLimiter({
  max: config.rateLimitChat,
  keyPrefix: "chat",
});

router.post(
  "/",
  authMiddleware,
  chatLimiter,
  upload.single("attachment"),
  async (req, res) => {
    try {
      let messages;
      try {
        messages = JSON.parse(req.body.messages || "[]");
      } catch {
        return res.status(400).json({ error: "Invalid messages format" });
      }

      if (!Array.isArray(messages) || !messages.length) {
        return res.status(400).json({ error: "Messages are required" });
      }

      let candidateProfile = null;
      if (req.body.candidateId) {
        candidateProfile = getCandidateById(req.body.candidateId, req.user.id);
      } else if (req.body.candidateProfile) {
        try {
          candidateProfile = JSON.parse(req.body.candidateProfile);
        } catch {
          return res.status(400).json({ error: "Invalid candidate profile" });
        }
      }

      const lastIdx = messages.length - 1;
      if (req.file && isSupportedFile(req.file.originalname)) {
        const extracted = await extractFileContent(req.file.buffer, req.file.originalname);
        const attachmentText =
          extracted.type === "pdf"
            ? `[Attached PDF: ${req.file.originalname} — content analyzed server-side]`
            : `[Attached: ${req.file.originalname}]\n${extracted.data.slice(0, 12000)}`;

        const last = messages[lastIdx];
        messages[lastIdx] = {
          ...last,
          content: `${last.content}\n\n${attachmentText}`,
        };
      }

      const reply = await chatWithContext({ messages, candidateProfile });

      logAudit(req.user.id, "chat", { candidateId: req.body.candidateId || null }, req.ip);

      res.json({ reply });
    } catch (err) {
      console.error("Chat error:", err.message);
      res.status(500).json({ error: err.message || "Chat failed" });
    }
  }
);

export default router;
