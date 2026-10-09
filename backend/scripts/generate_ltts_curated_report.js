/**
 * Match user-curated LTTS Excel (286 reqs) to DB requirements, then export submissions report.
 * READ-ONLY on database.
 */
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const USER_XLSX = 'F:/Share/LTTS_21-Apr to 29-Jul_Req data.xlsx';
const OUT_FILE = path.join(__dirname, '..', '..', 'reports', 'LTTS_Curated_286_Submissions_Report.xlsx');

function norm(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function excelDateToIsoDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return val.toISOString().slice(0, 10);
  }
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return '';
}

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

function istDateKey(d) {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(dt);
}

function tatParts(from, to) {
  if (!from || !to) return { days: '', hours: '', label: '' };
  const a = from instanceof Date ? from : new Date(from);
  const b = to instanceof Date ? to : new Date(to);
  const ms = Math.max(0, b.getTime() - a.getTime());
  const hours = Math.round((ms / (1000 * 60 * 60)) * 10) / 10;
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  const remH = Math.round(((ms / (1000 * 60 * 60)) % 24) * 10) / 10;
  const label = days > 0 ? `${days} day${days === 1 ? '' : 's'} ${remH} hr` : `${hours} hr`;
  return { days, hours, label };
}

function scoreMatch(excelRow, dbRow) {
  const et = norm(excelRow.title);
  const dt = norm(dbRow.role_title);
  const es = norm(dbRow.source_email_subject);
  if (!et || (!dt && !es)) return 0;

  let titleScore = 0;
  if (dt === et || es === et) titleScore = 100;
  else if (dt && (dt.includes(et) || et.includes(dt))) titleScore = 90;
  else if (es && (es.includes(et) || et.includes(es))) titleScore = 88;
  else {
    const etWords = et.split(' ').filter((w) => w.length > 2);
    const dtWords = new Set((dt + ' ' + es).split(' '));
    const overlap = etWords.filter((w) => dtWords.has(w)).length;
    if (etWords.length) titleScore = Math.round((overlap / etWords.length) * 75);
  }

  // Excel dates are often day-only and can differ from DB created_at; bonus only.
  const excelDate = excelRow.dateKey;
  const dbDate = istDateKey(dbRow.created_at);
  let dateScore = 0;
  if (excelDate && dbDate) {
    if (excelDate === dbDate) dateScore = 15;
    else {
      const diff = Math.abs(new Date(excelDate).getTime() - new Date(dbDate).getTime());
      const dayDiff = diff / (1000 * 60 * 60 * 24);
      if (dayDiff <= 3) dateScore = 8;
      else if (dayDiff <= 7) dateScore = 4;
    }
  }

  return titleScore + dateScore;
}

function matchUserToDb(userReqs, dbReqs) {
  const usedDb = new Set();
  const matches = [];

  const tryMatch = (ur, minScore) => {
    let best = null;
    let bestScore = 0;
    for (const dr of dbReqs) {
      if (usedDb.has(dr.requirement_pk)) continue;
      const sc = scoreMatch(ur, dr);
      if (sc > bestScore) {
        bestScore = sc;
        best = dr;
      }
    }
    if (best && bestScore >= minScore) {
      usedDb.add(best.requirement_pk);
      return { user: ur, db: best, score: bestScore, matched: true };
    }
    return { user: ur, db: best, score: bestScore, matched: false };
  };

  const sortedUser = [...userReqs].sort((a, b) => {
    const da = a.dateKey || '';
    const db = b.dateKey || '';
    if (da !== db) return da.localeCompare(db);
    return a.title.localeCompare(b.title);
  });

  for (const ur of sortedUser) {
    matches.push(tryMatch(ur, 60));
  }

  // Second pass: relaxed threshold for rows still unmatched
  for (let i = 0; i < matches.length; i++) {
    if (matches[i].matched) continue;
    const retry = tryMatch(matches[i].user, 50);
    if (retry.matched) matches[i] = retry;
  }

  matches.sort((a, b) => a.user.sno - b.user.sno);
  return matches;
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
    if ([1, 10, 11, 12, 13, 14, 15].includes(col)) {
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    }
    if (alt) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F9FC' } };
    }
  });
}

