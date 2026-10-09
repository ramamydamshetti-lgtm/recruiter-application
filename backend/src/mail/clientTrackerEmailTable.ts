import { stripTrackerCellHtml } from '@/lib/clientFacingValue';
import { formatTrackerSkillsPlain } from '@/utils/trackerSkillCell';

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Visual style for the inline HTML tracker (email clients vary; uses table + inline CSS). */
export type TrackerEmailVariant =
  | 'itc_infotech_reference'
  | 'ltts_yellow_grid'
  | 'kpmg_green_header'
  | 'accenture_green_header'
  | 'metaforge_navy_banner'
  | 'ust_white_header'
  | 'brillio_blue_header'
  | 'happiest_minds_green_header'
  | 'standard_grey_grid';

export function trackerVariantForSubmittingTo(client: string): TrackerEmailVariant {
  const c = client.trim().toLowerCase();
  if (c === 'itc') return 'itc_infotech_reference';
  if (c === 'ltts') return 'ltts_yellow_grid';
  if (c === 'kpmg') return 'kpmg_green_header';
  if (c === 'accenture') return 'accenture_green_header';
  if (c === 'metaforge') return 'metaforge_navy_banner';
  if (c === 'ust') return 'ust_white_header';
  if (c === 'brillio') return 'brillio_blue_header';
  if (c === 'happiest-minds') return 'happiest_minds_green_header';
  if (c === 'other-custom') return 'ltts_yellow_grid';
  return 'standard_grey_grid';
}

function headerStyles(variant: TrackerEmailVariant): { bg: string; color: string; border: string } {
  switch (variant) {
    case 'itc_infotech_reference':
      return { bg: '#dfe8f7', color: '#0f172a', border: '#94a3b8' };
    case 'ltts_yellow_grid':
      return { bg: '#FFFF00', color: '#000000', border: '#000000' };
    case 'kpmg_green_header':
      return { bg: '#c8e6c9', color: '#000000', border: '#1b5e20' };
    case 'accenture_green_header':
      return { bg: '#d8e4bc', color: '#000000', border: '#155724' };
    case 'metaforge_navy_banner':
      return { bg: '#c6e0b4', color: '#111111', border: '#64748b' };
    case 'ust_white_header':
      return { bg: '#ffffff', color: '#000000', border: '#000000' };
    case 'brillio_blue_header':
      return { bg: '#deeaf6', color: '#000000', border: '#1f2937' };
    case 'happiest_minds_green_header':
      return { bg: '#e2efda', color: '#000000', border: '#3f6212' };
    case 'standard_grey_grid':
    default:
      return { bg: '#e8e8e8', color: '#111111', border: '#888888' };
  }
}

function bodyBorder(variant: TrackerEmailVariant): string {
  switch (variant) {
    case 'itc_infotech_reference':
      return '#cbd5e1';
    case 'ltts_yellow_grid':
      return '#000000';
    case 'kpmg_green_header':
      return '#2e7d32';
    case 'accenture_green_header':
      return '#155724';
    case 'ust_white_header':
      return '#000000';
    case 'brillio_blue_header':
      return '#1f2937';
    case 'happiest_minds_green_header':
      return '#3f6212';
    default:
      return '#cccccc';
  }
}

function rowBackground(variant: TrackerEmailVariant, rowIndex: number): string {
  if (variant === 'itc_infotech_reference' || variant === 'ltts_yellow_grid') return '#ffffff';
  return rowIndex % 2 === 0 ? '#ffffff' : '#f8fafc';
}

function normalizedHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function isSerialHeader(header: string): boolean {
  const h = normalizedHeader(header);
  return h === 'sl no' || h === 'slno' || h === 's no' || h === 'serial no' || h === 'sr no';
}

function isSkillHeader(header: string): boolean {
  const h = normalizedHeader(header);
  return h === 'skill' || h === 'skills' || h.includes('skill set') || h.includes('technology');
}

function isMobileHeader(header: string): boolean {
  const h = normalizedHeader(header);
  return h.includes('mobile') || h.includes('phone') || h.includes('contact no');
}

function isEmailHeader(header: string): boolean {
  const h = normalizedHeader(header);
  return h.includes('mail') || h.includes('email');
}

function isRateHeader(header: string): boolean {
  const h = normalizedHeader(header);
  return h.includes('rate') || h.includes('ctc') || h.includes('salary');
}

const TRACKER_BODY_TEXT_STYLE =
  'color:#000000!important;font-weight:normal!important;text-decoration:none!important;background:transparent!important;';

function headerCellStyle(header: string, hs: { bg: string; color: string; border: string }): string {
  const width = isSerialHeader(header)
    ? 'width:38px;min-width:38px;max-width:40px;text-align:center;'
    : isSkillHeader(header)
      ? 'min-width:160px;max-width:260px;'
      : '';
  return `border:1px solid ${hs.border};background:${hs.bg};color:${hs.color};padding:8px 6px;font-size:12.5px;line-height:1.35;font-weight:700;text-align:left;vertical-align:bottom;white-space:nowrap;font-family:Calibri,Arial,Helvetica,sans-serif;${width}`;
}

