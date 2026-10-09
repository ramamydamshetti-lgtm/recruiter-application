import type { OfferLetter, Prisma, PrismaClient } from '@prisma/client';
import { Prisma as PrismaNs } from '@prisma/client';

/** Dual-write helper: keeps `offer_management` aligned with legacy `offer_letters`. */
export async function upsertOfferManagementFromLegacy(
  prisma: PrismaClient | Prisma.TransactionClient,
  offer: OfferLetter,
): Promise<void> {
  try {
    await prisma.offerManagement.upsert({
      where: { submissionId: offer.submissionId },
      create: {
        submissionId: offer.submissionId,
        legacyOfferLetterId: offer.id,
        status: offer.status,
        positionTitle: offer.positionTitle,
        compensation: offer.compensation,
        joiningDate: offer.joiningDate,
        offerExpiryDate: offer.validUntil,
        hrNotes: null,
        offeredCtc: null,
        currency: null,
        acceptedAt: offer.status === 'ACCEPTED' ? offer.updatedAt : null,
        declinedAt: offer.status === 'DECLINED' ? offer.updatedAt : null,
      },
      update: {
        legacyOfferLetterId: offer.id,
        status: offer.status,
        positionTitle: offer.positionTitle,
        compensation: offer.compensation,
        joiningDate: offer.joiningDate,
        offerExpiryDate: offer.validUntil,
        acceptedAt: offer.status === 'ACCEPTED' ? offer.updatedAt : null,
        declinedAt: offer.status === 'DECLINED' ? offer.updatedAt : null,
      },
    });
  } catch (e: unknown) {
    if (e instanceof PrismaNs.PrismaClientKnownRequestError && e.code === 'P2021') {
      console.warn('[offerManagementSync] offer_management table missing; run prisma migrate.');
      return;
    }
    throw e;
  }
}
