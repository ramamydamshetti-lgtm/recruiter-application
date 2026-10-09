/**
 * READ-ONLY: Final LTTS/L&T meeting Excel export.
 * Does not modify database or interrupt the live application.
 */
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const LTTS_REQ_WHERE = `
  r.is_deleted = false
  AND (
    LOWER(TRIM(COALESCE(r.submitting_to, ''))) IN ('ltts', 'l&t', 'lnt', 'l & t')
    OR LOWER(COALESCE(r.submitting_to, '')) LIKE '%ltts%'
    OR LOWER(COALESCE(r.submitting_to, '')) LIKE '%l&t%'
    OR LOWER(COALESCE(r.client_lead_poc, '')) LIKE '%@ltts.com%'
    OR LOWER(COALESCE(r.client_lead_poc, '')) LIKE '%lnttechservices%'
    OR LOWER(TRIM(COALESCE(c.name, ''))) IN ('ltts', 'l&t')
    OR LOWER(COALESCE(c.name, '')) LIKE '%@ltts.com%'
    OR LOWER(COALESCE(c.name, '')) LIKE '%lnttechservices%'
  )
`;

function fmtDate(d) {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(dt);
}

function fmtTime(d) {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(dt);
}

function fmtDateTime(d) {
  if (!d) return '';
  return `${fmtDate(d)} ${fmtTime(d)}`;
}

