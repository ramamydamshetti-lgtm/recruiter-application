/**
 * Export controller: CSV (Excel) and PDF (print) generation.
 * Scalable: can swap to server-side PDF/Excel generation later.
 */

import type { AdminReportAggregate } from './types';

/** BOM for Excel UTF-8 compatibility */
const UTF8_BOM = '\uFEFF';

export function exportTableToCSV(
  headers: string[],
  rows: (string | number)[][],
  filename: string,
): void {
  const escape = (v: string | number) => {
    const s = String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const line = (row: (string | number)[]) => row.map(escape).join(',');
  const csv = UTF8_BOM + [line(headers), ...rows.map(line)].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportAdminReportToExcel(aggregate: AdminReportAggregate, reportTitle: string): void {
  const date = new Date().toISOString().slice(0, 10);

  const headers = [
    'Recruiter Name',
    'Recruiter Email',
    'Requirements Assigned',
    'Candidates Submitted',
    'Success Rate %',
    'Open Jobs',
    'Closed Jobs',
  ];
  const rows: (string | number)[][] = aggregate.recruiterPerformance.map((r) => [
    r.recruiterName,
    r.recruiterEmail,
    r.requirementsAssigned,
    r.candidatesSubmitted,
    r.submissionsSuccessRate,
    r.openJobs,
    r.closedJobs,
  ]);
  exportTableToCSV(headers, rows, `Recruiter_Performance_${reportTitle}_${date}.csv`);

  const clientHeaders = [
    'Client Name',
    'Requirements Sent',
    'Requirements Assigned',
    'Candidates Submitted',
    'Submission Ratio',
    'Open',
    'Closed',
  ];
  const clientRows: (string | number)[][] = aggregate.clientPerformance.map((c) => [
    c.clientName,
    c.requirementsSent,
    c.requirementsAssigned,
    c.candidatesSubmitted,
    c.submissionRatio.toFixed(2),
    c.openCount,
    c.closedCount,
  ]);
  exportTableToCSV(clientHeaders, clientRows, `Client_Performance_${reportTitle}_${date}.csv`);
}

/** Export admin report to CSV. Dynamic based on applied filters. */
export function exportAdminReportToCSV(aggregate: AdminReportAggregate, reportTitle: string): void {
  const date = new Date().toISOString().slice(0, 10);
  const headers = [
    'Recruiter Name',
    'Recruiter Email',
    'Requirements Assigned',
    'Candidates Submitted',
    'Success Rate %',
    'Open Jobs',
    'Closed Jobs',
  ];
  const rows = aggregate.recruiterPerformance.map((r) => [
    r.recruiterName,
    r.recruiterEmail,
    r.requirementsAssigned,
    r.candidatesSubmitted,
    r.submissionsSuccessRate,
    r.openJobs,
    r.closedJobs,
  ]);
  exportTableToCSV(headers, rows, `Recruiter_Performance_${reportTitle}_${date}.csv`);
  const clientHeaders = [
    'Client Name',
    'Requirements Sent',
    'Requirements Assigned',
    'Candidates Submitted',
    'Submission Ratio',
    'Open',
    'Closed',
  ];
  const clientRows = aggregate.clientPerformance.map((c) => [
    c.clientName,
    c.requirementsSent,
    c.requirementsAssigned,
    c.candidatesSubmitted,
    c.submissionRatio.toFixed(2),
    c.openCount,
    c.closedCount,
  ]);
  exportTableToCSV(clientHeaders, clientRows, `Client_Performance_${reportTitle}_${date}.csv`);
}

/** Professional print/PDF styles for reports */
const PDF_STYLES = `
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: #1e293b; background: #fff; margin: 0; padding: 24px 32px; font-size: 14px; line-height: 1.5; }
  .print-header { margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #e2e8f0; }
  .print-header h1 { margin: 0; font-size: 22px; font-weight: 600; color: #0f172a; }
  .print-header p { margin: 4px 0 0; font-size: 13px; color: #64748b; }
  .pdf-section { margin-bottom: 28px; break-inside: avoid; }
  .pdf-section h2 { font-size: 16px; font-weight: 600; color: #0f172a; margin: 0 0 12px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 24px; }
  .kpi-item { border: 1px solid #e2e8f0; padding: 12px 16px; border-radius: 8px; background: #f8fafc; }
  .kpi-item strong { display: block; font-size: 20px; color: #0f172a; margin-top: 4px; }
  .kpi-item span { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 12px; }
  th, td { border: 1px solid #e2e8f0; padding: 10px 12px; text-align: left; }
  th { background: #f8fafc; font-weight: 600; color: #334155; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
  tr:nth-child(even) { background: #fafafa; }
  @media print { body { padding: 16px; } .print-header { margin-bottom: 16px; } .pdf-section { margin-bottom: 20px; } .kpi-grid { grid-template-columns: repeat(5, 1fr); } }
`;

/** Build clean HTML for admin report PDF (no charts - tables only for proper formatting). */
function buildAdminReportPDFHtml(aggregate: AdminReportAggregate): string {
  const recruiterRows = aggregate.recruiterPerformance
    .map(
      (r) =>
        `<tr><td>${r.recruiterName}</td><td>${r.recruiterEmail}</td><td>${r.requirementsAssigned}</td><td>${r.candidatesSubmitted}</td><td>${r.submissionsSuccessRate}%</td><td>${r.openJobs}</td><td>${r.closedJobs}</td></tr>`,
    )
    .join('');
  const clientRows = aggregate.clientPerformance
    .map(
      (c) =>
        `<tr><td>${c.clientName}</td><td>${c.requirementsSent}</td><td>${c.requirementsAssigned}</td><td>${c.candidatesSubmitted}</td><td>${c.submissionRatio.toFixed(2)}</td><td>${c.openCount}</td><td>${c.closedCount}</td></tr>`,
    )
    .join('');

  return `
    <div class="kpi-grid">
      <div class="kpi-item"><span>Total Req Sent</span><strong>${aggregate.totalRequirementsSent}</strong></div>
      <div class="kpi-item"><span>Total Assigned</span><strong>${aggregate.totalRequirementsAssigned}</strong></div>
      <div class="kpi-item"><span>Candidates Submitted</span><strong>${aggregate.totalCandidatesSubmitted}</strong></div>
      <div class="kpi-item"><span>Submission Ratio</span><strong>${aggregate.submissionRatioPerRequirement.toFixed(2)}</strong></div>
      <div class="kpi-item"><span>Open / Closed</span><strong>${aggregate.openRequirements} / ${aggregate.closedRequirements}</strong></div>
    </div>
    <div class="pdf-section">
      <h2>Recruiter-wise Performance</h2>
      <table>
        <thead><tr><th>Recruiter</th><th>Email</th><th>Req Assigned</th><th>Submissions</th><th>Success %</th><th>Open</th><th>Closed</th></tr></thead>
        <tbody>${recruiterRows || '<tr><td colspan="7">No data</td></tr>'}</tbody>
      </table>
    </div>
    <div class="pdf-section">
      <h2>Client-wise Performance</h2>
      <table>
        <thead><tr><th>Client</th><th>Req Sent</th><th>Req Assigned</th><th>Submissions</th><th>Ratio</th><th>Open</th><th>Closed</th></tr></thead>
        <tbody>${clientRows || '<tr><td colspan="7">No data</td></tr>'}</tbody>
      </table>
    </div>
  `;
}

/** Export admin report to PDF (data-driven, tables only – charts excluded for clean formatting). */
export function exportAdminReportToPDF(aggregate: AdminReportAggregate): void {
  const win = window.open('', '_blank');
  if (!win) return;
  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const content = buildAdminReportPDFHtml(aggregate);
  win.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Reports &amp; Analytics - Staffing Recruiting</title>
        <style>${PDF_STYLES}</style>
      </head>
      <body>
        <div class="print-header">
          <h1>Reports &amp; Analytics</h1>
          <p>Staffing Recruiting Performance Report &bull; Generated ${dateStr}</p>
        </div>
        ${content}
      </body>
    </html>
  `);
  win.document.close();
  win.print();
  win.close();
}

export function exportRecruiterReportToExcel(
  rows: { jobId: string; clientName: string; status: string; submissionsCount: number; createdAt: string }[],
  filenamePrefix: string,
): void {
  const date = new Date().toISOString().slice(0, 10);
  const headers = ['Requirement ID', 'Client Name', 'Status', 'Submissions', 'Created At'];
  const data = rows.map((r) => [
    r.jobId,
    r.clientName,
    r.status,
    r.submissionsCount,
    r.createdAt.slice(0, 10),
  ]);
  exportTableToCSV(headers, data, `${filenamePrefix}_${date}.xlsx.csv`);
}

/** Export recruiter report to CSV. Dynamic based on applied filters. */
export function exportRecruiterReportToCSV(
  rows: { jobId: string; clientName: string; status: string; submissionsCount: number; createdAt: string }[],
  filenamePrefix: string,
): void {
  const date = new Date().toISOString().slice(0, 10);
  const headers = ['Requirement ID', 'Client Name', 'Status', 'Submissions', 'Created At'];
  const data = rows.map((r) => [
    r.jobId,
    r.clientName,
    r.status,
    r.submissionsCount,
    r.createdAt.slice(0, 10),
  ]);
  exportTableToCSV(headers, data, `${filenamePrefix}_${date}.csv`);
}

/** Recruiter profile info for PDF header */
export type RecruiterPDFProfile = {
  name: string;
  email: string;
  role: string;
};

/** Recruiter report aggregate for PDF */
export type RecruiterReportForPDF = {
  requirementsAssigned: number;
  candidatesSubmitted: number;
  submissionSuccessRate: number;
  openJobsHandled: number;
  closedJobsHandled: number;
};

/** Build clean HTML for recruiter/profile PDF (no filters, no charts, no requirements table). */
function buildRecruiterReportPDFHtml(
  profile: RecruiterPDFProfile,
  aggregate: RecruiterReportForPDF,
): string {
  return `
    <div class="pdf-section" style="border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; background: #f8fafc; margin-bottom: 24px;">
      <h2 style="margin: 0 0 12px;">Profile Summary</h2>
      <p style="margin: 4px 0;"><strong>Name:</strong> ${profile.name}</p>
      <p style="margin: 4px 0;"><strong>Email:</strong> ${profile.email}</p>
      <p style="margin: 4px 0;"><strong>Role:</strong> ${profile.role}</p>
    </div>
    <div class="kpi-grid">
      <div class="kpi-item"><span>Requirements Assigned</span><strong>${aggregate.requirementsAssigned}</strong></div>
      <div class="kpi-item"><span>Candidates Submitted</span><strong>${aggregate.candidatesSubmitted}</strong></div>
      <div class="kpi-item"><span>Success Rate</span><strong>${aggregate.submissionSuccessRate}%</strong></div>
      <div class="kpi-item"><span>Open Jobs</span><strong>${aggregate.openJobsHandled}</strong></div>
      <div class="kpi-item"><span>Closed Jobs</span><strong>${aggregate.closedJobsHandled}</strong></div>
    </div>
  `;
}

/** Export recruiter report to PDF (data-driven, profile + KPIs only – no filters, charts, or requirements table). */
export function exportRecruiterReportToPDF(
  profile: RecruiterPDFProfile,
  aggregate: RecruiterReportForPDF,
): void {
  const win = window.open('', '_blank');
  if (!win) return;
  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const content = buildRecruiterReportPDFHtml(profile, aggregate);
  win.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Personal Performance Report - Staffing Recruiting</title>
        <style>${PDF_STYLES}</style>
      </head>
      <body>
        <div class="print-header">
          <h1>Personal Performance Report</h1>
          <p>Staffing Recruiting &bull; Generated ${dateStr}</p>
        </div>
        ${content}
      </body>
    </html>
  `);
  win.document.close();
  win.print();
  win.close();
}
