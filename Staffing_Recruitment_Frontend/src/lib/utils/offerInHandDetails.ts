export type OfferInHandLine = { company: string; ctc: string };

export type OfferInHandDetailsPayload = {
  offers: Array<{ company?: string; ctc?: string }>;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Parse API JSON + legacy single offer fields into editable lines (at least one row). */
export function offerLinesFromApi(
  rawDetails: unknown,
  legacyAmount?: string | null,
  legacyCompany?: string | null,
): OfferInHandLine[] {
  if (isRecord(rawDetails) && Array.isArray(rawDetails.offers)) {
    const rows = (rawDetails.offers as unknown[])
      .map((o) => {
        if (!isRecord(o)) return { company: '', ctc: '' };
        const company = typeof o.company === 'string' ? o.company : '';
        const ctc = typeof o.ctc === 'string' ? o.ctc : typeof o.amount === 'string' ? o.amount : '';
        return { company, ctc };
      })
      .filter((r) => r.company.trim() || r.ctc.trim());
    if (rows.length > 0) return rows;
  }
  const co = (legacyCompany ?? '').trim();
  const ctc = (legacyAmount ?? '').trim();
  if (co || ctc) return [{ company: co, ctc }];
  return [{ company: '', ctc: '' }];
}

/** Build payload for API; returns null if no non-empty lines. */
export function buildOfferInHandDetailsPayload(
  lines: Array<{ company?: string; ctc?: string }>,
): OfferInHandDetailsPayload | null {
  const offers = lines
    .map((l) => ({
      company: typeof l.company === 'string' ? l.company.trim().slice(0, 240) : '',
      ctc: typeof l.ctc === 'string' ? l.ctc.trim().slice(0, 160) : '',
    }))
    .filter((l) => l.company || l.ctc)
    .map((l) => ({
      ...(l.company ? { company: l.company } : {}),
      ...(l.ctc ? { ctc: l.ctc } : {}),
    }));
  if (offers.length === 0) return null;
  return { offers };
}

export function countFilledOffers(lines: OfferInHandLine[]): number {
  return lines.filter((l) => l.company.trim() || l.ctc.trim()).length;
}
