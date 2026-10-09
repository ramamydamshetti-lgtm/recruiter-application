import ExcelJS from 'exceljs';

/** Column order and labels for ITC Infotech client submission tracker (matches UI + client email). */
export const ITC_INFOTECH_TRACKER_HEADERS = [
  'Name',
  'Email',
  'Phone',
  'Current company',
  'Skills / Technologies',
  'Total years of experience',
  'Relevant experience',
  'Highest qualification',
  'Current CTC',
  'Expected CTC',
  'Current location',
  'Preferred location',
  'Availability for Interview',
  'Notice period (last working day)',
  'Offer in hand',
  'Reason for job change',
  'LinkedIn URL',
] as const;

export type ItcInfotechTrackerHeader = (typeof ITC_INFOTECH_TRACKER_HEADERS)[number];

export type ItcInfotechTrackerRow = Record<ItcInfotechTrackerHeader, string>;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Validate and normalize rows from the client submission API. */
export function parseItcInfotechTrackerRows(raw: unknown): ItcInfotechTrackerRow[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: ItcInfotechTrackerRow[] = [];
  for (const item of raw) {
    if (!isPlainObject(item)) return null;
    const row = {} as ItcInfotechTrackerRow;
    for (const h of ITC_INFOTECH_TRACKER_HEADERS) {
      const v = item[h];
      row[h] = v == null ? '' : String(v).trim();
    }
    out.push(row);
  }
  return out;
}

const HEADER_GRAY = 'FFE8E8E8';

export async function buildItcInfotechTrackerExcelBuffer(
  rows: ItcInfotechTrackerRow[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('ITC Submission', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  ws.addRow([...ITC_INFOTECH_TRACKER_HEADERS]);
  const headerRow = ws.getRow(1);
  headerRow.height = 22;
  headerRow.font = { bold: true, color: { argb: 'FF000000' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: HEADER_GRAY },
  };
  headerRow.alignment = { vertical: 'middle', wrapText: true, horizontal: 'left' };
  ITC_INFOTECH_TRACKER_HEADERS.forEach((_, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF888888' } },
      left: { style: 'thin', color: { argb: 'FF888888' } },
      bottom: { style: 'thin', color: { argb: 'FF888888' } },
      right: { style: 'thin', color: { argb: 'FF888888' } },
    };
  });

  for (const r of rows) {
    const line = ITC_INFOTECH_TRACKER_HEADERS.map((h) => r[h] ?? '');
    const dataRow = ws.addRow(line);
    dataRow.alignment = { vertical: 'middle', wrapText: true };
  }

  ws.columns.forEach((col, idx) => {
    const header = ITC_INFOTECH_TRACKER_HEADERS[idx];
    let width = 14;
    if (header === 'Skills / Technologies') width = 40;
    else if (header === 'Name' || header === 'Current company') width = 22;
    else if (header === 'Email' || header === 'LinkedIn URL') width = 30;
    else if (header === 'Notice period (last working day)') width = 28;
    else if (header === 'Highest qualification') width = 36;
    col.width = width;
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
