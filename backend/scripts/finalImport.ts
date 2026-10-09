import path from 'path';
import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { mapExcelToCandidate, shouldSkipMappedCandidate } from '../src/utils/candidateMapper';

const prisma = new PrismaClient();

function toNonEmpty(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  const lower = v.toLowerCase();
  if (lower === 'na' || lower === 'n/a' || lower === 'null' || lower === '-') return null;
  return v;
}

function mergeUnique(existing: string[], incoming: string[]): string[] {
  const set = new Set<string>();
  for (const item of [...existing, ...incoming]) {
    const v = item.trim();
    if (!v) continue;
    set.add(v);
  }
  return [...set];
}

function appendImportNote(existingNotes: string | null, fileName: string): string {
  const tag = `[import:${fileName}]`;
  if (!existingNotes || !existingNotes.trim()) return tag;
  if (existingNotes.includes(tag)) return existingNotes;
  return `${existingNotes}\n${tag}`;
}

async function run(): Promise<void> {
  const filePath =
    process.argv[2] ||
    path.resolve(process.cwd(), 'import_data_dump', 'ISSB-Support_20260423195913_141.xlsx');
  const fileName = path.basename(filePath);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const ws = workbook.worksheets[0];
  if (!ws) throw new Error('No worksheet found in workbook');

  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? '').trim();
  });

  let totalRows = 0;
  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  const skippedReasons = new Map<string, number>();

  ws.eachRow(async () => {
    // no-op: keeps ts happy for async-free iterator
  });

  const rows = ws.getRows(2, ws.rowCount - 1) ?? [];
  for (let idx = 0; idx < rows.length; idx += 1) {
    const row = rows[idx];
    if (!row) continue;
    totalRows += 1;

    const rawRow: Record<string, unknown> = {};
    headers.forEach((header, colIdx) => {
      if (!header) return;
      const cell = row.getCell(colIdx);
      const val = cell?.value;
      if (val === null || val === undefined || String(val).trim() === '') return;
      rawRow[header] = typeof val === 'object' && val && 'text' in val ? (val as any).text : val;
    });

    const mapped = mapExcelToCandidate(rawRow);
    const skipCheck = shouldSkipMappedCandidate(mapped);
    if (skipCheck.skip) {
      skippedCount += 1;
      const reason = skipCheck.reason ?? 'Unknown skip reason';
      skippedReasons.set(reason, (skippedReasons.get(reason) ?? 0) + 1);
      continue;
    }

    // Candidate table requires unique non-null email.
    if (!mapped.email) {
      skippedCount += 1;
      const reason = 'Missing valid email';
      skippedReasons.set(reason, (skippedReasons.get(reason) ?? 0) + 1);
      continue;
    }

    try {
      const existing = await prisma.candidate.findUnique({
        where: { email: mapped.email },
      });

      if (!existing) {
        await prisma.candidate.create({
          data: {
            name: mapped.name ?? 'Unknown',
            email: mapped.email,
            phone: toNonEmpty(mapped.phone),
            phoneNormalized: toNonEmpty(mapped.phoneNormalized),
            currentCompany: toNonEmpty(mapped.currentCompany),
            experienceLabel: toNonEmpty(mapped.experienceLabel),
            totalExperience: mapped.totalExperience,
            skills: mapped.skills,
            technologies: mapped.technologies,
            education: [],
            currentLocation: toNonEmpty(mapped.currentLocation),
            preferredLocation: toNonEmpty(mapped.preferredLocation),
            noticePeriod: toNonEmpty(mapped.noticePeriod),
            currentSalary: toNonEmpty(mapped.currentSalary),
            expectedSalary: toNonEmpty(mapped.expectedSalary),
            sourcePlatform: toNonEmpty(mapped.sourcePlatform) ?? 'Excel Import',
            notes: appendImportNote(toNonEmpty(mapped.notes), fileName),
            isActive: true,
          },
        });
        createdCount += 1;
      } else {
        await prisma.candidate.update({
          where: { email: mapped.email },
          data: {
            name: toNonEmpty(mapped.name) ?? existing.name,
            phone: toNonEmpty(mapped.phone) ?? existing.phone,
            phoneNormalized: toNonEmpty(mapped.phoneNormalized) ?? existing.phoneNormalized,
            currentCompany: toNonEmpty(mapped.currentCompany) ?? existing.currentCompany,
            experienceLabel: toNonEmpty(mapped.experienceLabel) ?? existing.experienceLabel,
            totalExperience: mapped.totalExperience ?? existing.totalExperience,
            skills: mergeUnique(existing.skills, mapped.skills),
            technologies: mergeUnique(existing.technologies, mapped.technologies),
            currentLocation: toNonEmpty(mapped.currentLocation) ?? existing.currentLocation,
            preferredLocation: toNonEmpty(mapped.preferredLocation) ?? existing.preferredLocation,
            noticePeriod: toNonEmpty(mapped.noticePeriod) ?? existing.noticePeriod,
            currentSalary: toNonEmpty(mapped.currentSalary) ?? existing.currentSalary,
            expectedSalary: toNonEmpty(mapped.expectedSalary) ?? existing.expectedSalary,
            sourcePlatform: toNonEmpty(mapped.sourcePlatform) ?? existing.sourcePlatform,
            notes: appendImportNote(toNonEmpty(existing.notes ?? mapped.notes), fileName),
          },
        });
        updatedCount += 1;
      }
    } catch (e) {
      errorCount += 1;
      console.error(`[row ${idx + 2}] import error:`, e instanceof Error ? e.message : e);
    }

    if ((idx + 1) % 20 === 0) {
      console.log(
        `Processed ${idx + 1}/${rows.length} rows | created=${createdCount} updated=${updatedCount} skipped=${skippedCount} errors=${errorCount}`,
      );
    }
  }

  console.log('\n========== Final Import Summary ==========');
  console.log('File:', filePath);
  console.log('Total rows seen:', totalRows);
  console.log('New records created:', createdCount);
  console.log('Existing records updated:', updatedCount);
  console.log('Skipped rows:', skippedCount);
  console.log('Errored rows:', errorCount);
  if (skippedReasons.size > 0) {
    console.log('\nSkipped reasons:');
    for (const [reason, count] of skippedReasons.entries()) {
      console.log(`- ${reason}: ${count}`);
    }
  }
}

void run()
  .catch((e) => {
    console.error('[finalImport] failed:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
