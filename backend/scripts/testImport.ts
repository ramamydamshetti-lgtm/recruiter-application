import path from 'path';
import ExcelJS from 'exceljs';
import { mapExcelToCandidate, shouldSkipMappedCandidate } from '../src/utils/candidateMapper';

async function run(): Promise<void> {
  const filePath =
    process.argv[2] ||
    path.resolve(process.cwd(), 'import_data_dump', 'ISSB-Support_20260423195913_141.xlsx');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const ws = workbook.worksheets[0];
  if (!ws) {
    throw new Error('No worksheet found in file.');
  }

  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? '').trim();
  });

  let totalRows = 0;
  let mappedRows = 0;
  let skippedRows = 0;
  const skippedReasons = new Map<string, number>();
  let previewCount = 0;

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    totalRows += 1;

    const rawRow: Record<string, unknown> = {};
    headers.forEach((header, idx) => {
      if (!header) return;
      const cell = row.getCell(idx);
      const value = cell?.value;
      if (value === null || value === undefined || String(value).trim() === '') return;
      rawRow[header] = typeof value === 'object' && value && 'text' in value ? (value as any).text : value;
    });

    const mapped = mapExcelToCandidate(rawRow);
    const check = shouldSkipMappedCandidate(mapped);

    if (check.skip) {
      skippedRows += 1;
      const reason = check.reason ?? 'Unknown';
      skippedReasons.set(reason, (skippedReasons.get(reason) ?? 0) + 1);
    } else {
      mappedRows += 1;
    }

    if (previewCount < 3) {
      previewCount += 1;
      console.log(`\n--- Row ${rowNumber} Preview ---`);
      console.log('Raw Row:', rawRow);
      console.log('Mapped Result:', mapped);
      if (check.skip) console.log('Skip Reason:', check.reason);
    }
  });

  console.log('\n========== Dry Run Summary ==========');
  console.log('File:', filePath);
  console.log('Worksheet:', ws.name);
  console.log('Total data rows:', totalRows);
  console.log('Successfully mapped rows:', mappedRows);
  console.log('Skipped rows:', skippedRows);
  if (skippedReasons.size > 0) {
    console.log('\nSkipped reasons:');
    for (const [reason, count] of skippedReasons.entries()) {
      console.log(`- ${reason}: ${count}`);
    }
  }
  console.log('\nNo database writes were performed.');
}

void run().catch((e) => {
  console.error('[testImport] Failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
