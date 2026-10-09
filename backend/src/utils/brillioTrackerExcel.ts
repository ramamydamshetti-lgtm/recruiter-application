import ExcelJS from 'exceljs';

export const BRILLIO_TRACKER_HEADERS = [
  'Sl No',
  'Date',
  'Vendor name',
  'Market / Bench Resource',
  'Mode of Hiring',
  'Hiring skill',
  'Candidate Name',
  'Contact No',
  'Email ID',
  'Current Company',
  'Total Exp',
  'Relevant exp in Skillset',
  'Current CTC',
  'EX CTC',
  'Current Location',
  'Preferred Location',
  'Notice period',
  'Remarks',
  'Screening/Interview',
] as const;

export type BrillioTrackerHeader = (typeof BRILLIO_TRACKER_HEADERS)[number];

export type BrillioTrackerRow = Record<BrillioTrackerHeader, string>;

const VENDOR_FIXED = 'MetaForge';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function parseBrillioTrackerRows(raw: unknown): BrillioTrackerRow[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: BrillioTrackerRow[] = [];
  for (const item of raw) {
    if (!isPlainObject(item)) return null;
    const row = {} as BrillioTrackerRow;
    for (const h of BRILLIO_TRACKER_HEADERS) {
      const v = item[h];
      row[h] = v == null ? '' : String(v).trim();
    }
    row['Vendor name'] = VENDOR_FIXED;
    out.push(row);
  }
  return out;
}

/** Light blue header for Brillio tracker. */
const HEADER_FILL = 'FFDEEAF6';

export async function buildBrillioTrackerExcelBuffer(rows: BrillioTrackerRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Brillio Submission', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  ws.addRow([...BRILLIO_TRACKER_HEADERS]);
  const headerRow = ws.getRow(1);
  headerRow.height = 22;
  headerRow.font = { bold: true, color: { argb: 'FF000000' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: HEADER_FILL },
  };
  headerRow.alignment = { vertical: 'bottom', wrapText: true, horizontal: 'left' };
  BRILLIO_TRACKER_HEADERS.forEach((_, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } },
    };
  });

  for (const r of rows) {
    const line = BRILLIO_TRACKER_HEADERS.map((h) =>
      h === 'Vendor name' ? VENDOR_FIXED : (r[h] ?? ''),
    );
    const dataRow = ws.addRow(line);
    dataRow.alignment = { vertical: 'middle', wrapText: true };
    BRILLIO_TRACKER_HEADERS.forEach((_, i) => {
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
    const header = BRILLIO_TRACKER_HEADERS[idx];
    let width = 14;
    if (header === 'Hiring skill' || header === 'Remarks' || header === 'Market / Bench Resource') {
      width = 22;
    } else if (header === 'Email ID') width = 28;
    else if (header === 'Candidate Name' || header === 'Current Company') width = 22;
    else if (header === 'Relevant exp in Skillset') width = 22;
    col.width = width;
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
