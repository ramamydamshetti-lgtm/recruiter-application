import fs from 'fs';
import path from 'path';
import type { MailAttachment } from './transport';
import { METAFORGE_HEADER_LOGO_CID, resolveMetaforgeLogoPath } from './resolveMetaforgeLogo';

/**
 * CID for inline PNG in client submission HTML (`<img src="cid:...">`).
 * Must match the `cid` field on the corresponding attachment.
 */
export const METAFORGE_EMAIL_BRANDING_CID = 'metaforge.branding@metaforge';

/** White wordmark + dots (transparent); shown on a dark header band in HTML. */
export const METAFORGE_HEADER_WORDMARK_CID = 'metaforge.header.wordmark@metaforge';
/** Compact blue brandmark + icon rail for the footer signature block. */
export const METAFORGE_FOOTER_BRANDMARK_CID = 'metaforge.footer.brandmark@metaforge';
export const METAFORGE_ICON_PHONE_CID = 'metaforge.footer.icon.phone@metaforge';
export const METAFORGE_ICON_SEND_CID = 'metaforge.footer.icon.send@metaforge';
export const METAFORGE_ICON_WEB_CID = 'metaforge.footer.icon.web@metaforge';
export const METAFORGE_ICON_LOCATION_CID = 'metaforge.footer.icon.location@metaforge';
export const METAFORGE_SOCIAL_LINKEDIN_CID = 'metaforge.footer.social.linkedin@metaforge';
export const METAFORGE_SOCIAL_INSTAGRAM_CID = 'metaforge.footer.social.instagram@metaforge';
export const METAFORGE_SOCIAL_X_CID = 'metaforge.footer.social.x@metaforge';

/** Navy Metaforge wordmark (PNG) embedded in the client submission signature strip. */
export const METAFORGE_SIGNATURE_WORDMARK_CID = 'metaforge.signature.wordmark';

const SIGNATURE_WORDMARK_FILENAME = 'metaforge-signature-wordmark.png';

const BRANDING_FILENAME = 'metaforge-email-branding.png';
const HEADER_WORDMARK_FILENAME = 'metaforge-header-wordmark.png';
const FOOTER_BRANDMARK_FILENAME = 'metaforge-footer-brandmark.png';
const ICON_PHONE_FILENAME = 'metaforge-footer-icon-phone.png';
const ICON_SEND_FILENAME = 'metaforge-footer-icon-send.png';
const ICON_WEB_FILENAME = 'metaforge-footer-icon-web.png';
const ICON_LOCATION_FILENAME = 'metaforge-footer-icon-location.png';
const SOCIAL_LINKEDIN_FILENAME = 'metaforge-social-linkedin.png';
const SOCIAL_INSTAGRAM_FILENAME = 'metaforge-social-instagram.png';
const SOCIAL_X_FILENAME = 'metaforge-social-x.png';

/** Natural pixel size of `metaforge-email-branding.png` (IHDR). */
export const METAFORGE_EMAIL_BRANDING_SIZE = { width: 383, height: 184 } as const;

/** Natural pixel size of `metaforge-header-wordmark.png` (IHDR). */
export const METAFORGE_HEADER_WORDMARK_SIZE = { width: 256, height: 171 } as const;
/** Natural pixel size of `metaforge-footer-brandmark.png` (IHDR). */
export const METAFORGE_FOOTER_BRANDMARK_SIZE = { width: 184, height: 118 } as const;

export function resolveMetaforgeEmailBrandingPath(): string {
  const p = path.join(process.cwd(), 'mail-assets', BRANDING_FILENAME);
  if (!fs.existsSync(p)) {
    throw new Error(`Missing mail asset (copy branding PNG to ${p})`);
  }
  return p;
}

function resolveMetaforgeHeaderWordmarkPath(): string {
  const p = path.join(process.cwd(), 'mail-assets', HEADER_WORDMARK_FILENAME);
  if (!fs.existsSync(p)) {
    throw new Error(`Missing mail asset (copy header wordmark PNG to ${p})`);
  }
  return p;
}

function resolveMetaforgeFooterBrandmarkPath(): string {
  const p = path.join(process.cwd(), 'mail-assets', FOOTER_BRANDMARK_FILENAME);
  if (!fs.existsSync(p)) {
    throw new Error(`Missing mail asset (copy footer brandmark PNG to ${p})`);
  }
  return p;
}

