/**
 * Pull plain text from uploaded resume files for client-side field extraction.
 * PDF: unpdf (pdf.js). DOCX: mammoth. Legacy .doc is not reliably parseable in the browser.
 */

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

export async function extractPlainTextFromResume(file: File): Promise<ExtractResumeTextResult> {
  const dot = file.name.lastIndexOf('.');
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : '';

  try {
    const buf = await file.arrayBuffer();

    if (ext === '.pdf') {
      const { extractText } = await import('unpdf');
      const result = await extractText(new Uint8Array(buf), { mergePages: true });
      const pages = result.text as string | string[];
      const raw =
        typeof pages === 'string' ? pages : Array.isArray(pages) ? pages.join('\n') : '';
      const text = normalizeResumeText(raw);
      if (!text) {
        return {
          text: '',
          error:
            'No text found in this PDF. It may be scanned (image-only). Try a text-based PDF or DOCX.',
        };
      }
      return { text };
    }

    if (ext === '.docx') {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ arrayBuffer: buf });
      const text = normalizeResumeText(result.value || '');
      if (result.messages?.length) {
        console.warn('[resume] mammoth messages', result.messages);
      }
      if (!text) {
        return { text: '', error: 'No text could be read from this DOCX file.' };
      }
      return { text };
    }

    if (ext === '.doc') {
      return {
        text: '',
        error:
          'Legacy Word (.doc) is not supported for auto-fill. Please save the resume as PDF or DOCX and upload again.',
      };
    }

    // Plain text / unknown — try UTF-8 decode
    const text = normalizeResumeText(new TextDecoder('utf-8', { fatal: false }).decode(buf));
    if (!text) {
      return { text: '', error: 'Could not read text from this file.' };
    }
    return { text };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to read file';
    return { text: '', error: msg };
  }
}
