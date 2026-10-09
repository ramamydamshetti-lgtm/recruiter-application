/**
 * Parse budget amounts in the selected currency (default INR), stored as whole currency units.
 * - "1800000", "18,00,000", "₹1800000" → 1800000
 * - "18 LPA" / "18 lakh" → 18 × 100000 (legacy shorthand for lakhs per annum)
 */
export function parseBudgetInrInput(raw: string): number | undefined {
  const s = String(raw ?? '').trim();
  if (!s) return undefined;

  const lower = s.toLowerCase();
  const impliesLakhs = /(?:lakh|lpa|l\.?\s*p\.?\s*a\.?)/i.test(lower);

  const withoutCurrency = s.replace(/[₹,\s_]/g, ' ');
  const withoutWords = withoutCurrency.replace(
    /(?:lakh?s?|lpa|l\.?\s*p\.?\s*a\.?|inr|rs\.?|rupees?|per\s*month|per\s*annum|p\.?\s*a\.?)/gi,
    ' ',
  );
  const m = withoutWords.match(/(\d+(?:\.\d+)?)/);
  if (!m) return undefined;
  const n = parseFloat(m[1]!);
  if (!Number.isFinite(n) || n <= 0) return undefined;

  if (impliesLakhs && n < 10000) {
    return n * 100000;
  }
  return n;
}

/** @deprecated Use parseBudgetInrInput — same implementation. */
export const parseBudgetLakhsInput = parseBudgetInrInput;
