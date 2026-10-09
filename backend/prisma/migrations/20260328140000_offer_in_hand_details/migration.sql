-- Optional offer details when candidate has an offer in hand
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "offer_in_hand_amount" TEXT;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "offer_in_hand_company" TEXT;
ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "offer_in_hand_amount" TEXT;
ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "offer_in_hand_company" TEXT;