async function loadUserRequirements() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(USER_XLSX);
  const ws = wb.worksheets[0];
  const rows = [];
  for (let i = 2; i <= ws.rowCount; i++) {
    const r = ws.getRow(i);
    const title = String(r.getCell(2).value ?? '').trim();
    if (!title) continue;
    const poc = [r.getCell(3).value, r.getCell(4).value]
      .filter(Boolean)
      .map((v) => String(v).trim())
      .join(' / ');
    const dateVal = r.getCell(1).value;
    rows.push({
      sno: rows.length + 1,
      dateVal,
      dateKey: excelDateToIsoDate(dateVal) || istDateKey(dateVal),
      title,
      poc,
    });
  }
  return rows;
}

async function main() {
  await prisma.$executeRawUnsafe('SET default_transaction_read_only = on');

  const userReqs = await loadUserRequirements();

  const dbReqs = await prisma.$queryRawUnsafe(`
    SELECT
      r.id AS requirement_pk,
      r.requirement_id,
      r.role_title,
      r.source_email_subject,
      r.location,
      r.status::text AS status,
      r.client_lead_poc,
      r.created_at
    FROM requirements r
    WHERE r.is_deleted = false
      AND LOWER(TRIM(COALESCE(r.submitting_to, ''))) = 'ltts'
    ORDER BY r.created_at ASC
  `);

  const matches = matchUserToDb(userReqs, dbReqs);

  const matchedPks = matches.filter((m) => m.matched).map((m) => m.db.requirement_pk);
  let submissions = [];
  if (matchedPks.length) {
    submissions = await prisma.$queryRawUnsafe(`
      SELECT
        s.id AS submission_pk,
        s.submission_ref,
        r.id AS requirement_pk,
        r.requirement_id,
        r.role_title,
        r.source_email_subject,
        r.created_at AS requirement_received_at,
        cand.name AS candidate_name,
        cand.email AS candidate_email,
        cand.phone AS candidate_phone,
        s.submitted_on AS candidate_submitted_at,
        u."firstName" AS recruiter_first_name,
        u."lastName" AS recruiter_last_name,
        u.email AS recruiter_email,
        s.status::text AS submission_status,
        CASE WHEN s.email_sent THEN 'Yes' ELSE 'No' END AS reply_email_sent
      FROM submissions s
      INNER JOIN requirements r ON r.id = s.requirement_id
      INNER JOIN candidates cand ON cand.id = s.candidate_id
      INNER JOIN users u ON u.id = s.submitted_by
      WHERE r.id = ANY($1::text[])
      ORDER BY r.created_at ASC, s.submitted_on ASC
    `, matchedPks);
  }

  const subsByReq = new Map();
  for (const s of submissions) {
    if (!subsByReq.has(s.requirement_pk)) subsByReq.set(s.requirement_pk, []);
    subsByReq.get(s.requirement_pk).push(s);
  }

  const recruiterMap = new Map();
  for (const s of submissions) {
    const key = s.recruiter_email || `${s.recruiter_first_name} ${s.recruiter_last_name}`;
    if (!recruiterMap.has(key)) {
      recruiterMap.set(key, {
        name: `${s.recruiter_first_name || ''} ${s.recruiter_last_name || ''}`.trim(),
        email: s.recruiter_email || '',
        submissions: 0,
        candidates: new Set(),
        requirements: new Set(),
      });
    }
    const r = recruiterMap.get(key);
    r.submissions += 1;
    r.candidates.add(s.candidate_email);
    r.requirements.add(s.requirement_pk);
  }

  const recruiterTotals = [...recruiterMap.values()]
    .map((r) => ({
      name: r.name,
      email: r.email,
      submissions: r.submissions,
      candidates: r.candidates.size,
      requirements: r.requirements.size,
    }))
    .sort((a, b) => b.submissions - a.submissions);

  const matchedCount = matches.filter((m) => m.matched).length;
  const unmatchedCount = matches.length - matchedCount;
  let worked = 0;
  let notWorked = 0;
  for (const m of matches) {
    if (!m.matched) continue;
    const cnt = (subsByReq.get(m.db.requirement_pk) || []).length;
    if (cnt > 0) worked += 1;
    else notWorked += 1;
  }

  const generatedAt = new Date();
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'MetaForge Recruitment';
  wb.created = generatedAt;

  // Summary
  const wsSum = wb.addWorksheet('Summary');
  wsSum.columns = [{ width: 54 }, { width: 28 }];
  wsSum.mergeCells('A1:B1');
  wsSum.getCell('A1').value = 'LTTS / L&T — Curated Requirements Report (286 list)';
  wsSum.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF1F4E79' }, name: 'Calibri' };
  wsSum.mergeCells('A2:B2');
  wsSum.getCell('A2').value =
    `Source list: LTTS_21-Apr to 29-Jul_Req data.xlsx  |  Generated: ${fmtDateTime(generatedAt)} IST  |  DB: read-only`;
  wsSum.getCell('A2').font = { size: 10, italic: true, color: { argb: 'FF595959' } };
  wsSum.addRow([]);
  headerStyle(wsSum.addRow(['Particulars', 'Value']));
  const kpis = [
    ['Requirements in your curated Excel', userReqs.length],
    ['Matched to database requirements', matchedCount],
    ['Not matched to database', unmatchedCount],
    ['Worked (≥1 submission)', worked],
    ['Not worked (0 submissions)', notWorked],
    ['Worked + Not worked (matched only)', worked + notWorked],
    ['Total candidate submissions (matched reqs)', submissions.length],
    ['Distinct recruiters', recruiterTotals.length],
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
      if (i % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
    });
  });
  wsSum.addRow([]);
  headerStyle(wsSum.addRow(['Recruiter', 'Submissions', 'Requirements', 'Candidates']), '145A32');
  recruiterTotals.forEach((r, i) => {
    const row = wsSum.addRow([r.name, r.submissions, r.requirements, r.candidates]);
    row.eachCell((cell, col) => {
      cell.font = { name: 'Calibri', size: 10 };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        right: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      };
      if (col > 1) cell.alignment = { horizontal: 'center' };
      if (i % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
    });
  });

  // Requirements (1 row each) — from curated list
  const wsReq = wb.addWorksheet('Requirements (1 row each)', {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }],
  });
  const reqHeaders = [
    'S.No',
    'Requirement ID',
    'Requirement (Excel)',
    'Requirement (DB)',
    'Requirement Subject',
    'Client POC (Excel)',
    'Demand Received Date (Excel)',
    'Requirement Received Date',
    'Requirement Received Time',
    'No. of Submissions',
    'First Submission Date',
    'First Submission TAT (Days)',
    'First Submission TAT (Hours)',
    'First Submission TAT',
    'Last Submission Date',
    'DB Match Status',
  ];
  wsReq.addRow(reqHeaders);
  headerStyle(wsReq.getRow(1));
  wsReq.columns = [6, 20, 34, 34, 40, 18, 16, 16, 12, 14, 18, 14, 14, 18, 18, 14].map((w) => ({ width: w }));

  matches.forEach((m, idx) => {
    const subs = m.db ? subsByReq.get(m.db.requirement_pk) || [] : [];
    const firstSub = subs.length ? subs.reduce((a, b) => (a.candidate_submitted_at < b.candidate_submitted_at ? a : b)) : null;
    const lastSub = subs.length ? subs.reduce((a, b) => (a.candidate_submitted_at > b.candidate_submitted_at ? a : b)) : null;
    const receivedAt = m.db?.created_at || m.user.dateVal;
    const tat = firstSub ? tatParts(receivedAt, firstSub.candidate_submitted_at) : { days: '', hours: '', label: '' };
    const subject = m.db
      ? (m.db.source_email_subject || '').trim() || m.db.role_title
      : m.user.title;

    wsReq.addRow([
      idx + 1,
      m.db?.requirement_id || '—',
      m.user.title,
      m.db?.role_title || '—',
      subject,
      m.user.poc || '',
      m.user.dateKey || fmtDate(m.user.dateVal),
      m.db ? fmtDate(receivedAt) : '—',
      m.db ? fmtTime(receivedAt) : '—',
      subs.length,
      firstSub ? fmtDateTime(firstSub.candidate_submitted_at) : '—',
      tat.days === '' ? '—' : tat.days,
      tat.hours === '' ? '—' : tat.hours,
      tat.label || '—',
      lastSub ? fmtDateTime(lastSub.candidate_submitted_at) : '—',
      m.matched ? 'Matched' : 'Not matched',
    ]);
    styleRow(wsReq.getRow(idx + 2), idx % 2 === 1);
  });
  wsReq.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: reqHeaders.length } };

  // Submissions (1 row each)
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
    'TAT (Hours)',
    'TAT',
    'Recruiter Name',
    'Recruiter Email',
    'Submission Status',
    'Reply Email Sent',
  ];
  wsSub.addRow(subHeaders);
  headerStyle(wsSub.getRow(1), '145A32');
  wsSub.columns = [6, 20, 40, 34, 16, 12, 24, 30, 14, 16, 12, 10, 10, 16, 22, 30, 16, 12].map((w) => ({ width: w }));

  let subIdx = 0;
  for (const m of matches) {
    if (!m.matched) continue;
    const subs = subsByReq.get(m.db.requirement_pk) || [];
    for (const s of subs) {
      subIdx += 1;
      const tat = tatParts(s.requirement_received_at, s.candidate_submitted_at);
      const recruiter = `${s.recruiter_first_name || ''} ${s.recruiter_last_name || ''}`.trim();
      wsSub.addRow([
        subIdx,
        s.requirement_id,
        (s.source_email_subject || '').trim() || s.role_title,
        s.role_title || '',
        fmtDate(s.requirement_received_at),
        fmtTime(s.requirement_received_at),
        s.candidate_name || '',
        s.candidate_email || '',
        s.candidate_phone || '',
        fmtDate(s.candidate_submitted_at),
        fmtTime(s.candidate_submitted_at),
        tat.days,
        tat.hours,
        tat.label,
        recruiter,
        s.recruiter_email || '',
        s.submission_status || '',
        s.reply_email_sent || 'No',
      ]);
      styleRow(wsSub.getRow(subIdx + 1), subIdx % 2 === 1);
    }
  }
  wsSub.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: subHeaders.length } };

  // Recruiter Performance (dedicated sheet)
  const wsRec = wb.addWorksheet('Recruiter Performance', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  const recHeaders = ['S.No', 'Recruiter Name', 'Recruiter Email', 'Total Submissions', 'Distinct Candidates', 'Requirements Worked'];
  wsRec.addRow(recHeaders);
  headerStyle(wsRec.getRow(1), '7D3C98');
  wsRec.columns = [6, 26, 34, 16, 18, 18].map((w) => ({ width: w }));
  recruiterTotals.forEach((r, i) => {
    const row = wsRec.addRow([i + 1, r.name, r.email, r.submissions, r.candidates, r.requirements]);
    styleRow(row, i % 2 === 1);
  });

  // Unmatched list for review
  const wsUn = wb.addWorksheet('Unmatched (review)');
  wsUn.addRow(['S.No', 'Excel Job Title', 'Excel Date', 'Excel POC', 'Best match score']);
  headerStyle(wsUn.getRow(1), '922B21');
  matches
    .filter((m) => !m.matched)
    .forEach((m, i) => {
      wsUn.addRow([m.user.sno, m.user.title, m.user.dateKey, m.user.poc, m.score]);
    });

  await wb.xlsx.writeFile(OUT_FILE);

  console.log(
    JSON.stringify(
      {
        outFile: OUT_FILE,
        userReqs: userReqs.length,
        matchedCount,
        unmatchedCount,
        worked,
        notWorked,
        submissions: submissions.length,
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
