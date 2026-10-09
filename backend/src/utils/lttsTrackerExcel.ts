import ExcelJS from 'exceljs';

export const LTTS_TRACKER_HEADERS = [
  'Sl.No',
  'Vendor Name',
  'BU/IS',
  'Position/ Title',
  'Skill',
  'Resumes sent Date (DDMMYY)',
  'Full Name of the candidate',
  'Last Full Time Qualification',
  'MOBILE NO',
  'Mail ID',
  'NP(Days)',
  'Total Exp',
  'Relevant Exp',
  'Current Location',
  'Job Location',
  'Current Organization',
  'Rate per Month',
] as const;

export type LttsTrackerHeader = (typeof LTTS_TRACKER_HEADERS)[number];

export type LttsTrackerRow = Record<LttsTrackerHeader, string>;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function parseLttsTrackerRows(raw: unknown): LttsTrackerRow[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: LttsTrackerRow[] = [];
  for (const item of raw) {
    if (!isPlainObject(item)) return null;
    const row = {} as LttsTrackerRow;
    for (const h of LTTS_TRACKER_HEADERS) {
      const v = item[h];
      row[h] = v == null ? '' : String(v).trim();
    }
    out.push(row);
  }
  return out;
}

const FORMAL_YELLOW = 'FFFFFF00';

export async function buildLttsTrackerExcelBuffer(rows: LttsTrackerRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('LTTS Submission', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  ws.addRow([...LTTS_TRACKER_HEADERS]);
  const headerRow = ws.getRow(1);
  headerRow.height = 24;
  headerRow.font = { bold: true, color: { argb: 'FF000000' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: FORMAL_YELLOW },
  };
  headerRow.alignment = { vertical: 'middle', wrapText: true, horizontal: 'left' };
  LTTS_TRACKER_HEADERS.forEach((_, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } },
    };
  });

  for (const r of rows) {
    const line = LTTS_TRACKER_HEADERS.map((h) => r[h] ?? '');
    const dataRow = ws.addRow(line);
    dataRow.alignment = { vertical: 'middle', wrapText: true };
  }

  ws.columns.forEach((col, idx) => {
    const header = LTTS_TRACKER_HEADERS[idx];
    let width = 14;
    if (header === 'Position/ Title' || header === 'Skill') width = 22;
    else if (header === 'Full Name of the candidate' || header === 'Last Full Time Qualification') {
      width = 24;
    } else if (header === 'Mail ID') width = 28;
    else if (header === 'Resumes sent Date (DDMMYY)') width = 20;
    col.width = width;
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
