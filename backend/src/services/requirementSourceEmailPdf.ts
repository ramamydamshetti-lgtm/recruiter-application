import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { htmlToPlainTextForArchive } from '@/lib/emailHtmlToText';

function toStr(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map((x) => toStr(x)).filter(Boolean).join(', ');
  return String(v);
}

function firstNonEmptyStr(...candidates: unknown[]): string {
  for (const c of candidates) {
    const s = toStr(c).trim();
    if (s) return s;
  }
  return '';
}

/** Loose equality so we do not print HTML-derived text twice when it matches plain. */
function bodyTextEquivalent(a: string, b: string): boolean {
  if (!a.trim() || !b.trim()) return false;
  const squish = (s: string) => s.replace(/\s+/g, ' ').trim();
  return squish(a) === squish(b);
}

function formatAddressList(raw: unknown): string {
  if (Array.isArray(raw)) return raw.map((x) => toStr(x)).filter(Boolean).join(', ');
  return toStr(raw);
}

export function buildSourceEmailArchiveText(options: {
  requirementCode: string;
  requirementPk: string;
  receivedAt: Date;
  payload: Record<string, unknown>;
}): string {
  const { requirementCode, requirementPk, receivedAt, payload } = options;
  const subject = toStr(payload.subject ?? payload.job_title ?? payload.roleTitle);
  const fromAddr = toStr(payload.from ?? payload.fromEmail ?? payload.senderEmail);
  const toLine = formatAddressList(payload.to ?? payload.toEmail ?? payload.recipientsTo);
  const ccLine = formatAddressList(payload.cc ?? payload.ccEmail ?? payload.recipientsCc);
  // Match ingest tolerances (internalAutomation extractFromEmailContent) plus common alternate keys.
  const preview = firstNonEmptyStr(
    payload.bodyPreview,
    payload.preview,
    payload.emailBody,
    payload.description,
  );
  const plain = firstNonEmptyStr(
    payload.bodyText,
    payload.text,
    payload.body,
    payload.content,
    payload.messageText,
    payload.plainBody,
    payload.bodyPlain,
    payload.emailBody,
  );
  const htmlRaw = firstNonEmptyStr(
    payload.bodyHtml,
    payload.html,
    payload.messageHtml,
    payload.body_html,
    payload.message_html,
  );
  const htmlAsText = htmlToPlainTextForArchive(htmlRaw);

  const lines: string[] = [];
  lines.push('ORIGINAL EMAIL ARCHIVE (for recruiter verification)');
  lines.push('');
  lines.push(`System requirement code: ${requirementCode}`);
  lines.push(`Internal requirement id: ${requirementPk}`);
  lines.push(`Email received (UTC): ${receivedAt.toISOString()}`);
  lines.push('');
  lines.push('--- HEADERS ---');
  lines.push(`Subject: ${subject || '(empty)'}`);
  lines.push(`From: ${fromAddr || '(empty)'}`);
  lines.push(`To: ${toLine || '(empty)'}`);
  lines.push(`Cc: ${ccLine || '(empty)'}`);
  lines.push('');

  const primaryBody = plain || preview;
  const pTrim = primaryBody.trim();
  const hTrim = htmlAsText.trim();
  const sameBody = bodyTextEquivalent(pTrim, hTrim);
  const htmlCarriesMore = Boolean(hTrim && hTrim.length > pTrim.length);

  lines.push('--- BODY (as captured at ingest; client-agnostic) ---');
  if (!pTrim && !hTrim) {
    lines.push('(no body captured in payload)');
  } else if (sameBody) {
    lines.push(pTrim || hTrim);
  } else if (htmlCarriesMore || !pTrim) {
    // Typical: Graph bodyPreview is short; full message lives in HTML.
    lines.push(hTrim);
    if (pTrim) {
      lines.push('');
      lines.push('--- Plain / preview from provider (often shorter than full mail) ---');
      lines.push(pTrim);
    }
  } else {
    lines.push(pTrim);
    if (hTrim) {
      lines.push('');
      lines.push('--- From HTML (tags removed); differs from plain fields ---');
      lines.push(hTrim);
    }
  }
  return lines.join('\n');
}

export function getRequirementSourcePdfAbsolutePath(requirementPk: string): string {
  const baseDir =
    process.env.REQUIREMENT_EMAIL_PDF_DIR ||
    path.join(process.cwd(), 'uploads', 'requirement-email-sources');
  return path.join(baseDir, `${requirementPk}.pdf`);
}

export async function writeRequirementSourceEmailPdf(options: {
  requirementPk: string;
  requirementCode: string;
  receivedAt: Date;
  payload: Record<string, unknown>;
}): Promise<string> {
  const outPath = getRequirementSourcePdfAbsolutePath(options.requirementPk);
  const dir = path.dirname(outPath);
  fs.mkdirSync(dir, { recursive: true });

  const archiveText = buildSourceEmailArchiveText({
    requirementCode: options.requirementCode,
    requirementPk: options.requirementPk,
    receivedAt: options.receivedAt,
    payload: options.payload,
  });

  const buffer = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 48, bottom: 48, left: 48, right: 48 },
      autoFirstPage: true,
    });
    const chunks: Buffer[] = [];
    doc.on('data', (d: Buffer) => chunks.push(d));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font('Helvetica').fontSize(9);
    doc.text(archiveText, {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      align: 'left',
    });
    doc.end();
  });

  fs.writeFileSync(outPath, buffer);
  return outPath;
}
