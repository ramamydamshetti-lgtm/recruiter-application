import { Prisma } from '@prisma/client';

const MAX_OFFER_LINES = 10;

function trimStr(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return '';
  const t = raw.trim();
  if (!t) return '';
  return t.length > max ? t.slice(0, max) : t;
}

export type NormalizedOfferDetails = {
  details: Prisma.InputJsonValue | typeof Prisma.JsonNull;
};

/**
 * Normalize client payload into DB JSON + whether to clear legacy scalar offer fields.
 */
export function normalizeOfferInHandDetails(
  data: Record<string, unknown>,
  offerYes: boolean,
): NormalizedOfferDetails {
  if (!offerYes) {
    return { details: Prisma.JsonNull };
  }

  const raw = data.offerInHandDetails;
  const offers: Array<{ company?: string; ctc?: string }> = [];

  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const rec = raw as Record<string, unknown>;
    const arr = rec.offers;
    if (Array.isArray(arr)) {
      for (const item of arr.slice(0, MAX_OFFER_LINES)) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
        const o = item as Record<string, unknown>;
        const company = trimStr(o.company ?? o.companyName, 240);
        const ctc = trimStr(o.ctc ?? o.amount, 160);
        if (!company && !ctc) continue;
        offers.push({
          ...(company ? { company } : {}),
          ...(ctc ? { ctc } : {}),
        });
      }
    }
  }

  if (offers.length > 0) {
    return { details: { offers } as Prisma.InputJsonValue };
  }

  const amt = trimStr(data.offerInHandAmount, 160);
  const co = trimStr(data.offerInHandCompany, 240);
  if (amt || co) {
    return {
      details: {
        offers: [{ ...(co ? { company: co } : {}), ...(amt ? { ctc: amt } : {}) }],
      } as Prisma.InputJsonValue,
    };
  }

  return { details: Prisma.JsonNull };
}
