import ExcelJS from 'exceljs';

export const ACCENTURE_TRACKER_HEADERS = [
  'Submission Date',
  'Name of candidate',
  'Email ID',
  'Current Location',
  'Preferred Location',
  'Notice Period',
  'Rate Card',
  'Contact Number',
  'Skill',
  'Current company',
  'Total Experience',
  'Relevant Experience',
] as const;

export type AccentureTrackerHeader = (typeof ACCENTURE_TRACKER_HEADERS)[number];

export type AccentureTrackerRow = Record<AccentureTrackerHeader, string>;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function parseAccentureTrackerRows(raw: unknown): AccentureTrackerRow[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: AccentureTrackerRow[] = [];
  for (const item of raw) {
    if (!isPlainObject(item)) return null;
    const row = {} as AccentureTrackerRow;
    for (const h of ACCENTURE_TRACKER_HEADERS) {
      const v = item[h];
      row[h] = v == null ? '' : String(v).trim();
    }
    out.push(row);
  }
  return out;
}

/** Light formal green — same family as KPMG tracker. */
const HEADER_GREEN = 'FFD8E4BC';

export async function buildAccentureTrackerExcelBuffer(rows: AccentureTrackerRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Accenture Submission', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  ws.addRow([...ACCENTURE_TRACKER_HEADERS]);
  const headerRow = ws.getRow(1);
  headerRow.height = 28;
  headerRow.font = { bold: true, color: { argb: 'FF000000' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: HEADER_GREEN },
  };
  headerRow.alignment = { vertical: 'middle', wrapText: true, horizontal: 'left' };
  ACCENTURE_TRACKER_HEADERS.forEach((_, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } },
    };
  });

  for (const r of rows) {
    const line = ACCENTURE_TRACKER_HEADERS.map((h) => r[h] ?? '');
    const dataRow = ws.addRow(line);
    dataRow.alignment = { vertical: 'middle', wrapText: true };
  }

  ws.columns.forEach((col, idx) => {
    const header = ACCENTURE_TRACKER_HEADERS[idx];
    let width = 14;
    if (header === 'Skill' || header === 'Current company') width = 22;
    else if (header === 'Email ID') width = 28;
    else if (header === 'Notice Period' || header === 'Rate Card') width = 16;
    col.width = width;
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