function daysBetween(from, to) {
  if (!from || !to) return '';
  const a = from instanceof Date ? from : new Date(from);
  const b = to instanceof Date ? to : new Date(to);
  const ms = b.getTime() - a.getTime();
  if (Number.isNaN(ms)) return '';
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function subjectOf(row) {
  const s = (row.source_email_subject || '').trim();
  return s || (row.role_title || '').trim();
}

function headerStyle(row, color = '1F4E79') {
  row.height = 34;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${color}` } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFBFBFBF' } },
      left: { style: 'thin', color: { argb: 'FFBFBFBF' } },
      bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } },
      right: { style: 'thin', color: { argb: 'FFBFBFBF' } },
    };
  });
}

function styleRow(row, alt = false) {
  row.eachCell((cell, col) => {
    cell.font = { name: 'Calibri', size: 10 };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      right: { style: 'thin', color: { argb: 'FFD9D9D9' } },
    };
    cell.alignment = { vertical: 'top', wrapText: true };
    if ([1, 9, 10, 11, 12, 13, 14].includes(col)) {
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    }
    if (alt) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F9FC' } };
    }
  });
}

async function main() {
  await prisma.$executeRawUnsafe('SET default_transaction_read_only = on');

  const [bounds] = await prisma.$queryRawUnsafe(`
    SELECT
      (SELECT MIN(created_at) FROM requirements WHERE is_deleted = false) AS app_launch,
      (SELECT MIN(r.created_at) FROM requirements r LEFT JOIN clients c ON c.id = r.client_id WHERE ${LTTS_REQ_WHERE}) AS first_ltts_req
  `);

  const requirements = await prisma.$queryRawUnsafe(`
    SELECT
      r.id AS requirement_pk,
      r.requirement_id,
      r.role_title,
      r.source_email_subject,
      r.location,
      r.status::text AS status,
      r.client_lead_poc,
      r.submitting_to,
      r.created_at AS requirement_received_at,
      COUNT(s.id)::int AS submission_count,
      MIN(s.submitted_on) AS first_submission_at,
      MAX(s.submitted_on) AS last_submission_at,
      ROUND(AVG(EXTRACT(EPOCH FROM (s.submitted_on - r.created_at)) / 86400)::numeric, 1) AS avg_tat_days,
      ROUND(EXTRACT(EPOCH FROM (MIN(s.submitted_on) - r.created_at)) / 86400)::int AS first_submission_tat_days
    FROM requirements r
    LEFT JOIN clients c ON c.id = r.client_id
    LEFT JOIN submissions s ON s.requirement_id = r.id
    WHERE ${LTTS_REQ_WHERE}
    GROUP BY r.id, r.requirement_id, r.role_title, r.source_email_subject,
             r.location, r.status, r.client_lead_poc, r.submitting_to, r.created_at
    ORDER BY r.created_at ASC, r.requirement_id ASC
  `);

  const submissions = await prisma.$queryRawUnsafe(`
    SELECT
      s.id AS submission_pk,
      s.submission_ref,
      r.requirement_id,
      COALESCE(NULLIF(TRIM(r.source_email_subject), ''), r.role_title) AS requirement_subject,
      r.role_title,
      r.created_at AS requirement_received_at,
      cand.name AS candidate_name,
      cand.email AS candidate_email,
      cand.phone AS candidate_phone,
      s.submitted_on AS candidate_submitted_at,
      FLOOR(EXTRACT(EPOCH FROM (s.submitted_on - r.created_at)) / 86400)::int AS tat_days,
      u."firstName" AS recruiter_first_name,
      u."lastName" AS recruiter_last_name,
      u.email AS recruiter_email,
      s.status::text AS submission_status,
      CASE WHEN s.email_sent THEN 'Yes' ELSE 'No' END AS reply_email_sent
    FROM submissions s
    INNER JOIN requirements r ON r.id = s.requirement_id
    LEFT JOIN clients c ON c.id = r.client_id
    INNER JOIN candidates cand ON cand.id = s.candidate_id
    INNER JOIN users u ON u.id = s.submitted_by
    WHERE ${LTTS_REQ_WHERE}
    ORDER BY r.created_at ASC, s.submitted_on ASC
  `);

  const recruiterTotals = await prisma.$queryRawUnsafe(`
    SELECT
      u."firstName" AS first_name,
      u."lastName" AS last_name,
      u.email,
      COUNT(*)::int AS submissions,
      COUNT(DISTINCT s.requirement_id)::int AS requirements,
      COUNT(DISTINCT s.candidate_id)::int AS candidates
    FROM submissions s
    INNER JOIN requirements r ON r.id = s.requirement_id
    LEFT JOIN clients c ON c.id = r.client_id
    INNER JOIN users u ON u.id = s.submitted_by
    WHERE ${LTTS_REQ_WHERE}
    GROUP BY u.id, u."firstName", u."lastName", u.email
    ORDER BY submissions DESC
  `);

  const totalReqs = requirements.length;
  const totalSubs = submissions.length;
  const reqsWithSubs = requirements.filter((r) => Number(r.submission_count) > 0).length;
  const distinctCandidates = new Set(submissions.map((s) => s.candidate_email)).size;
  const generatedAt = new Date();

  const outDir = path.join(__dirname, '..', '..', 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'LTTS_L&T_Meeting_Report_Final.xlsx');

  const wb = new ExcelJS.Workbook();
  wb.creator = 'MetaForge Recruitment';
  wb.created = generatedAt;

  // ── Sheet 1: Summary ──
  const wsSum = wb.addWorksheet('Summary');
  wsSum.columns = [{ width: 52 }, { width: 30 }];
  wsSum.mergeCells('A1:B1');
  wsSum.getCell('A1').value = 'LTTS / L&T — Final Meeting Report';
  wsSum.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF1F4E79' }, name: 'Calibri' };
  wsSum.getRow(1).height = 30;
  wsSum.mergeCells('A2:B2');
  wsSum.getCell('A2').value =
    `Generated: ${fmtDateTime(generatedAt)} IST  |  Source: staffing_db (read-only)  |  Client: LTTS / L&T only`;
  wsSum.getCell('A2').font = { size: 10, italic: true, color: { argb: 'FF595959' } };

  wsSum.addRow([]);
  headerStyle(wsSum.addRow(['Particulars', 'Value']));

  const kpis = [
    ['Application launch date (first requirement in DB)', fmtDate(bounds.app_launch)],
    ['First LTTS / L&T requirement received', fmtDate(bounds.first_ltts_req)],
    ['Total LTTS / L&T requirements received (till today)', totalReqs],
    ['Requirements with ≥1 candidate submission', reqsWithSubs],
    ['Requirements with no submission yet', totalReqs - reqsWithSubs],
    ['Total candidate submissions (LTTS / L&T)', totalSubs],
    ['Distinct candidates submitted', distinctCandidates],
    ['Recruiters who submitted', recruiterTotals.length],
    ['', ''],
    ['Data source', 'PostgreSQL staffing_db — read-only SELECT'],
    ['Requirement received timestamp', 'requirements.created_at'],
    ['Candidate submitted timestamp', 'submissions.submitted_on'],
    ['TAT (Turnaround Time)', 'Days from requirement received → candidate submitted'],
    ['Note on UI Reports page', 'UI shows 161 LTTS (loads latest 500 reqs only). DB total is accurate.'],
  ];
  kpis.forEach(([k, v], i) => {
    const row = wsSum.addRow([k, v]);
    row.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 10 };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        right: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      };
      if (i % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
      }
    });
  });

  wsSum.addRow([]);
  headerStyle(wsSum.addRow(['Recruiter', 'Submissions', 'Requirements', 'Candidates']), '145A32');
  recruiterTotals.forEach((r, i) => {
    const row = wsSum.addRow([
      `${r.first_name || ''} ${r.last_name || ''}`.trim(),
      r.submissions,
      r.requirements,
      r.candidates,
    ]);
    row.eachCell((cell, col) => {
      cell.font = { name: 'Calibri', size: 10 };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        right: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      };
      if (col > 1) cell.alignment = { horizontal: 'center' };
      if (i % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
      }
    });
  });

  // ── Sheet 2: One row per requirement ──
  const wsReq = wb.addWorksheet('Requirements (1 row each)', {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }],
  });
  const reqHeaders = [
    'S.No',
    'Requirement ID',
    'Requirement',
    'Requirement Subject',
    'Location',
    'Status',
    'Client Lead POC',
    'Requirement Received Date',
    'Requirement Received Time',
    'No. of Submissions',
    'First Submission Date',
    'First Submission TAT (Days)',
    'Last Submission Date',
    'Avg TAT (Days)',
  ];
  wsReq.addRow(reqHeaders);
  headerStyle(wsReq.getRow(1));
  wsReq.columns = [6, 20, 36, 44, 16, 12, 32, 16, 12, 14, 18, 16, 18, 12].map((w) => ({ width: w }));

  requirements.forEach((r, idx) => {
    const row = wsReq.addRow([
      idx + 1,
      r.requirement_id,
      r.role_title || '',
      subjectOf(r),
      r.location || '',
      r.status || '',
      r.client_lead_poc || '',
      fmtDate(r.requirement_received_at),
      fmtTime(r.requirement_received_at),
      Number(r.submission_count) || 0,
      r.first_submission_at ? fmtDateTime(r.first_submission_at) : '—',
      r.first_submission_tat_days ?? '—',
      r.last_submission_at ? fmtDateTime(r.last_submission_at) : '—',
      r.avg_tat_days ?? '—',
    ]);
    styleRow(row, idx % 2 === 1);
  });
  wsReq.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: reqHeaders.length } };

  // ── Sheet 3: One row per submission ──
  const wsSub = wb.addWorksheet('Submissions (1 row each)', {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }],
  });
  const subHeaders = [
    'S.No',
    'Requirement ID',
    'Requirement Subject',
    'Requirement',
    'Requirement Received Date',
    'Requirement Received Time',
    'Candidate Name',
    'Candidate Email',
    'Candidate Phone',
    'Candidate Submitted Date',
    'Candidate Submitted Time',
    'TAT (Days)',
    'Recruiter Name',
    'Recruiter Email',
    'Submission Status',
    'Reply Email Sent',
  ];
  wsSub.addRow(subHeaders);
  headerStyle(wsSub.getRow(1), '145A32');
  wsSub.columns = [6, 20, 44, 36, 16, 12, 26, 32, 16, 16, 12, 10, 24, 32, 18, 14].map((w) => ({
    width: w,
  }));

  submissions.forEach((s, idx) => {
    const recruiter = `${s.recruiter_first_name || ''} ${s.recruiter_last_name || ''}`.trim();
    const row = wsSub.addRow([
      idx + 1,
      s.requirement_id,
      s.requirement_subject || '',
      s.role_title || '',
      fmtDate(s.requirement_received_at),
      fmtTime(s.requirement_received_at),
      s.candidate_name || '',
      s.candidate_email || '',
      s.candidate_phone || '',
      fmtDate(s.candidate_submitted_at),
      fmtTime(s.candidate_submitted_at),
      s.tat_days ?? '',
      recruiter,
      s.recruiter_email || '',
      s.submission_status || '',
      s.reply_email_sent || 'No',
    ]);
    styleRow(row, idx % 2 === 1);
  });
  wsSub.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: subHeaders.length } };

  await wb.xlsx.writeFile(outFile);

  console.log(
    JSON.stringify(
      {
        outFile,
        totalReqs,
        totalSubs,
        reqsWithSubs,
        noSubs: totalReqs - reqsWithSubs,
        distinctCandidates,
        recruiters: recruiterTotals.length,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