function bodyCellStyle(header: string, bb: string, bg: string): string {
  const serial = isSerialHeader(header)
    ? 'width:38px;min-width:38px;max-width:40px;text-align:center;'
    : '';
  const skills = isSkillHeader(header) ? 'min-width:160px;max-width:260px;' : '';
  const nowrap = isMobileHeader(header) || isEmailHeader(header) || isRateHeader(header)
    ? 'white-space:nowrap;word-break:normal;'
    : 'white-space:normal;word-break:break-word;';
  return `border:1px solid ${bb};background:${bg};color:#000000;mso-color-alt:#000000;padding:6px 6px;font-size:12.5px;line-height:1.45;font-weight:normal;vertical-align:top;font-family:Calibri,Arial,Helvetica,sans-serif;${nowrap}${serial}${skills}`;
}

/** Force plain black text in Outlook and other clients that override td/link colors. */
function wrapTrackerCellText(text: string, header: string): string {
  let inner = esc(text);
  if (isEmailHeader(header)) {
    inner = inner.replace(/@/g, '&#8203;@');
  }
  return `<span style="${TRACKER_BODY_TEXT_STYLE}"><font color="#000000" style="${TRACKER_BODY_TEXT_STYLE}">${inner}</font></span>`;
}

function renderBodyCell(header: string, value: string): string {
  const plain = stripTrackerCellHtml(value).trim();
  const text = isSkillHeader(header) ? formatTrackerSkillsPlain(plain) : plain;
  if (!text) {
    return wrapTrackerCellText('—', header);
  }
  return wrapTrackerCellText(text, header);
}

const TRACKER_TABLE_SCOPED_CSS = `
  .tracker-wrap {
    width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    margin: 0 0 18px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
  }
  .tracker-wrap table {
    border-collapse: collapse;
    min-width: 1100px;
    width: 100%;
    table-layout: auto;
  }
  .tracker-wrap th,
  .tracker-wrap td {
    white-space: normal;
    word-break: break-word;
    vertical-align: top;
    font-size: 12.5px;
  }
  .tracker-wrap th {
    white-space: nowrap;
  }
  .tracker-table td,
  .tracker-table td *,
  .tracker-table td font,
  .tracker-table td a {
    color: #000000 !important;
    background-color: transparent !important;
    font-weight: normal !important;
    text-decoration: none !important;
  }
`.trim();

/**
 * Inline submission tracker: title, subtitle, and HTML data grid only (no images in navy bars).
 */
export function buildClientTrackerEmailTableHtml(input: {
  documentTitle: string;
  subtitle: string;
  headers: readonly string[];
  rows: string[][];
  variant: TrackerEmailVariant;
  /** Optional HTML-safe hex color override (`#RRGGBB`) for header background. */
  headerBgOverride?: string;
  /** When true, omit client/title headings above the table (email body provides greeting). */
  hideTitleHeader?: boolean;
}): string {
  const { documentTitle, subtitle, headers, rows, variant, headerBgOverride, hideTitleHeader } = input;
  const hsBase = headerStyles(variant);
  const hs = headerBgOverride ? { ...hsBase, bg: headerBgOverride } : hsBase;
  const bb = bodyBorder(variant);

  const thead = headers
    .map(
      (h) =>
        `<th style="${headerCellStyle(String(h), hs)}">${esc(String(h))}</th>`,
    )
    .join('');

  const extraBanner =
    !hideTitleHeader && variant === 'metaforge_navy_banner'
      ? `<p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#1a2b4a;font-family:Arial,Helvetica,sans-serif;">MetaForge submission tracker</p>`
      : '';

  const titleBlock = hideTitleHeader
    ? ''
    : `
<p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#1a2744;font-family:Calibri,Arial,Helvetica,sans-serif;">${esc(documentTitle)}</p>
<p style="margin:0 0 12px;font-size:13px;color:#475569;font-family:Calibri,Arial,Helvetica,sans-serif;">${esc(subtitle)}</p>`;

  const tbody = rows
    .map((cells, rowIndex) => {
      const bg = rowBackground(variant, rowIndex);
      const tds = headers
        .map((h, i) => {
          const text = cells[i] ?? '';
          return `<td style="${bodyCellStyle(String(h), bb, bg)}">${renderBodyCell(
            String(h),
            text,
          )}</td>`;
        })
        .join('');
      return `<tr>${tds}</tr>`;
    })
    .join('');

  return `
${extraBanner}
${titleBlock}
<!--[if mso]>
<style type="text/css">
${TRACKER_TABLE_SCOPED_CSS}
</style>
<![endif]-->
<style type="text/css">
${TRACKER_TABLE_SCOPED_CSS}
</style>
<div class="tracker-wrap" style="width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;margin:0 0 18px;border:1px solid #cbd5e1;border-radius:6px;">
  <table class="tracker-table" role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;min-width:1100px;width:100%;table-layout:auto;">
    <thead><tr>${thead}</tr></thead>
    <tbody>${tbody}</tbody>
  </table>
</div>
`.trim();
}
