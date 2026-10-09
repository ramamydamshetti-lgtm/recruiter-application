import ExcelJS from 'exceljs';

export const KPMG_TRACKER_HEADERS = [
  'Submission Date',
  'Name of candidate',
  'Email ID',
  'Contact Number',
  'Skill',
  'Current company',
  'Total Experience',
  'Relevant Experience',
  'Current Location',
  'Preferred Location',
  'Contract/ Fulltime',
  'Current CTC',
  'Expected CTC',
  'Notice Period',
  'Vendor',
] as const;

export type KpmgTrackerHeader = (typeof KPMG_TRACKER_HEADERS)[number];

export type KpmgTrackerRow = Record<KpmgTrackerHeader, string>;

const VENDOR_FIXED = 'MetaForge';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function parseKpmgTrackerRows(raw: unknown): KpmgTrackerRow[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: KpmgTrackerRow[] = [];
  for (const item of raw) {
    if (!isPlainObject(item)) return null;
    const row = {} as KpmgTrackerRow;
    for (const h of KPMG_TRACKER_HEADERS) {
      const v = item[h];
      row[h] = v == null ? '' : String(v).trim();
    }
    row['Vendor'] = VENDOR_FIXED;
    out.push(row);
  }
  return out;
}

/** Light formal green (pale/muted) for header row — matches typical KPMG-style tracker. */
const HEADER_GREEN = 'FFD8E4BC';

export async function buildKpmgTrackerExcelBuffer(rows: KpmgTrackerRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('KPMG Submission', {
    views: [{ state: 'frozen', ySplit: 2 }],
  });

  const colCount = KPMG_TRACKER_HEADERS.length;
  const band = ws.addRow(Array.from({ length: colCount }, () => ''));
  band.height = 14;
  for (let i = 1; i <= colCount; i += 1) {
    const cell = band.getCell(i);
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: HEADER_GREEN },
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } },
    };
  }

  ws.addRow([...KPMG_TRACKER_HEADERS]);
  const headerRow = ws.getRow(2);
  headerRow.height = 22;
  headerRow.font = { bold: true, color: { argb: 'FF000000' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: HEADER_GREEN },
  };
  headerRow.alignment = { vertical: 'middle', wrapText: true, horizontal: 'left' };
  KPMG_TRACKER_HEADERS.forEach((_, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } },
    };
  });

  for (const r of rows) {
    const line = KPMG_TRACKER_HEADERS.map((h) => (h === 'Vendor' ? VENDOR_FIXED : r[h] ?? ''));
    const dataRow = ws.addRow(line);
    dataRow.alignment = { vertical: 'middle', wrapText: true };
  }

  ws.columns.forEach((col, idx) => {
    const header = KPMG_TRACKER_HEADERS[idx];
    let width = 14;
    if (header === 'Skill' || header === 'Current company') width = 22;
    else if (header === 'Email ID') width = 28;
    else if (header === 'Notice Period') width = 24;
    col.width = width;
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
