import {
  APP_PRODUCT_NAME,
  COMPANY_NAME,
  getCompanySignatureContactBlock,
  getCompanySignatureSocialUrls,
} from './branding';
import {
  METAFORGE_SIGNATURE_WORDMARK_CID,
  hasMetaforgeSignatureWordmarkAsset,
  getAvailableSignatureIconCids,
} from './inlineAssets';
import { METAFORGE_HEADER_LOGO_CID, resolveMetaforgeLogoPath } from './resolveMetaforgeLogo';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Render a 26px CID PNG icon for the contact rows (purple circle + white glyph). */
function renderContactIcon(cid: string | null): string {
  if (!cid) {
    return `<span style="display:inline-block;width:26px;height:26px;border-radius:50%;background:#a855f7;"></span>`;
  }
  return `<img src="cid:${cid}" width="26" height="26" alt="" style="display:block;border:0;outline:none;text-decoration:none;width:26px;height:26px;" />`;
}

/** Render a 30px CID PNG social icon (brand color + white glyph). */
function renderSocialIcon(href: string, cid: string | null, alt: string): string {
  if (!cid) {
    return `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer" style="font-family:Arial,Helvetica,sans-serif;color:#1a2b4a;text-decoration:underline;">${esc(alt)}</a>`;
  }
  return `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;line-height:0;text-decoration:none;">
    <img src="cid:${cid}" width="30" height="30" alt="${esc(alt)}" style="display:block;border:0;outline:none;text-decoration:none;width:30px;height:30px;" />
  </a>`;
}

