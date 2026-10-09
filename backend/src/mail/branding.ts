/** Product name for emails, subjects, and footers (matches frontend `APP_NAME`). */
export const APP_PRODUCT_NAME = 'Metaforge IT Solutions';

export const COMPANY_NAME = 'Metaforge IT Solutions';

/** Company-wide contact lines in client email footers (optional env overrides). */
export function getCompanySignatureContactBlock(): {
  websiteDisplay: string;
  websiteHref: string;
  phoneLine: string;
  /** Shown in signature strip (e.g. recruitment inbox). */
  publicEmail: string;
  corpLine: string;
  offshoreLine: string;
} {
  const websiteDisplay = (process.env.COMPANY_WEBSITE_DISPLAY || 'www.MetaForgeIT.com').trim();
  let websiteHref = (process.env.COMPANY_WEBSITE_URL || 'https://www.MetaForgeIT.com').trim();
  if (websiteHref && !/^https?:\/\//i.test(websiteHref)) {
    websiteHref = `https://${websiteHref}`;
  }
  const from = (process.env.COMPANY_SIGNATURE_EMAIL || process.env.FROM_EMAIL || '').trim();
  return {
    websiteDisplay,
    websiteHref: websiteHref || 'https://www.MetaForgeIT.com',
    phoneLine: (process.env.COMPANY_SIGNATURE_PHONE_LINE || 'IND +91 92487 13573').trim(),
    publicEmail: from || 'recruitment.application@metaforgeit.com',
    corpLine: (process.env.COMPANY_SIGNATURE_CORP_LINE || 'CORP: AUSTIN, TEXAS, US').trim(),
    offshoreLine: (process.env.COMPANY_SIGNATURE_OFFSHORE_LINE || 'OFFSHORE: HYDERABAD, TS, INDIA.').trim(),
  };
}

/** Social profile URLs for the HTML email signature strip (optional env overrides). */
export function getCompanySignatureSocialUrls(): {
  linkedIn: string;
  instagram: string;
  twitter: string;
} {
  return {
    linkedIn: (process.env.COMPANY_LINKEDIN_URL || 'https://www.linkedin.com/company/metaforge-it-solutions').trim(),
    instagram: (process.env.COMPANY_INSTAGRAM_URL || 'https://www.instagram.com/').trim(),
    twitter: (process.env.COMPANY_TWITTER_URL || 'https://x.com/').trim(),
  };
}
