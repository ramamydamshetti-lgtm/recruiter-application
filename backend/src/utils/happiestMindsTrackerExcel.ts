import ExcelJS from 'exceljs';

export const HAPPIEST_MINDS_TRACKER_HEADERS = [
  'Source Name',
  'Profile Recd date',
  'Candidate Name',
  'Skill',
  'Candidate Mobile number',
  'Candidate email ID',
  'Current Company',
  'Total Exp',
  'Relevant Exp',
  'CTC',
  'ECTC/Rate card',
  'Counter Offer CTC',
  'Notice Period',
  'Tentative DOJ',
  'Current Location',
  'Preferred Location',
  'Available date and time for Open Interview',
  'Remarks',
] as const;

export type HappiestMindsTrackerHeader = (typeof HAPPIEST_MINDS_TRACKER_HEADERS)[number];

export type HappiestMindsTrackerRow = Record<HappiestMindsTrackerHeader, string>;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function parseHappiestMindsTrackerRows(raw: unknown): HappiestMindsTrackerRow[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: HappiestMindsTrackerRow[] = [];
  for (const item of raw) {
    if (!isPlainObject(item)) return null;
    const row = {} as HappiestMindsTrackerRow;
    for (const h of HAPPIEST_MINDS_TRACKER_HEADERS) {
      const v = item[h];
      row[h] = v == null ? '' : String(v).trim();
    }
    out.push(row);
  }
  return out;
}

const HEADER_FILL = 'FFE2EFDA';

export async function buildHappiestMindsTrackerExcelBuffer(
  rows: HappiestMindsTrackerRow[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Happiest Minds', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  ws.addRow([...HAPPIEST_MINDS_TRACKER_HEADERS]);
  const headerRow = ws.getRow(1);
  headerRow.height = 22;
  headerRow.font = { bold: true, color: { argb: 'FF000000' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: HEADER_FILL },
  };
  headerRow.alignment = { vertical: 'bottom', wrapText: true, horizontal: 'left' };
  HAPPIEST_MINDS_TRACKER_HEADERS.forEach((_, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } },
    };
  });

  for (const r of rows) {
    const line = HAPPIEST_MINDS_TRACKER_HEADERS.map((h) => r[h] ?? '');
    const dataRow = ws.addRow(line);
    dataRow.alignment = { vertical: 'middle', wrapText: true };
    HAPPIEST_MINDS_TRACKER_HEADERS.forEach((_, i) => {
      const cell = dataRow.getCell(i + 1);
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF404040' } },
        left: { style: 'thin', color: { argb: 'FF404040' } },
        bottom: { style: 'thin', color: { argb: 'FF404040' } },
        right: { style: 'thin', color: { argb: 'FF404040' } },
      };
    });
  }

  ws.columns.forEach((col, idx) => {
    const header = HAPPIEST_MINDS_TRACKER_HEADERS[idx];
    let width = 14;
    if (header === 'Skill' || header === 'Remarks') width = 22;
    else if (header === 'Candidate email ID') width = 28;
    else if (header === 'Available date and time for Open Interview') width = 32;
    else if (header === 'Candidate Name' || header === 'Current Company') width = 22;
    col.width = width;
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
