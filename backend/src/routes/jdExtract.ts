import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { ResponseHelper } from '@/utils/response';
import { asyncHandler } from '@/middleware/errorHandler';
import { authenticate } from '@/middleware/auth';
import { extractPlainTextFromResumeBuffer } from '../resume/extractResumeText';
import { parseJdToFormFields, type JdExtractFormFields } from '../lib/jdFieldExtractor';
import { analyzeJdText } from '../services/jd-analyser/analyzeJd';

const router = Router();

const jdUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = new Set(['.pdf', '.doc', '.docx']);
    if (!allowed.has(ext)) return cb(null, false);
    return cb(null, true);
  },
});

const MIN_JD_CHARS = 50;

type JdExtractResponse = JdExtractFormFields & {
  extractionSource?: string;
  totalRolesDetected?: number;
  roleTitle?: string;
  usedFallbackParser?: boolean;
};

/**
 * @route   POST /api/ai/extract-jd
 * @desc    Extract requirement form fields from pasted JD text or uploaded PDF/DOCX
 * @access  Private
 */
router.post(
  '/extract-jd',
  authenticate,
  jdUpload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    let jdText = '';
    const bodyText = typeof req.body?.text === 'string' ? req.body.text.trim() : '';

    if (req.file?.buffer) {
      const name = req.file.originalname || 'jd.pdf';
      const { text, error } = await extractPlainTextFromResumeBuffer(req.file.buffer, name);
      if (!text.trim()) {
        return ResponseHelper.error(
          res,
          error || 'Could not read text from this document. Try PDF or DOCX.',
          400,
        );
      }
      jdText = text;
    } else if (bodyText) {
      jdText = bodyText;
    } else {
      return ResponseHelper.error(
        res,
        'Provide pasted JD text (min 50 characters) or upload a PDF/DOCX file.',
        400,
      );
    }

    if (jdText.trim().length < MIN_JD_CHARS) {
      return ResponseHelper.error(
        res,
        `Job description is too short (minimum ${MIN_JD_CHARS} characters).`,
        400,
      );
    }

    const subjectHint =
      typeof req.body?.subject === 'string' ? req.body.subject.trim() : undefined;

    let extracted: JdExtractResponse;

    try {
      const analyzed = await analyzeJdText(jdText);
      extracted = {
        ...analyzed.fields,
        jdDescription: analyzed.fields.jdDescription ?? jdText.trim(),
        extractionSource: analyzed.source,
        totalRolesDetected: analyzed.totalRoles,
        roleTitle: analyzed.roleTitle,
        usedFallbackParser: false,
      };
    } catch (llmError) {
      console.warn(
        '[extract-jd] LLM analyser failed, using rule-based fallback:',
        llmError instanceof Error ? llmError.message : llmError,
      );
      const fallback = parseJdToFormFields(jdText, { subjectHint });
      extracted = {
        ...fallback,
        jdDescription: fallback.jdDescription ?? jdText.trim(),
        usedFallbackParser: true,
      };
    }

    ResponseHelper.success(res, 'JD extracted successfully', extracted);
  }),
);

export default router;
