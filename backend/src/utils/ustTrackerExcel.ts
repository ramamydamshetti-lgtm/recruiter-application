import ExcelJS from 'exceljs';

export const UST_TRACKER_HEADERS = [
  'Account',
  'Profile Submission Date',
  'SO Number',
  'Recruiter Name',
  'Recruiter UID',
  'Source',
  'Sub Source',
  'Mandatory Skill',
  'Skill combinations',
  'Candidate Status',
  'Detailed Status',
  'Hire Type',
  'RH ID',
  'Candidate Name',
  'Contact Number',
  'Email id',
  'Total Yrs of Exp',
  'Relevant Exp',
  'Current Company',
  'Current CTC',
  'Expected CTC/Rate card',
  'Notice period',
  'Buyout(Y/N)',
  'Ex-Employee(Y/N)',
  'If Rehire Ex- Employee ID',
  'Current Location',
  'Preferred Location',
  'Remarks',
  'Screening Interview',
  'Availablity',
] as const;

export type UstTrackerHeader = (typeof UST_TRACKER_HEADERS)[number];

export type UstTrackerRow = Record<UstTrackerHeader, string>;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function parseUstTrackerRows(raw: unknown): UstTrackerRow[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: UstTrackerRow[] = [];
  for (const item of raw) {
    if (!isPlainObject(item)) return null;
    const row = {} as UstTrackerRow;
    for (const h of UST_TRACKER_HEADERS) {
      const v = item[h];
      row[h] = v == null ? '' : String(v).trim();
    }
    out.push(row);
  }
  return out;
}

/** White header row, black text — matches typical UST grid style. */
const HEADER_FILL = 'FFFFFFFF';

export async function buildUstTrackerExcelBuffer(rows: UstTrackerRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('UST Submission', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  ws.addRow([...UST_TRACKER_HEADERS]);
  const headerRow = ws.getRow(1);
  headerRow.height = 28;
  headerRow.font = { bold: true, color: { argb: 'FF000000' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: HEADER_FILL },
  };
  headerRow.alignment = { vertical: 'middle', wrapText: true, horizontal: 'left' };
  UST_TRACKER_HEADERS.forEach((_, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } },
    };
  });

  for (const r of rows) {
    const line = UST_TRACKER_HEADERS.map((h) => r[h] ?? '');
    const dataRow = ws.addRow(line);
    dataRow.alignment = { vertical: 'top', wrapText: true };
  }

  ws.columns.forEach((col, idx) => {
    const header = UST_TRACKER_HEADERS[idx];
    let width = 12;
    if (
      header === 'Skill combinations' ||
      header === 'Mandatory Skill' ||
      header === 'Remarks'
    ) {
      width = 28;
    } else if (
      header === 'Expected CTC/Rate card' ||
      header === 'Profile Submission Date' ||
      header === 'Detailed Status'
    ) {
      width = 18;
    } else if (header === 'Email id') width = 26;
    col.width = width;
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
