import fs from 'fs';
import path from 'path';

/** CID reference for `<img src="cid:...">` in HTML (must match attachment `contentId`). */
export const METAFORGE_HEADER_LOGO_CID = 'metaforge-logo-header';

/**
 * Resolve the current Metaforge logo used across UI/email headers.
 *
 * Preferred source is the same file used by frontend sidebar (`/Logo.png` in
 * `Staffing_Recruitment_Frontend/public`), with backend asset fallbacks.
 */
export function resolveMetaforgeLogoPath(): string | null {
  const candidates = [
    // Repo-root layout (running from workspace root)
    path.join(process.cwd(), 'Staffing_Recruitment_Frontend', 'public', 'Logo.png'),
    // Backend cwd layout (running from /backend)
    path.join(process.cwd(), '..', 'Staffing_Recruitment_Frontend', 'public', 'Logo.png'),
    // Legacy / fallback backend assets
    path.join(process.cwd(), 'assets', 'Logo.png'),
    path.join(process.cwd(), 'assets', 'metaforge-logo.png'),
    path.join(__dirname, '..', '..', '..', 'Staffing_Recruitment_Frontend', 'public', 'Logo.png'),
    path.join(__dirname, '..', '..', 'assets', 'Logo.png'),
    path.join(__dirname, '..', '..', 'assets', 'metaforge-logo.png'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}