function resolveFooterIconPath(filename: string): string {
  const p = path.join(process.cwd(), 'mail-assets', filename);
  if (!fs.existsSync(p)) {
    throw new Error(`Missing mail asset (copy footer icon PNG to ${p})`);
  }
  return p;
}

/** Tolerant lookup: checks `mail-assets/`, `assets/`, `backend/...` (works regardless of cwd). */
function resolveMailAssetPath(filename: string): string | null {
  const candidates = [
    path.join(process.cwd(), 'assets', filename),
    path.join(process.cwd(), 'mail-assets', filename),
    path.join(process.cwd(), 'backend', 'assets', filename),
    path.join(process.cwd(), 'backend', 'mail-assets', filename),
    path.join(__dirname, '..', '..', 'assets', filename),
    path.join(__dirname, '..', '..', 'mail-assets', filename),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function resolveMetaforgeSignatureWordmarkPath(): string | null {
  return resolveMailAssetPath(SIGNATURE_WORDMARK_FILENAME);
}

/** True when `backend/assets/metaforge-signature-wordmark.png` is present (CID logo in HTML). */
export function hasMetaforgeSignatureWordmarkAsset(): boolean {
  return resolveMetaforgeSignatureWordmarkPath() !== null;
}

/** Returns CID strings for any signature icons that are actually on disk. */
export function getAvailableSignatureIconCids(): {
  phone: string | null;
  email: string | null;
  web: string | null;
  location: string | null;
  linkedin: string | null;
  instagram: string | null;
  x: string | null;
} {
  return {
    phone: resolveMailAssetPath(ICON_PHONE_FILENAME) ? METAFORGE_ICON_PHONE_CID : null,
    email: resolveMailAssetPath(ICON_SEND_FILENAME) ? METAFORGE_ICON_SEND_CID : null,
    web: resolveMailAssetPath(ICON_WEB_FILENAME) ? METAFORGE_ICON_WEB_CID : null,
    location: resolveMailAssetPath(ICON_LOCATION_FILENAME) ? METAFORGE_ICON_LOCATION_CID : null,
    linkedin: resolveMailAssetPath(SOCIAL_LINKEDIN_FILENAME) ? METAFORGE_SOCIAL_LINKEDIN_CID : null,
    instagram: resolveMailAssetPath(SOCIAL_INSTAGRAM_FILENAME) ? METAFORGE_SOCIAL_INSTAGRAM_CID : null,
    x: resolveMailAssetPath(SOCIAL_X_FILENAME) ? METAFORGE_SOCIAL_X_CID : null,
  };
}

/**
 * Inline attachments for the client submission email signature.
 * Attaches the wordmark plus any contact / social icon PNGs that are present.
 * Outlook and many clients strip `data:` URIs and inline SVG, so CID PNGs are
 * the most reliable way to show the white glyph inside the violet circle.
 */
export function getClientSubmissionMailInlineAttachments(): MailAttachment[] {
  const out: MailAttachment[] = [];

  const headerLogo = resolveMetaforgeLogoPath();
  if (headerLogo) {
    out.push({
      filename: path.basename(headerLogo),
      path: headerLogo,
      cid: METAFORGE_HEADER_LOGO_CID,
    });
  }

  const wordmark = resolveMetaforgeSignatureWordmarkPath();
  if (wordmark) {
    out.push({
      filename: SIGNATURE_WORDMARK_FILENAME,
      path: wordmark,
      cid: METAFORGE_SIGNATURE_WORDMARK_CID,
    });
  }

  const iconAttachments: Array<{ file: string; cid: string }> = [
    { file: ICON_PHONE_FILENAME, cid: METAFORGE_ICON_PHONE_CID },
    { file: ICON_SEND_FILENAME, cid: METAFORGE_ICON_SEND_CID },
    { file: ICON_WEB_FILENAME, cid: METAFORGE_ICON_WEB_CID },
    { file: ICON_LOCATION_FILENAME, cid: METAFORGE_ICON_LOCATION_CID },
    { file: SOCIAL_LINKEDIN_FILENAME, cid: METAFORGE_SOCIAL_LINKEDIN_CID },
    { file: SOCIAL_INSTAGRAM_FILENAME, cid: METAFORGE_SOCIAL_INSTAGRAM_CID },
    { file: SOCIAL_X_FILENAME, cid: METAFORGE_SOCIAL_X_CID },
  ];

  for (const { file, cid } of iconAttachments) {
    const p = resolveMailAssetPath(file);
    if (p) {
      out.push({ filename: file, path: p, cid });
    }
  }

  return out;
}
