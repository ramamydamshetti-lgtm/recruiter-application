/**
 * HTML → plain text for email archival (PDF, poller bodyText).
 * Preserves structure; does not strip legal/disclaimers (archive must stay faithful to the raw mail).
 */

const NAMED_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&ndash;': '–',
  '&mdash;': '—',
  '&lsquo;': "'",
  '&rsquo;': "'",
  '&ldquo;': '"',
  '&rdquo;': '"',
  '&bull;': '•',
  '&middot;': '·',
  '&hellip;': '...',
  '&trade;': '™',
  '&reg;': '®',
  '&copy;': '©',
  '&euro;': '€',
  '&pound;': '£',
  '&times;': '×',
  '&divide;': '÷',
  '&rarr;': '→',
  '&larr;': '←',
};

function decodeNumericEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n) => {
      const code = parseInt(String(n), 10);
      if (!Number.isFinite(code) || code <= 0) return '';
      try {
        return String.fromCodePoint(code);
      } catch {
        return '';
      }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const code = parseInt(String(h), 16);
      if (!Number.isFinite(code) || code <= 0) return '';
      try {
        return String.fromCodePoint(code);
      } catch {
        return '';
      }
    });
}

function decodeEntities(text: string): string {
  return decodeNumericEntities(
    text.replace(/&[a-zA-Z]+;/g, (m) => NAMED_ENTITIES[m] ?? m),
  );
}

/** True if string looks like HTML (not plain text). */
export function isHtmlContent(s: string): boolean {
  return /<[a-zA-Z][^>]*>/.test(s);
}

/**
 * Convert HTML email bodies to plain text for archival / search.
 * Client-agnostic: preserves layout cues (headings, lists, tables, line breaks).
 */
export function htmlToPlainTextForArchive(raw: string): string {
  if (!raw?.trim()) return '';
  const trimmed = raw.replace(/\r/g, '').trim();

  if (!isHtmlContent(trimmed)) {
    return decodeEntities(trimmed)
      .replace(/[ \t]+/g, ' ')
      .trim();
  }

  let t = trimmed;

  t = t.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  t = t.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  t = t.replace(/<!--[\s\S]*?-->/g, ' ');
  // Common 1×1 / tracking-style images (conservative; keeps normal images).
  t = t.replace(/<img[^>]*(width|height)=["']?[01]["']?[^>]*>/gi, ' ');

  t = t.replace(/<h[1-6][^>]*>/gi, '\n\n');
  t = t.replace(/<\/h[1-6]>/gi, '\n');
  t = t.replace(/<p[^>]*>/gi, '\n');
  t = t.replace(/<\/p>/gi, '\n');
  t = t.replace(/<div[^>]*>/gi, '\n');
  t = t.replace(/<\/div>/gi, '\n');
  t = t.replace(/<br\s*\/?>/gi, '\n');
  t = t.replace(/<hr\s*\/?>/gi, '\n────────────────────────────\n');

  t = t.replace(/<li[^>]*>/gi, '\n  • ');
  t = t.replace(/<\/li>/gi, '');
  t = t.replace(/<\/?[uo]l[^>]*>/gi, '\n');

  t = t.replace(/<td[^>]*>/gi, '  ');
  t = t.replace(/<\/td>/gi, '  |');
  t = t.replace(/<tr[^>]*>/gi, '\n');
  t = t.replace(/<\/tr>/gi, '');
  t = t.replace(/<\/?t[bh]ody[^>]*>/gi, '');
  t = t.replace(/<\/?table[^>]*>/gi, '\n');
  t = t.replace(/<th[^>]*>/gi, '  ');
  t = t.replace(/<\/th>/gi, '  |');

  t = t.replace(/<[^>]+>/g, ' ');

  t = decodeEntities(t);
  t = t.replace(/[ \t]+/g, ' ');
  t = t.replace(/\n{3,}/g, '\n\n');
  return t.trim();
}