/** Normalize recruiter phone for signature: **IND** + formatted number (screenshot style). */
function buildPhoneSignatureHtml(
  recruiterPhone: string | null | undefined,
  fallbackPhoneLine: string,
): string {
  const raw = (recruiterPhone ?? '').trim();
  if (!raw) {
    const fb = fallbackPhoneLine.trim();
    const rest = fb.replace(/^IND\s*/i, '').trim();
    return `<strong style="color:#1a2b4a;">IND</strong> <span style="color:#1565c0;">${esc(rest)}</span>`;
  }
  let d = raw.replace(/\s+/g, ' ');
  if (!/^\+/.test(d)) {
    const digits = d.replace(/\D/g, '');
    if (digits.length === 10) {
      d = `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
    } else if (digits.length >= 12 && digits.startsWith('91')) {
      d = `+${digits.slice(0, 2)} ${digits.slice(2, 7)} ${digits.slice(7)}`;
    }
  }
  return `<strong style="color:#1a2b4a;">IND</strong> <span style="color:#1565c0;">${esc(d)}</span>`;
}

/**
 * Table-based Metaforge footer: navy wordmark (CID PNG when `backend/assets/metaforge-signature-wordmark.png`
 * exists, else SVG data URI) + circular social row | gradient-icon contact rows + Corp/Offshore.
 */
function buildMetaforgeHariniStyleSignatureHtml(input: {
  recruiterEmail: string;
  recruiterPhone?: string | null;
}): string {
  const contact = getCompanySignatureContactBlock();
  const social = getCompanySignatureSocialUrls();

  const websiteDisplay = contact.websiteDisplay;
  const websiteHref = contact.websiteHref || 'https://www.MetaForgeIT.com';

  const corpPlain = contact.corpLine.replace(/^CORP[:\s]*/i, '').trim() || 'AUSTIN, TEXAS, US';
  const offPlain = contact.offshoreLine.replace(/^OFFSHORE[:\s]*/i, '').trim() || 'HYDERABAD, TS, INDIA.';

  const phoneRow = buildPhoneSignatureHtml(input.recruiterPhone, contact.phoneLine);

  const iconCids = getAvailableSignatureIconCids();

  const linkedInCell = social.linkedIn
    ? `<td style="padding:0 5px;vertical-align:middle;line-height:0;">${renderSocialIcon(social.linkedIn, iconCids.linkedin, 'LinkedIn')}</td>`
    : '';
  const instagramCell = social.instagram
    ? `<td style="padding:0 5px;vertical-align:middle;line-height:0;">${renderSocialIcon(social.instagram, iconCids.instagram, 'Instagram')}</td>`
    : '';
  const twitterCell = social.twitter
    ? `<td style="padding:0 5px;vertical-align:middle;line-height:0;">${renderSocialIcon(social.twitter, iconCids.x, 'X')}</td>`
    : '';

  // Prefer CID PNG (`backend/assets/metaforge-signature-wordmark.png`) so Outlook
  // and clients that block `data:` URIs still show the navy wordmark. Fallback SVG
  // uses two dots under the final "e" (cyan left, magenta right).
  const useCidWordmark = hasMetaforgeSignatureWordmarkAsset();
  const metaforgeWordmarkSvg = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 80" width="200" height="50" role="img" aria-label="Metaforge"><text x="0" y="58" font-family="Arial, Helvetica, sans-serif" font-size="60" font-weight="800" fill="#1a2b4a" letter-spacing="0">metaforge</text><circle cx="282" cy="58" r="6.5" fill="#38bdf8"/><circle cx="298" cy="58" r="6.5" fill="#ec4899"/></svg>`;
  const wordmarkDataUri = `data:image/svg+xml;base64,${Buffer.from(metaforgeWordmarkSvg).toString('base64')}`;

  const wordmarkImgSrc = useCidWordmark
    ? `cid:${METAFORGE_SIGNATURE_WORDMARK_CID}`
    : wordmarkDataUri;

  const logoWordmark = `
    <table role="presentation" align="center" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;margin:0 auto;">
      <tr>
        <td align="center" style="text-align:center;padding:0 0 12px;">
          <img src="${wordmarkImgSrc}" width="200" height="auto" alt="Metaforge" style="display:block;border:0;outline:none;text-decoration:none;max-width:220px;height:auto;margin:0 auto;" />
          ${useCidWordmark ? '' : `<!--[if mso]>
            <span style="font-family:Arial,Helvetica,sans-serif;font-size:30px;font-weight:800;color:#1a2b4a;letter-spacing:0.5px;">metaforge</span>
          <![endif]-->`}
        </td>
      </tr>
      <tr>
        <td align="center" style="text-align:center;">
          <table role="presentation" align="center" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;margin:0 auto;">
            <tr>${linkedInCell}${instagramCell}${twitterCell}</tr>
          </table>
        </td>
      </tr>
    </table>
  `.trim();

  const iconPhone = renderContactIcon(iconCids.phone);
  const iconEmail = renderContactIcon(iconCids.email);
  const iconWeb = renderContactIcon(iconCids.web);
  const iconLoc = renderContactIcon(iconCids.location);

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;border-collapse:collapse;margin:18px 0 0;padding-top:18px;border-top:1px solid #e5e7eb;">
      <tr>
        <td width="42%" valign="middle" align="center" style="padding:0 14px 0 0;font-family:Arial,Helvetica,sans-serif;text-align:center;">
          ${logoWordmark}
        </td>
        <td width="58%" valign="top" style="padding:0 0 0 16px;border-left:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
            <tr>
              <td style="width:34px;vertical-align:middle;padding:0 10px 10px 0;">${iconPhone}</td>
              <td style="vertical-align:middle;padding:0 0 10px 0;font-size:12.5px;line-height:1.5;color:#111827;">
                ${phoneRow}
              </td>
            </tr>
            <tr>
              <td style="vertical-align:middle;padding:0 10px 10px 0;">${iconEmail}</td>
              <td style="vertical-align:middle;padding:0 0 10px 0;font-size:12.5px;line-height:1.5;">
                <a href="mailto:${esc(input.recruiterEmail)}" style="color:#1565c0;text-decoration:underline;">${esc(input.recruiterEmail)}</a>
              </td>
            </tr>
            <tr>
              <td style="vertical-align:middle;padding:0 10px 10px 0;">${iconWeb}</td>
              <td style="vertical-align:middle;padding:0 0 10px 0;font-size:12.5px;line-height:1.5;">
                <a href="${esc(websiteHref)}" style="color:#1565c0;text-decoration:underline;">${esc(websiteDisplay)}</a>
              </td>
            </tr>
            <tr>
              <td style="vertical-align:top;padding:0 10px 4px 0;">${iconLoc}</td>
              <td style="vertical-align:top;padding:0;font-size:12.5px;line-height:1.55;color:#111827;">
                <strong style="color:#1a2b4a;">CORP:</strong> ${esc(corpPlain)}<br/>
                <strong style="color:#1a2b4a;">OFFSHORE:</strong> ${esc(offPlain)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `.trim();
}

function paragraphsToHtml(text: string): string {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#333;">${esc(p.replace(/\s*\n\s*/g, ' '))}</p>`,
    )
    .join('\n');
}

/**
 * Professional client-facing HTML for candidate submission emails.
 */
export function buildClientSubmissionEmailHtml(input: {
  /** e.g. "Dear Vinaya," or "Dear Vinaya and Praneeth," */
  greeting: string;
  /** Introduction body (plain text, blank-line separated paragraphs). */
  introduction: string;
  /** Closing before signature (plain text). */
  closing?: string;
  /** Inline HTML submission tracker (per client). */
  trackerTableHtml?: string;
  recruiterName: string;
  recruiterTitle: string;
  recruiterEmail: string;
  recruiterPhone?: string | null;
  sentAtLocale: string;
}): string {
  const {
    greeting,
    introduction,
    closing,
    trackerTableHtml,
    recruiterName,
    recruiterTitle,
    recruiterEmail,
    recruiterPhone,
    sentAtLocale,
  } = input;

  const greetingLine = greeting.trim() || 'Dear Team,';
  const introHtml = paragraphsToHtml(introduction.trim() || '');
  const closingText =
    closing?.trim() ||
    `Thank you for your time and consideration.\n\nWe look forward to your feedback.`;
  const closingHtml = paragraphsToHtml(closingText);

  const disclaimerBody = `IMPORTANT/CONFIDENTIAL: This message from ${COMPANY_NAME.toUpperCase()}, is intended only for the use of the addressees shown above. It contains information that may be privileged, confidential, and/or exempt from disclosure under applicable law. If you are not the intended recipient of this message, you are hereby notified that the copying, use, or distribution of any information or materials transmitted in or with this message is strictly prohibited. If you received this message by mistake, please immediately destroy the original message.`;

  const signatureStripHtml = buildMetaforgeHariniStyleSignatureHtml({
    recruiterEmail,
    recruiterPhone,
  });

  // Header logo in the same brand style as the app sidebar.
  const hasHeaderLogo = Boolean(resolveMetaforgeLogoPath());
  const headerWordmarkHtml = `
    ${hasHeaderLogo
      ? `<img src="cid:${METAFORGE_HEADER_LOGO_CID}" width="170" alt="Metaforge IT Solutions" style="display:block;border:0;outline:none;text-decoration:none;max-width:220px;height:auto;" />`
      : `<span style="font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:800;letter-spacing:0.4px;color:#ffffff;">Metaforge IT Solutions</span>`}
  `.trim();

  return `
<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style type="text/css">
    body {
      font-size: 14px;
      line-height: 1.55;
    }
    .tracker-wrap {
      width: 100%;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
    .tracker-wrap table {
      min-width: 1100px;
      table-layout: auto;
      border-collapse: collapse;
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
    img[width="26"],
    img[width="30"],
    img[width="170"],
    img[width="200"] {
      max-width: none !important;
      height: auto !important;
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f6f7fb;font-size:14px;line-height:1.55;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f7fb;padding:24px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:920px;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="padding:28px 28px 8px;font-family:Arial,Helvetica,sans-serif;">
              <table role="presentation" cellspacing="0" cellpadding="0" style="border-bottom:2px solid #7c2d3a;padding-bottom:16px;margin-bottom:20px;width:100%;">
                <tr>
                  <td bgcolor="#1a2b4a" style="background-color:#1a2b4a;padding:18px 22px;">
                    ${headerWordmarkHtml}
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:12px;">
                    <div style="font-size:11px;color:#64748b;font-weight:500;">${esc(APP_PRODUCT_NAME)}</div>
                    <div style="font-size:13px;color:#333;margin-top:6px;font-weight:600;">${esc(COMPANY_NAME)}</div>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#222;">
                ${esc(greetingLine)}
              </p>
              ${introHtml}

              ${trackerTableHtml ? `<div class="tracker-email-block" style="margin:18px 0 22px;">${trackerTableHtml}</div>` : ''}

              ${closingHtml}

              <div style="margin:28px 0 0;font-family:Arial,Helvetica,sans-serif;">
                <p style="margin:0 0 6px;font-size:14px;line-height:1.5;color:#222;">Regards,</p>
                <p style="margin:0;font-size:14px;line-height:1.55;">
                  <span style="font-size:16px;font-weight:bold;color:#000000;">${esc(recruiterName)}</span><br/>
                  <span style="font-style:italic;color:#4b5563;">${esc(recruiterTitle)}</span><br/>
                  <span style="color:#111827;">${esc(COMPANY_NAME)}</span>
                </p>
              </div>

              ${signatureStripHtml}

              <div style="height:18px;line-height:18px;font-size:0;">&nbsp;</div>
              <div style="border-top:1px solid #e5e7eb;margin:0 0 12px;"></div>

              <p style="margin:0 0 0;font-size:10px;line-height:1.45;color:#64748b;font-family:Arial,Helvetica,sans-serif;">
                ${esc(disclaimerBody)}
              </p>

              <p style="margin:14px 0 0;font-size:12px;color:#888;">
                Submitted: ${esc(sentAtLocale)}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
