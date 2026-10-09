import ExcelJS from 'exceljs';

export const METAFORGE_INTERNAL_TRACKER_HEADERS = [
  'Sl No',
  'Submission Date',
  'Skillset',
  'Candidate Name',
  'Contact Number',
  'Email id',
  'Total Yrs of Exp',
  'Relevant Exp',
  'Current Company',
  'Current CTC',
  'Expected CTC/Rate card',
  'Notice period',
  'Current Location',
  'Preferred Location',
  'Availability for Interview',
  'Reason',
  'Offer in Hand',
  'Linkedin URL',
] as const;

export type MetaforgeInternalTrackerHeader = (typeof METAFORGE_INTERNAL_TRACKER_HEADERS)[number];

export type MetaforgeInternalTrackerRow = Record<MetaforgeInternalTrackerHeader, string>;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function parseMetaforgeInternalTrackerRows(raw: unknown): MetaforgeInternalTrackerRow[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: MetaforgeInternalTrackerRow[] = [];
  for (const item of raw) {
    if (!isPlainObject(item)) return null;
    const row = {} as MetaforgeInternalTrackerRow;
    for (const h of METAFORGE_INTERNAL_TRACKER_HEADERS) {
      const v = item[h];
      row[h] = v == null ? '' : String(v).trim();
    }
    out.push(row);
  }
  return out;
}

/** Light pastel green — Internal MetaForge tracker (reference #C6E0B4). */
const HEADER_GREEN = 'FFC6E0B4';

export async function buildMetaforgeInternalTrackerExcelBuffer(
  rows: MetaforgeInternalTrackerRow[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Internal MetaForge', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  ws.addRow([...METAFORGE_INTERNAL_TRACKER_HEADERS]);
  const headerRow = ws.getRow(1);
  headerRow.height = 22;
  headerRow.font = { bold: true, color: { argb: 'FF000000' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: HEADER_GREEN },
  };
  headerRow.alignment = { vertical: 'bottom', wrapText: true, horizontal: 'left' };
  METAFORGE_INTERNAL_TRACKER_HEADERS.forEach((_, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } },
    };
  });

  for (const r of rows) {
    const line = METAFORGE_INTERNAL_TRACKER_HEADERS.map((h) => r[h] ?? '');
    const dataRow = ws.addRow(line);
    dataRow.alignment = { vertical: 'middle', wrapText: true };
    METAFORGE_INTERNAL_TRACKER_HEADERS.forEach((_, i) => {
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
    const header = METAFORGE_INTERNAL_TRACKER_HEADERS[idx];
    let width = 14;
    if (header === 'Skillset' || header === 'Reason') width = 24;
    else if (header === 'Email id' || header === 'Linkedin URL') width = 28;
    else if (header === 'Candidate Name' || header === 'Current Company') width = 22;
    else if (header === 'Expected CTC/Rate card') width = 22;
    col.width = width;
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
