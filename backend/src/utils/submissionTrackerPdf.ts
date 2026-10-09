import PDFDocument from 'pdfkit';
import { resolveMetaforgeLogoPath } from '@/mail/resolveMetaforgeLogo';
import { sanitizeClientFacingCellValue, stripTrackerCellHtml } from '@/lib/clientFacingValue';

/** Build rows for PDF from tracker row objects (same column order as headers). */
export function trackerRowsToMatrix(
  headers: readonly string[],
  records: Array<Record<string, string>>,
): string[][] {
  return records.map((r) =>
    headers.map((h) =>
      sanitizeClientFacingCellValue(
        stripTrackerCellHtml(String(r[h] ?? '')).replace(/\r?\n/g, ' '),
      ),
    ),
  );
}

function estimateTextHeight(text: string, columnWidth: number, fontSize: number): number {
  const t = text.trim() || '—';
  const approxCharW = fontSize * 0.48;
  const charsPerLine = Math.max(8, Math.floor(columnWidth / approxCharW));
  const lines = Math.max(1, Math.ceil(t.length / charsPerLine));
  const lineHeight = fontSize + 1.2;
  return Math.min(lines * lineHeight + 8, 120);
}

function columnWeights(headers: readonly string[]): number[] {
  return headers.map((h) => {
    const s = String(h);
    if (s.includes('Skills') || s.includes('Technologies')) return Math.max(s.length * 2, 28);
    if (s.includes('Notice') || s.includes('qualification')) return Math.max(s.length, 18);
    return Math.max(s.length, 6);
  });
}

function distributeWidths(weights: number[], total: number): number[] {
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  return weights.map((w) => (w / sum) * total);
}

/**
 * Renders a landscape PDF table (optional utility). Client submission emails embed the tracker as HTML instead.
 */
export async function buildSubmissionTrackerPdfBuffer(options: {
  documentTitle: string;
  subtitle: string;
  headers: readonly string[];
  rows: string[][];
}): Promise<Buffer> {
  const { documentTitle, subtitle, headers, rows } = options;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margins: { top: 32, bottom: 32, left: 28, right: 28 },
      autoFirstPage: true,
    });

    const chunks: Buffer[] = [];
    doc.on('data', (d: Buffer) => chunks.push(d));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageInnerWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const weights = columnWeights(headers);
    const colWidths = distributeWidths(weights, pageInnerWidth);
    const headerRowHeight = 24;
    const startX = () => doc.page.margins.left;
    const bottomLimit = () => doc.page.height - doc.page.margins.bottom;

    const logoPath = resolveMetaforgeLogoPath();
    const bannerH = logoPath ? 44 : 0;
    let yCursor = doc.page.margins.top;

    if (logoPath && bannerH) {
      doc.save();
      doc.fillColor('#1a2b4a');
      doc.rect(doc.page.margins.left, yCursor, pageInnerWidth, bannerH).fill();
      doc.restore();
      const logoW = Math.min(160, pageInnerWidth * 0.35);
      const logoH = 28;
      const lx = doc.page.margins.left + (pageInnerWidth - logoW) / 2;
      try {
        doc.image(logoPath, lx, yCursor + (bannerH - logoH) / 2, {
          width: logoW,
          height: logoH,
        });
      } catch {
        /* logo missing or corrupt — skip */
      }
      yCursor += bannerH + 10;
    }

    doc.y = yCursor;
    doc.fillColor('#1a2744').font('Helvetica-Bold').fontSize(12).text(documentTitle, {
      align: 'center',
    });
    doc.moveDown(0.25);
    doc.font('Helvetica').fontSize(9).fillColor('#333333').text(subtitle, { align: 'center' });
    doc.moveDown(0.6);

    const drawHeader = (y: number): number => {
      let x = startX();
      headers.forEach((h, i) => {
        const w = colWidths[i] ?? 40;
        doc.save();
        doc.lineWidth(0.35);
        doc.strokeColor('#555555');
        doc.fillColor('#dfe8f7');
        doc.rect(x, y, w, headerRowHeight).fill();
        doc.rect(x, y, w, headerRowHeight).stroke();
        doc.fillColor('#000000').font('Helvetica-Bold').fontSize(5.5);
        doc.text(String(h), x + 3, y + 5, {
          width: w - 6,
          height: headerRowHeight - 10,
          ellipsis: true,
        });
        doc.restore();
        x += w;
      });
      return y + headerRowHeight;
    };

    let y = doc.y;
    y = drawHeader(y);

    doc.font('Helvetica').fillColor('#000000');

    const drawRow = (cells: string[]) => {
      let rowH = 14;
      cells.forEach((cell, i) => {
        const w = (colWidths[i] ?? 40) - 6;
        const h = estimateTextHeight(cell, w, 5);
        if (h > rowH) rowH = h;
      });
      rowH = Math.min(Math.max(rowH, 16), 110);

      if (y + rowH > bottomLimit()) {
        doc.addPage();
        y = doc.page.margins.top;
        let yHdr = y;
        if (logoPath && bannerH) {
          doc.save();
          doc.fillColor('#1a2b4a');
          doc.rect(doc.page.margins.left, yHdr, pageInnerWidth, bannerH).fill();
          doc.restore();
          const logoW = Math.min(160, pageInnerWidth * 0.35);
          const logoH = 28;
          const lx = doc.page.margins.left + (pageInnerWidth - logoW) / 2;
          try {
            doc.image(logoPath, lx, yHdr + (bannerH - logoH) / 2, {
              width: logoW,
              height: logoH,
            });
          } catch {
            /* skip */
          }
          yHdr += bannerH + 10;
        }
        doc.y = yHdr;
        doc.fillColor('#1a2744').font('Helvetica-Bold').fontSize(10).text(documentTitle, {
          align: 'center',
        });
        doc.moveDown(0.4);
        y = doc.y;
        y = drawHeader(y);
        doc.font('Helvetica').fillColor('#000000');
      }

      let x = startX();
      cells.forEach((cell, i) => {
        const w = colWidths[i] ?? 40;
        doc.save();
        doc.strokeColor('#bbbbbb').lineWidth(0.25).rect(x, y, w, rowH).stroke();
        doc.fontSize(5).text(cell.trim() || '—', x + 3, y + 3, {
          width: w - 6,
          height: rowH - 6,
        });
        doc.restore();
        x += w;
      });
      y += rowH;
    };

    for (const row of rows) {
      const padded = headers.map((_, i) => row[i] ?? '');
      drawRow(padded);
    }

    doc.end();
  });
}
