/**
 * Plain text from resume bytes (PDF / DOC / DOCX), with OCR fallback for
 * scanned/image-only PDFs and image files.
 */
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import WordExtractor from 'word-extractor';

type OcrRecognize = (
  image: Buffer,
  lang?: string,
  options?: { logger?: (m: unknown) => void },
) => Promise<{ data?: { text?: string } }>;

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff']);
const OCR_MIN_TEXT_THRESHOLD = 40;
const OCR_MAX_PDF_PAGES = 5;

export type ExtractResumeTextResult = {
  text: string;
  error?: string;
};

function normalizeResumeText(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isLikelyScannedPdf(text: string): boolean {
  const t = normalizeResumeText(text);
  return t.length < OCR_MIN_TEXT_THRESHOLD;
}

async function ocrImageBuffer(buffer: Buffer): Promise<string> {
  const mod = (await import('tesseract.js')) as { recognize: OcrRecognize };
  const recognize = mod.recognize;
  const out = await recognize(buffer, 'eng', { logger: () => undefined });
  return normalizeResumeText(out?.data?.text || '');
}

async function renderPdfPagesToImages(buffer: Buffer): Promise<Buffer[]> {
  const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as {
    getDocument: (input: {
      data: Uint8Array;
      disableWorker?: boolean;
      useSystemFonts?: boolean;
      isEvalSupported?: boolean;
    }) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<unknown> }> };
  };
  const canvasMod = (await import('@napi-rs/canvas')) as {
    createCanvas: (w: number, h: number) => {
      getContext: (kind: '2d') => unknown;
      toBuffer: (mime: 'image/png') => Buffer;
    };
  };

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    useSystemFonts: true,
    isEvalSupported: false,
  });
  const doc = await loadingTask.promise;
  const pageCount = Math.min(doc.numPages, OCR_MAX_PDF_PAGES);
  const images: Buffer[] = [];

  for (let i = 1; i <= pageCount; i += 1) {
    const page = (await doc.getPage(i)) as {
      getViewport: (params: { scale: number }) => { width: number; height: number };
      render: (params: { canvasContext: unknown; viewport: unknown }) => { promise: Promise<void> };
    };
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = canvasMod.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    images.push(canvas.toBuffer('image/png'));
  }

  return images;
}

async function ocrPdfBuffer(buffer: Buffer): Promise<string> {
  const images = await renderPdfPagesToImages(buffer);
  const pages: string[] = [];
  for (const image of images) {
    const txt = await ocrImageBuffer(image);
    if (txt) pages.push(txt);
  }
  return normalizeResumeText(pages.join('\n\n'));
}

export async function extractPlainTextFromResumeBuffer(
  buffer: Buffer,
  filename: string,
): Promise<ExtractResumeTextResult> {
  const dot = filename.lastIndexOf('.');
  const ext = dot >= 0 ? filename.slice(dot).toLowerCase() : '';

  try {
    if (ext === '.pdf') {
      const data = await pdfParse(buffer);
      const raw = typeof data.text === 'string' ? data.text : '';
      const text = normalizeResumeText(raw);
      if (!isLikelyScannedPdf(text)) {
        return { text };
      }
      // OCR fallback for scanned/image-only PDFs.
      const ocrText = await ocrPdfBuffer(buffer);
      if (!ocrText) {
        return {
          text: '',
          error: 'No text found in this PDF after OCR.',
        };
      }
      return { text: ocrText };
    }

    if (ext === '.docx') {
      const result = await mammoth.extractRawText({ buffer });
      const text = normalizeResumeText(result.value || '');
      if (!text) {
        return { text: '', error: 'No text could be read from this DOCX file.' };
      }
      return { text };
    }

    if (ext === '.doc') {
      const extractor = new WordExtractor();
      const doc = await extractor.extract(buffer);
      const text = normalizeResumeText(doc.getBody() || '');
      if (!text) return { text: '', error: 'No text could be read from this DOC file.' };
      return { text };
    }

    if (IMAGE_EXTS.has(ext)) {
      const text = await ocrImageBuffer(buffer);
      if (!text) return { text: '', error: 'No text could be read from this image file.' };
      return { text };
    }

    const text = normalizeResumeText(buffer.toString('utf8'));
    if (!text) {
      return { text: '', error: 'Could not read text from this file.' };
    }
    return { text };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to read file';
    return { text: '', error: msg };
  }
}
